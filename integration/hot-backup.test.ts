import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { Client } from 'pg';

const postgresBase = 'postgres:17.10@sha256:5f050f770b427fbd477edee6c3968a72e5c6be97e050a7e368b2b74a9494a285';

// Everything is disposable: a unique Compose project, synthetic credentials,
// an internal model stub, and a separate PostgreSQL with no network.
test('ops hot backup preserves a consistent snapshot with live, healthy services and restores without roles', { timeout: 900_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pilates-hot-integration-'));
  const root = join(directory, 'production');
  const project = `pilates-hot-${randomBytes(8).toString('hex')}`;
  const prefix = `${project}-volumes`;
  const hermesImage = `${project}-hermes`;
  const postgresImage = `${project}-postgres`;
  const opsImage = `${project}-ops`;
  const opsContainer = `${project}-ops-run`;
  const restoreContainer = `${project}-restore`;
  const commit = 'a'.repeat(40);
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
    'whatsapp-allowed-users': '15555550102',
    'whatsapp-home-channel': '15555550102',
    'whatsapp-phone-number-id': '123456789012345',
    'whatsapp-teacher-links': '[]',
  };
  const override = join(directory, 'compose.override.yaml');
  const env = {
    ...process.env,
    COMPOSE_ENV_FILES: '/dev/null',
    SECRETS_DIR: join(root, 'secrets'),
    POSTGRES_PORT: '0',
    WHATSAPP_WEBHOOK_PORT: '0',
    WHATSAPP_WEBHOOK_PATH: '/webhooks/whatsapp',
    PILATES_MODEL: 'synthetic/test-model',
    PILATES_VOLUME_PREFIX: prefix,
    PILATES_HERMES_IMAGE: hermesImage,
    PILATES_POSTGRES_IMAGE: postgresImage,
  };
  const docker = (...args: string[]) => execFileSync('docker', args, { encoding: 'utf8', stdio: 'pipe', timeout: 180_000 });
  const compose = (...args: string[]) => execFileSync('docker', ['compose', '-p', project, '-f', 'compose.yaml', '-f', override, ...args], {
    env, encoding: 'utf8', stdio: 'pipe', timeout: 180_000,
  });
  const opsArgs = (...args: string[]) => [
    'run', '--rm', '--name', opsContainer, '--network', 'none',
    '--env', `PILATES_HOME=${root}`, '--env', `PILATES_PROJECT=${project}`, '--env', 'COMPOSE_ENV_FILES=/dev/null',
    '--mount', 'type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock',
    '--mount', `type=bind,src=${root},dst=${root}`,
    opsImage, ...args,
  ];
  let admin: Client | undefined;
  let writer: Client | undefined;
  let writerInTransaction = false;
  let child: ReturnType<typeof spawn> | undefined;
  let childResult: Promise<{ code: number | null; stdout: string; stderr: string }> | undefined;
  try {
    await mkdir(root, { mode: 0o700 });
    for (const subdirectory of ['secrets', 'backups', 'state']) await mkdir(join(root, subdirectory), { mode: 0o700 });
    await Promise.all(Object.entries(secrets).map(([name, value]) => writeFile(join(root, 'secrets', name), value, { mode: 0o600 })));
    await writeFile(join(root, 'prod.env'), 'POSTGRES_PORT=0\nWHATSAPP_WEBHOOK_PORT=0\nWHATSAPP_WEBHOOK_PATH=/webhooks/whatsapp\nPILATES_MODEL=synthetic/test-model\n', { mode: 0o600 });
    // Exercise the active volume prefix after a previous rollback.
    await writeFile(join(root, 'state/volume-prefix'), `${prefix}\n`, { mode: 0o600 });
    await writeFile(override, `services:\n  model-stub:\n    image: ${hermesImage}\n    entrypoint: ["/opt/hermes/.venv/bin/python", "/model_stub.py"]\n    volumes:\n      - ${JSON.stringify(`${resolve('integration/model_stub.py')}:/model_stub.py:ro`)}\n    logging:\n      driver: none\n  hermes:\n    environment:\n      OPENROUTER_BASE_URL: http://model-stub:8088/v1\nnetworks:\n  default:\n    internal: true\n`);
    for (const [file, image] of [['hermes/Dockerfile', hermesImage], ['db/Dockerfile', postgresImage], ['scripts/ops.Dockerfile', opsImage]]) {
      execFileSync('docker', ['build', '-f', file, '--build-arg', `PILATES_RELEASE=${commit}`, '-t', image, '.'], { stdio: 'pipe', timeout: 600_000 });
    }
    compose('up', '-d', '--no-build', '--wait', 'postgres', 'model-stub');
    compose('run', '--rm', '-T', '--interactive=false', 'db-bootstrap');
    const postgresId = compose('ps', '-q', 'postgres').trim();
    const postgresHost = docker('inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', postgresId).trim();
    assert.ok(postgresHost);
    const migrationUrl = new URL(`postgresql://${postgresHost}:5432/studio?schema=public`);
    migrationUrl.username = 'studio_migrator';
    migrationUrl.password = secrets['db-migrator'];
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
      env: { ...env, DATABASE_URL: migrationUrl.toString() }, stdio: 'pipe', timeout: 120_000,
    });
    admin = new Client({ host: postgresHost, database: 'studio', user: 'studio_admin', password: secrets['db-admin'] });
    writer = new Client({ host: postgresHost, database: 'studio', user: 'studio_admin', password: secrets['db-admin'] });
    await admin.connect();
    await writer.connect();
    await admin.query('CREATE TABLE app.hot_backup_probe (id integer PRIMARY KEY, value text NOT NULL)');
    await admin.query("INSERT INTO app.hot_backup_probe VALUES (1, 'before-commit')");
    await admin.query('BEGIN');
    await admin.query("INSERT INTO studio_private.author_context (backend_pid, transaction_id, sender, profile_name, expires_at) VALUES (pg_backend_pid(), txid_current(), '15555550102', 'Synthetic Author', clock_timestamp() + interval '1 hour')");
    await admin.query("INSERT INTO app.clients (first_name, last_name) VALUES ('Backup', 'Synthetic')");
    await admin.query('COMMIT');
    await admin.query("INSERT INTO studio_private.author_context (backend_pid, transaction_id, sender, profile_name, expires_at) VALUES (1, 1, '15555550102', 'Synthetic Context', clock_timestamp() + interval '1 hour')");
    await admin.query("INSERT INTO studio_private.consumed_messages (message_hash, expires_at) VALUES ('synthetic-replay-hash', clock_timestamp() + interval '1 hour')");
    compose('up', '-d', '--no-build', '--wait', '--wait-timeout', '120', 'author-broker', 'hermes');
    const gatewayId = compose('ps', '-q', 'hermes').trim();
    const brokerId = compose('ps', '-q', 'author-broker').trim();
    assert.ok(gatewayId && brokerId);
    docker('exec', '--user', '10000:10000', gatewayId, 'sh', '-c', 'echo synthetic-hermes-only-marker > /opt/data/hot-backup-marker');
    const inspectServices = () => {
      for (const [service, id] of [['hermes', gatewayId], ['author-broker', brokerId]]) {
        assert.equal(compose('ps', '-q', service).trim(), id, `${service} was recreated`);
        assert.equal(docker('inspect', '--format', '{{.State.Running}} {{.State.Health.Status}} {{.RestartCount}}', id).trim(), 'true healthy 0', `${service} is not continuously healthy`);
      }
    };
    inspectServices();

    // Hold a lock until pg_dump's snapshot is already waiting on the table.
    // A committed update after that snapshot must not appear in the restore.
    await writer.query('BEGIN');
    writerInTransaction = true;
    await writer.query('LOCK TABLE app.hot_backup_probe IN ACCESS EXCLUSIVE MODE');
    child = spawn('docker', opsArgs('backup-hot', commit), { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding('utf8').on('data', (data: string) => { stdout += data; });
    child.stderr?.setEncoding('utf8').on('data', (data: string) => { stderr += data; });
    childResult = new Promise((resolveChild, rejectChild) => {
      child?.once('error', rejectChild);
      child?.once('close', (code) => resolveChild({ code, stdout, stderr }));
    });
    let waiting = false;
    for (let i = 0; i < 240 && !waiting; i++) {
      assert.equal(child.exitCode, null, 'ops exited before pg_dump waited on the table');
      const result = await admin.query("SELECT EXISTS (SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid WHERE l.relation = 'app.hot_backup_probe'::regclass AND NOT l.granted AND a.application_name = 'pg_dump') AS waiting");
      waiting = result.rows[0].waiting as boolean;
      if (!waiting) await delay(250);
    }
    assert.equal(waiting, true, 'pg_dump did not reach the held lock');
    for (let i = 0; i < 12; i++) {
      inspectServices();
      assert.equal(child.exitCode, null, 'backup ended while the lock was held');
      await delay(1_000);
    }
    await writer.query("UPDATE app.hot_backup_probe SET value = 'after-commit' WHERE id = 1");
    await writer.query('COMMIT');
    writerInTransaction = false;
    const result = await childResult;
    assert.equal(result.code, 0, 'ops hot backup failed');
    assert.match(result.stdout, /Hot PostgreSQL backup completed/);
    for (const forbidden of [...Object.values(secrets), 'Synthetic Author', 'Synthetic Context', 'before-commit', 'after-commit', 'synthetic-hermes-only-marker']) {
      assert.equal((result.stdout + result.stderr).includes(forbidden), false, 'ops leaked synthetic data');
    }
    inspectServices();
    assert.equal((await admin.query('SELECT value FROM app.hot_backup_probe WHERE id = 1')).rows[0].value, 'after-commit');
    const backups = await readdir(join(root, 'backups'));
    assert.equal(backups.length, 1);
    assert.match(backups[0], /^hot-\d{8}T\d{6}Z-a{12}-[A-Za-z0-9]{8}$/);
    const backup = join(root, 'backups', backups[0]);
    assert.ok(result.stdout.includes(backup));
    assert.deepEqual((await readdir(backup)).sort(), ['COMPLETE', 'SHA256SUMS', 'postgres.dump']);
    assert.equal(await readFile(join(backup, 'COMPLETE'), 'utf8'), 'hot-postgres-v1\n');
    const dump = await readFile(join(backup, 'postgres.dump'));
    assert.equal(dump.subarray(0, 5).toString('ascii'), 'PGDMP');
    assert.equal(await readFile(join(backup, 'SHA256SUMS'), 'utf8'), `${createHash('sha256').update(dump).digest('hex')}  postgres.dump\n`);
    const rootStat = await stat(root);
    for (const path of [backup, ...['COMPLETE', 'SHA256SUMS', 'postgres.dump'].map((file) => join(backup, file))]) {
      const entry = await stat(path);
      assert.equal(entry.mode & 0o777, path === backup ? 0o700 : 0o600);
      assert.equal(entry.uid, rootStat.uid);
      assert.equal(entry.gid, rootStat.gid);
    }

    const rejected = spawnSync('docker', opsArgs('rollback', backup, commit), { encoding: 'utf8', timeout: 120_000 });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /Backup is incomplete/);
    inspectServices();

    // Hold initdb at its socket-only temporary server to expose premature readiness.
    const initGate = join(directory, 'restore-init.sh');
    await writeFile(initGate, 'touch /tmp/pilates-init-waiting\nwhile [ ! -f /tmp/pilates-init-release ]; do sleep 0.1; done\n', { mode: 0o644 });
    // No network or application roles: restore into a genuinely empty cluster.
    docker('run', '-d', '--name', restoreContainer, '--network', 'none', '--log-driver', 'none', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust',
      '--mount', `type=bind,src=${initGate},dst=/docker-entrypoint-initdb.d/00-gate.sh,readonly`, postgresBase);
    const restoreReady = () => spawnSync('docker', ['exec', restoreContainer, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres'], { stdio: 'ignore', timeout: 5_000 }).status === 0;
    let initializing = false;
    for (let i = 0; i < 120 && !initializing; i++) {
      initializing = spawnSync('docker', ['exec', restoreContainer, 'test', '-f', '/tmp/pilates-init-waiting'], { stdio: 'ignore', timeout: 5_000 }).status === 0;
      if (!initializing) await delay(500);
    }
    assert.equal(initializing, true, 'isolated PostgreSQL did not reach the initdb gate');
    assert.equal(spawnSync('docker', ['exec', restoreContainer, 'pg_isready', '-U', 'postgres', '-d', 'postgres'], { stdio: 'ignore', timeout: 5_000 }).status, 0, 'temporary PostgreSQL should accept socket connections');
    assert.equal(restoreReady(), false, 'temporary initdb server must not be considered ready for restore');
    docker('exec', restoreContainer, 'touch', '/tmp/pilates-init-release');
    let ready = false;
    for (let i = 0; i < 120 && !ready; i++) {
      ready = restoreReady();
      if (!ready) await delay(500);
    }
    assert.equal(ready, true, 'isolated PostgreSQL did not start');
    const restored = spawnSync('docker', ['exec', '-i', restoreContainer, 'pg_restore', '--exit-on-error', '--no-owner', '--no-privileges', '--no-password', '-U', 'postgres', '-d', 'postgres'], {
      input: dump, encoding: 'utf8', timeout: 120_000,
    });
    assert.equal(restored.status, 0, 'pg_restore into the empty database failed');
    const query = (sql: string) => docker('exec', restoreContainer, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c', sql).trim();
    assert.equal(query('SELECT value FROM app.hot_backup_probe WHERE id = 1'), 'before-commit');
    assert.equal(query('SELECT count(*) FROM studio_private.author_context'), '0');
    assert.equal(query("SELECT count(*) FROM studio_private.consumed_messages WHERE message_hash = 'synthetic-replay-hash'"), '1');
    assert.equal(query("SELECT count(*) FROM app.clients WHERE first_name = 'Backup' AND last_name = 'Synthetic'"), '1');
    assert.equal(query("SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = 'app.clients'::regclass"), 'postgres');
    assert.equal(query("SELECT count(*) FROM pg_roles WHERE rolname IN ('studio_admin', 'studio_migrator', 'studio_agent', 'studio_broker')"), '0');
    inspectServices();
  } finally {
    if (writerInTransaction) await writer?.query('ROLLBACK').catch(() => {});
    await writer?.end().catch(() => {});
    await admin?.end().catch(() => {});
    // The names are unique to this test; never act on another project.
    spawnSync('docker', ['rm', '-fv', opsContainer, restoreContainer], { stdio: 'ignore', timeout: 30_000 });
    if (childResult) await childResult.catch(() => {});
    try { compose('down', '--volumes', '--remove-orphans'); } catch { /* best effort */ }
    spawnSync('docker', ['image', 'rm', '-f', hermesImage, postgresImage, opsImage], { stdio: 'ignore', timeout: 60_000 });
    await rm(directory, { recursive: true, force: true });
  }
});
