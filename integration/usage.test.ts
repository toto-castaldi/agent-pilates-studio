import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { Client } from 'pg';
import { USAGE_EVENT_FAILED } from '../src/usage-event.js';
import { assertGatewayLog } from './gateway-log.js';
import { seedIdentities } from './identity-seed.js';

type ModelObservation = { kind: 'turn' | 'summary' | 'aux'; prompt_tokens: number; completion_tokens: number; cost: number | null; reasoning: unknown; stream: boolean; tool_calls: number };
type MetaObservation = { to: string; text: string };
type UsageEvent = {
  id: string; teacher_id: string | null; turn_kind: string; received_at: Date; replied_at: Date | null; total_ms: number | null;
  model_ms: number | null; model: string | null; reasoning_effort: string | null; input_tokens: string | null; output_tokens: string | null;
  context_tokens: string | null; context_window: string | null; context_percent: string | null; compaction_threshold_tokens: string | null;
  compactions: number; tool_calls: number; model_requests: number; cost_usd: string | null; send_outcome: string;
  send_http_status: number | null; send_error_code: number | null;
};

const WINDOW = 200_000;
const THRESHOLD = 80_000;
const ALPHA = '15555550102';
const BETA = '15555550103';
const GAMMA = '15555550104';
const STRANGER = '15555550199';
const COLUMNS = ['id', 'recorded_at', 'teacher_id', 'turn_kind', 'received_at', 'replied_at', 'total_ms', 'model_ms', 'model',
  'reasoning_effort', 'input_tokens', 'output_tokens', 'context_tokens', 'context_window', 'context_percent',
  'compaction_threshold_tokens', 'compactions', 'tool_calls', 'model_requests', 'cost_usd', 'send_outcome', 'send_http_status',
  'send_error_code'];
const message = (marker: string, tokens: number) => `${marker} ${'parola sintetica '.repeat(Math.ceil((tokens * 4) / 17))}`.trim();
const pico = (value: number) => BigInt(Math.round(value * 1e12));
const costText = (total: bigint) => `${total / 1_000_000_000_000n}.${String(total % 1_000_000_000_000n).padStart(12, '0')}`;

test('usage events: one protected event per handled message, measured by the trusted gateway', { timeout: 1_800_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pilates-usage-test-'));
  const project = `pilates-usage-${randomBytes(8).toString('hex')}`;
  const secrets: Record<string, string> = {
    'db-admin': randomBytes(32).toString('hex'), 'db-migrator': randomBytes(32).toString('hex'),
    'db-agent': randomBytes(32).toString('hex'), 'db-broker': randomBytes(32).toString('hex'), 'db-grafana': randomBytes(32).toString('hex'),
    'bridge-token': randomBytes(32).toString('hex'), 'openrouter-key': 'synthetic-model-token',
    'whatsapp-access-token': 'synthetic-access-token', 'whatsapp-app-secret': 'synthetic-app-secret',
    'whatsapp-verify-token': 'synthetic-verify-token', 'whatsapp-manager-phone': `+${ALPHA}`,
    'whatsapp-phone-number-id': '123456789012345',
  };
  const override = join(directory, 'override.yaml');
  const env = {
    ...process.env, COMPOSE_ENV_FILES: '/dev/null', SECRETS_DIR: directory, POSTGRES_PORT: '0', WHATSAPP_WEBHOOK_PORT: '0',
    PILATES_MODEL: 'openai/synthetic-usage-model', PILATES_REASONING_EFFORT: 'high', PILATES_IDLE_COMPACT_SECONDS: '3600',
  };
  const compose = (...args: string[]) => execFileSync('docker', ['compose', '-p', project, '-f', 'compose.yaml', '-f', override, ...args], { env, encoding: 'utf8', stdio: 'pipe', timeout: 240_000 });
  const clients: Client[] = [];
  try {
    await Promise.all(Object.entries(secrets).map(([name, value]) => writeFile(join(directory, name), value, { mode: 0o600 })));
    const config = await readFile('hermes/config.yaml', 'utf8');
    assert.equal(config.split('\ndisplay:\n').length, 2);
    await writeFile(join(directory, 'config.yaml'), config.replace('\ndisplay:\n', '\ndisplay:\n  tool_progress: off\n'));
    await writeFile(override, `services:\n  model-stub:\n    image: ${project}-hermes\n    entrypoint: ["/opt/hermes/.venv/bin/python", "/usage_stub.py"]\n    networks:\n      default:\n        aliases: [stub.openrouter.ai]\n    volumes:\n      - ${JSON.stringify(`${resolve('integration/usage_stub.py')}:/usage_stub.py:ro`)}\n    logging:\n      driver: none\n  meta-stub:\n    image: ${project}-hermes\n    entrypoint: ["/opt/hermes/.venv/bin/python", "/meta_stub.py"]\n    volumes:\n      - ${JSON.stringify(`${resolve('scenarios/meta_stub.py')}:/meta_stub.py:ro`)}\n    logging:\n      driver: none\n  hermes:\n    environment:\n      OPENROUTER_BASE_URL: http://stub.openrouter.ai:8088/v1\n      NO_PROXY: stub.openrouter.ai,model-stub,meta-stub,localhost,127.0.0.1\n    volumes:\n      - ${JSON.stringify(`${resolve('scenarios/gateway-launcher.sh')}:/opt/hermes/libexec/hermes:ro`)}\n      - ${JSON.stringify(`${join(directory, 'config.yaml')}:/opt/data/config.yaml:ro`)}\nnetworks:\n  default:\n    internal: true\n`);
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
    const connect = async (user: string, password: string) => {
      const client = new Client({ host: address('postgres'), port: 5432, database: 'studio', user, password });
      await client.connect();
      clients.push(client);
      return client;
    };
    const migrator = await connect('studio_migrator', secrets['db-migrator']);
    const agent = await connect('studio_agent', secrets['db-agent']);
    const broker = await connect('studio_broker', secrets['db-broker']);
    const ids = await seedIdentities({ host: address('postgres'), password: secrets['db-broker'] },
      { first: 'Alpha', last: 'Synthetic', phone: ALPHA }, [{ first: 'Beta', last: 'Synthetic', phone: BETA }, { first: 'Gamma', last: 'Synthetic', phone: GAMMA }]);

    // 1. Schema: only the allowed columns; no rewrite, deletion or truncation, also for the migrator.
    const columns = (await migrator.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'studio_private' AND table_name = 'usage_events' ORDER BY ordinal_position")).rows.map((row) => row.column_name);
    assert.deepEqual(columns, COLUMNS);
    const textColumns = (await migrator.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'studio_private' AND table_name = 'usage_events' AND data_type = 'text' ORDER BY 1")).rows.map((row) => row.column_name);
    assert.deepEqual(textColumns, ['model', 'reasoning_effort', 'send_outcome', 'turn_kind'], 'only constrained text columns');
    const sample = { turn_kind: 'fixed', received_at: '2026-11-26T09:00:00.000Z', replied_at: '2026-11-26T09:00:00.120Z', total_ms: 120, model_ms: null, model: null,
      reasoning_effort: null, input_tokens: null, output_tokens: null, context_tokens: null, context_window: null, context_percent: null,
      compaction_threshold_tokens: null, compactions: 0, tool_calls: 0, model_requests: 0, cost_usd: null, send_outcome: 'sent', send_http_status: null, send_error_code: null };
    const sampleId = (await broker.query('SELECT studio_private.record_usage_event($1, $2::jsonb) AS id', [ids[BETA], JSON.stringify(sample)])).rows[0].id;
    for (const statement of [`UPDATE studio_private.usage_events SET total_ms = 1 WHERE id = ${sampleId}`, `DELETE FROM studio_private.usage_events WHERE id = ${sampleId}`, 'TRUNCATE studio_private.usage_events']) {
      await assert.rejects(migrator.query(statement), (error: { code?: string }) => error.code === '42501', statement);
    }
    for (const forged of [{ ...sample, model: 'testo libero 15555550102' }, { ...sample, send_error_code: 155555501 }, { ...sample, turn_kind: 'chat' },
      { ...sample, model_requests: 1 }, { ...sample, phone: ALPHA }, { ...sample, replied_at: '2026-11-26T09:00:05.000Z' }]) {
      await assert.rejects(broker.query('SELECT studio_private.record_usage_event($1, $2::jsonb)', [ids[BETA], JSON.stringify(forged)]));
    }
    // Neither the broker nor the agent can read, write or bypass the function.
    for (const [client, statements] of [[broker, ['SELECT * FROM studio_private.usage_events', `INSERT INTO studio_private.usage_events (turn_kind, received_at, compactions, tool_calls, model_requests, send_outcome) VALUES ('fixed', now(), 0, 0, 0, 'none')`, 'DELETE FROM studio_private.usage_events']],
      [agent, ['SELECT * FROM studio_private.usage_events', `INSERT INTO studio_private.usage_events (turn_kind, received_at, compactions, tool_calls, model_requests, send_outcome) VALUES ('fixed', now(), 0, 0, 0, 'none')`,
        `UPDATE studio_private.usage_events SET total_ms = 1`, 'DELETE FROM studio_private.usage_events', `SELECT studio_private.record_usage_event(NULL, '{}'::jsonb)`]]] as [Client, string[]][]) {
      for (const statement of statements) await assert.rejects(client.query(statement), (error: { code?: string }) => error.code === '42501', statement);
    }
    const privileges = (await migrator.query(`SELECT has_schema_privilege('studio_agent', 'studio_private', 'USAGE') AS schema,
      has_table_privilege('studio_agent', 'studio_private.usage_events', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS agent_table,
      has_table_privilege('studio_broker', 'studio_private.usage_events', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS broker_table,
      has_function_privilege('studio_agent', 'studio_private.record_usage_event(bigint, jsonb)', 'EXECUTE') AS agent_function,
      has_function_privilege('studio_broker', 'studio_private.record_usage_event(bigint, jsonb)', 'EXECUTE') AS broker_function`)).rows[0];
    assert.deepEqual(privileges, { schema: false, agent_table: false, broker_table: false, agent_function: false, broker_function: true });

    compose('up', '-d', '--wait', 'model-stub', 'meta-stub');
    compose('up', '-d', '--wait', '--wait-timeout', '150', 'hermes');
    const gatewayId = () => compose('ps', '-q', 'hermes').trim();
    const gateway = `http://${address('hermes')}:8090/whatsapp/webhook`;
    const model = `http://${address('model-stub')}:8088/v1`;
    const metaBase = `http://${address('meta-stub')}:8088`;
    const brokerUrl = `http://${address('author-broker')}:8091`;

    // 2. Write credentials exist only in the broker: the gateway that runs the
    // model's tools has the agent credential and the bridge token alone.
    const gatewayFiles = execFileSync('docker', ['exec', gatewayId(), 'sh', '-c', 'ls /run/secrets /run/pilates-agent'], { encoding: 'utf8' });
    assert.doesNotMatch(gatewayFiles, /db_broker|db_migrator|db_admin/);
    const environments = execFileSync('docker', ['exec', gatewayId(), 'sh', '-c', 'cat /proc/[0-9]*/environ 2>/dev/null | tr "\\0" "\\n"'], { encoding: 'utf8' });
    assert.ok(!environments.includes(secrets['db-broker']) && !environments.includes(secrets['db-migrator']), 'write credential reachable from the gateway');

    // 2b. Regression (TEC-057): before the startup gate opens, Hermes' runner
    // parks an inbound event and replays the same event after warm-up. The
    // parked pass must not close the event: the replayed turn is measured.
    // The gate cannot be held closed deterministically on a live gateway, so
    // the wrapper runs on a stand-in adapter, after checking the runner contract.
    const parked = [
      'import asyncio, inspect, json, time',
      'from types import SimpleNamespace',
      'import pilates_trusted as trusted',
      'from gateway.run import GatewayRunner',
      "contract = all(hasattr(GatewayRunner, name) for name in ('_queue_startup_restore_event', '_drain_startup_restore_queue')) and '_startup_restore_queue' in inspect.getsource(GatewayRunner._queue_startup_restore_event)",
      'sent = []',
      'async def submit(body): sent.append(body)',
      'trusted.submit_usage = submit',
      'class Base:',
      '    async def _process_message_background(self, event, session_key):',
      '        if not getattr(event, "_hermes_startup_restore_replay", False):',
      '            self.gateway_runner._startup_restore_queue.append(event)',
      '            return',
      '        record = trusted.usage_current.get()',
      '        if record is None:',
      '            return',
      '        trusted.mark_usage("agent_turn")',
      "        record.add_request(trusted.usage_request('main', 0.5, {'usage': {'prompt_tokens': 7, 'completion_tokens': 3, 'cost': 0.25}, 'model': 'openai/synthetic-usage-served'}, 0, 'high'))",
      "        record.note_send('sent')",
      'class WhatsAppCloudAdapter(Base): pass',
      'trusted.observe_usage_processing(Base)',
      'async def main():',
      "    trusted.usage_admit([{'message_id': 'wamid.synthetic.parked', 'sender': '15555550109'}], time.time(), time.monotonic())",
      "    event = SimpleNamespace(message_id='wamid.synthetic.parked', source=SimpleNamespace(user_id='15555550109'))",
      '    adapter = WhatsAppCloudAdapter()',
      '    adapter.gateway_runner = SimpleNamespace(_startup_restore_queue=[])',
      "    await adapter._process_message_background(event, 'synthetic-session')",
      '    await asyncio.sleep(1)',
      '    early = len(sent)',
      '    event = adapter.gateway_runner._startup_restore_queue.pop(0)',
      '    event._hermes_startup_restore_replay = True',
      "    await adapter._process_message_background(event, 'synthetic-session')",
      '    for _ in range(50):',
      '        if sent: break',
      '        await asyncio.sleep(0.1)',
      "    print(json.dumps({'contract': contract, 'early': early, 'events': [[body['measurement']['agent_turn'], len(body['measurement']['requests']), body['measurement']['send']['outcome']] for body in sent]}))",
      'asyncio.run(main())',
    ].join('\n');
    const parkedResult = JSON.parse(execFileSync('docker', ['exec', '--user', '10000', gatewayId(), '/opt/hermes/.venv/bin/python', '-c', parked],
      { encoding: 'utf8', stdio: 'pipe', timeout: 60_000 }).trim().split('\n').at(-1) as string) as { contract: boolean; early: number; events: unknown[] };
    assert.deepEqual(parkedResult, { contract: true, early: 0, events: [[true, 1, 'sent']] });

    const modelObservations = async () => await (await fetch(`${model}/observations`)).json() as ModelObservation[];
    const metaObservations = async () => await (await fetch(`${metaBase}/observations`)).json() as MetaObservation[];
    const control = async (body: object) => assert.equal((await fetch(`${model}/control`, { method: 'POST', body: JSON.stringify(body) })).status, 200);
    const reject = async (to: string, mode: string) => assert.equal((await fetch(`${metaBase}/synthetic-reject`, { method: 'POST', body: JSON.stringify({ to, mode }) })).status, 204);
    const events = async () => (await migrator.query('SELECT * FROM studio_private.usage_events WHERE id <> $1 ORDER BY id', [sampleId])).rows as UsageEvent[];
    const post = async (messages: { from: string; text: string }[]) => {
      const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: '999', changes: [{ field: 'messages', value: {
        metadata: { phone_number_id: secrets['whatsapp-phone-number-id'] },
        contacts: messages.map((item) => ({ wa_id: item.from, profile: { name: 'WhatsAppProfile Synthetic' } })),
        messages: messages.map((item) => ({ from: item.from, id: `wamid.synthetic.${randomBytes(16).toString('hex')}`, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: item.text } })),
      } }] }] });
      const signature = `sha256=${createHmac('sha256', secrets['whatsapp-app-secret']).update(payload).digest('hex')}`;
      assert.equal((await fetch(gateway, { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signature } })).status, 200);
    };
    // Waits for `count` new events; returns them with the model requests made meanwhile.
    const exchange = async (messages: { from: string; text: string }[], count = messages.length) => {
      const before = (await events()).length;
      const modelBefore = (await modelObservations()).length;
      const started = Date.now();
      await post(messages);
      for (let i = 0; i < 240; i++) {
        const current = await events();
        if (current.length >= before + count) {
          await delay(1500);
          const settled = await events();
          assert.equal(settled.length, before + count, 'unexpected additional usage events');
          return { events: settled.slice(before), requests: (await modelObservations()).slice(modelBefore), started };
        }
        await delay(500);
      }
      return assert.fail(`Timed out waiting for ${count} usage events`);
    };
    const windows = new Set<string>();
    const expectModelData = (event: UsageEvent, requests: ModelObservation[]) => {
      // Values come from the provider's answers of this message only, never from the model's text.
      assert.equal(event.model_requests, requests.length);
      assert.equal(Number(event.input_tokens), requests.reduce((sum, item) => sum + item.prompt_tokens, 0));
      assert.equal(Number(event.output_tokens), requests.reduce((sum, item) => sum + item.completion_tokens, 0));
      assert.equal(event.cost_usd, costText(requests.reduce((sum, item) => sum + pico(item.cost as number), 0n)));
      const turns = requests.filter((item) => item.kind === 'turn');
      assert.equal(Number(event.context_tokens), turns.at(-1)?.prompt_tokens);
      // The window of Hermes' compressor, the same for every event of the model.
      assert.ok(Number(event.context_window) >= WINDOW, String(event.context_window));
      windows.add(String(event.context_window));
      assert.equal(windows.size, 1);
      assert.equal(event.compaction_threshold_tokens, String(THRESHOLD));
      assert.equal(event.context_percent, (Math.round((Number(event.context_tokens) * 10_000) / Number(event.context_window)) / 100).toFixed(2));
      assert.equal(event.tool_calls, turns.reduce((sum, item) => sum + item.tool_calls, 0));
      assert.equal(event.model, 'openai/synthetic-usage-served');
    };
    const expectTimes = (event: UsageEvent, started: number) => {
      assert.ok(event.received_at.getTime() >= started - 1000 && event.received_at.getTime() <= started + 5000);
      assert.equal(event.replied_at?.getTime(), event.received_at.getTime() + (event.total_ms as number));
    };
    const expectNoModel = (event: UsageEvent) => {
      for (const key of ['model_ms', 'model', 'reasoning_effort', 'input_tokens', 'output_tokens', 'context_tokens', 'context_window', 'context_percent', 'compaction_threshold_tokens', 'cost_usd'] as const) {
        assert.equal(event[key], null, key);
      }
      assert.deepEqual([event.compactions, event.tool_calls, event.model_requests], [0, 0, 0]);
    };

    // 3. Agent reply: first turn of a chat, with title generation after the reply.
    let result = await exchange([{ from: BETA, text: 'Ciao MARK-1' }]);
    let [event] = result.events;
    assert.equal(event.turn_kind, 'agent');
    assert.equal(event.teacher_id, ids[BETA]);
    assert.equal(event.send_outcome, 'sent');
    expectTimes(event, result.started);
    expectModelData(event, result.requests);
    assert.ok(result.requests.some((item) => item.kind === 'aux'), 'title generation is part of the turn');
    assert.ok((event.model_ms as number) <= (event.total_ms as number));
    const sentReasoning = result.requests.filter((item) => item.kind === 'turn').at(-1)?.reasoning as { effort?: string; enabled?: boolean } | undefined;
    // An OpenRouter route of a reasoning family: the level actually sent is recorded.
    assert.deepEqual([event.reasoning_effort, sentReasoning?.effort], ['high', 'high'], JSON.stringify(sentReasoning));

    // 4. Tool calls requested by the model, including one refused by the allowlist.
    result = await exchange([{ from: BETA, text: 'TOOLS MARK-2' }]);
    [event] = result.events;
    assert.equal(event.turn_kind, 'agent');
    assert.equal(event.tool_calls, 3);
    expectModelData(event, result.requests);

    // 5. The agent's SQL cannot read the events or call the writer.
    result = await exchange([{ from: GAMMA, text: 'METRICS MARK-3' }]);
    [event] = result.events;
    assert.equal(event.teacher_id, ids[GAMMA]);
    assert.equal(event.tool_calls, 2);

    // 6. Rejected command in the gateway, without the model.
    result = await exchange([{ from: BETA, text: '/model synthetic/other' }]);
    [event] = result.events;
    assert.equal(event.turn_kind, 'rejected_command');
    assert.equal(result.requests.length, 0);
    expectNoModel(event);
    expectTimes(event, result.started);

    // 7. Broker replies: refusal of an unknown number, ordinary management command, guided path.
    result = await exchange([{ from: STRANGER, text: 'Ciao' }]);
    [event] = result.events;
    assert.deepEqual([event.turn_kind, event.teacher_id, event.send_outcome], ['fixed', null, 'sent']);
    expectNoModel(event);
    expectTimes(event, result.started);
    result = await exchange([{ from: BETA, text: '/anagrafica' }]);
    assert.deepEqual([result.events[0].turn_kind, result.events[0].teacher_id], ['rejected_command', ids[BETA]]);
    result = await exchange([{ from: ALPHA, text: '/anagrafica' }]);
    assert.deepEqual([result.events[0].turn_kind, result.events[0].teacher_id], ['management', ids[ALPHA]]);
    result = await exchange([{ from: ALPHA, text: '/annulla' }]);
    assert.equal(result.events[0].turn_kind, 'management');
    expectNoModel(result.events[0]);

    // 8. Send outcomes: refused by Meta (status and code) and network failure.
    await reject(GAMMA, 'refuse');
    result = await exchange([{ from: GAMMA, text: 'Ciao MARK-4' }]);
    [event] = result.events;
    assert.deepEqual([event.turn_kind, event.send_outcome, event.send_http_status, event.send_error_code], ['agent', 'refused', 400, 131030]);
    await reject(STRANGER, 'drop');
    result = await exchange([{ from: STRANGER, text: 'Ciao di nuovo' }]);
    assert.deepEqual([result.events[0].turn_kind, result.events[0].send_outcome, result.events[0].send_http_status], ['fixed', 'network', null]);
    await reject(GAMMA, 'accept');
    await reject(STRANGER, 'accept');

    // 9. A provider answer without cost leaves the cost empty, never estimated.
    await control({ omit_cost: true });
    result = await exchange([{ from: GAMMA, text: 'Ciao MARK-5' }]);
    await control({ omit_cost: false });
    assert.equal(result.events[0].cost_usd, null);
    assert.ok(Number(result.events[0].input_tokens) > 0);

    // 10. Compactions in the turn: messages of ~45K tokens cross 40% of the window.
    let compacted: UsageEvent | undefined;
    const trace: string[] = [];
    for (let index = 1; index <= 6 && !compacted; index++) {
      result = await exchange([{ from: ALPHA, text: message(`MARK-C-${index}`, 45_000) }]);
      trace.push(`${result.events[0].context_tokens}/${result.events[0].compactions}:${result.requests.map((item) => `${item.kind}${item.prompt_tokens}`).join(',')}`);
      if (result.requests.some((item) => item.kind === 'summary')) {
        [compacted] = result.events;
        expectModelData(compacted, result.requests);
        assert.ok(compacted.compactions >= 1);
        // The summary precedes the reply: it is model time.
        assert.ok((compacted.model_ms as number) > 0);
      } else {
        assert.equal(result.events[0].compactions, 0);
      }
    }
    assert.ok(compacted, `no compaction observed: ${trace.join(' | ')}`);

    // 11. Messages arriving during a turn (Hermes steers, interrupts or queues
    // them): one event each, every model request counted on exactly one event.
    {
      const before = (await events()).length;
      const modelBefore = (await modelObservations()).length;
      await post([{ from: BETA, text: 'SLOW MARK-7' }]);
      await delay(1500);
      await post([{ from: BETA, text: 'MARK-8' }, { from: BETA, text: 'MARK-9' }]);
      let merged: UsageEvent[] = [];
      for (let i = 0; i < 240 && merged.length < 3; i++) {
        await delay(500);
        merged = (await events()).slice(before);
      }
      // Settled: no further model request or event for a while.
      let seen = -1;
      for (let i = 0; i < 60; i++) {
        const now = (await modelObservations()).length + (await events()).length;
        if (now === seen) break;
        seen = now;
        await delay(3000);
      }
      merged = (await events()).slice(before);
      const requests = (await modelObservations()).slice(modelBefore);
      const shape = JSON.stringify(merged.map((item) => [item.turn_kind, item.model_requests, item.send_outcome]));
      assert.equal(merged.length, 3, shape);
      assert.ok(merged.every((item) => item.teacher_id === ids[BETA]), shape);
      assert.ok(merged.some((item) => item.turn_kind === 'agent'), shape);
      assert.equal(merged.reduce((sum, item) => sum + item.model_requests, 0), requests.length, shape);
      assert.equal(merged.reduce((sum, item) => sum + Number(item.input_tokens ?? 0), 0), requests.reduce((sum, item) => sum + item.prompt_tokens, 0), shape);
    }

    // 12. The broker accepts one event per receipt or ticket and never a gateway kind.
    const bridge = { 'Content-Type': 'application/json', 'X-Pilates-Bridge': secrets['bridge-token'] };
    const measurement = { broker_kind: null, agent_turn: false, rejected_command: false, refused: false, received_at: Date.now(), elapsed_ms: 5,
      requests: [], compactions: 0, context_window: null, compaction_threshold: null, send: { outcome: 'sent', http_status: null, error_code: null } };
    const usage = async (body: object, headers: Record<string, string> = bridge) => (await fetch(`${brokerUrl}/v1/usage`, { method: 'POST', headers, body: JSON.stringify(body) })).status;
    const before = (await events()).length;
    assert.equal(await usage({ ticket: 'f'.repeat(64), measurement }), 403);
    assert.equal(await usage({ ticket: 'f'.repeat(64), measurement: { ...measurement, broker_kind: 'management' } }), 400);
    assert.equal(await usage({ message_id: 'wamid.synthetic.unknown', sender: BETA, measurement }), 403);
    assert.equal(await usage({ message_id: 'wamid.synthetic.unknown', sender: BETA, teacher: ids[ALPHA], measurement }), 400);
    assert.equal(await usage({ ticket: 'f'.repeat(64), measurement }, { 'Content-Type': 'application/json' }), 403);
    assert.equal((await events()).length, before);

    // 13. A failed write: the turn completes with the same reply and the log has only the fixed event.
    await migrator.query('REVOKE EXECUTE ON FUNCTION studio_private.record_usage_event(bigint, jsonb) FROM studio_broker');
    const metaBefore = (await metaObservations()).length;
    await post([{ from: GAMMA, text: 'Ciao MARK-10' }]);
    for (let i = 0; i < 120 && (await metaObservations()).length === metaBefore; i++) await delay(500);
    await delay(3000);
    await migrator.query('GRANT EXECUTE ON FUNCTION studio_private.record_usage_event(bigint, jsonb) TO studio_broker');
    assert.deepEqual((await metaObservations()).slice(metaBefore), [{ to: GAMMA, text: 'Risposta sintetica.' }]);
    assert.equal((await events()).length, before);
    const extra = assertGatewayLog(execFileSync('docker', ['logs', gatewayId()], { encoding: 'utf8', stdio: 'pipe' }), { usageFailures: true });
    assert.equal(extra.filter((line) => line === USAGE_EVENT_FAILED).length, 1);

    // 14. Events contain no phone, text or name; replies were not altered.
    const all = await events();
    const serialized = JSON.stringify(all);
    for (const forbidden of [ALPHA, BETA, GAMMA, STRANGER, 'MARK-', 'Synthetic', 'WhatsAppProfile', 'Risposta', 'wamid']) assert.ok(!serialized.includes(forbidden), forbidden);
    for (const item of await metaObservations()) assert.ok(!item.text.includes('usage'), 'collection changed a reply');

    // 15. Events persist across restart and recreation of gateway and broker.
    const count = all.length;
    compose('restart', 'hermes', 'author-broker');
    compose('up', '-d', '--no-deps', '--force-recreate', '--wait', '--wait-timeout', '150', 'author-broker', 'hermes');
    assert.equal((await events()).length, count);
  } finally {
    for (const client of clients) await client.end().catch(() => undefined);
    try { compose('down', '--volumes', '--remove-orphans'); } catch { /* best effort */ }
    spawnSync('docker', ['image', 'rm', `${project}-hermes`], { stdio: 'ignore', timeout: 90_000 });
    await rm(directory, { recursive: true, force: true });
  }
});
