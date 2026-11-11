import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { Client } from 'pg';

type ModelObservation = {
  kind: 'turn' | 'summary' | 'aux'; model: string; chars: number; last_role: string;
  verbatim: string[]; all: string[]; current: string[]; summary_in_context: boolean; soul: boolean; clock: boolean;
  private_phone: boolean;
};
type MetaObservation = { to: string; text: string };

const WINDOW = 200_000;
const THRESHOLD = 80_000;
const IDLE_SECONDS = 30;
const ALPHA = '15555550102';
const BETA = '15555550103';
const REPLY = 'Risposta sintetica.';

// Synthetic padding: about `tokens` rough tokens (4 characters each) after the marker.
const message = (marker: string, tokens: number) => `${marker} ${'parola sintetica '.repeat(Math.ceil((tokens * 4) / 17))}`.trim();

test('per-sender contexts compact silently at 40% of the model window and after inactivity', { timeout: 1_800_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pilates-compaction-test-'));
  const project = `pilates-compaction-${randomBytes(8).toString('hex')}`;
  const secrets: Record<string, string> = {
    'db-admin': randomBytes(32).toString('hex'), 'db-migrator': randomBytes(32).toString('hex'),
    'db-agent': randomBytes(32).toString('hex'), 'db-broker': randomBytes(32).toString('hex'),
    'bridge-token': randomBytes(32).toString('hex'), 'openrouter-key': 'synthetic-model-token',
    'whatsapp-access-token': 'synthetic-access-token', 'whatsapp-app-secret': 'synthetic-app-secret',
    'whatsapp-verify-token': 'synthetic-verify-token', 'whatsapp-allowed-users': `${ALPHA},${BETA}`,
    'whatsapp-home-channel': ALPHA, 'whatsapp-phone-number-id': '123456789012345',
    'whatsapp-teacher-links': '[]',
  };
  const override = join(directory, 'override.yaml');
  const env = {
    ...process.env, COMPOSE_ENV_FILES: '/dev/null', SECRETS_DIR: directory, POSTGRES_PORT: '0', WHATSAPP_WEBHOOK_PORT: '0',
    PILATES_MODEL: 'synthetic/compaction-model', PILATES_IDLE_COMPACT_SECONDS: String(IDLE_SECONDS),
  };
  const composeWith = (extra: Record<string, string>, ...args: string[]) => execFileSync('docker', ['compose', '-p', project, '-f', 'compose.yaml', '-f', override, ...args], { env: { ...env, ...extra }, encoding: 'utf8', stdio: 'pipe', timeout: 240_000 });
  const compose = (...args: string[]) => composeWith({}, ...args);
  let database: Client | undefined;
  try {
    await Promise.all(Object.entries(secrets).map(([name, value]) => writeFile(join(directory, name), value, { mode: 0o600 })));
    const config = await readFile('hermes/config.yaml', 'utf8');
    assert.equal(config.split('\ndisplay:\n').length, 2);
    // Tool progress is not a compaction notice; keep the observed channel to final replies.
    await writeFile(join(directory, 'config.yaml'), config.replace('\ndisplay:\n', '\ndisplay:\n  tool_progress: off\n'));
    await writeFile(override, `services:\n  model-stub:\n    image: ${project}-hermes\n    entrypoint: ["/opt/hermes/.venv/bin/python", "/compaction_stub.py"]\n    volumes:\n      - ${JSON.stringify(`${resolve('integration/compaction_stub.py')}:/compaction_stub.py:ro`)}\n    logging:\n      driver: none\n  meta-stub:\n    image: ${project}-hermes\n    entrypoint: ["/opt/hermes/.venv/bin/python", "/meta_stub.py"]\n    volumes:\n      - ${JSON.stringify(`${resolve('scenarios/meta_stub.py')}:/meta_stub.py:ro`)}\n    logging:\n      driver: none\n  hermes:\n    environment:\n      OPENROUTER_BASE_URL: http://model-stub:8088/v1\n      NO_PROXY: model-stub,meta-stub,localhost,127.0.0.1\n    volumes:\n      - ${JSON.stringify(`${resolve('scenarios/gateway-launcher.sh')}:/opt/hermes/libexec/hermes:ro`)}\n      - ${JSON.stringify(`${join(directory, 'config.yaml')}:/opt/data/config.yaml:ro`)}\nnetworks:\n  default:\n    internal: true\n`);
    compose('build', 'hermes');
    compose('up', '-d', '--wait', 'postgres');
    compose('run', '--rm', 'db-bootstrap');
    const address = (service: string) => {
      const id = compose('ps', '-q', service).trim();
      const ip = execFileSync('docker', ['inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', id], { encoding: 'utf8' }).trim();
      assert.ok(ip);
      return ip;
    };
    const migrationUrl = new URL(`postgresql://${address('postgres')}:5432/studio?schema=public`);
    migrationUrl.username = 'studio_migrator';
    migrationUrl.password = secrets['db-migrator'];
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: { ...env, DATABASE_URL: migrationUrl.toString() }, stdio: 'pipe', timeout: 90_000 });
    const db = new Client({ host: address('postgres'), port: 5432, database: 'studio', user: 'studio_migrator', password: secrets['db-migrator'] });
    database = db;
    await db.connect();
    compose('up', '-d', '--wait', 'model-stub', 'meta-stub');

    // Invalid inactivity and an unknown model window stop the gateway with only the fixed event.
    for (const extra of [{ PILATES_IDLE_COMPACT_SECONDS: '0' }, { PILATES_IDLE_COMPACT_SECONDS: 'quattro' }, { PILATES_MODEL: 'synthetic/missing-model' }] as Record<string, string>[]) {
      assert.throws(() => composeWith(extra, 'run', '--rm', '--no-deps', 'hermes'), (error: unknown) => {
        const output = error as { stdout?: string; stderr?: string };
        const combined = `${output.stdout ?? ''}${output.stderr ?? ''}`;
        assert.match(combined, /hermes_preflight_failed/);
        assert.doesNotMatch(combined, /synthetic-model-token|synthetic-app-secret|1555555010[23]/);
        return true;
      });
    }

    compose('up', '-d', '--wait', '--wait-timeout', '150', 'hermes');
    const gatewayId = () => compose('ps', '-q', 'hermes').trim();
    let gateway = `http://${address('hermes')}:8090/whatsapp/webhook`;
    const model = `http://${address('model-stub')}:8088/v1`;
    const meta = `http://${address('meta-stub')}:8088/observations`;
    const python = (script: string) => execFileSync('docker', ['exec', '--user', '10000', gatewayId(), '/opt/hermes/.venv/bin/python', '-c', script], { encoding: 'utf8', stdio: 'pipe', timeout: 60_000 });
    // The live gateway received the threshold derived from the synthetic catalog,
    // and Hermes' compressor keeps it despite its small-window 75% floor.
    // Print only the two compaction variables of the gateway process, not its secrets.
    const launched = execFileSync('docker', ['exec', gatewayId(), 'sh', '-c', 'for f in /proc/[0-9]*/environ; do { tr "\\0" "\\n" < "$f"; } 2>/dev/null | grep -E "^PILATES_(COMPACTION_THRESHOLD_TOKENS|IDLE_COMPACT_SECONDS)="; done | sort -u'], { encoding: 'utf8' }).trim().split('\n');
    assert.deepEqual(launched.filter((line) => line.startsWith('PILATES_COMPACTION_')), [`PILATES_COMPACTION_THRESHOLD_TOKENS=${THRESHOLD}`]);
    assert.ok(launched.includes(`PILATES_IDLE_COMPACT_SECONDS=${IDLE_SECONDS}`));
    python([
      'from agent.context_compressor import ContextCompressor',
      `c = ContextCompressor('synthetic/compaction-model', threshold_percent=0.5, config_context_length=${WINDOW}, threshold_tokens_cap=${THRESHOLD}, provider='openrouter')`,
      `threshold = c.threshold_tokens`,
      `assert c.threshold_percent >= 0.75 and threshold == ${THRESHOLD}, (c.threshold_percent, threshold)`,
    ].join('\n'));

    const modelObservations = async () => await (await fetch(`${model}/observations`)).json() as ModelObservation[];
    const metaObservations = async () => await (await fetch(meta)).json() as MetaObservation[];
    const send = async (sender: string, text: string) => {
      const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: '999', changes: [{ field: 'messages', value: {
        metadata: { phone_number_id: secrets['whatsapp-phone-number-id'] }, contacts: [{ wa_id: sender, profile: { name: 'Synthetic' } }],
        messages: [{ from: sender, id: `wamid.synthetic.${randomBytes(16).toString('hex')}`, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }],
      } }] }] });
      const signature = `sha256=${createHmac('sha256', secrets['whatsapp-app-secret']).update(payload).digest('hex')}`;
      assert.equal((await fetch(gateway, { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signature } })).status, 200);
    };
    // One complete turn: returns only the model requests it caused.
    const turn = async (sender: string, text: string) => {
      const modelBefore = (await modelObservations()).length;
      const metaBefore = (await metaObservations()).length;
      await send(sender, text);
      for (let i = 0; i < 180; i++) {
        const replies = (await metaObservations()).slice(metaBefore);
        if (replies.some((item) => item.to === sender)) {
          await delay(1500);
          return (await modelObservations()).slice(modelBefore);
        }
        await delay(1000);
      }
      return assert.fail('Timed out waiting for synthetic reply');
    };
    const kinds = (observations: ModelObservation[], kind: string) => observations.filter((item) => item.kind === kind);
    const lastTurn = (observations: ModelObservation[]) => {
      const turns = kinds(observations, 'turn');
      assert.ok(turns.length > 0);
      return turns[turns.length - 1];
    };
    const waitIdle = () => delay((IDLE_SECONDS + 5) * 1000);
    const waitHealthy = async () => {
      for (let i = 0; i < 90; i++) {
        gateway = `http://${address('hermes')}:8090/whatsapp/webhook`;
        try { if ((await fetch(gateway.replace('/whatsapp/webhook', '/health'))).ok) return; } catch { /* restarting */ }
        await delay(1000);
      }
      assert.fail('Gateway not healthy');
    };
    const domain = async () => (await db.query("SELECT (SELECT count(*) FROM app.clients)::int AS clients, (SELECT count(*) FROM app.training_rules)::int AS rules")).rows[0];
    const domainBefore = await domain();

    // 1. Threshold: alpha grows by ~10K tokens per turn; compaction starts when the
    // request reaches about 40% of the 200K window, well before Hermes' 75% floor.
    let observations: ModelObservation[] = [];
    let previousChars = 0;
    const trace: string[] = [];
    let crossing: { index: number; estimate: number; previous: number; observations: ModelObservation[] } | undefined;
    for (let index = 1; index <= 14 && !crossing; index++) {
      // Put a configured number in the middle of persisted history too, so
      // the summary route is exercised independently of the native prompt.
      const text = message(`MARK-A-${index}${index === 3 ? ` ${ALPHA}` : ''}`, 10_000);
      const observations = await turn(ALPHA, text);
      trace.push(observations.map((item) => `${item.kind}:${Math.round(item.chars / 4)}:${item.verbatim.length}`).join(','));
      if (kinds(observations, 'summary').length > 0) {
        crossing = { index, estimate: (previousChars + text.length + REPLY.length) / 4, previous: previousChars / 4, observations };
      } else {
        previousChars = lastTurn(observations).chars;
      }
    }
    assert.ok(crossing, `threshold compaction did not start: ${trace.join(' | ')}`);
    assert.ok(crossing.previous < THRESHOLD, `compaction should not start below the threshold (${crossing.previous})`);
    assert.ok(crossing.estimate >= 0.36 * WINDOW && crossing.estimate < 0.47 * WINDOW, `unexpected trigger point ${crossing.estimate}`);
    const afterThreshold = lastTurn(crossing.observations);
    assert.ok(afterThreshold.summary_in_context && afterThreshold.soul && afterThreshold.clock);
    assert.deepEqual(afterThreshold.current, [`MARK-A-${crossing.index}`]);
    // Hermes' lean summary keeps excerpts of user messages, so markers may remain:
    // compaction is proven by the much smaller request sent after the summary.
    assert.ok(afterThreshold.chars / 4 < 0.6 * crossing.estimate, `request not reduced: ${trace.join(' | ')}`);
    const alphaLatest = crossing.index + 1;
    observations = await turn(ALPHA, message(`MARK-A-${alphaLatest}`, 10_000));
    assert.equal(kinds(observations, 'summary').length, 0);
    let alphaChars = lastTurn(observations).chars;

    // 2. Inactivity: beta stays far below the threshold; only a resumed turn compacts.
    let betaChars = 0;
    for (let index = 1; index <= 6; index++) {
      observations = await turn(BETA, message(`MARK-B-${index}${index === 3 ? ' +1 (555) 555-0103' : ''}`, 5_000));
      assert.equal(kinds(observations, 'summary').length, 0);
      betaChars = lastTurn(observations).chars;
    }
    await waitIdle();
    observations = await turn(BETA, 'MARK-B-7 ciao');
    let summaryIndex = observations.findIndex((item) => item.kind === 'summary');
    let turnIndex = observations.findIndex((item) => item.kind === 'turn');
    assert.ok(summaryIndex >= 0 && summaryIndex < turnIndex, 'resume compaction must precede the new request');
    assert.ok(observations[summaryIndex].all.includes('MARK-B-3'));
    let resumed = lastTurn(observations);
    assert.ok(resumed.summary_in_context && resumed.soul && resumed.clock);
    assert.deepEqual(resumed.current, ['MARK-B-7']);
    assert.ok(resumed.verbatim.includes('MARK-B-6') && resumed.chars < 0.85 * betaChars, 'resume compaction must reduce the request');
    observations = await turn(BETA, 'MARK-B-8 ciao');
    assert.equal(kinds(observations, 'summary').length, 0);
    assert.ok(lastTurn(observations).chars >= resumed.chars, 'no compaction within the interval');

    // 3. Restart: the cached agent is gone; inactivity still comes from SQLite.
    compose('restart', 'hermes');
    await waitHealthy();
    observations = await turn(ALPHA, 'MARK-A-20 ciao');
    summaryIndex = observations.findIndex((item) => item.kind === 'summary');
    turnIndex = observations.findIndex((item) => item.kind === 'turn');
    assert.ok(summaryIndex >= 0 && summaryIndex < turnIndex, 'resume compaction after restart');
    assert.ok(observations[summaryIndex].summary_in_context, 'the persisted summary survives restart');
    resumed = lastTurn(observations);
    assert.ok(resumed.current.includes('MARK-A-20') && resumed.soul && resumed.clock);
    assert.ok(resumed.chars < 0.85 * alphaChars, 'resume compaction after restart must reduce the request');

    // 4. Recreation: same volume, new container.
    for (const index of [9, 10]) betaChars = lastTurn(await turn(BETA, message(`MARK-B-${index}`, 5_000))).chars;
    compose('up', '-d', '--no-deps', '--force-recreate', '--wait', '--wait-timeout', '150', 'hermes');
    await waitHealthy();
    await waitIdle();
    observations = await turn(BETA, 'MARK-B-11 ciao');
    summaryIndex = observations.findIndex((item) => item.kind === 'summary');
    turnIndex = observations.findIndex((item) => item.kind === 'turn');
    assert.ok(summaryIndex >= 0 && summaryIndex < turnIndex, 'resume compaction after recreation');
    assert.ok(observations[summaryIndex].summary_in_context, 'the persisted summary survives recreation');
    assert.ok(lastTurn(observations).chars < 0.85 * betaChars, 'resume compaction after recreation must reduce the request');

    // 5. A failing summary is silent and the turn continues with the full context.
    for (const index of [21, 22]) alphaChars = lastTurn(await turn(ALPHA, message(`MARK-A-${index}`, 10_000))).chars;
    await waitIdle();
    assert.equal((await fetch(`${model}/control`, { method: 'POST', body: JSON.stringify({ fail_summary: true }) })).status, 200);
    observations = await turn(ALPHA, 'MARK-A-30 ciao');
    assert.equal((await fetch(`${model}/control`, { method: 'POST', body: JSON.stringify({ fail_summary: false }) })).status, 200);
    assert.ok(kinds(observations, 'summary').length > 0, 'a summary was attempted');
    const unchanged = lastTurn(observations);
    assert.ok(unchanged.current.includes('MARK-A-30') && unchanged.chars >= alphaChars, 'a failed summary keeps the full context');

    // 6. Compaction never changed domain data; a later registration keeps the system author.
    assert.deepEqual(await domain(), domainBefore);
    await turn(BETA, 'REGISTER MARK-B-12');
    for (let i = 0; i < 60 && (await domain()).clients === domainBefore.clients; i++) await delay(1000);
    const registered = (await db.query("SELECT created_by_phone, created_by_name FROM app.clients WHERE first_name = 'compaction'")).rows;
    assert.deepEqual(registered, [{ created_by_phone: BETA, created_by_name: 'Synthetic' }]);

    // 7. Isolation, same summary model, and silent delivery.
    const all = await modelObservations();
    for (const item of all) {
      assert.equal(item.model, 'synthetic/compaction-model');
      assert.equal(item.private_phone, false, 'an authorized sender number reached a model request');
      const senders = new Set(item.all.map((marker) => marker.split('-')[1]));
      assert.ok(senders.size <= 1, 'a model request mixed two senders');
    }
    assert.ok(kinds(all, 'summary').some((item) => item.all.includes('MARK-A-3')));
    assert.ok(kinds(all, 'summary').some((item) => item.all.includes('MARK-B-3')));
    const delivered = await metaObservations();
    assert.ok(delivered.length > 0);
    for (const item of delivered) {
      assert.ok([ALPHA, BETA].includes(item.to));
      assert.equal(item.text, REPLY);
    }

    // 8. Summaries persist in Hermes' SQLite volume, never in logs, and are in the backup.
    python([
      'from pathlib import Path',
      "state = b''.join(p.read_bytes() for p in Path('/opt/data').glob('state.db*') if p.is_file())",
      "assert b'synthetic-summary' in state",
      "logs = b''.join(p.read_bytes() for p in Path('/opt/data/logs').rglob('*') if p.is_file()) if Path('/opt/data/logs').exists() else b''",
      "assert not any(x in logs.lower() for x in [b'mark-a-', b'mark-b-', b'synthetic-summary', b'15555550102', b'15555550103', b'parola sintetica'])",
    ].join('\n'));
    assert.equal(execFileSync('docker', ['logs', gatewayId()], { encoding: 'utf8', stdio: 'pipe' }).trim(), 'hermes_launch');
    compose('stop', 'hermes', 'author-broker');
    const backup = join(directory, 'backup');
    execFileSync('bash', ['scripts/backup.sh', project, backup], { env, stdio: 'pipe', timeout: 240_000 });
    const archive = await readFile(join(backup, 'hermes.tar'));
    assert.ok(archive.includes('synthetic-summary') && archive.includes('MARK-B-12'));
  } finally {
    await database?.end().catch(() => undefined);
    try { compose('down', '--volumes', '--remove-orphans'); } catch { /* best effort */ }
    spawnSync('docker', ['image', 'rm', `${project}-hermes`], { stdio: 'ignore', timeout: 90_000 });
    await rm(directory, { recursive: true, force: true });
  }
});
