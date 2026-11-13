import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { Client } from 'pg';

test('guided management with signed webhooks, private PostgreSQL and no model history', { timeout: 900_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pilates-management-'));
  const project = `pilates-management-${randomBytes(8).toString('hex')}`;
  let manager = '15555550102'; const ordinary = '15555550103';
  const secrets: Record<string, string> = {
    'db-admin': randomBytes(32).toString('hex'), 'db-migrator': randomBytes(32).toString('hex'),
    'db-agent': randomBytes(32).toString('hex'), 'db-broker': randomBytes(32).toString('hex'),
    'bridge-token': randomBytes(32).toString('hex'), 'openrouter-key': 'synthetic-key',
    'whatsapp-access-token': 'synthetic-access', 'whatsapp-app-secret': 'synthetic-secret',
    'whatsapp-verify-token': 'synthetic-verify', 'whatsapp-allowed-users': `${manager},${ordinary}`,
    'whatsapp-home-channel': manager, 'whatsapp-phone-number-id': '123456789012345', 'whatsapp-teacher-links': '[]',
  };
  const override = join(directory, 'override.yaml');
  const env = { ...process.env, COMPOSE_ENV_FILES: '/dev/null', COMPOSE_PROJECT_NAME: project, PILATES_VOLUME_PREFIX: project, PILATES_HERMES_IMAGE: `${project}-hermes`, PILATES_POSTGRES_IMAGE: `${project}-postgres`, SECRETS_DIR: directory, POSTGRES_PORT: '0', WHATSAPP_WEBHOOK_PORT: '0', PILATES_MODEL: 'synthetic/compaction-model', PILATES_IDLE_COMPACT_SECONDS: '1' };
  const compose = (...args: string[]) => execFileSync('docker', ['compose', '-p', project, '-f', 'compose.yaml', '-f', override, ...args], { env, encoding: 'utf8', stdio: 'pipe', timeout: 240_000 });
  let db: Client | undefined;
  try {
    await Promise.all(Object.entries(secrets).map(([key, value]) => writeFile(join(directory, key), value, { mode: 0o600 })));
    await writeFile(join(directory, 'config.yaml'), (await readFile('hermes/config.yaml', 'utf8')).replace('\ndisplay:\n', '\ndisplay:\n  tool_progress: off\n'));
    await writeFile(override, `services:
  author-broker:
    environment:
      PILATES_MANAGER_PHONE: "+${manager}"
  model-stub:
    image: ${project}-hermes
    entrypoint: ["/opt/hermes/.venv/bin/python", "/stub.py"]
    volumes:
      - ${JSON.stringify(`${resolve('integration/compaction_stub.py')}:/stub.py:ro`)}
    logging: {driver: none}
  meta-stub:
    image: ${project}-hermes
    entrypoint: ["/opt/hermes/.venv/bin/python", "/stub.py"]
    volumes:
      - ${JSON.stringify(`${resolve('scenarios/meta_stub.py')}:/stub.py:ro`)}
    logging: {driver: none}
  hermes:
    environment:
      PILATES_MANAGER_PHONE: "+${manager}"
      OPENROUTER_BASE_URL: http://model-stub:8088/v1
    volumes:
      - ${JSON.stringify(`${resolve('scenarios/gateway-launcher.sh')}:/opt/hermes/libexec/hermes:ro`)}
      - ${JSON.stringify(`${join(directory, 'config.yaml')}:/opt/data/config.yaml:ro`)}
networks:
  default:
    internal: true
`);
    compose('build', 'hermes'); compose('up', '-d', '--wait', 'postgres'); compose('run', '--rm', 'db-bootstrap');
    const address = (service: string) => execFileSync('docker', ['inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', compose('ps', '-q', service).trim()], { encoding: 'utf8' }).trim();
    const url = new URL(`postgresql://${address('postgres')}:5432/studio?schema=public`);
    url.username = 'studio_migrator'; url.password = secrets['db-migrator'];
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: { ...env, DATABASE_URL: url.toString() }, stdio: 'pipe', timeout: 90_000 });
    db = new Client({ host: address('postgres'), database: 'studio', user: 'studio_migrator', password: secrets['db-migrator'] }); await db.connect();
    const sql = (query: string, params: unknown[] = []) => (db as Client).query(query, params);
    compose('up', '-d', '--wait', '--wait-timeout', '150', 'model-stub', 'meta-stub', 'hermes');
    const gateway = () => `http://${address('hermes')}:8090/whatsapp/webhook`;
    const meta = `http://${address('meta-stub')}:8088/observations`;
    const models = `http://${address('model-stub')}:8088/v1/observations`;
    const observations = async () => await (await fetch(models)).json() as { kind: string; private_phone: boolean; private_management: boolean; all: string[] }[];
    const replies = async () => await (await fetch(meta)).json() as { to: string; text: string }[];
    let seq = 0;
    const payload = (text: string, sender = manager, id = `management-${++seq}`, timestamp = Math.floor(Date.now() / 1000)) => JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: secrets['whatsapp-phone-number-id'] }, contacts: [{ wa_id: sender, profile: { name: 'Synthetic' } }], messages: [{ from: sender, id, timestamp: String(timestamp), type: 'text', text: { body: text } }] } }] }] });
    const post = (body: string, signature = `sha256=${createHmac('sha256', secrets['whatsapp-app-secret']).update(body).digest('hex')}`) => fetch(gateway(), { method: 'POST', body, headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signature } });
    const step = async (text: string, sender = manager) => {
      const before = (await replies()).length;
      assert.equal((await post(payload(text, sender))).status, 200);
      const entries = (await replies()).slice(before);
      assert.ok(entries.length, 'missing deterministic management response');
      assert.ok(entries.every((entry) => entry.to === sender), 'cross-sender management response');
      return entries.map((entry) => entry.text).join('\n');
    };
    const confirm = async (preview: string) => {
      const code = /\/conferma ([a-f0-9]{16})/u.exec(preview)?.[1]; assert.ok(code);
      return step(`/conferma ${code}`);
    };
    const start = () => step('/anagrafica');
    assert.equal((await post(payload('/anagrafica'), 'sha256=bad')).status, 401);
    await step('/anagrafica', ordinary); await step('/conferma stolen', ordinary);
    await start(); await step('Synthetic');
    assert.match(await confirm(await step('Manager')), /salvata/u);
    const managerId = String((await sql('SELECT id FROM studio_private.teachers')).rows[0].id);
    await start(); await step('nuovo'); await step('Other'); await step('Synthetic');
    assert.match(await confirm(await step('+1 (555) 555-0901')), /salvata/u);
    const otherId = String((await sql("SELECT id FROM studio_private.teachers WHERE first_name='Other'")).rows[0].id);
    await start(); assert.match(await step('elenco'), /15555550901/u);
    for (const text of [`numero ${managerId}`, `revoca ${managerId}`]) assert.match(await step(text), /Non puoi/u);
    await step('/annulla');
    for (const [command, inputs] of [[`correggi ${otherId}`, ['Corrected', 'Synthetic']], [`numero ${otherId}`, ['+15555550902']], [`revoca ${otherId}`, []], [`abilita ${otherId}`, []], [`correggi ${managerId}`, ['Synthetic', 'CorrectedManager']]] as [string, string[]][]) {
      await start(); let preview = await step(command); for (const input of inputs) preview = await step(input);
      assert.match(await confirm(preview), /salvata/u);
    }
    // Duplicate normalized phone and duplicate names are rolled back with no audit.
    const count = async () => Number((await sql('SELECT count(*) FROM studio_private.teacher_identity_changes')).rows[0].count);
    const before = await count();
    await start(); await step('nuovo'); await step('Duplicate'); await step('Synthetic');
    assert.match(await confirm(await step('00 1 555 555 0902')), /rifiutato/u); assert.equal(await count(), before);
    await start(); const cancelled = await step(`revoca ${otherId}`); await step('/annulla');
    await confirm(cancelled); assert.equal(await count(), before);
    await start(); await step(`numero ${otherId}`); await step('555'); assert.equal(await count(), before);
    await start(); const replay = await step(`revoca ${otherId}`);
    const code = /\/conferma ([a-f0-9]{16})/u.exec(replay)?.[1]; assert.ok(code);
    const repeated = payload(`/conferma ${code}`);
    await Promise.all([post(repeated), post(repeated)]); assert.equal(await count(), before + 1);
    // An interrupted confirmation stays consumed and cannot be resumed after restart.
    await start(); const interrupted = await step(`abilita ${otherId}`);
    compose('restart', 'author-broker'); await delay(3000);
    assert.match(await confirm(interrupted), /scaduta/u);
    assert.match(await step('+15555550903'), /scaduta/u);
    await step('/annulla');
    await step('/annulla');
    await start(); const expired = await step(`abilita ${otherId}`);
    await sql("UPDATE studio_private.management_sessions SET state=jsonb_set(state::jsonb,'{state,expires}','0')::text");
    assert.match(await confirm(expired), /scaduta/u);
    await step('/annulla');
    // A stale manager revision is rejected even if the account is enabled again.
    await start(); const stale = await step(`abilita ${otherId}`);
    const trusted = new Client({ host: address('postgres'), database: 'studio', user: 'studio_broker', password: secrets['db-broker'] });
    await trusted.connect();
    try {
      await trusted.query("SELECT * FROM studio_private.manage_teacher_identity($1,$2,'correct',$3,'Synthetic','ChangedAgain',NULL)", [manager, `+${manager}`, managerId]);
    } finally { await trusted.end(); }
    assert.match(await confirm(stale), /rifiutato/u);
    // Cross-sender confirmation cannot consume the manager's pending draft.
    await start(); const own = await step(`abilita ${otherId}`);
    const ownCode = /\/conferma ([a-f0-9]{16})/u.exec(own)?.[1]; assert.ok(ownCode);
    assert.match(await step(`/conferma ${ownCode}`, ordinary), /riservata/u);
    assert.match(await confirm(own), /salvata/u);
    const enrollment = async (first: string, last: string, phone: string) => {
      await start(); await step('nuovo'); await step(first); await step(last); return confirm(await step(phone));
    };
    assert.match(await enrollment('Corrected', 'Synthetic', '+15555550908'), /rifiutato/u);
    assert.match(await enrollment('Trusted', 'Synthetic', '+15555550905'), /salvata/u);
    await start(); const unauthorized = await step(`revoca ${otherId}`);
    const changed = new Client({ host: address('postgres'), database: 'studio', user: 'studio_broker', password: secrets['db-broker'] });
    await changed.connect();
    try {
      // Simulate an operator's changed trusted manager proof, not model input.
      await changed.query("SELECT * FROM studio_private.manage_teacher_identity('15555550905','+15555550905','revoke',$1,NULL,NULL,NULL)", [managerId]);
      const changesBefore = await count();
      assert.match(await confirm(unauthorized), /non abilitato/u);
      assert.equal(await count(), changesBefore);
      await changed.query("SELECT * FROM studio_private.manage_teacher_identity('15555550905','+15555550905','enable',$1,NULL,NULL,NULL)", [managerId]);
    } finally { await changed.end(); }
    assert.equal((await observations()).length, 0, 'management must never call a model');
    // Restart the empty database while retaining legacy persons to test matching bootstrap.
    // Use a separate synthetic manager number via the trusted DB proof, not model input.
    await sql('BEGIN');
    await sql("INSERT INTO studio_private.author_context VALUES (pg_backend_pid(),txid_current(),'15555550103','Synthetic',clock_timestamp()+interval '60 seconds',NULL,NULL)");
    const legacy = (await sql("INSERT INTO app.teachers(first_name,last_name) VALUES ('Legacy','Synthetic') RETURNING id")).rows[0].id;
    await sql('COMMIT');
    await start(); await step(`completa ${legacy}`); assert.match(await confirm(await step('+15555550904')), /salvata/u);
    // Ordinary conversations still take the baseline path. Fill enough history
    // for idle compaction, observing all principal and auxiliary requests.
    for (let i = 0; i < 8; i++) {
      const previous = (await replies()).length;
      assert.equal((await post(payload(`MARK-A-${i} ${i === 0 ? 'ENROLL' : ''} ${'parola sintetica '.repeat(1500)}`))).status, 200);
      for (let wait = 0; wait < 120 && (await replies()).length === previous; wait++) await delay(500);
      assert.ok((await replies()).length > previous, 'normal turn did not finish');
      await delay(1200);
    }
    assert.equal(Number((await sql("SELECT count(*) FROM app.teachers WHERE first_name='Forbidden'")).rows[0].count), 0, 'legacy SQL bypassed guided enrollment');
    const beforeOther = (await replies()).length;
    assert.equal((await post(payload('MARK-B-0 ordinary', ordinary))).status, 200);
    for (let wait = 0; wait < 120 && (await replies()).length === beforeOther; wait++) await delay(500);
    assert.ok((await replies()).length > beforeOther, 'other sender normal turn did not finish');
    const observed = await observations();
    const otherTurn = observed.filter((entry) => entry.all.includes('MARK-B-0'));
    assert.ok(otherTurn.length > 0);
    assert.ok(otherTurn.every((entry) => entry.all.every((marker) => !marker.startsWith('MARK-A-'))), 'manager history reached another sender');
    assert.ok(observed.every((entry) => !entry.private_management), 'management names reached a model request');
    assert.ok(observed.some((entry) => entry.kind === 'summary'), 'missing real compaction');
    assert.ok(observed.every((entry) => !entry.private_phone), 'management phone reached model or compaction');
    const gatewayId = compose('ps', '-q', 'hermes').trim();
    execFileSync('docker', ['exec', gatewayId, '/opt/hermes/.venv/bin/python', '-c', "from pathlib import Path; files=[p for p in Path('/opt/data').rglob('*') if p.is_file() and p.suffix in ('.db','.jsonl')]; assert not any(b'1555555090' in p.read_bytes() or b'555-0901' in p.read_bytes() for p in files)"], { stdio: 'pipe' });
    assert.equal(execFileSync('docker', ['inspect', '--format', '{{.HostConfig.LogConfig.Type}}', compose('ps', '-q', 'author-broker').trim()], { encoding: 'utf8' }).trim(), 'none');
    // Complete a legacy manager through the signed guided bootstrap, preserving ID.
    await sql('BEGIN');
    await sql("INSERT INTO studio_private.author_context VALUES (pg_backend_pid(),txid_current(),'15555550103','Synthetic',clock_timestamp()+interval '60 seconds',NULL,NULL)");
    const legacyManager = (await sql("INSERT INTO app.teachers(first_name,last_name) VALUES ('LegacyManager','Synthetic') RETURNING id")).rows[0].id;
    await sql('COMMIT');
    await start(); await step(`numero ${otherId}`);
    const oldManager = manager;
    manager = ordinary;
    await writeFile(override, (await readFile(override, 'utf8')).replaceAll(`+${oldManager}`, `+${manager}`));
    compose('up', '-d', '--wait', '--wait-timeout', '150', 'hermes');
    const modelCount = (await observations()).length;
    assert.match(await step('+15555550906', oldManager), /riservata/u);
    assert.match(await step('/annulla', oldManager), /riservata/u);
    assert.match(await step('/anagrafica', oldManager), /riservata/u);
    await start(); await step('LegacyManager');
    const legacyPreview = await step('Synthetic');
    assert.match(legacyPreview, /preesistente/u);
    assert.match(await confirm(legacyPreview), /salvata/u);
    const completed = (await sql('SELECT phone FROM studio_private.teachers WHERE id=$1', [legacyManager])).rows[0];
    assert.equal(completed.phone, `+${manager}`);
    assert.equal((await observations()).length, modelCount);
    for (const service of ['hermes']) {
      const logs = execFileSync('docker', ['logs', compose('ps', '-q', service).trim()], { encoding: 'utf8', stdio: 'pipe' });
      assert.doesNotMatch(logs, /1555555|Synthetic|synthetic-secret|conferma/u);
    }
  } finally {
    await db?.end().catch(() => {});
    try { compose('down', '-v', '--remove-orphans'); } catch { /* best effort, isolated project only */ }
    for (const image of [`${project}-hermes`, `${project}-postgres`]) {
      try { execFileSync('docker', ['image', 'rm', image], { stdio: 'pipe' }); } catch { /* only this test's tags */ }
    }
    await rm(directory, { recursive: true, force: true });
  }
});
