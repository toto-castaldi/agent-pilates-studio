import assert from 'node:assert/strict';
import { type ChildProcessWithoutNullStreams, spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { createRun, DEV_HOST, hostFilterPattern, PROD_HOST, parseSummary } from '../../src/proxy-audit.js';

const COLLECTOR = resolve('scripts/proxy-audit-remote.py');
const ORIGIN = resolve('scripts/proxy-audit-origin.py');
const LAUNCHER = resolve('scripts/proxy-audit.mjs');
// Synthetic values that must never leave the collector or the launcher.
const SECRETS = ['synthetic-config-secret', 'synthetic-env-secret', 'synthetic-argv-secret', 'syntheticVerifySecret', '15555550123', 'Messaggio privato sintetico'];

function exportEntry(fields: Record<string, string>): string {
  return `${Object.entries(fields).map(([key, value]) => `${key}=${value}`).join('\n')}\n\n`;
}

function jsonl(entries: Array<[string | number[], number]>): string {
  return entries.map(([message, epoch]) => JSON.stringify({ MESSAGE: message, __REALTIME_TIMESTAMP: String(epoch * 1_000_000), __CURSOR: 's=synthetic' })).join('\n') + (entries.length ? '\n' : '');
}

async function fixture(dirty: boolean) {
  const directory = await mkdtemp(join(tmpdir(), 'pilates-proxy-audit-'));
  const bin = join(directory, 'bin');
  const root = join(directory, 'root');
  const fake = join(directory, 'fake');
  for (const path of [bin, fake, join(root, 'usr/bin'), join(root, 'proc/4242'), join(root, 'proc/net'), join(root, 'proc/sys/kernel'), join(root, 'etc/cloudflared'), join(root, 'etc/logrotate.d'), join(root, 'etc/default'), join(root, 'var/log/journal'), join(root, 'var/crash')]) {
    await mkdir(path, { recursive: true });
  }
  // The collector gives its tools a minimal environment: the fakes locate their data from their own path.
  const script = (name: string, body: string) => writeFile(join(bin, name), `#!/bin/bash\nFAKE="$(dirname "$0")/../fake"\n${body}\n`, { mode: 0o755 });
  await script('systemctl', `case "$1" in
  --version) echo 'systemd 259 (259.9-0ubuntu0.1)'; echo '+PAM' ;;
  show) cat "$FAKE/systemctl-show" ;;
  is-active) for name in $(cat "$FAKE/active"); do [ "$name" = "$2" ] && { echo active; exit 0; }; done; echo inactive; exit 3 ;;
  *) exit 1 ;;
esac`);
  await script('journalctl', `args="$*"
if [[ $args == *--disk-usage* ]]; then echo 'Archived and active journals take up 24.0M in the file system.'; exit 0; fi
if [[ $args == *"-o export"* ]]; then cat "$FAKE/journal-export"; exit 0; fi
if [[ $args == *"-u cloudflared"* ]]; then if [[ $args == *--since* ]]; then cat "$FAKE/unit-since.jsonl"; else cat "$FAKE/unit.jsonl"; fi; exit 0; fi
if [[ $args == *__REALTIME_TIMESTAMP* ]]; then echo '{"__REALTIME_TIMESTAMP":"1790000000000000"}'; exit 0; fi
exit 1`);
  await script('systemd-analyze', 'cat "$FAKE/journald.conf"');
  await script('systemd-cat', `{ printf 'SYSLOG_IDENTIFIER=pilates-proxy-audit\\nMESSAGE='; cat; printf '\\n'; } >> "$FAKE/journal-export"`);
  await script('dpkg-query', "printf '2026.10.7'");
  await writeFile(join(root, 'usr/bin/cloudflared'), `#!/bin/bash
if [ "$1" = --version ]; then echo 'cloudflared version 2026.10.7 (built 2026-10-30-1711 UTC)'; exit 0; fi
url="\${@: -1}"
case "$url" in
  https://${PROD_HOST}/whatsapp/webhook) svc=http://127.0.0.1:18190 ;;
  https://${DEV_HOST}/webhooks/whatsapp) svc=http://127.0.0.1:8300 ;;
  *) svc=http_status:404 ;;
esac
printf 'Using rules from %s\\nMatched rule #1\\n\\thostname: example\\n\\tservice: %s\\n' "$4" "$svc"
`, { mode: 0o755 });
  const argv = ['/usr/bin/cloudflared', '--no-autoupdate', '--config', '/etc/cloudflared/config.yml', ...(dirty ? ['--loglevel', 'debug', '--token', 'synthetic-argv-secret'] : []), 'tunnel', 'run'];
  await writeFile(join(fake, 'systemctl-show'), [
    'ActiveState=active', 'SubState=running', 'MainPID=4242',
    `ExecStart={ path=/usr/bin/cloudflared ; argv[]=${argv.join(' ')} ; ignore_errors=no ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }`,
    `Environment=${dirty ? 'TUNNEL_LOGFILE=/var/log/cloudflared.log TUNNEL_TOKEN=synthetic-env-secret' : ''}`,
    `EnvironmentFiles=${dirty ? '/etc/default/cloudflared (ignore_errors=no)' : ''}`,
    `StandardOutput=${dirty ? 'append:/var/log/cloudflared.log' : 'journal'}`, 'StandardError=inherit',
    `LogFilterPatterns=${hostFilterPattern(PROD_HOST)}`, ...(dirty ? [] : [`LogFilterPatterns=${hostFilterPattern(DEV_HOST)}`]),
    'LogLevelMax=', 'LimitCORE=infinity', 'NeedDaemonReload=no', 'User=',
  ].join('\n'));
  await writeFile(join(root, 'proc/4242/cmdline'), `${argv.join('\0')}\0`);
  await writeFile(join(root, 'proc/4242/environ'), `PATH=/usr/bin\0${dirty ? 'TUNNEL_TOKEN=synthetic-env-secret\0' : ''}`);
  await writeFile(join(root, 'etc/default/cloudflared'), 'TUNNEL_LOGLEVEL=debug\n');
  await writeFile(join(root, 'etc/cloudflared/config.yml'), `tunnel: 00000000-0000-4000-8000-000000000000
credentials-file: /etc/cloudflared/synthetic.json
${dirty ? 'loglevel: debug\nlogfile: /var/log/cloudflared.log\ntoken: synthetic-config-secret\nprotocol: http2\n' : ''}ingress:
  - hostname: ${PROD_HOST}
    path: ^/whatsapp/webhook$
    service: http://127.0.0.1:18190
  - hostname: ${PROD_HOST}
    service: http_status:404
  - service: http_status:404
`);
  await writeFile(join(fake, 'journald.conf'), `# /etc/systemd/journald.conf\n[Journal]\n#Storage=auto\nSystemMaxUse=500M\n${dirty ? 'ForwardToSocket=/run/synthetic.sock\n' : ''}\n# /etc/systemd/journald.conf.d/override.conf\n[Journal]\nSystemMaxUse=1G\nMaxRetentionSec=1month\nForwardToSyslog=yes\n`);
  const t0 = 1_794_000_000;
  const unit: Array<[string | number[], number]> = [
    ['Version 2026.10.7 (Checksum 0000)', t0],
    ['2026-11-14T10:00:00Z INF Registered tunnel connection connIndex=0 connection=00000000 event=0 ip=198.51.100.1 location=mxp01 protocol=quic', t0 + 1],
    ['2026-11-14T10:00:05Z ERR  error="Unable to reach the origin service. The service may be down: dial tcp 127.0.0.1:8300: connect: connection refused" cfRay=0123456789abcdef-MXP connIndex=0 event=1 ingressRule=3 originService=http://127.0.0.1:8300', t0 + 5],
    [Array.from(Buffer.from('binary message \u0001 without hostname')), t0 + 6],
  ];
  if (dirty) {
    unit.push([`2026-11-14T10:00:07Z ERR Request failed dest=https://${DEV_HOST}/webhooks/whatsapp?hub.verify_token=syntheticVerifySecret type=http`, t0 + 7]);
    unit.push([`2026-11-14T10:00:08Z DBG GET https://${PROD_HOST}/whatsapp/webhook host=${PROD_HOST.toUpperCase()}`, t0 + 8]);
  }
  await writeFile(join(fake, 'unit.jsonl'), jsonl(unit));
  await writeFile(join(fake, 'unit-since.jsonl'), jsonl(unit.slice(2)));
  await writeFile(join(fake, 'journal-export'), exportEntry({ MESSAGE: 'Started cloudflared.service', _CMDLINE: '/usr/bin/cloudflared tunnel run' }));
  await writeFile(join(root, 'var/log/syslog'), `Nov 14 10:00:00 jarvis cloudflared[4242]: INF connected\n${dirty ? `Nov 14 10:00:01 jarvis cloudflared[4242]: ERR dest=https://${PROD_HOST}/whatsapp/webhook\n` : ''}`);
  await writeFile(join(root, 'var/log/syslog.2.gz'), gzipSync(`Nov 10 10:00:00 jarvis cloudflared[4242]: INF old line, message 15555550123\n`));
  await writeFile(join(root, 'etc/logrotate.d/rsyslog'), '/var/log/syslog\n{\n\trotate 4\n\tweekly\n\tmissingok\n}\n');
  await writeFile(join(root, 'proc/sys/kernel/core_pattern'), '|/usr/share/apport/apport -p%p -s%s -c%c\n');
  await writeFile(join(root, 'etc/default/apport'), 'enabled=1\n');
  if (dirty) {
    await writeFile(join(root, 'var/crash/_usr_bin_cloudflared.0.crash'), 'synthetic');
    await mkdir(join(root, 'opt/agent-pilates-prod/secrets'), { recursive: true });
    await writeFile(join(root, 'opt/agent-pilates-prod/secrets/whatsapp-verify-token'), 'synthetic-config-secret\n', { mode: 0o600 });
    await utimes(join(root, 'opt/agent-pilates-prod/secrets/whatsapp-verify-token'), 1_794_600_000, 1_794_600_000);
  }
  const header = '  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n';
  await writeFile(join(root, 'proc/net/tcp'), `${header}   0: 0100007F:470E 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 1 1 0\n${dirty ? '   1: 0100007F:206C 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 2 1 0\n' : ''}`);
  await writeFile(join(root, 'proc/net/tcp6'), header);
  await writeFile(join(fake, 'active'), dirty ? 'rsyslog promtail auditd\n' : 'rsyslog\n');
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, PILATES_PROXY_AUDIT_ROOT: root };
  return {
    directory,
    fake,
    collect(input: Record<string, unknown>) {
      const header = `INPUT = __import__('json').loads(__import__('base64').b64decode('${Buffer.from(JSON.stringify(input)).toString('base64')}'))\n`;
      return spawnSync('python3', ['-'], { input: header + readFileSync(COLLECTOR, 'utf8'), env, encoding: 'utf8', timeout: 60_000 });
    },
    privileged(out: string) {
      return spawnSync('python3', [COLLECTOR, 'privileged', out], { env, encoding: 'utf8', timeout: 60_000 });
    },
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}

function assertNoSecrets(output: string) {
  for (const secret of SECRETS) assert.ok(!output.includes(secret), 'synthetic secret leaked');
  assert.ok(!output.includes(PROD_HOST) && !output.includes(DEV_HOST), 'hostname or log line leaked');
}

test('the collector reports a clean host with counts and enumerations only', async () => {
  const fixtures = await fixture(false);
  try {
    const run = createRun((size) => new Uint8Array(randomBytes(size)));
    const pre = fixtures.collect({ phase: 'pre', control: run.control });
    assert.equal(pre.status, 0, pre.stderr);
    assertNoSecrets(pre.stdout + pre.stderr);
    const summary = parseSummary(pre.stdout, 'pre');
    assert.equal(summary['unit.state'], 'active');
    assert.equal(summary['unit.stdout'], 'journal');
    assert.equal(summary['unit.filter.deny_patterns'], '2');
    for (const name of ['prod_lower', 'prod_upper', 'prod_mixed', 'prod_json', 'dev_lower', 'dev_upper']) assert.equal(summary[`unit.filter.${name}`], 'dropped', name);
    assert.equal(summary['unit.filter.neutral'], 'kept');
    assert.equal(summary['cloudflared.exec'], '/usr/bin/cloudflared');
    assert.equal(summary['cloudflared.version'], '2026.10.7');
    assert.match(summary['cloudflared.sha256'], /^[0-9a-f]{64}$/);
    assert.equal(summary['cloudflared.args.no_autoupdate'], 'yes');
    assert.equal(summary['cloudflared.args.token'], 'no');
    assert.equal(summary['cloudflared.process.loglevel'], 'unset');
    assert.equal(summary['cloudflared.config.readable'], 'yes');
    assert.equal(summary['journald.systemmaxuse'], '1G');
    assert.equal(summary['journald.maxretentionsec'], '1month');
    assert.equal(summary['journald.forwardtosyslog'], 'yes');
    assert.equal(summary['journald.storage'], 'unset');
    assert.equal(summary['journald.disk_usage'], '24.0M');
    assert.equal(summary['journal.oldest_epoch'], '1790000000');
    assert.equal(summary['cloudflared.journal.entries'], '4');
    assert.equal(summary['cloudflared.journal.oldest_epoch'], '1794000000');
    assert.equal(summary['cloudflared.journal.protocol'], 'quic');
    assert.equal(summary['cloudflared.journal.version'], '2026.10.7');
    assert.equal(summary['cloudflared.journal.prod_host_lines'], '0');
    assert.equal(summary['cloudflared.journal.format.origin_unreachable'], '1');
    assert.equal(summary['syslog.rsyslog'], 'active');
    assert.equal(summary['syslog.files'], '2');
    assert.equal(summary['syslog.cloudflared_lines'], '2');
    assert.equal(summary['syslog.prod_host_lines'], '0');
    assert.equal(summary['logrotate.rsyslog_rotate'], '4');
    assert.equal(summary['logrotate.rsyslog_frequency'], 'weekly');
    assert.equal(summary['core.pattern'], 'apport');
    assert.equal(summary['core.apport_enabled'], 'yes');
    assert.equal(summary['core.crash_files'], '0');
    assert.equal(summary['shippers.active'], '0');
    assert.equal(summary['port.8300'], 'free');
    assert.equal(summary['port.18190'], 'busy');
    assert.equal(summary['control.written'], 'yes');
    assert.equal(summary['prod.verify_token_mtime'], 'absent');

    const post = fixtures.collect({ phase: 'post', control: run.control, since: Number(summary['time.epoch']) - 5, markers: run.markers });
    assert.equal(post.status, 0, post.stderr);
    assertNoSecrets(post.stdout + post.stderr);
    const after = parseSummary(post.stdout, 'post');
    assert.equal(after['control.journal'], '1');
    for (const id of Object.keys(run.markers)) {
      assert.equal(after[`marker.${id}.journal`], '0', id);
      assert.equal(after[`marker.${id}.syslog`], '0', id);
    }
    assert.equal(after['cloudflared.since.entries'], '2');
    assert.equal(after['cloudflared.since.format.origin_unreachable'], '1');
  } finally {
    await fixtures.cleanup();
  }
});

test('the collector detects exposures without printing the values that cause them', async () => {
  const fixtures = await fixture(true);
  const output = await mkdtemp('/tmp/pilates-proxy-audit.');
  try {
    const run = createRun((size) => new Uint8Array(randomBytes(size)));
    const [id, value] = Object.entries(run.markers)[0];
    await writeFile(join(fixtures.fake, 'journal-export'), exportEntry({ MESSAGE: 'unrelated', _CMDLINE: `synthetic ${value}` }), { flag: 'a' });
    const pre = fixtures.collect({ phase: 'pre', control: run.control });
    assert.equal(pre.status, 0, pre.stderr);
    assertNoSecrets(pre.stdout + pre.stderr);
    const summary = parseSummary(pre.stdout, 'pre');
    assert.equal(summary['unit.stdout'], 'append');
    assert.equal(summary['unit.filter.dev_lower'], 'kept');
    assert.equal(summary['unit.filter.prod_upper'], 'dropped');
    assert.equal(summary['cloudflared.args.loglevel'], 'debug');
    assert.equal(summary['cloudflared.args.token'], 'yes');
    assert.equal(summary['cloudflared.process.token'], 'yes');
    assert.equal(summary['cloudflared.unit_env.tunnel_logfile'], 'set');
    assert.equal(summary['cloudflared.unit_env.tunnel_token'], 'set');
    assert.equal(summary['cloudflared.env_files'], '1');
    assert.equal(summary['journald.forwardtosocket'], 'other', 'values outside the safe alphabet are never printed');
    assert.equal(summary['cloudflared.journal.dev_host_lines'], '1');
    assert.equal(summary['cloudflared.journal.prod_host_lines'], '1');
    assert.equal(summary['cloudflared.journal.host_token_lines'], '1');
    assert.equal(summary['cloudflared.journal.debug_lines'], '1');
    assert.equal(summary['cloudflared.journal.dev_host_newest_epoch'], '1794000007');
    assert.equal(summary['cloudflared.journal.host_query_lines'], '1');
    assert.equal(summary['cloudflared.journal.host_token_synthetic'], '1');
    assert.equal(summary['cloudflared.journal.host_token_other'], '0');
    assert.equal(summary['cloudflared.journal.host_token_newest_epoch'], '1794000007');
    assert.equal(summary['syslog.prod_host_lines'], '1');
    assert.equal(summary['syslog.host_cloudflared_lines'], '1');
    assert.equal(summary['syslog.host_query_lines'], '0');
    assert.equal(summary['syslog.host_token_hex64'], '0');
    assert.equal(summary['core.crash_files'], '1');
    assert.equal(summary['shippers.active'], '1');
    assert.equal(summary['shippers.promtail'], 'active');
    assert.equal(summary['audit.auditd'], 'active');
    assert.equal(summary['port.8300'], 'busy');
    assert.equal(summary['prod.verify_token_mtime'], '1794600000', 'only the modification time of the secret is read');

    const post = fixtures.collect({ phase: 'post', control: run.control, since: Number(summary['time.epoch']) - 5, markers: run.markers });
    assert.equal(post.status, 0, post.stderr);
    assertNoSecrets(post.stdout + post.stderr);
    const after = parseSummary(post.stdout, 'post');
    assert.equal(after[`marker.${id}.journal`], '1');
    assert.equal(after['cloudflared.since.dev_host_lines'], '1');
    assert.equal(after['cloudflared.since.debug_lines'], '1');

    const target = join(output, 'privileged.out');
    const privileged = fixtures.privileged(target);
    assert.equal(privileged.status, 0, privileged.stderr);
    assert.equal(privileged.stdout.trim(), 'privileged=ok');
    const content = await readFile(target, 'utf8');
    assertNoSecrets(content + privileged.stderr);
    const facts = parseSummary(content, 'privileged');
    assert.equal(facts['cloudflared.config.loglevel'], 'debug');
    assert.equal(facts['cloudflared.config.logfile'], 'set');
    assert.equal(facts['cloudflared.config.token'], 'set');
    assert.equal(facts['cloudflared.config.protocol'], 'http2');
    assert.equal(facts['cloudflared.proc_env.tunnel_token'], 'set');
    assert.equal(facts['cloudflared.env_file.tunnel_loglevel'], 'set');
    assert.equal(facts['ingress.prod_webhook'], 'prod-origin');
    assert.equal(facts['ingress.prod_root'], 'status-404');
    assert.equal(facts['ingress.dev_webhook'], 'dev-origin');
    assert.equal(facts['core.crash_files'], '1');
    const again = fixtures.privileged(target);
    assert.notEqual(again.status, 0, 'an existing summary file is never overwritten');
    const outside = fixtures.privileged(join(tmpdir(), 'elsewhere.out'));
    assert.notEqual(outside.status, 0);
  } finally {
    await fixtures.cleanup();
    await rm(output, { recursive: true, force: true });
  }
});

test('the collector rejects malformed markers and unknown phases without output', async () => {
  const fixtures = await fixture(false);
  try {
    for (const input of [{ phase: 'post', control: 'x', since: 1794000000, markers: { 'bad id': 'pxauditAAAA0000' } }, { phase: 'post', control: 'x', since: 1794000000, markers: { 'prod-root.query': 'a b' } }, { phase: 'other' }]) {
      const result = fixtures.collect(input);
      assert.notEqual(result.status, 0);
      assert.ok(!result.stdout.includes('marker.'));
    }
  } finally {
    await fixtures.cleanup();
  }
});

async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => (typeof address === 'object' && address ? resolvePort(address.port) : reject(new Error('port'))));
    });
  });
}

function startOrigin(port: number, env: Record<string, string> = {}): Promise<{ child: ChildProcessWithoutNullStreams; output: () => string; exited: Promise<number | null> }> {
  const child = spawn('python3', [ORIGIN, String(port)], { env: { ...process.env, ...env } });
  let output = '';
  let errors = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    errors += chunk;
  });
  const exited = new Promise<number | null>((resolveExit) => child.on('close', (code) => resolveExit(code)));
  return new Promise((resolveStart) => {
    child.stdout.on('data', (chunk) => {
      output += chunk;
      if (/origin=(listening|busy|failed)/.test(output)) resolveStart({ child, output: () => output + errors, exited });
    });
    child.on('close', () => resolveStart({ child, output: () => output + errors, exited }));
  });
}

test('the temporary origin answers fixed responses, logs nothing and stops on stdin EOF', async () => {
  const port = await freePort();
  const origin = await startOrigin(port);
  try {
    assert.match(origin.output(), /origin=listening/);
    const url = `http://127.0.0.1:${port}/webhooks/whatsapp?hub.verify_token=syntheticVerifySecret`;
    const ok = await fetch(url, { headers: { 'x-pilates-audit-mode': 'ok' } });
    assert.equal(ok.status, 200);
    assert.equal(await ok.text(), 'synthetic ok\n');
    const failed = await fetch(url, { method: 'POST', headers: { 'x-pilates-audit-mode': 'error', 'content-type': 'application/json' }, body: '{"from":"15555550123"}' });
    assert.equal(failed.status, 500);
    await failed.text();
    await assert.rejects(fetch(url, { headers: { 'x-pilates-audit-mode': 'reset' } }));
    await assert.rejects(fetch(url, { headers: { 'x-pilates-audit-mode': 'slow' }, signal: AbortSignal.timeout(500) }));
  } finally {
    origin.child.stdin.end();
  }
  assert.equal(await origin.exited, 0);
  assert.match(origin.output(), /origin=closed/);
  assertNoSecrets(origin.output());
  assert.ok(!origin.output().includes('GET') && !origin.output().includes('webhooks'), 'requests are never logged');
  await assert.rejects(fetch(`http://127.0.0.1:${port}/`), 'the port is released');
});

test('the temporary origin refuses a busy port and stops at its deadline', async () => {
  const port = await freePort();
  const holder = createServer();
  await new Promise<void>((resolveListen) => holder.listen(port, '127.0.0.1', resolveListen));
  try {
    const busy = await startOrigin(port);
    assert.equal(await busy.exited, 3);
    assert.match(busy.output(), /origin=busy/);
  } finally {
    await new Promise<void>((resolveClose) => holder.close(() => resolveClose()));
  }
  const timed = await startOrigin(port, { PILATES_PROXY_AUDIT_ORIGIN_SECONDS: '1' });
  assert.match(timed.output(), /origin=listening/);
  assert.equal(await timed.exited, 0, 'stops without stdin EOF');
  assert.match(timed.output(), /origin=closed/);
  timed.child.stdin.destroy();
});

function launcher(args: string[]) {
  return spawnSync(process.execPath, [LAUNCHER, ...args], { encoding: 'utf8', timeout: 30_000, env: { ...process.env, PATH: '/nonexistent' } });
}

test('the launcher validates arguments and the private Cloudflare file before any request', async () => {
  for (const args of [['--bogus'], ['other'], ['--host', 'jarvis;id'], ['--host', '-oProxyCommand=x'], ['cloudflare'], ['cloudflare', '--run', 'x'], ['--wait-minutes', '99'], ['run', '--run', 'run-0000abcd.json']]) {
    const result = launcher(args);
    assert.equal(result.status, 2, args.join(' '));
    assert.match(result.stderr, /^Uso: /);
    assert.equal(result.stdout, '');
  }
  const directory = await mkdtemp(join(tmpdir(), 'pilates-proxy-cloudflare-'));
  const inside = join(resolve('.local'), `proxy-audit-test-${process.pid}`);
  try {
    const state = join(directory, 'run-0000abcd.json');
    await writeFile(state, JSON.stringify({ schema: 'pilates-proxy-audit-run-v1', runId: '0000abcd', startedAt: '2026-11-14T10:00:00Z', finishedAt: '2026-11-14T10:01:00Z', markers: {}, probes: [] }), { mode: 0o600 });
    const token = 'synthetic-cloudflare-token-0123456789';
    const config = join(directory, 'cloudflare');
    await writeFile(config, `CLOUDFLARE_API_TOKEN=${token}\nUNEXPECTED=1\n`, { mode: 0o600 });
    const loose = join(directory, 'loose');
    await writeFile(loose, token, { mode: 0o644 });
    await chmod(loose, 0o644);
    const link = join(directory, 'link');
    await symlink(config, link);
    await mkdir(resolve('.local'), { recursive: true, mode: 0o700 });
    await writeFile(inside, token, { mode: 0o600 });
    const cases: Array<[string[], RegExp]> = [
      [['--run', state, '--cloudflare-config', 'relative/file'], /deve essere assoluto/],
      [['--run', state, '--cloudflare-config', join(directory, 'missing')], /non trovata/],
      [['--run', state, '--cloudflare-config', link], /non un collegamento/],
      [['--run', state, '--cloudflare-config', loose], /permessi 0600/],
      [['--run', state, '--cloudflare-config', inside], /fuori dal repository/],
      [['--run', state, '--cloudflare-config', config], /^Configurazione Cloudflare non valida\.$/m],
      [['--run', join(directory, 'run-ffffffff.json'), '--cloudflare-config', config], /non privato o non leggibile/],
      [['--run', join(directory, 'state.json'), '--cloudflare-config', config], /File di esecuzione non valido/],
    ];
    for (const [args, message] of cases) {
      const result = launcher(['cloudflare', ...args]);
      assert.equal(result.status, 2, args.join(' '));
      assert.match(result.stderr, message);
      assert.ok(!(result.stdout + result.stderr).includes(token), 'token leaked');
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(inside, { force: true });
  }
});
