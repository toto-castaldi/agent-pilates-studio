import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { Client } from 'pg';
import { checkTeacherHistoryProtection, readTeacherState, seedTeacherHistory } from './teacher-fixtures.js';

// The old and new images are intentionally fixed. This exercises one supported
// upgrade path, not compatibility with arbitrary releases or major upgrades.
test('isolated upgrade preserves PostgreSQL and Hermes state across real image versions', { timeout: 900_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pilates-upgrade-test-'));
  const project = `pilates-upgrade-${randomBytes(8).toString('hex')}`;
  const legacyImage = `${project}-hermes-legacy`;
  const password = randomBytes(32).toString('hex');
  const secrets: Record<string, string> = {
    'db-admin': randomBytes(32).toString('hex'),
    'db-migrator': password,
    'db-agent': randomBytes(32).toString('hex'),
    'db-broker': randomBytes(32).toString('hex'),
    'bridge-token': randomBytes(32).toString('hex'),
    'openrouter-key': 'synthetic-model-token',
    'whatsapp-access-token': 'synthetic-access-token',
    'whatsapp-app-secret': 'synthetic-app-secret',
    'whatsapp-verify-token': 'synthetic-verify-token',
    'whatsapp-allowed-users': '15555550102',
    'whatsapp-home-channel': '15555550102',
    'whatsapp-phone-number-id': '123456789012345',
    'whatsapp-teacher-links': '[{"phone":"15555550102","firstName":"History","lastName":"Synthetic"}]',
  };
  const oldOverride = join(directory, 'old.yaml');
  const newOverride = join(directory, 'new.yaml');
  const oldDockerfile = join(directory, 'Dockerfile.old');
  const env = {
    ...process.env,
    COMPOSE_ENV_FILES: '/dev/null',
    SECRETS_DIR: directory,
    POSTGRES_PORT: '0',
    WHATSAPP_WEBHOOK_PORT: '0',
    WHATSAPP_WEBHOOK_PATH: '/webhooks/whatsapp',
    PILATES_MODEL: 'synthetic/test-model',
  };
  const compose = (override: string, ...args: string[]) => execFileSync('docker', [
    'compose', '-p', project, '-f', 'compose.yaml', '-f', override, ...args,
  ], { env, encoding: 'utf8', stdio: 'pipe', timeout: 240_000 });
  const address = (container: string) => execFileSync('docker', [
    'inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', container,
  ], { encoding: 'utf8', stdio: 'pipe' }).trim();
  let migrator: Client | undefined;
  let agent: Client | undefined;
  try {
    await Promise.all(Object.entries(secrets).map(([name, value]) => writeFile(join(directory, name), value, { mode: 0o600 })));
    const dockerfile = await readFile('hermes/Dockerfile', 'utf8');
    const current = 'nousresearch/hermes-agent:v0.22.7@sha256:e6d81ae52ebf6a43efa529701405509f20054ba818f179ddd748bed4f8af584c';
    const old = 'nousresearch/hermes-agent:v0.22.6@sha256:d27689bc6e8581ec884a7227c9101fdaebf6c853cff8859020dac14f21452b4d';
    assert.equal(dockerfile.split(current).length, 2);
    await writeFile(oldDockerfile, dockerfile.replace(current, old));
    await writeFile(oldOverride, `services:\n  postgres:\n    image: postgres:17.9@sha256:2a0d0fe14825b0939f78a8cad5cd4e6aa68bf94d0e5dd96e24b6d23af4315545\n    volumes:\n      - ${JSON.stringify(`${resolve('db/pg_hba.conf')}:/etc/pilates/pg_hba.conf:ro`)}\n      - ${JSON.stringify(`${resolve('db/entrypoint.sh')}:/etc/pilates/entrypoint.sh:ro`)}\n  model-stub:\n    image: ${project}-hermes\n    entrypoint: ["/opt/hermes/.venv/bin/python", "/model_stub.py"]\n    volumes:\n      - ${JSON.stringify(`${resolve('integration/model_stub.py')}:/model_stub.py:ro`)}\n    logging:\n      driver: none\n  hermes:\n    image: ${legacyImage}\n    environment:\n      OPENROUTER_BASE_URL: http://model-stub:8088/v1\nnetworks:\n  default:\n    internal: true\n`);
    await writeFile(newOverride, `services:\n  model-stub:\n    image: ${project}-hermes\n    entrypoint: ["/opt/hermes/.venv/bin/python", "/model_stub.py"]\n    volumes:\n      - ${JSON.stringify(`${resolve('integration/model_stub.py')}:/model_stub.py:ro`)}\n    logging:\n      driver: none\n  hermes:\n    environment:\n      OPENROUTER_BASE_URL: http://model-stub:8088/v1\nnetworks:\n  default:\n    internal: true\n`);
    execFileSync('docker', ['build', '-f', oldDockerfile, '-t', legacyImage, '.'], { env, stdio: 'pipe', timeout: 600_000 });
    compose(newOverride, 'build', 'hermes', 'postgres');
    compose(oldOverride, 'up', '-d', '--wait', '--no-build', 'postgres');
    assert.equal(execFileSync('docker', ['network', 'inspect', `${project}_default`, '--format', '{{.Internal}}'], { encoding: 'utf8' }).trim(), 'true');
    compose(oldOverride, 'run', '--rm', 'db-bootstrap');
    const oldDatabase = compose(oldOverride, 'ps', '-q', 'postgres').trim();
    const oldDatabaseImage = execFileSync('docker', ['inspect', '--format', '{{.Image}}', oldDatabase], { encoding: 'utf8' }).trim();
    let databaseHost = address(oldDatabase);
    const legacyMigrations = join(directory, 'legacy-migrations');
    await mkdir(legacyMigrations);
    for (const item of ['migration_lock.toml', '20261104000000_init', '20261105000000_studio_planning']) {
      await cp(join('prisma/migrations', item), join(legacyMigrations, item), { recursive: true });
    }
    const legacyConfig = join(directory, 'legacy.config.mjs');
    await writeFile(legacyConfig, `export default { schema: ${JSON.stringify(resolve('prisma/schema.prisma'))}, migrations: { path: ${JSON.stringify(legacyMigrations)} }, datasource: { url: process.env.DATABASE_URL } };\n`);
    const migrate = (host: string, legacy = false) => {
      const url = new URL(`postgresql://${host}:5432/studio?schema=public`);
      url.username = 'studio_migrator';
      url.password = password;
      execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', ...(legacy ? ['--config', legacyConfig] : [])], {
        env: { ...env, DATABASE_URL: url.toString() }, stdio: 'pipe', timeout: 90_000,
      });
    };
    migrate(databaseHost, true);
    migrator = new Client({ host: databaseHost, port: 5432, database: 'studio', user: 'studio_migrator', password });
    await migrator.connect();
    assert.match((await migrator.query<{ server_version: string }>('SHOW server_version')).rows[0].server_version, /^17\.9/);
    await migrator.query('CREATE TABLE app.upgrade_probe (id int PRIMARY KEY, value text NOT NULL)');
    await migrator.query("INSERT INTO app.upgrade_probe VALUES (1, 'synthetic-before-upgrade')");
    await migrator.query('BEGIN');
    const oldBinding = (await migrator.query('SELECT pg_backend_pid() AS pid, txid_current() AS txid')).rows[0];
    await migrator.query("INSERT INTO studio_private.author_context VALUES ($1, $2, '15555550102', 'Synthetic Profile', clock_timestamp() + interval '1 minute')", [oldBinding.pid, oldBinding.txid]);
    const oldClient = (await migrator.query("INSERT INTO app.clients (first_name, last_name) VALUES ('Upgrade', 'Synthetic') RETURNING id")).rows[0].id;
    const oldRule = (await migrator.query("INSERT INTO app.training_rules (rule_text) VALUES ('synthetic upgrade rule') RETURNING id")).rows[0].id;
    await migrator.query('INSERT INTO app.rule_clients (client_id, rule_id) VALUES ($1, $2)', [oldClient, oldRule]);
    await migrator.query("INSERT INTO app.rule_slots (rule_id, weekday, start_time) VALUES ($1, 1, '09:00')", [oldRule]);
    await migrator.query('COMMIT');
    assert.equal((await migrator.query("SELECT to_regclass('app.attendance') AS name")).rows[0].name, null);
    // Apply TEC-027 and US-013 separately, then upgrade from the exact previous
    // schema with training rules, valid/cancelled attendance and a future absence.
    await cp('prisma/migrations/20261107000000_attendance', join(legacyMigrations, '20261107000000_attendance'), { recursive: true });
    migrate(databaseHost, true);
    await migrator.query('BEGIN');
    const attendanceBinding = (await migrator.query('SELECT pg_backend_pid() AS pid, txid_current() AS txid')).rows[0];
    await migrator.query("INSERT INTO studio_private.author_context VALUES ($1, $2, '15555550102', 'Synthetic Profile', clock_timestamp() + interval '1 minute')", [attendanceBinding.pid, attendanceBinding.txid]);
    const oldAttendance = (await migrator.query("INSERT INTO app.attendance (client_id, lesson_date, start_time, outcome) VALUES ($1, '2020-01-01', '09:00', 'present') RETURNING id", [oldClient])).rows[0].id;
    await migrator.query("UPDATE app.attendance SET cancelled_at = clock_timestamp(), cancellation_reason = 'synthetic correction' WHERE id = $1", [oldAttendance]);
    await migrator.query("INSERT INTO app.attendance (client_id, lesson_date, start_time, outcome) VALUES ($1, '2020-01-01', '09:00', 'excused_absence')", [oldClient]);
    await migrator.query('COMMIT');
    await cp('prisma/migrations/20261108000000_future_excused_absences', join(legacyMigrations, '20261108000000_future_excused_absences'), { recursive: true });
    migrate(databaseHost, true);
    await migrator.query('BEGIN');
    const futureBinding = (await migrator.query('SELECT pg_backend_pid() AS pid, txid_current() AS txid')).rows[0];
    await migrator.query("INSERT INTO studio_private.author_context VALUES ($1, $2, '15555550102', 'Synthetic Profile', clock_timestamp() + interval '1 minute')", [futureBinding.pid, futureBinding.txid]);
    await migrator.query("INSERT INTO app.attendance (client_id, lesson_date, start_time, outcome) VALUES ($1, '2098-01-01', '09:00', 'excused_absence')", [oldClient]);
    await migrator.query('COMMIT');
    const planningBefore: Record<string, unknown[]> = {};
    for (const table of ['clients', 'training_rules', 'rule_slots', 'rule_clients', 'attendance']) {
      planningBefore[table] = (await migrator.query(`SELECT * FROM app.${table} ORDER BY 1, 2`)).rows;
    }
    assert.equal((await migrator.query("SELECT to_regclass('app.teachers') AS name")).rows[0].name, null);
    compose(oldOverride, 'up', '-d', '--wait', '--no-build', 'model-stub');
    compose(oldOverride, 'up', '-d', '--wait', '--wait-timeout', '150', '--no-build', 'hermes');
    const oldGateway = compose(oldOverride, 'ps', '-q', 'hermes').trim();
    const oldGatewayImage = execFileSync('docker', ['inspect', '--format', '{{.Image}}', oldGateway], { encoding: 'utf8' }).trim();
    const send = async (container: string, text: string) => {
      const endpoint = `http://${address(container)}:8090/webhooks/whatsapp`;
      const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: '999999', changes: [{ field: 'messages', value: { metadata: { phone_number_id: '123456789012345' }, messages: [{ from: '15555550102', id: `wamid.${text}`, type: 'text', text: { body: text } }] } }] }] });
      const signature = `sha256=${createHmac('sha256', secrets['whatsapp-app-secret']).update(body).digest('hex')}`;
      assert.equal((await fetch(endpoint, { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature } })).status, 200);
      await delay(8_000);
    };
    const stateContains = (container: string, markers: string[]) => {
      const script = `from pathlib import Path\ndata=b''.join(p.read_bytes() for p in Path('/opt/data').glob('state.db*') if p.is_file())\nassert all(x.encode() in data for x in ${JSON.stringify(markers)})`;
      execFileSync('docker', ['exec', container, '/opt/hermes/.venv/bin/python', '-c', script], { stdio: 'pipe' });
    };
    await send(oldGateway, 'synthetic-before-upgrade');
    stateContains(oldGateway, ['synthetic-before-upgrade']);
    assert.equal(execFileSync('docker', ['logs', oldGateway], { encoding: 'utf8', stdio: 'pipe' }).trim(), 'hermes_launch');
    compose(oldOverride, 'stop', 'hermes');
    // Apply TEC-033 and US-011 independently on the old database, populate
    // history, then apply only the additive identity foundation during upgrade.
    await cp('prisma/migrations/20261111000000_teachers', join(legacyMigrations, '20261111000000_teachers'), { recursive: true });
    migrate(databaseHost, true);
    await migrator.query('BEGIN');
    const teacherBinding = (await migrator.query('SELECT pg_backend_pid() AS pid, txid_current() AS txid')).rows[0];
    await migrator.query("INSERT INTO studio_private.author_context VALUES ($1, $2, '15555550102', 'Synthetic Profile', clock_timestamp() + interval '1 minute')", [teacherBinding.pid, teacherBinding.txid]);
    await seedTeacherHistory(migrator);
    await migrator.query('COMMIT');
    await cp('prisma/migrations/20261111141813_sender_teacher', join(legacyMigrations, '20261111141813_sender_teacher'), { recursive: true });
    migrate(databaseHost, true);
    const teachersBefore = await readTeacherState(migrator);
    const teacherStorageOid = (await migrator.query("SELECT 'app.teachers'::regclass::oid::text AS oid")).rows[0].oid;
    await migrator.end();
    migrator = undefined;

    // Upgrade PostgreSQL first, apply migrations, then recreate the gateway.
    compose(newOverride, 'up', '-d', '--wait', '--no-build', 'postgres');
    const newDatabase = compose(newOverride, 'ps', '-q', 'postgres').trim();
    assert.notEqual(newDatabase, oldDatabase);
    assert.notEqual(execFileSync('docker', ['inspect', '--format', '{{.Image}}', newDatabase], { encoding: 'utf8' }).trim(), oldDatabaseImage);
    databaseHost = address(newDatabase);
    migrate(databaseHost);
    migrator = new Client({ host: databaseHost, port: 5432, database: 'studio', user: 'studio_migrator', password });
    await migrator.connect();
    assert.match((await migrator.query('SHOW server_version')).rows[0].server_version, /^17\.10/);
    assert.equal((await migrator.query("SELECT 'studio_private.teachers'::regclass::oid::text AS oid")).rows[0].oid, teacherStorageOid);
    assert.equal((await migrator.query("SELECT relkind FROM pg_class WHERE oid = 'app.teachers'::regclass")).rows[0].relkind, 'v');
    assert.equal((await migrator.query('SELECT count(*)::int AS n FROM studio_private.teachers WHERE phone IS NOT NULL OR access_enabled OR NOT legacy_identity OR identity_revision <> 1')).rows[0].n, 0);
    assert.equal((await migrator.query('SELECT count(*)::int AS n FROM studio_private.teacher_identity_changes')).rows[0].n, 0);
    assert.equal((await migrator.query('SELECT count(*)::int AS n FROM studio_private.teacher_identity_writes')).rows[0].n, 0);
    assert.equal((await migrator.query('SELECT value FROM app.upgrade_probe WHERE id=1')).rows[0].value, 'synthetic-before-upgrade');
    assert.equal((await migrator.query("SELECT count(*)::int AS n FROM app.clients c JOIN app.rule_clients rc ON rc.client_id = c.id JOIN app.training_rules r ON r.id = rc.rule_id JOIN app.rule_slots s ON s.rule_id = r.id WHERE c.first_name = 'Upgrade' AND r.rule_text = 'synthetic upgrade rule' AND s.weekday = 1")).rows[0].n, 1);
    for (const [table, rows] of Object.entries(planningBefore)) {
      assert.deepEqual((await migrator.query(`SELECT * FROM app.${table} ORDER BY 1, 2`)).rows, rows);
    }
    await migrator.query('BEGIN');
    const newBinding = (await migrator.query('SELECT pg_backend_pid() AS pid, txid_current() AS txid')).rows[0];
    await migrator.query("INSERT INTO studio_private.author_context VALUES ($1, $2, '15555550102', 'Synthetic Profile', clock_timestamp() + interval '1 minute')", [newBinding.pid, newBinding.txid]);
    assert.deepEqual(await readTeacherState(migrator), teachersBefore);
    await migrator.query("INSERT INTO app.attendance (client_id, lesson_date, start_time, outcome) VALUES ($1, '2099-01-01', '09:00', 'excused_absence')", [oldClient]);
    await migrator.query('COMMIT');
    assert.equal((await migrator.query('SELECT count(*)::int AS n FROM studio_private.teacher_rule_builds')).rows[0].n, 0);
    agent = new Client({ host: databaseHost, port: 5432, database: 'studio', user: 'studio_agent', password: secrets['db-agent'] });
    await agent.connect();
    assert.equal((await agent.query('SELECT value FROM app.upgrade_probe WHERE id=1')).rows[0].value, 'synthetic-before-upgrade');
    assert.deepEqual(await readTeacherState(agent), teachersBefore);
    await checkTeacherHistoryProtection(agent, migrator);
    assert.deepEqual(await readTeacherState(agent), teachersBefore);
    await assert.rejects(agent.query('CREATE TABLE app.upgrade_forbidden (id int)'), (error: unknown) => (error as { code?: string }).code === '42501');
    compose(newOverride, 'up', '-d', '--wait', '--wait-timeout', '150', '--no-build', 'hermes');
    const newGateway = compose(newOverride, 'ps', '-q', 'hermes').trim();
    assert.notEqual(newGateway, oldGateway);
    assert.notEqual(execFileSync('docker', ['inspect', '--format', '{{.Image}}', newGateway], { encoding: 'utf8' }).trim(), oldGatewayImage);
    stateContains(newGateway, ['synthetic-before-upgrade']);
    await send(newGateway, 'synthetic-after-upgrade');
    stateContains(newGateway, ['synthetic-before-upgrade', 'synthetic-after-upgrade']);
    assert.deepEqual(await readTeacherState(migrator), teachersBefore);
    assert.equal(execFileSync('docker', ['logs', newGateway], { encoding: 'utf8', stdio: 'pipe' }).trim(), 'hermes_launch');
    assert.equal(execFileSync('docker', ['logs', newDatabase], { encoding: 'utf8', stdio: 'pipe' }).trim(), 'postgres_launch');
  } finally {
    await agent?.end().catch(() => undefined);
    await migrator?.end().catch(() => undefined);
    spawnSync('docker', ['compose', '-p', project, '-f', 'compose.yaml', '-f', newOverride, 'down', '-v', '--remove-orphans'], { env, stdio: 'ignore', timeout: 90_000 });
    spawnSync('docker', ['image', 'rm', legacyImage, `${project}-hermes`], { stdio: 'ignore', timeout: 90_000 });
    await rm(directory, { recursive: true, force: true });
  }
});
