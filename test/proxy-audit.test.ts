import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type AuditResult, type AuditSystem, buildProbe, type CollectorInput, createRun, DEV_HOST, evaluateLocal, formatFindings,
  formatSamples, hostFilterPattern, isSyntheticPhone, journaldKeeps, MARKER_PREFIX, PROBES, PROD_HOST, type ProbeRequest,
  parseSummary, releaseFinding, runAudit, type Summary, syntheticPhone, verdict,
} from '../src/proxy-audit.js';

// Deterministic xorshift32 bytes for reproducible markers.
function counter(seed = 1) {
  let state = seed >>> 0 || 1;
  return (size: number) => Uint8Array.from({ length: size }, () => {
    state = (state ^ (state << 13)) >>> 0;
    state = (state ^ (state >>> 17)) >>> 0;
    state = (state ^ (state << 5)) >>> 0;
    return state & 0xff;
  });
}

// Documented in docs/operations/TEC-036-whatsapp-ambienti.md for the production hostname.
const TEC036_PATTERN = '~[aA][gG][eE][nN][tT]-[pP][iI][lL][aA][tT][eE][sS]-[sS][tT][uU][dD][iI][oO][.][tT][oO][tT][oO]-[cC][aA][sS][tT][aA][lL][dD][iI][.][cC][oO][mM]';

const TUNNEL_ENV = ['tunnel_loglevel', 'tunnel_transport_loglevel', 'tunnel_proto_loglevel', 'tunnel_logfile', 'tunnel_logdirectory', 'tunnel_trace_output', 'tunnel_log_output', 'tunnel_management_output', 'tunnel_token'];
const env = (scope: string) => Object.fromEntries(TUNNEL_ENV.map((name) => [`cloudflared.${scope}.${name}`, 'unset']));

const PRE: Record<string, string> = {
  ...env('unit_env'),
  schema: 'pilates-proxy-audit-v1', phase: 'pre', user: 'unprivileged', 'time.epoch': '1794650000', 'systemd.version': '259',
  'unit.state': 'active', 'unit.substate': 'running', 'unit.user': 'root', 'unit.stdout': 'journal', 'unit.stderr': 'inherit',
  'unit.need_daemon_reload': 'no', 'unit.log_level_max': 'unset', 'unit.limit_core': 'infinity',
  'unit.filter.deny_patterns': '2', 'unit.filter.allow_patterns': '0', 'unit.filter.prod_lower': 'dropped', 'unit.filter.prod_upper': 'dropped',
  'unit.filter.prod_mixed': 'dropped', 'unit.filter.prod_json': 'dropped', 'unit.filter.dev_lower': 'dropped', 'unit.filter.dev_upper': 'dropped',
  'unit.filter.neutral': 'kept', 'cloudflared.exec': '/usr/bin/cloudflared', 'cloudflared.version': '2026.10.7',
  'cloudflared.sha256': 'a'.repeat(64), 'cloudflared.package_version': '2026.10.7', 'cloudflared.args.no_autoupdate': 'yes',
  'cloudflared.args.config': 'set', 'cloudflared.args.token': 'no', 'cloudflared.args.loglevel': 'unset', 'cloudflared.args.transport_loglevel': 'unset',
  'cloudflared.args.logfile': 'unset', 'cloudflared.args.log_directory': 'unset', 'cloudflared.args.trace_output': 'unset', 'cloudflared.args.output': 'unset',
  'cloudflared.args.protocol': 'unset', 'cloudflared.process.no_autoupdate': 'yes', 'cloudflared.process.config': 'set', 'cloudflared.process.token': 'no',
  'cloudflared.process.loglevel': 'unset', 'cloudflared.process.transport_loglevel': 'unset', 'cloudflared.process.logfile': 'unset',
  'cloudflared.process.log_directory': 'unset', 'cloudflared.process.trace_output': 'unset', 'cloudflared.process.output': 'unset',
  'cloudflared.process.protocol': 'unset', 'cloudflared.unit_env.tunnel_loglevel': 'unset', 'cloudflared.unit_env.tunnel_logfile': 'unset',
  'cloudflared.unit_env.tunnel_token': 'unset', 'cloudflared.env_files': '0', 'cloudflared.config.readable': 'no',
  'journald.storage': 'unset', 'journald.systemmaxuse': 'unset', 'journald.maxretentionsec': 'unset', 'journald.forwardtosyslog': 'unset',
  'journald.forwardtokmsg': 'unset', 'journald.forwardtoconsole': 'unset', 'journald.forwardtowall': 'unset', 'journald.forwardtosocket': 'unset',
  'journald.config_readable': 'yes', 'journald.persistent_dir': 'yes', 'journald.disk_usage': '512.0M', 'journal.readable': 'yes',
  'journal.oldest_epoch': '1790000000', 'cloudflared.journal.oldest_epoch': '1790000100', 'cloudflared.journal.entries': '900',
  'cloudflared.journal.prod_host_lines': '0', 'cloudflared.journal.dev_host_lines': '0', 'cloudflared.journal.host_token_lines': '0',
  'cloudflared.journal.debug_lines': '0', 'cloudflared.journal.json_lines': '0', 'cloudflared.journal.format.request_failed': '0',
  'cloudflared.journal.format.origin_unreachable': '4', 'cloudflared.journal.format.ended_abruptly': '0', 'cloudflared.journal.format.failed_to_serve': '0',
  'cloudflared.journal.prod_host_newest_epoch': 'unknown', 'cloudflared.journal.dev_host_newest_epoch': 'unknown',
  'cloudflared.journal.host_query_lines': '0', 'cloudflared.journal.host_token_hex64': '0', 'cloudflared.journal.host_token_synthetic': '0',
  'cloudflared.journal.host_token_other': '0', 'cloudflared.journal.host_token_newest_epoch': 'unknown',
  'syslog.host_cloudflared_lines': '0', 'syslog.host_token_lines': '0', 'syslog.host_query_lines': '0', 'syslog.host_token_hex64': '0',
  'syslog.host_token_synthetic': '0', 'syslog.host_token_other': '0', 'syslog.host_token_newest_date': 'none',
  'cloudflared.journal.protocol': 'quic', 'cloudflared.journal.version': '2026.10.7', 'syslog.rsyslog': 'active', 'syslog.syslog_ng': 'inactive',
  'syslog.files': '3', 'syslog.readable_files': '3', 'syslog.cloudflared_lines': '0', 'syslog.prod_host_lines': '0', 'syslog.dev_host_lines': '0',
  'logrotate.rsyslog_rotate': '4', 'logrotate.rsyslog_frequency': 'weekly', 'core.pattern': 'apport', 'core.apport_enabled': 'yes',
  'core.crash_files': '0', 'audit.auditd': 'inactive', 'shippers.active': '0', 'port.8300': 'free', 'port.18190': 'busy', 'control.written': 'yes',
  'prod.verify_token_mtime': '1794600000',
};

function summary(values: Record<string, string>, phase: 'pre' | 'post' | 'privileged'): Summary {
  return parseSummary(Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n'), phase);
}

function post(markers: Record<string, string>, overrides: Record<string, string> = {}): Summary {
  const values: Record<string, string> = {
    schema: 'pilates-proxy-audit-v1', phase: 'post', user: 'unprivileged', 'time.epoch': '1794650100', 'since.epoch': '1794649995',
    'journal.readable': 'yes', 'journal.since_bytes': '4096', 'control.journal': '1', 'cloudflared.since.entries': '6',
    'cloudflared.since.prod_host_lines': '0', 'cloudflared.since.dev_host_lines': '0', 'cloudflared.since.host_token_lines': '0',
    'cloudflared.since.debug_lines': '0', 'cloudflared.since.json_lines': '0', 'cloudflared.since.format.request_failed': '0',
    'cloudflared.since.host_query_lines': '0', 'cloudflared.since.host_token_hex64': '0', 'cloudflared.since.host_token_synthetic': '0',
    'cloudflared.since.host_token_other': '0', 'cloudflared.since.host_token_newest_epoch': 'unknown',
    'cloudflared.since.format.origin_unreachable': '3', 'cloudflared.since.format.ended_abruptly': '1', 'cloudflared.since.format.failed_to_serve': '0',
    'port.8300': 'free',
  };
  for (const id of Object.keys(markers)) {
    values[`marker.${id}.journal`] = '0';
    values[`marker.${id}.syslog`] = '0';
  }
  return summary({ ...values, ...overrides }, 'post');
}

const PRIVILEGED: Record<string, string> = {
  ...env('proc_env'),
  ...env('env_file'),
  schema: 'pilates-proxy-audit-v1', phase: 'privileged', user: 'root', 'time.epoch': '1794649000', 'cloudflared.config.readable': 'yes',
  'cloudflared.config.loglevel': 'unset', 'cloudflared.config.transport_loglevel': 'unset', 'cloudflared.config.logfile': 'unset',
  'cloudflared.config.log_directory': 'unset', 'cloudflared.config.trace_output': 'unset', 'cloudflared.config.metrics': 'unset',
  'cloudflared.config.output': 'unset', 'cloudflared.config.protocol': 'unset', 'cloudflared.config.no_autoupdate': 'unset',
  'cloudflared.config.token': 'unset', 'cloudflared.config.ingress_rules': '5', 'ingress.prod_webhook': 'prod-origin', 'ingress.prod_root': 'status-404',
  'ingress.prod_health': 'status-404', 'ingress.prod_subpath': 'status-404', 'ingress.dev_webhook': 'dev-origin', 'ingress.dev_root': 'status-404',
  'cloudflared.proc_env.tunnel_loglevel': 'unset', 'cloudflared.proc_env.tunnel_logfile': 'unset', 'cloudflared.env_file.tunnel_loglevel': 'unset',
  'core.crash_files': '0',
};

function result(overrides: { pre?: Record<string, string>; post?: Record<string, string>; privileged?: Record<string, string> | null; probes?: AuditResult['probes'] } = {}): AuditResult {
  const run = createRun(counter());
  return {
    run,
    pre: summary({ ...PRE, ...overrides.pre }, 'pre'),
    post: post(run.markers, overrides.post),
    privileged: overrides.privileged === null ? null : summary({ ...PRIVILEGED, ...overrides.privileged }, 'privileged'),
    probes: overrides.probes ?? PROBES.map((probe) => ({ id: probe.id, group: probe.group, status: probe.expected, ray: null, edgeBlocked: false })),
    origin: 'closed',
    since: 1794649995,
  };
}

test('synthetic markers are unique, prefixed and use only fictional telephone numbers', () => {
  const run = createRun(counter());
  assert.match(run.runId, /^[0-9a-f]{8}$/);
  assert.equal(run.prefix, `${MARKER_PREFIX}${run.runId}`);
  const values = Object.values(run.markers);
  assert.equal(new Set(values).size, values.length);
  for (const [id, value] of Object.entries(run.markers)) {
    assert.match(id, /^[a-z0-9-]+\.[a-z]+$/);
    if (id.endsWith('.phone')) assert.ok(isSyntheticPhone(value), id);
    else assert.ok(value.startsWith(run.prefix) && /^[A-Za-z0-9]{8,64}$/.test(value), id);
  }
  assert.ok(run.control.startsWith(run.prefix));
  for (let index = 0; index < 256; index += 1) assert.ok(isSyntheticPhone(syntheticPhone(Uint8Array.of(index, 255 - index, index))));
  assert.throws(() => createRun(() => new Uint8Array(4)), /non univoci/);
  assert.throws(() => syntheticPhone(new Uint8Array(2)));
});

test('probes target only the webhook hostnames and carry markers in query, headers and body', () => {
  const run = createRun(counter(7));
  const requests = PROBES.map((spec) => buildProbe(spec, run));
  for (const request of requests) {
    const url = new URL(request.url);
    assert.ok([PROD_HOST, DEV_HOST].includes(url.hostname));
    assert.equal(url.protocol, 'https:');
    const spec = PROBES.find((item) => item.id === request.id);
    assert.ok(spec);
    for (const kind of spec.kinds) {
      const marker = run.markers[`${request.id}.${kind}`];
      const where = `${request.url} ${JSON.stringify(request.headers)} ${request.body ?? ''}`;
      assert.ok(where.includes(marker), `${request.id}.${kind}`);
    }
  }
  const byId = Object.fromEntries(requests.map((request) => [request.id, request]));
  assert.equal(new URL(byId['prod-root'].url).pathname, '/');
  assert.equal(new URL(byId['prod-health'].url).pathname, '/health');
  assert.match(new URL(byId['prod-subpath'].url).pathname, /^\/whatsapp\/webhook\/pxaudit/);
  assert.equal(new URL(byId['prod-verify'].url).searchParams.get('hub.mode'), 'subscribe');
  assert.equal(byId['prod-python'].headers['user-agent'], 'Python-urllib/3.14');
  assert.equal(new URL(byId['dev-verify'].url).pathname, '/webhooks/whatsapp');
  assert.equal(byId['origin-reset'].headers['x-pilates-audit-mode'], 'reset');
  assert.equal(byId['origin-cancel'].abortAfterMs, 3000);
  const body = JSON.parse(byId['prod-unsigned'].body ?? '{}');
  assert.equal(body.entry[0].changes[0].value.messages[0].from, run.markers['prod-unsigned.phone']);
  assert.equal(byId['prod-unsigned'].headers['x-hub-signature-256'], undefined);
  assert.equal(byId['prod-badsig'].headers['x-hub-signature-256'], `sha256=${run.markers['prod-badsig.signature']}`);
});

test('remote summaries are accepted only with known keys and safe values', () => {
  assert.equal(summary(PRE, 'pre')['unit.state'], 'active');
  const text = Object.entries(PRE).map(([key, value]) => `${key}=${value}`).join('\r\n');
  assert.equal(parseSummary(text, 'pre')['cloudflared.version'], '2026.10.7');
  const invalid = [
    { ...PRE, 'unit.filter.prod_lower': 'hub.verify_token=secret' },
    { ...PRE, 'cloudflared.journal.entries': '12a' },
    { ...PRE, 'journald.storage': 'value with spaces' },
    { ...PRE, 'cloudflared.sha256': 'z'.repeat(64) },
    { ...PRE, 'cloudflared.raw_message': 'x' },
    { ...PRE, 'marker.prod-root.query.journal': '+15555550123' },
    { ...PRE, schema: 'other' },
  ];
  for (const values of invalid) {
    assert.throws(() => summary(values, 'pre'), (error: Error) => error.message === 'Riepilogo remoto non valido.');
  }
  assert.throws(() => summary(PRE, 'post'));
  assert.throws(() => parseSummary(`${text}\nunit.state=active`, 'pre'));
  assert.throws(() => parseSummary('schema=pilates-proxy-audit-v1\nphase=pre\nno separator', 'pre'));
  assert.throws(() => parseSummary(`${text}\n${'x'.repeat(200_001)}`, 'pre'));
});

test('the journald filter pattern matches the documented one and drops every line that carries the hostname', () => {
  assert.equal(hostFilterPattern(PROD_HOST), TEC036_PATTERN);
  const patterns = [hostFilterPattern(PROD_HOST), hostFilterPattern(DEV_HOST)];
  const secret = 'hub.verify_token=pxauditSYNTHETIC&hub.challenge=42';
  for (const [host, path] of [[PROD_HOST, '/whatsapp/webhook'], [DEV_HOST, '/webhooks/whatsapp']]) {
    const samples = formatSamples(host, path, secret);
    for (const name of ['quicRequestFailed', 'quicRequestFailedJson', 'debugRequest'] as const) {
      assert.equal(journaldKeeps(patterns, samples[name]), false, name);
      assert.equal(journaldKeeps(patterns, samples[name].replace(host, host.toUpperCase())), false, `${name} uppercase`);
    }
    for (const name of ['proxyError', 'proxyCancelled', 'http2Failed'] as const) {
      assert.equal(journaldKeeps(patterns, samples[name]), true, name);
      assert.ok(!samples[name].includes('pxauditSYNTHETIC') && !samples[name].includes(host), `${name} carries no request data`);
    }
  }
  assert.equal(journaldKeeps([], 'anything'), true);
  assert.equal(journaldKeeps(['ERR'], 'INF connected'), false);
  assert.equal(journaldKeeps(['ERR', '~secret'], 'ERR secret'), false);
});

test('a clean, fully verified audit has no exposure', () => {
  const findings = evaluateLocal(result());
  assert.deepEqual(findings.filter((finding) => finding.level === 'exposure' || finding.level === 'unverified'), []);
  assert.equal(verdict(findings).code, 0);
  const lines = formatFindings('Titolo', findings);
  assert.equal(lines[0], 'Titolo');
  assert.match(lines.at(-1) ?? '', /nessuna esposizione/);
});

test('local exposures are reported', () => {
  const run = createRun(counter());
  const cases: Array<[string, Parameters<typeof result>[0], RegExp]> = [
    ['debug', { pre: { 'cloudflared.args.loglevel': 'debug' } }, /debug/],
    ['config debug', { privileged: { 'cloudflared.config.loglevel': 'debug' } }, /debug/],
    ['transport debug', { pre: { 'cloudflared.process.transport_loglevel': 'debug' } }, /trasporto/],
    ['logfile', { privileged: { 'cloudflared.config.log_directory': 'set' } }, /file di log/],
    ['env logfile', { privileged: { 'cloudflared.proc_env.tunnel_logfile': 'set' } }, /file di log/],
    ['token', { pre: { 'cloudflared.process.token': 'yes' } }, /Token del tunnel/],
    ['stdout file', { pre: { 'unit.stdout': 'append' } }, /su file/],
    ['filter', { pre: { 'unit.filter.prod_upper': 'kept' } }, /non scarta/],
    ['marker', { post: { [`marker.${Object.keys(run.markers)[0]}.journal`]: '1' } }, /Marcatori sintetici trovati/],
    ['syslog marker', { post: { [`marker.${Object.keys(run.markers)[0]}.syslog`]: '2' } }, /file syslog/],
    ['hosts', { post: { 'cloudflared.since.dev_host_lines': '1' } }, /Righe con hostname registrate/],
    ['debug lines', { pre: { 'cloudflared.journal.debug_lines': '3' } }, /Righe di debug/],
  ];
  for (const [name, overrides, text] of cases) {
    const findings = evaluateLocal(result(overrides));
    const exposures = findings.filter((finding) => finding.level === 'exposure');
    assert.ok(exposures.some((finding) => text.test(finding.text)), name);
    assert.equal(verdict(findings).code, 1, name);
  }
});

test('missing evidence is reported as not verified', () => {
  const cases: Array<[string, Parameters<typeof result>[0], RegExp]> = [
    ['privileged', { privileged: null }, /raccolta privilegiata/],
    ['control', { post: { 'control.journal': '0' } }, /Controllo positivo assente/],
    ['syslog unknown', { post: { [`marker.${Object.keys(createRun(counter()).markers)[0]}.syslog`]: 'unknown' } }, /syslog non eseguita/],
    ['unit', { pre: { 'unit.state': 'inactive' } }, /non attivo/],
    ['reload', { pre: { 'unit.need_daemon_reload': 'yes' } }, /non ricaricata/],
    ['shippers', { pre: { 'shippers.active': '1', 'shippers.promtail': 'active' } }, /promtail/],
    ['crash', { pre: { 'core.crash_files': '2' }, privileged: { 'core.crash_files': '2' } }, /Crash report/],
    ['ingress', { privileged: { 'ingress.prod_root': 'prod-origin' } }, /prod_root/],
    ['metrics', { privileged: { 'cloudflared.config.metrics': 'set', 'cloudflared.config.metrics_scope': 'any' } }, /non limitato a loopback/],
    ['probe', { probes: [{ id: 'prod-root', group: 'prod', status: 403, ray: null, edgeBlocked: true }] }, /bloccata da Cloudflare/],
    ['skipped', { probes: [{ id: 'dev-verify', group: 'dev-down', status: 'skipped', ray: null, edgeBlocked: false }] }, /non eseguita/],
  ];
  for (const [name, overrides, text] of cases) {
    const findings = evaluateLocal(result(overrides));
    assert.ok(findings.some((finding) => finding.level === 'unverified' && text.test(finding.text)), name);
    assert.equal(verdict(findings).code, 3, name);
  }
  const closed = { ...result(), origin: 'close-failed' as const };
  assert.ok(evaluateLocal(closed).some((finding) => /Chiusura dell'origine/.test(finding.text)));
  const busy = { ...result({ post: { 'port.8300': 'busy' } }) };
  assert.ok(evaluateLocal(busy).some((finding) => /risulta occupata/.test(finding.text)));
  const historic = evaluateLocal(result({ pre: { 'cloudflared.journal.dev_host_lines': '2', 'cloudflared.journal.dev_host_newest_epoch': '1793700000' } }));
  assert.ok(historic.some((finding) => finding.level === 'info' && /Righe storiche/.test(finding.text) && /2026-11-03/.test(finding.text)));
  for (const shape of ['hex64', 'other']) {
    const token = evaluateLocal(result({ pre: { 'cloudflared.journal.dev_host_lines': '2', 'cloudflared.journal.host_token_lines': '1', [`cloudflared.journal.host_token_${shape}`]: '1' } }));
    assert.ok(token.some((finding) => finding.level === 'unverified' && /possibile verify token reale/.test(finding.text)), shape);
    const syslog = evaluateLocal(result({ pre: { 'syslog.dev_host_lines': '3', 'syslog.host_token_lines': '1', [`syslog.host_token_${shape}`]: '1', 'syslog.host_token_newest_date': '2026-11-04' } }));
    assert.ok(syslog.some((finding) => finding.section === 'syslog' && finding.level === 'unverified' && /2026-11-04/.test(finding.text)), shape);
  }
  const synthetic = evaluateLocal(result({ pre: { 'cloudflared.journal.dev_host_lines': '2', 'cloudflared.journal.host_token_lines': '1', 'cloudflared.journal.host_token_synthetic': '1' } }));
  assert.ok(synthetic.some((finding) => finding.level === 'info' && /sintetici 1, altri 0/.test(finding.text)));
});

function fakeSystem(options: { port?: string; origin?: 'busy' | 'ok' | 'throw'; failOn?: string } = {}) {
  const calls: string[] = [];
  const inputs: CollectorInput[] = [];
  let closed = 0;
  const system: AuditSystem = {
    randomBytes: counter(3),
    async collect(input) {
      calls.push(`collect:${input.phase}`);
      inputs.push(input);
      if (input.phase === 'pre') return Object.entries({ ...PRE, 'port.8300': options.port ?? 'free' }).map(([key, value]) => `${key}=${value}`).join('\n');
      const values: string[] = ['schema=pilates-proxy-audit-v1', 'phase=post', 'user=unprivileged', 'time.epoch=1794650100', `since.epoch=${input.since}`,
        'journal.readable=yes', 'journal.since_bytes=10', 'control.journal=1', 'port.8300=free'];
      for (const id of Object.keys(input.markers ?? {})) values.push(`marker.${id}.journal=0`, `marker.${id}.syslog=0`);
      return values.join('\n');
    },
    async startOrigin() {
      calls.push('origin:start');
      if (options.origin === 'busy') return 'busy';
      if (options.origin === 'throw') throw new Error('x');
      return {
        async close() {
          closed += 1;
          calls.push('origin:close');
          return true;
        },
      };
    },
    async request(probe: ProbeRequest) {
      calls.push(`request:${probe.id}`);
      if (probe.id === options.failOn) throw new Error('synthetic failure');
      return { id: probe.id, status: probe.expected, ray: '0123456789abcdef-MXP', edgeBlocked: false };
    },
    async sleep(ms) {
      calls.push(`sleep:${ms}`);
    },
  };
  return { system, calls, inputs, closed: () => closed };
}

test('the audit runs pre, probes, temporary origin and post in order, passing markers only to post', async () => {
  const fake = fakeSystem();
  const audit = await runAudit(fake.system, { dev: true, origin: true, settleMs: 5, privileged: null });
  assert.deepEqual(fake.calls, [
    'collect:pre',
    ...PROBES.filter((probe) => probe.group === 'prod').map((probe) => `request:${probe.id}`),
    ...PROBES.filter((probe) => probe.group === 'dev-down').map((probe) => `request:${probe.id}`),
    'origin:start',
    ...PROBES.filter((probe) => probe.group === 'dev-origin').map((probe) => `request:${probe.id}`),
    'origin:close', 'sleep:5', 'collect:post',
  ]);
  assert.equal(fake.inputs[0].markers, undefined);
  assert.equal(fake.inputs[0].control, audit.run.control);
  assert.deepEqual(fake.inputs[1].markers, audit.run.markers);
  assert.equal(fake.inputs[1].since, 1794650000 - 5);
  assert.equal(audit.origin, 'closed');
  assert.equal(audit.probes.length, PROBES.length);
});

test('the temporary origin is closed even when a probe fails, and skipped when the port is busy', async () => {
  const failing = fakeSystem({ failOn: 'origin-error' });
  await assert.rejects(runAudit(failing.system, { dev: true, origin: true, settleMs: 0, privileged: null }), /synthetic failure/);
  assert.equal(failing.closed(), 1);

  const busyPort = fakeSystem({ port: 'busy' });
  const audit = await runAudit(busyPort.system, { dev: true, origin: true, settleMs: 0, privileged: null });
  assert.ok(!busyPort.calls.includes('origin:start'));
  assert.ok(audit.probes.filter((probe) => probe.group !== 'prod').every((probe) => probe.status === 'skipped'));

  for (const origin of ['busy', 'throw'] as const) {
    const fake = fakeSystem({ origin });
    const outcome = await runAudit(fake.system, { dev: true, origin: true, settleMs: 0, privileged: null });
    assert.equal(outcome.origin, origin === 'busy' ? 'busy' : 'start-failed');
    assert.ok(outcome.probes.filter((probe) => probe.group === 'dev-origin').every((probe) => probe.status === 'skipped'));
  }
  const noDev = fakeSystem();
  const local = await runAudit(noDev.system, { dev: false, origin: true, settleMs: 0, privileged: null });
  assert.equal(local.origin, 'not-requested');
  assert.ok(!noDev.calls.some((call) => call.includes('dev-')));
});

test('the binary is compared with the checksums published in the release notes', () => {
  const sha = '1f99fb518b83dec2ba8d870a7cc991d82a77e6196295a3d2754ba17ab9f91872';
  const notes = `### SHA256 Checksums:\n\`\`\`\ncloudflared-linux-amd64.deb: ${'7'.repeat(64)}\ncloudflared-linux-amd64: ${sha}\n\`\`\``;
  const ok = releaseFinding('2026.10.7', sha, notes);
  assert.equal(ok.level, 'ok');
  assert.match(ok.text, /cloudflared-linux-amd64 della release 2026\.10\.7/);
  assert.equal(releaseFinding('2026.10.7', 'a'.repeat(64), notes).level, 'unverified');
  assert.equal(releaseFinding('2026.10.7', sha, null).level, 'unverified');
  assert.equal(releaseFinding('unknown', 'unknown', notes).level, 'unverified');
  assert.equal(releaseFinding(undefined, sha, notes).level, 'unverified');
});
