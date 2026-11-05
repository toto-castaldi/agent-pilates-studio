import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { Client } from 'pg';

test('authenticated WhatsApp turns bind authors through the isolated broker', { timeout: 420_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pilates-author-test-'));
  const project = `pilates-author-${randomBytes(8).toString('hex')}`;
  const secrets: Record<string, string> = {
    'db-admin': randomBytes(32).toString('hex'),
    'db-migrator': randomBytes(32).toString('hex'),
    'db-agent': randomBytes(32).toString('hex'),
    'db-broker': randomBytes(32).toString('hex'),
    'bridge-token': randomBytes(32).toString('hex'),
    'openrouter-key': 'synthetic-model-token',
    'whatsapp-access-token': 'synthetic-access-token',
    'whatsapp-app-secret': 'synthetic-app-secret',
    'whatsapp-verify-token': 'synthetic-verify-token',
    'whatsapp-allowed-users': '15555550102,15555550103',
    'whatsapp-phone-number-id': '123456789012345',
  };
  const override = join(directory, 'override.yaml');
  const env = { ...process.env, COMPOSE_ENV_FILES: '/dev/null', SECRETS_DIR: directory, POSTGRES_PORT: '0', WHATSAPP_WEBHOOK_PORT: '0', PILATES_MODEL: 'synthetic/test-model' };
  const compose = (...args: string[]) => execFileSync('docker', ['compose', '-p', project, '-f', 'compose.yaml', '-f', override, ...args], { env, encoding: 'utf8', stdio: 'pipe', timeout: 180_000 });
  const clients: Client[] = [];
  try {
    await Promise.all(Object.entries(secrets).map(([name, value]) => writeFile(join(directory, name), value, { mode: 0o600 })));
    await writeFile(join(directory, 'config.yaml'), await readFile('hermes/config.yaml'));
    await writeFile(override, `services:\n  model-stub:\n    image: ${project}-hermes\n    entrypoint: ["/opt/hermes/.venv/bin/python", "/model_stub.py"]\n    volumes:\n      - ${JSON.stringify(`${resolve('integration/model_stub.py')}:/model_stub.py:ro`)}\n    logging:\n      driver: none\n  hermes:\n    environment:\n      OPENROUTER_BASE_URL: http://model-stub:8088/v1\n    volumes:\n      - ${JSON.stringify(`${join(directory, 'config.yaml')}:/opt/data/config.yaml:ro`)}\nnetworks:\n  default:\n    internal: true\n`);
    compose('build', 'hermes');
    compose('up', '-d', '--wait', 'postgres');
    compose('run', '--rm', 'db-bootstrap');
    const address = (service: string) => {
      const id = compose('ps', '-q', service).trim();
      const host = execFileSync('docker', ['inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', id], { encoding: 'utf8' }).trim();
      assert.ok(host);
      return host;
    };
    const databaseHost = address('postgres');
    const migrationUrl = new URL(`postgresql://${databaseHost}:5432/studio?schema=public`);
    migrationUrl.username = 'studio_migrator';
    migrationUrl.password = secrets['db-migrator'];
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: { ...env, DATABASE_URL: migrationUrl.toString() }, stdio: 'pipe', timeout: 90_000 });
    const connect = async (user: string, password: string) => {
      const client = new Client({ host: databaseHost, port: 5432, database: 'studio', user, password });
      await client.connect();
      clients.push(client);
      return client;
    };
    const migrator = await connect('studio_migrator', secrets['db-migrator']);
    compose('up', '-d', '--wait', '--wait-timeout', '150', 'model-stub', 'hermes');
    const gateway = `http://${address('hermes')}:8090/whatsapp/webhook`;
    let broker = `http://${address('author-broker')}:8091`;
    const body = (sender: string, name: string, id: string, text: string, timestamp = Math.floor(Date.now() / 1000), phoneId = secrets['whatsapp-phone-number-id']) => JSON.stringify({
      object: 'whatsapp_business_account', entry: [{ id: '999', changes: [{ field: 'messages', value: {
        metadata: { phone_number_id: phoneId }, contacts: [{ wa_id: sender, profile: { name } }],
        messages: [{ from: sender, id, timestamp: String(timestamp), type: 'text', text: { body: text } }],
      } }] }],
    });
    const signed = (payload: string) => `sha256=${createHmac('sha256', secrets['whatsapp-app-secret']).update(payload).digest('hex')}`;
    const gatewayPost = (payload: string, signature = signed(payload)) => fetch(gateway, { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signature } });
    const evidence = (payload: string, signature = signed(payload), token = secrets['bridge-token']) => fetch(`${broker}/v1/evidence`, { method: 'POST', body: payload, headers: { 'X-Pilates-Bridge': token, 'X-Hub-Signature-256': signature } });
    const claim = (data: object, token = secrets['bridge-token']) => fetch(`${broker}/v1/context`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pilates-Bridge': token }, body: JSON.stringify(data) });
    const alpha = body('15555550102', 'Synthetic Alpha', 'synthetic-wamid-alpha', 'alpha');
    const beta = body('15555550103', 'Synthetic Beta', 'synthetic-wamid-beta', 'beta');
    assert.equal((await evidence(alpha, signed(alpha), 'wrong-token')).status, 403);
    assert.equal((await evidence(alpha, `sha256=${'0'.repeat(64)}`)).status, 401);
    assert.equal((await gatewayPost(alpha, `sha256=${'0'.repeat(64)}`)).status, 401);
    assert.deepEqual((await Promise.all([gatewayPost(alpha), gatewayPost(beta)])).map((response) => response.status), [200, 200]);
    const waitFor = async (query: string, expected: number) => {
      for (let i = 0; i < 120; i++) {
        if (Number((await migrator.query(query)).rows[0].count) === expected) return;
        await delay(1000);
      }
      assert.fail('Timed out waiting for synthetic gateway writes');
    };
    await waitFor('SELECT count(*) FROM app.clients', 2);
    await waitFor('SELECT count(*) FROM app.training_rules', 2);
    await waitFor('SELECT count(*) FROM studio_private.author_context', 0);
    const rows = (await migrator.query('SELECT first_name, created_by_phone, created_by_name FROM app.clients ORDER BY first_name')).rows;
    assert.deepEqual(rows, [
      { first_name: 'alpha', created_by_phone: '15555550102', created_by_name: 'Synthetic Alpha' },
      { first_name: 'beta', created_by_phone: '15555550103', created_by_name: 'Synthetic Beta' },
    ]);
    const rules = (await migrator.query('SELECT rule_text, created_by_phone, created_by_name FROM app.training_rules ORDER BY rule_text')).rows;
    assert.deepEqual(rules, [
      { rule_text: 'alpha rule', created_by_phone: '15555550102', created_by_name: 'Synthetic Alpha' },
      { rule_text: 'beta rule', created_by_phone: '15555550103', created_by_name: 'Synthetic Beta' },
    ]);
    const deactivate = body('15555550103', 'Synthetic Beta', 'synthetic-wamid-deactivate', 'deactivate-alpha');
    assert.equal((await gatewayPost(deactivate)).status, 200);
    await waitFor('SELECT count(*) FROM app.training_rules WHERE deactivated_at IS NOT NULL', 1);
    const deactivated = (await migrator.query("SELECT deactivated_by_phone, deactivated_by_name, deactivation_reason FROM app.training_rules WHERE rule_text = 'alpha rule'")).rows[0];
    assert.deepEqual(deactivated, { deactivated_by_phone: '15555550103', deactivated_by_name: 'Synthetic Beta', deactivation_reason: 'synthetic reason' });
    const gatewayId = compose('ps', '-q', 'hermes').trim();
    execFileSync('docker', ['exec', gatewayId, 'sh', '-c', 'test ! -e /tmp/pilates-injection-marker'], { stdio: 'pipe' });
    assert.equal(execFileSync('docker', ['logs', gatewayId], { encoding: 'utf8', stdio: 'pipe' }).trim(), 'hermes_launch');
    const logCheck = [
      'from pathlib import Path',
      "logs = b''.join(p.read_bytes() for p in Path('/opt/data/logs').rglob('*') if p.is_file())",
      "assert not any(x in logs for x in [b'15555550102', b'15555550103', b'Synthetic Alpha', b'Synthetic Beta', b'synthetic-app-secret'])",
    ].join('\n');
    execFileSync('docker', ['exec', gatewayId, '/opt/hermes/.venv/bin/python', '-c', logCheck], { stdio: 'pipe' });
    assert.equal(execFileSync('docker', ['inspect', '--format', '{{.HostConfig.LogConfig.Type}}', compose('ps', '-q', 'author-broker').trim()], { encoding: 'utf8' }).trim(), 'none');

    // A signed receipt can be claimed by one turn only, even across restart.
    compose('restart', 'author-broker');
    for (let i = 0; i < 30; i++) {
      broker = `http://${address('author-broker')}:8091`;
      try { if ((await fetch(`${broker}/health`)).status === 200) break; } catch { /* restarting */ }
      await delay(1000);
    }
    assert.equal((await evidence(alpha)).status, 204);
    const agent1 = await connect('studio_agent', secrets['db-agent']);
    const agent2 = await connect('studio_agent', secrets['db-agent']);
    const binding = async (client: Client) => {
      await client.query('BEGIN');
      const row = (await client.query('SELECT pg_backend_pid() AS pid, txid_current()::text AS txid')).rows[0];
      return { pid: row.pid as number, txid: row.txid as string };
    };
    const first = await binding(agent1);
    const base = { message_id: 'synthetic-wamid-alpha', sender: '15555550102', turn: randomBytes(32).toString('hex'), ...first };
    assert.equal((await claim(base)).status, 403);
    assert.equal((await claim({ ...base, author: 'forged' })).status, 400);
    assert.equal((await claim(base, 'wrong-token')).status, 403);
    await agent1.query('ROLLBACK');

    // Wrong account, disallowed sender and stale signed messages cannot establish a context.
    for (const [payload, sender, id] of [
      [body('15555550109', 'Synthetic Denied', 'synthetic-denied', 'x'), '15555550109', 'synthetic-denied'],
      [body('15555550102', 'Synthetic Alpha', 'synthetic-other-account', 'x', Math.floor(Date.now() / 1000), '999'), '15555550102', 'synthetic-other-account'],
      [body('15555550102', 'Synthetic Alpha', 'synthetic-stale', 'x', Math.floor(Date.now() / 1000) - 600), '15555550102', 'synthetic-stale'],
    ]) {
      assert.equal((await evidence(payload)).status, 204);
      assert.equal((await claim({ ...base, message_id: id, sender })).status, 403);
    }
    const race = body('15555550102', 'Synthetic Alpha', 'synthetic-race', 'race');
    assert.equal((await evidence(race)).status, 204);
    const one = await binding(agent1);
    const two = await binding(agent2);
    const attempts = await Promise.all([one, two].map((target) => claim({ ...target, message_id: 'synthetic-race', sender: '15555550102', turn: randomBytes(32).toString('hex') })));
    assert.deepEqual(attempts.map((response) => response.status).sort(), [204, 403]);
    const winner = attempts[0].status === 204 ? agent1 : agent2;
    const inserted = await winner.query("INSERT INTO app.clients (first_name, last_name, created_by_phone) VALUES ('race', 'synthetic', '999') RETURNING created_by_phone, created_by_name");
    assert.deepEqual(inserted.rows[0], { created_by_phone: '15555550102', created_by_name: 'Synthetic Alpha' });
    await agent1.query('ROLLBACK');
    await agent2.query('ROLLBACK');
    for (const target of [one, two]) await fetch(`${broker}/v1/release`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pilates-Bridge': secrets['bridge-token'] }, body: JSON.stringify(target) });
    await agent1.query('BEGIN');
    await assert.rejects(agent1.query("INSERT INTO app.clients (first_name, last_name) VALUES ('replay', 'synthetic')"), { code: '42501' });
    await agent1.query('ROLLBACK');

    const noNamePayload = JSON.parse(body('15555550102', 'Synthetic Alpha', 'synthetic-no-name', 'x')) as { entry: Array<{ changes: Array<{ value: { contacts?: unknown } }> }> };
    delete noNamePayload.entry[0].changes[0].value.contacts;
    assert.equal((await evidence(JSON.stringify(noNamePayload))).status, 204);
    const noName = await binding(agent1);
    assert.equal((await claim({ ...noName, message_id: 'synthetic-no-name', sender: '15555550102', turn: randomBytes(32).toString('hex') })).status, 204);
    const missing = await agent1.query("INSERT INTO app.clients (first_name, last_name, created_by_name) VALUES ('missing', 'synthetic', 'forged') RETURNING created_by_phone, created_by_name");
    assert.deepEqual(missing.rows[0], { created_by_phone: '15555550102', created_by_name: null });
    await agent1.query('ROLLBACK');
    await fetch(`${broker}/v1/release`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pilates-Bridge': secrets['bridge-token'] }, body: JSON.stringify(noName) });
    assert.equal(Number((await migrator.query('SELECT count(*) FROM studio_private.author_context')).rows[0].count), 0);
  } finally {
    for (const client of clients) await client.end().catch(() => {});
    try { compose('down', '-v', '--remove-orphans'); } catch { /* best effort */ }
    try { execFileSync('docker', ['image', 'rm', `${project}-hermes`], { stdio: 'pipe' }); } catch { /* best effort */ }
    await rm(directory, { recursive: true, force: true });
  }
});
