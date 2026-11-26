import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { Client } from 'pg';
import { legacyContext, migrateAcrossTransition } from './identity-seed.js';

test('operational transition keeps snapshots, completes identities in chat and recovers the manager', { timeout: 900_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'pilates-transition-'));
  const directory = join(root, 'secrets');
  const project = `pilates-transition-${randomBytes(6).toString('hex')}`;
  const recoveryProject = `pilates-trecovery-${randomBytes(6).toString('hex')}`;
  const opsImage = `${project}-ops`;
  const manager = '15555550102';
  const successor = '15555550103';
  const renumbered = '15555550107';
  const REFUSAL = /^Accesso non abilitato\. Per usare l.assistente dello studio rivolgiti al gestore\.$/u;
  const secrets: Record<string, string> = {
    'db-admin': randomBytes(32).toString('hex'), 'db-migrator': randomBytes(32).toString('hex'),
    'db-agent': randomBytes(32).toString('hex'), 'db-broker': randomBytes(32).toString('hex'), 'db-grafana': randomBytes(32).toString('hex'),
    'bridge-token': randomBytes(32).toString('hex'), 'openrouter-key': 'synthetic-key',
    'whatsapp-access-token': 'synthetic-access', 'whatsapp-app-secret': 'synthetic-secret',
    'whatsapp-verify-token': 'synthetic-verify', 'whatsapp-manager-phone': `+${manager}`,
    'whatsapp-phone-number-id': '123456789012345', 'grafana-admin-password': 'synthetic-grafana-admin',
  };
  const override = join(root, 'override.yaml');
  const envFile = join(root, 'local.env');
  const env = {
    ...process.env, COMPOSE_ENV_FILES: '/dev/null', COMPOSE_PROJECT_NAME: project, PILATES_VOLUME_PREFIX: project,
    PILATES_HERMES_IMAGE: `${project}-hermes`, PILATES_POSTGRES_IMAGE: `${project}-postgres`,
    SECRETS_DIR: directory, POSTGRES_PORT: '0', WHATSAPP_WEBHOOK_PORT: '0', WHATSAPP_WEBHOOK_PATH: '/whatsapp/webhook',
    PILATES_MODEL: 'synthetic/compaction-model', PILATES_IDLE_COMPACT_SECONDS: '1',
  };
  const compose = (...args: string[]) => execFileSync('docker', ['compose', '-p', project, '-f', 'compose.yaml', '-f', override, ...args], { env, encoding: 'utf8', stdio: 'pipe', timeout: 240_000 });
  let db: Client | undefined;
  try {
    await mkdir(directory, { mode: 0o700 });
    await chmod(root, 0o700);
    await Promise.all(Object.entries(secrets).map(([key, value]) => writeFile(join(directory, key), value, { mode: 0o600 })));
    for (const [name, value] of [['whatsapp-allowed-users', '15555550199\n'], ['whatsapp-home-channel', '15555550199\n'], ['whatsapp-teacher-links', '15555550199 Still Incomplete\n']] as const) {
      await writeFile(join(directory, name), value, { mode: 0o600 });
    }
    await writeFile(join(root, 'prod.env'), 'POSTGRES_PORT=0\nWHATSAPP_WEBHOOK_PORT=0\nWHATSAPP_WEBHOOK_PATH=/whatsapp/webhook\nPILATES_MODEL=synthetic/compaction-model\n', { mode: 0o600 });
    await writeFile(envFile, `OTHER=synthetic\nPILATES_MANAGER_PHONE=+${manager}\n`, { mode: 0o600 });
    await writeFile(join(root, 'config.yaml'), (await readFile('hermes/config.yaml', 'utf8')).replace('\ndisplay:\n', '\ndisplay:\n  tool_progress: off\n'));
    await writeFile(override, `services:
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
      OPENROUTER_BASE_URL: http://model-stub:8088/v1
    volumes:
      - ${JSON.stringify(`${resolve('scenarios/gateway-launcher.sh')}:/opt/hermes/libexec/hermes:ro`)}
      - ${JSON.stringify(`${join(root, 'config.yaml')}:/opt/data/config.yaml:ro`)}
  author-broker:
    logging: {driver: none}
networks:
  default:
    internal: true
`);
    execFileSync('docker', ['build', '-f', 'hermes/Dockerfile', '-t', `${project}-hermes`, '.'], { stdio: 'pipe', timeout: 600_000 });
    execFileSync('docker', ['build', '-f', 'db/Dockerfile', '-t', `${project}-postgres`, '.'], { stdio: 'pipe', timeout: 600_000 });
    execFileSync('docker', ['build', '-f', 'scripts/ops.Dockerfile', '--build-arg', `PILATES_RELEASE=${'a'.repeat(40)}`, '-t', opsImage, '.'], { stdio: 'pipe', timeout: 180_000 });
    compose('up', '-d', '--no-build', '--wait', 'postgres');
    compose('run', '--rm', 'db-bootstrap');
    const address = (service: string, target = project) => execFileSync('docker', ['inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', execFileSync('docker', ['compose', '-p', target, '-f', 'compose.yaml', ...(target === project ? ['-f', override] : []), 'ps', '-q', service], { env, encoding: 'utf8' }).trim()], { encoding: 'utf8' }).trim();
    const postgresHost = address('postgres');
    const url = new URL(`postgresql://${postgresHost}:5432/studio?schema=public`);
    url.username = 'studio_migrator';
    url.password = secrets['db-migrator'];
    db = new Client({ host: postgresHost, database: 'studio', user: 'studio_migrator', password: secrets['db-migrator'] });
    await db.connect();
    const before: Record<string, unknown[]> = {};
    await migrateAcrossTransition(env, url, async () => {
      await db?.query('BEGIN');
      await legacyContext(db as Client, '15555550104', 'WhatsApp Profile Synthetic');
      await db?.query("INSERT INTO app.teachers (first_name, last_name) VALUES ('Legacy', 'Synthetic'), ('Still', 'Incomplete')");
      await db?.query("INSERT INTO app.clients (first_name, last_name) VALUES ('Client', 'Synthetic')");
      const still = (await db?.query("SELECT id FROM app.teachers WHERE first_name = 'Still'"))?.rows[0].id;
      await db?.query("INSERT INTO app.teacher_assignments (teacher_id, lesson_date, start_time) VALUES ($1, '2020-02-03', '09:00')", [still]);
      await db?.query('COMMIT');
      for (const table of ['clients', 'teachers', 'teacher_assignments']) {
        before[table] = (await db?.query(`SELECT id FROM app.${table} ORDER BY id`))?.rows ?? [];
      }
    });
    assert.equal((await db.query("SELECT count(*)::int AS n FROM studio_private.teachers WHERE phone IS NOT NULL OR access_enabled OR NOT legacy_identity")).rows[0].n, 0);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM studio_private.teachers WHERE phone LIKE '%15555550199%' OR first_name LIKE '%15555550199%' OR created_by_name = 'WhatsApp Profile Synthetic' AND phone IS NOT NULL")).rows[0].n, 0);
    for (const table of ['clients', 'teachers', 'teacher_assignments']) {
      assert.deepEqual((await db.query(`SELECT id FROM studio_private.${table} ORDER BY id`)).rows, before[table], `${table} ids changed`);
    }
    const legacyId = String((await db.query("SELECT id FROM studio_private.teachers WHERE first_name = 'Legacy'")).rows[0].id);
    const stillId = String((await db.query("SELECT id FROM studio_private.teachers WHERE first_name = 'Still'")).rows[0].id);
    assert.deepEqual((await db.query("SELECT assigned_teacher FROM app.lesson_teachers('2020-02-03', '2020-02-03')")).rows.map((row) => row.assigned_teacher), ['Still Incomplete']);
    compose('up', '-d', '--no-build', '--wait', '--wait-timeout', '150', 'model-stub', 'meta-stub', 'hermes');
    const gateway = () => `http://${address('hermes')}:8090/whatsapp/webhook`;
    const observations = async () => await (await fetch(`http://${address('model-stub')}:8088/v1/observations`)).json() as { kind: string; private_phone: boolean; all: string[] }[];
    const replies = async () => await (await fetch(`http://${address('meta-stub')}:8088/observations`)).json() as { to: string; text: string }[];
    let seq = 0;
    const payload = (text: string, sender = manager, id = `transition-${++seq}`) => JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: secrets['whatsapp-phone-number-id'] }, contacts: [{ wa_id: sender, profile: { name: 'WhatsApp Profile Synthetic' } }], messages: [{ from: sender, id, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }] } }] }] });
    const post = (body: string, signature = `sha256=${createHmac('sha256', secrets['whatsapp-app-secret']).update(body).digest('hex')}`) => fetch(gateway(), { method: 'POST', body, headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signature } });
    const step = async (text: string, sender = manager) => {
      const beforeReplies = (await replies()).length;
      const beforeModels = (await observations()).length;
      assert.equal((await post(payload(text, sender))).status, 200);
      let entries: { to: string; text: string }[] = [];
      for (let wait = 0; wait < 80 && entries.length === 0; wait++) {
        await delay(250);
        entries = (await replies()).slice(beforeReplies);
      }
      assert.ok(entries.length, 'missing management response');
      assert.ok(entries.every((entry) => entry.to === sender));
      assert.equal((await observations()).length, beforeModels, 'management or refusal called the model');
      return entries.map((entry) => entry.text).join('\n');
    };
    const confirm = async (preview: string, sender = manager) => {
      const code = /\/conferma ([a-f0-9]{16})/u.exec(preview)?.[1];
      assert.ok(code);
      return step(`/conferma ${code}`, sender);
    };
    assert.match(await step('ciao'), /Censimento iniziale obbligatorio/u);
    await step('/anagrafica');
    await step('Synthetic');
    assert.match(await confirm(await step('Manager')), /salvata/u);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM studio_private.teachers WHERE first_name = 'Legacy'")).rows[0].n, 1);
    const managerId = String((await db.query("SELECT id FROM studio_private.teachers WHERE phone = $1", [`+${manager}`])).rows[0].id);
    assert.notEqual(managerId, legacyId);
    await step('/anagrafica');
    await step(`completa ${legacyId}`);
    assert.match(await confirm(await step('+15555550904')), /salvata/u);
    assert.equal((await db.query('SELECT id::text AS id, phone FROM studio_private.teachers WHERE first_name = $1', ['Legacy'])).rows[0].id, legacyId);
    const stillRow = (await db.query('SELECT phone, access_enabled FROM studio_private.teachers WHERE id = $1', [stillId])).rows[0];
    assert.equal(stillRow.phone, null);
    assert.equal(stillRow.access_enabled, false);
    assert.deepEqual((await db.query("SELECT assigned_teacher FROM app.lesson_teachers('2020-02-03', '2020-02-03')")).rows.map((row) => row.assigned_teacher), ['Still Incomplete']);
    assert.match(await step('lezione', '15555550199'), REFUSAL);
    await step('/anagrafica');
    await step('nuovo');
    await step('Partial');
    await step('Synthetic');
    assert.match(await step('555'), /non valido|rifiutato|prefisso/iu);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM studio_private.teachers WHERE first_name = 'Partial'")).rows[0].n, 0);
    await step('/annulla');
    await step('/anagrafica');
    await step('nuovo');
    await step('Successor');
    await step('Synthetic');
    assert.match(await confirm(await step(`+${successor}`)), /salvata/u);
    const successorId = String((await db.query('SELECT id FROM studio_private.teachers WHERE phone = $1', [`+${successor}`])).rows[0].id);
    assert.match(await step('/anagrafica', successor), /riservata/u);
    assert.match(await step('/sethome'), /operatore/iu);
    const homes = execFileSync('docker', ['exec', compose('ps', '-q', 'hermes').trim(), 'sh', '-c', 'for f in /proc/[0-9]*/environ; do tr "\\0" "\\n" < "$f" 2>/dev/null; done | grep "^WHATSAPP_CLOUD_HOME_CHANNEL=" | sort -u'], { encoding: 'utf8' }).trim();
    assert.equal(homes, `WHATSAPP_CLOUD_HOME_CHANNEL=${manager}`);
    await step('/anagrafica');
    await step(`correggi ${successorId}`);
    await step('Successor');
    const pending = await step('Synthetic');
    const pendingCode = /\/conferma ([a-f0-9]{16})/u.exec(pending)?.[1];
    assert.ok(pendingCode);
    compose('stop', 'hermes', 'author-broker');
    const backupDirectory = join(root, 'backup');
    execFileSync('bash', ['scripts/backup.sh', project, backupDirectory], { env, stdio: 'pipe', timeout: 180_000 });
    const restoreEnv = { ...env, COMPOSE_PROJECT_NAME: recoveryProject, PILATES_VOLUME_PREFIX: recoveryProject };
    execFileSync('bash', ['scripts/restore.sh', recoveryProject, backupDirectory], { env: restoreEnv, stdio: 'pipe', timeout: 180_000 });
    execFileSync('docker', ['compose', '-p', recoveryProject, '-f', 'compose.yaml', 'up', '-d', '--no-build', '--wait', 'author-broker'], { env: restoreEnv, stdio: 'pipe', timeout: 180_000 });
    const restored = new Client({ host: '127.0.0.1', port: Number(execFileSync('docker', ['compose', '-p', recoveryProject, '-f', 'compose.yaml', 'port', 'postgres', '5432'], { env: restoreEnv, encoding: 'utf8' }).trim().split(':').at(-1)), database: 'studio', user: 'studio_migrator', password: secrets['db-migrator'] });
    await restored.connect();
    assert.equal((await restored.query('SELECT count(*)::int AS n FROM studio_private.author_context')).rows[0].n, 0);
    assert.equal((await restored.query('SELECT count(*)::int AS n FROM studio_private.teachers WHERE id = $1', [stillId])).rows[0].n, 1);
    const brokerHost = address('author-broker', recoveryProject);
    const confirmBody = payload(`/conferma ${pendingCode}`);
    const admission = await fetch(`http://${brokerHost}:8091/v1/admission`, { method: 'POST', body: confirmBody, headers: { 'X-Pilates-Bridge': secrets['bridge-token'], 'X-Hub-Signature-256': `sha256=${createHmac('sha256', secrets['whatsapp-app-secret']).update(confirmBody).digest('hex')}` } });
    const decision = await admission.json() as { admitted: unknown[]; replies: { text: string }[] };
    assert.equal(decision.admitted.length, 0);
    assert.equal(/scaduta/u.test(decision.replies[0]?.text ?? ''), true);
    assert.equal((await restored.query("SELECT first_name FROM studio_private.teachers WHERE id = $1", [successorId])).rows[0].first_name, 'Successor');
    await restored.end();
    execFileSync('docker', ['compose', '-p', recoveryProject, '-f', 'compose.yaml', 'down', '-v', '--remove-orphans'], { env: restoreEnv, stdio: 'pipe', timeout: 120_000 });
    compose('up', '-d', '--no-build', '--wait', '--wait-timeout', '150', 'author-broker', 'hermes');
    const ops = (action: string) => spawnSync('docker', ['run', '--rm', '--network', 'none', '--env', `PILATES_HOME=${root}`, '--env', `PILATES_PROJECT=${project}`, '--env', 'COMPOSE_ENV_FILES=/dev/null', '--env', `PILATES_ENV_FILE=${envFile}`, '--mount', 'type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock', '--mount', `type=bind,src=${root},dst=${root}`, opsImage, action], { encoding: 'utf8', timeout: 120_000 });
    const refusedObsolete = ops('manager-transfer');
    assert.notEqual(refusedObsolete.status, 0);
    assert.match(refusedObsolete.stderr, /Obsolete identity file present/);
    assert.doesNotMatch(refusedObsolete.stdout + refusedObsolete.stderr, /1555555/);
    for (const name of ['whatsapp-allowed-users', 'whatsapp-home-channel', 'whatsapp-teacher-links']) await rm(join(directory, name));
    const align = async (action: string, next: string) => {
      compose('stop', 'hermes', 'author-broker');
      if (next) await writeFile(join(directory, 'manager-next-phone'), `${next}\n`, { mode: 0o600 });
      const result = ops(action);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Manager configuration aligned/);
      assert.doesNotMatch(result.stdout + result.stderr, /1555555/);
      compose('up', '-d', '--no-build', '--force-recreate', '--wait', '--wait-timeout', '150', 'author-broker', 'hermes');
    };
    const homeOf = () => execFileSync('docker', ['exec', compose('ps', '-q', 'hermes').trim(), 'sh', '-c', 'for f in /proc/[0-9]*/environ; do tr "\\0" "\\n" < "$f" 2>/dev/null; done | grep "^WHATSAPP_CLOUD_HOME_CHANNEL=" | sort -u'], { encoding: 'utf8' }).trim();
    await align('manager-transfer', `+${successor}`);
    assert.equal(await readFile(envFile, 'utf8'), `OTHER=synthetic\nPILATES_MANAGER_PHONE=+${successor}\n`);
    assert.equal((await db.query('SELECT id::text AS id FROM studio_private.teachers WHERE phone = $1', [`+${manager}`])).rows[0].id, managerId);
    assert.equal((await db.query('SELECT id::text AS id FROM studio_private.teachers WHERE phone = $1', [`+${successor}`])).rows[0].id, successorId);
    assert.match(await step('/anagrafica'), /riservata/u);
    assert.match(await step('/anagrafica', successor), /elenco|nuovo|completa/u);
    await step('/annulla', successor);
    assert.equal(homeOf(), `WHATSAPP_CLOUD_HOME_CHANNEL=${successor}`);
    await align('manager-recover', '');
    assert.equal(await readFile(envFile, 'utf8'), `OTHER=synthetic\nPILATES_MANAGER_PHONE=+${manager}\n`);
    assert.match(await step('/anagrafica'), /elenco|nuovo|completa/u);
    await step('/annulla');
    assert.match(await step('/anagrafica', successor), /riservata/u);
    assert.equal(homeOf(), `WHATSAPP_CLOUD_HOME_CHANNEL=${manager}`);
    const marked = payload('MARK-A-0 ordinary');
    assert.equal((await post(marked)).status, 200);
    for (let wait = 0; wait < 80 && !(await observations()).some((entry) => entry.all.includes('MARK-A-0')); wait++) await delay(250);
    assert.ok((await observations()).some((entry) => entry.all.includes('MARK-A-0')));
    await align('manager-renumber', `+${renumbered}`);
    assert.equal((await db.query('SELECT id::text AS id, phone FROM studio_private.teachers WHERE id = $1', [managerId])).rows[0].phone, `+${renumbered}`);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM studio_private.resolve_teacher_identity($1)", [manager])).rows[0].n, 0);
    assert.equal((await db.query("SELECT operation FROM studio_private.teacher_identity_changes WHERE teacher_id = $1 ORDER BY id DESC LIMIT 1", [managerId])).rows[0].operation, 'operator_renumber');
    assert.match(await step('vecchio', manager), REFUSAL);
    assert.match(await step('/anagrafica', renumbered), /elenco|nuovo|completa/u);
    await step('/annulla', renumbered);
    const beforeNew = (await observations()).length;
    assert.equal((await post(payload('MARK-B-0 ordinary', renumbered))).status, 200);
    for (let wait = 0; wait < 80 && (await observations()).length === beforeNew; wait++) await delay(250);
    const fresh = (await observations()).slice(beforeNew);
    assert.ok(fresh.some((entry) => entry.all.includes('MARK-B-0')));
    assert.ok(fresh.every((entry) => !entry.all.includes('MARK-A-0')), 'renumbered manager inherited the previous chat');
    assert.ok((await observations()).every((entry) => !entry.private_phone), 'a phone reached the model');
    await align('manager-recover', '');
    assert.equal((await db.query('SELECT phone FROM studio_private.teachers WHERE id = $1', [managerId])).rows[0].phone, `+${manager}`);
    assert.match(await step('/anagrafica'), /elenco|nuovo|completa/u);
    assert.match(await step('sostituito', renumbered), REFUSAL);
    const agent = new Client({ host: postgresHost, database: 'studio', user: 'studio_agent', password: secrets['db-agent'] });
    await agent.connect();
    try {
      await assert.rejects(agent.query('SELECT phone FROM studio_private.teachers'), { code: '42501' });
      await assert.rejects(agent.query("SELECT studio_private.operator_manager_change('transfer', '+15555550102', '+15555550103')"), { code: '42501' });
      assert.ok((await agent.query('SELECT * FROM app.teachers')).rows.every((row) => !Object.hasOwn(row, 'phone')));
    } finally { await agent.end(); }
    const logs = execFileSync('docker', ['logs', compose('ps', '-q', 'hermes').trim()], { encoding: 'utf8', stdio: 'pipe' });
    assert.doesNotMatch(logs, /1555555|synthetic-secret|WhatsApp Profile/u);
  } finally {
    await db?.end().catch(() => undefined);
    try { compose('down', '-v', '--remove-orphans'); } catch { /* isolated project only */ }
    spawnSync('docker', ['compose', '-p', recoveryProject, '-f', 'compose.yaml', 'down', '-v', '--remove-orphans'], { env, stdio: 'ignore', timeout: 120_000 });
    spawnSync('docker', ['image', 'rm', '-f', `${project}-hermes`, `${project}-postgres`, opsImage], { stdio: 'ignore', timeout: 60_000 });
    await rm(root, { recursive: true, force: true });
  }
});
