import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { Client } from 'pg';

test('Prisma and isolated PostgreSQL roles enforce DML without schema DDL', { timeout: 420_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pilates-db-test-'));
  const passwords = {
    admin: randomBytes(32).toString('hex'),
    migrator: randomBytes(32).toString('hex'),
    agent: randomBytes(32).toString('hex'),
  };
  const project = `pilates-test-${randomBytes(8).toString('hex')}`;
  const env = { ...process.env, COMPOSE_ENV_FILES: '/dev/null', SECRETS_DIR: directory, POSTGRES_PORT: '0' };
  const compose = (...args: string[]) =>
    execFileSync('docker', ['compose', '-p', project, '-f', 'compose.yaml', ...args], {
      env,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 120_000,
    });
  let agent: Client | undefined;
  let migrator: Client | undefined;
  let admin: Client | undefined;
  try {
    await Promise.all(
      Object.entries(passwords).map(([name, password]) =>
        writeFile(join(directory, `db-${name}`), `${password}\n`, { mode: 0o600 }),
      ),
    );
    execFileSync('docker', [
      'run', '--rm', '--init', '--entrypoint', '/opt/hermes/bin/hermes',
      '-v', `${join(process.cwd(), 'hermes/plugins/pilates-postgres')}:/plugin:ro`,
      'nousresearch/hermes-agent:v0.22.7@sha256:e6d81ae52ebf6a43efa529701405509f20054ba818f179ddd748bed4f8af584c',
      'plugins', 'doctor', '/plugin', '--ci',
    ], { encoding: 'utf8', stdio: 'pipe', timeout: 90_000 });
    compose('up', '-d', '--wait', 'postgres');
    compose('run', '--rm', 'db-bootstrap');
    const published = compose('port', 'postgres', '5432').trim();
    const port = Number(published.slice(published.lastIndexOf(':') + 1));
    assert.ok(Number.isInteger(port) && port > 0);
    const migrationEnv = { ...env, POSTGRES_PORT: String(port) };
    // Run the migration from an isolated working directory without the operator's .env.
    for (const path of ['node_modules', 'prisma', 'prisma.config.ts']) {
      await symlink(resolve(path), join(directory, path));
    }
    const migrate = () =>
      execFileSync(process.execPath, [resolve('scripts/migrate.mjs')], {
        cwd: directory,
        env: migrationEnv,
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 90_000,
      });
    // Exercise the real upgrade from the v0.1.0 migration with existing data.
    const legacyMigrations = join(directory, 'legacy-migrations');
    await mkdir(legacyMigrations);
    await cp('prisma/migrations/migration_lock.toml', join(legacyMigrations, 'migration_lock.toml'));
    await cp('prisma/migrations/20261104000000_init', join(legacyMigrations, '20261104000000_init'), { recursive: true });
    const legacyConfig = join(directory, 'legacy.config.mjs');
    await writeFile(legacyConfig, `export default { schema: ${JSON.stringify(join(process.cwd(), 'prisma/schema.prisma'))}, migrations: { path: ${JSON.stringify(legacyMigrations)} }, datasource: { url: process.env.DATABASE_URL } };\n`);
    const legacyUrl = new URL(`postgresql://127.0.0.1:${port}/studio?schema=public`);
    legacyUrl.username = 'studio_migrator';
    legacyUrl.password = passwords.migrator;
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--config', legacyConfig], {
      env: { ...env, DATABASE_URL: legacyUrl.toString() }, stdio: 'pipe', timeout: 90_000,
    });
    const legacy = new Client({ host: '127.0.0.1', port, database: 'studio', user: 'studio_migrator', password: passwords.migrator });
    await legacy.connect();
    try {
      await legacy.query('CREATE TABLE app.legacy_probe (value text NOT NULL)');
      await legacy.query("INSERT INTO app.legacy_probe VALUES ('synthetic-preserved')");
    } finally { await legacy.end(); }
    // The Linux server migration path has no host Node.js installation.
    execFileSync('sh', ['scripts/migrate-docker.sh'], {
      env: migrationEnv,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 300_000,
    });
    migrate();

    const connection = { host: '127.0.0.1', port, database: 'studio' };
    migrator = new Client({ ...connection, user: 'studio_migrator', password: passwords.migrator });
    agent = new Client({ ...connection, user: 'studio_agent', password: passwords.agent });
    await migrator.connect();
    await agent.connect();
    assert.equal((await agent.query('SELECT value FROM app.legacy_probe')).rows[0].value, 'synthetic-preserved');

    // The protected context is installed here by the migration owner only as a
    // test fixture. The production broker and gateway propagation are not
    // implemented here; this fixture does not prove their isolation.
    await assert.rejects(agent.query("INSERT INTO app.clients (first_name, last_name) VALUES ('Synthetic', 'NoContext')"), { code: '42501' });
    await assert.rejects(agent.query('SELECT * FROM studio_private.author_context'), { code: '42501' });
    await assert.rejects(agent.query('SET ROLE studio_broker'), { code: '42501' });
    await assert.rejects(agent.query("INSERT INTO app.clients (first_name, last_name, created_by_phone) SELECT 'Synthetic', 'Forged', set_config('spike.author', '15555550199', true)"), { code: '42501' });
    await agent.query('BEGIN');
    const expired = (await agent.query('SELECT pg_backend_pid() AS pid, txid_current() AS txid')).rows[0];
    await migrator.query("INSERT INTO studio_private.author_context VALUES ($1, $2, $3, NULL, clock_timestamp() - interval '1 second')", [expired.pid, expired.txid, '15555550103']);
    await assert.rejects(agent.query("INSERT INTO app.clients (first_name, last_name) VALUES ('Synthetic', 'Expired')"), { code: '42501' });
    await agent.query('ROLLBACK');
    await agent.query('BEGIN');
    const binding = (await agent.query('SELECT pg_backend_pid() AS pid, txid_current() AS txid')).rows[0];
    await migrator.query("INSERT INTO studio_private.author_context VALUES ($1, $2, $3, $4, clock_timestamp() + interval '1 minute')", [binding.pid, binding.txid, '15555550102', 'Synthetic Profile']);
    const client = await agent.query("INSERT INTO app.clients (first_name, last_name, created_by_phone, created_by_name) VALUES ('Synthetic', 'Client', 'forged', 'forged') RETURNING *");
    assert.equal(client.rows[0].created_by_phone, '15555550102');
    assert.equal(client.rows[0].created_by_name, 'Synthetic Profile');
    const rule = await agent.query("INSERT INTO app.training_rules (rule_text, created_by_phone) SELECT 'Synthetic rule', set_config('spike.author', 'forged', true) RETURNING *");
    assert.equal(rule.rows[0].created_by_phone, '15555550102');
    await agent.query('SAVEPOINT invalid_insert');
    await assert.rejects(agent.query("INSERT INTO app.training_rules (rule_text, deactivated_at, deactivation_reason) VALUES ('Synthetic', clock_timestamp(), 'Synthetic reason')"), { code: '23514' });
    await agent.query('ROLLBACK TO SAVEPOINT invalid_insert');
    await agent.query('SAVEPOINT invalid_deactivation');
    await assert.rejects(agent.query('UPDATE app.training_rules SET deactivated_at = clock_timestamp() WHERE id = $1', [rule.rows[0].id]), { code: '23514' });
    await agent.query('ROLLBACK TO SAVEPOINT invalid_deactivation');
    await agent.query('INSERT INTO app.rule_clients (rule_id, client_id) VALUES ($1, $2)', [rule.rows[0].id, client.rows[0].id]);
    await agent.query("INSERT INTO app.rule_slots (rule_id, weekday, start_time) VALUES ($1, 5, '09:00')", [rule.rows[0].id]);
    const otherAgent = new Client({ ...connection, user: 'studio_agent', password: passwords.agent });
    await otherAgent.connect();
    try {
      // The still-live context belongs to the first connection, not this one.
      await assert.rejects(otherAgent.query("INSERT INTO app.clients (first_name, last_name) VALUES ('Synthetic', 'OtherConnection')"), { code: '42501' });
    } finally { await otherAgent.end(); }
    await agent.query('COMMIT');
    await assert.rejects(agent.query("INSERT INTO app.clients (first_name, last_name) VALUES ('Synthetic', 'Stale')"), { code: '42501' });
    await assert.rejects(agent.query('DELETE FROM app.training_rules WHERE id = $1', [rule.rows[0].id]), { code: '42501' });
    await assert.rejects(agent.query("UPDATE app.clients SET created_by_phone = 'forged' WHERE id = $1", [client.rows[0].id]), { code: '42501' });
    await assert.rejects(migrator.query('DELETE FROM app.training_rules WHERE id = $1', [rule.rows[0].id]), { code: '42501' });
    await assert.rejects(agent.query("UPDATE app.training_rules SET rule_text = 'rewritten' WHERE id = $1", [rule.rows[0].id]), { code: '42501' });
    await assert.rejects(agent.query("INSERT INTO app.rule_slots VALUES ($1, 8, '09:00')", [rule.rows[0].id]), { code: '23514' });
    const concurrent = new Client({ ...connection, user: 'studio_agent', password: passwords.agent });
    await concurrent.connect();
    try {
      await Promise.all([agent.query('BEGIN'), concurrent.query('BEGIN')]);
      const [a, b] = await Promise.all([
        agent.query('SELECT pg_backend_pid() AS pid, txid_current() AS txid'),
        concurrent.query('SELECT pg_backend_pid() AS pid, txid_current() AS txid'),
      ]);
      for (const [binding, phone] of [[a.rows[0], '15555550102'], [b.rows[0], '15555550103']] as const) {
        await migrator.query("INSERT INTO studio_private.author_context VALUES ($1, $2, $3, NULL, clock_timestamp() + interval '1 minute')", [binding.pid, binding.txid, phone]);
      }
      const [firstInsert, secondInsert] = await Promise.all([
        agent.query("INSERT INTO app.clients (first_name, last_name) VALUES ('Synthetic', 'ConcurrentOne') RETURNING created_by_phone"),
        concurrent.query("INSERT INTO app.clients (first_name, last_name) VALUES ('Synthetic', 'ConcurrentTwo') RETURNING created_by_phone"),
      ]);
      assert.equal(firstInsert.rows[0].created_by_phone, '15555550102');
      assert.equal(secondInsert.rows[0].created_by_phone, '15555550103');
      await Promise.all([agent.query('ROLLBACK'), concurrent.query('ROLLBACK')]);
    } finally { await concurrent.end(); }
    await agent.query('BEGIN');
    const second = (await agent.query('SELECT pg_backend_pid() AS pid, txid_current() AS txid')).rows[0];
    await migrator.query("INSERT INTO studio_private.author_context VALUES ($1, $2, $3, NULL, clock_timestamp() + interval '1 minute')", [second.pid, second.txid, '15555550103']);
    const deactivated = await agent.query("UPDATE app.training_rules SET deactivated_at = clock_timestamp(), deactivation_reason = 'Synthetic reason', deactivated_by_phone = 'forged' WHERE id = $1 RETURNING *", [rule.rows[0].id]);
    assert.equal(deactivated.rows[0].deactivated_by_phone, '15555550103');
    assert.equal(deactivated.rows[0].deactivated_by_name, null);
    await agent.query('COMMIT');
    await agent.query('BEGIN');
    const third = (await agent.query('SELECT pg_backend_pid() AS pid, txid_current() AS txid')).rows[0];
    await migrator.query("INSERT INTO studio_private.author_context VALUES ($1, $2, $3, NULL, clock_timestamp() + interval '1 minute')", [third.pid, third.txid, '15555550103']);
    await assert.rejects(agent.query("UPDATE app.training_rules SET deactivation_reason = 'rewritten' WHERE id = $1", [rule.rows[0].id]), { code: '23514' });
    await agent.query('ROLLBACK');
    await agent.query('BEGIN');
    const fourth = (await agent.query('SELECT pg_backend_pid() AS pid, txid_current() AS txid')).rows[0];
    await migrator.query("INSERT INTO studio_private.author_context VALUES ($1, $2, $3, NULL, clock_timestamp() + interval '1 minute')", [fourth.pid, fourth.txid, '15555550103']);
    await assert.rejects(agent.query("INSERT INTO app.clients (first_name, last_name) VALUES ('synthetic', 'CLIENT')"), { code: '23505' });
    await agent.query('ROLLBACK');

    admin = new Client({ ...connection, database: 'postgres', user: 'studio_admin', password: passwords.admin });
    await admin.connect();
    await admin.query('CREATE DATABASE isolated_probe');
    for (const database of ['postgres', 'template1', 'isolated_probe']) {
      const outside = new Client({ ...connection, database, user: 'studio_agent', password: passwords.agent });
      try {
        await assert.rejects(outside.connect(), (error: unknown) => {
          assert.equal((error as { code?: string }).code, '28000');
          return true;
        });
      } finally {
        await outside.end();
      }
    }
    await migrator.query('CREATE TABLE app.privilege_probe (id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, value text NOT NULL)');
    await migrator.query('CREATE FUNCTION app.privilege_probe_function() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$');

    // Apply a second migration to an already populated schema without changing project files.
    const migrationDirectory = join(directory, 'migrations');
    await cp('prisma/migrations', migrationDirectory, { recursive: true });
    const upgradeDirectory = join(migrationDirectory, '20261104000001_test_upgrade');
    await mkdir(upgradeDirectory);
    await writeFile(join(upgradeDirectory, 'migration.sql'), 'ALTER TABLE app.privilege_probe ADD COLUMN extra text;\n');
    const config = join(directory, 'prisma.config.mjs');
    await writeFile(config, `export default { schema: ${JSON.stringify(join(process.cwd(), 'prisma/schema.prisma'))}, migrations: { path: ${JSON.stringify(migrationDirectory)} }, datasource: { url: process.env.DATABASE_URL } };\n`);
    const migrationUrl = new URL(`postgresql://127.0.0.1:${port}/studio?schema=public`);
    migrationUrl.username = 'studio_migrator';
    migrationUrl.password = passwords.migrator;
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--config', config], {
      env: { ...env, DATABASE_URL: migrationUrl.toString() },
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 90_000,
    });
    const columns = await migrator.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'privilege_probe' AND column_name = 'extra'");
    assert.equal(columns.rowCount, 1);
    compose('run', '--rm', 'db-bootstrap');

    const insert = await agent.query("INSERT INTO app.privilege_probe (value) VALUES ('synthetic') RETURNING id");
    const id = insert.rows[0].id;
    assert.equal((await agent.query('SELECT value FROM app.privilege_probe WHERE id = $1', [id])).rows[0].value, 'synthetic');
    assert.equal((await agent.query("UPDATE app.privilege_probe SET value = 'updated' WHERE id = $1", [id])).rowCount, 1);
    assert.equal((await agent.query('DELETE FROM app.privilege_probe WHERE id = $1', [id])).rowCount, 1);

    // Dispatch through the actual Hermes tool registry with the restricted DB role.
    const python = [
      'import importlib.util, json, sys',
      'from tools.registry import registry',
      "spec = importlib.util.spec_from_file_location('pilates_test_plugin', '/plugin/__init__.py')",
      'plugin = importlib.util.module_from_spec(spec)',
      'spec.loader.exec_module(plugin)',
      "context = type('Context', (), {'register_tool': staticmethod(registry.register)})()",
      'plugin.register(context)',
      "print(json.dumps([json.loads(registry.dispatch('studio_sql_query', item)) for item in json.load(sys.stdin)]))",
    ].join('\n');
    const toolRequests = [
      { query: 'SELECT current_user AS role' },
      { query: 'INSERT INTO app.privilege_probe (value) VALUES ($1) RETURNING id', parameters: ['tool-synthetic'] },
      { query: "UPDATE app.privilege_probe SET value = 'tool-updated' WHERE value = 'tool-synthetic'" },
      { query: "DELETE FROM app.privilege_probe WHERE value = 'tool-updated'" },
      { query: 'CREATE TABLE app.tool_forbidden (id int)' },
      { query: 'CREATE TEMP TABLE tool_forbidden (id int)' },
      { query: 'SELECT * FROM public._prisma_migrations' },
      { query: "INSERT INTO app.clients (first_name, last_name, created_by_phone) VALUES ('Synthetic', 'Plugin', 'forged')" },
    ];
    const toolOutput = execFileSync('docker', [
      'run', '--rm', '-i', '--init', '--network', `${project}_default`,
      '-v', `${join(process.cwd(), 'hermes/plugins/pilates-postgres')}:/plugin:ro`,
      '-v', `${join(directory, 'db-agent')}:/run/secrets/db_agent:ro`,
      '--entrypoint', '/opt/hermes/.venv/bin/python',
      'nousresearch/hermes-agent:v0.22.7@sha256:e6d81ae52ebf6a43efa529701405509f20054ba818f179ddd748bed4f8af584c',
      '-c', python,
    ], { input: JSON.stringify(toolRequests), encoding: 'utf8', stdio: 'pipe', timeout: 90_000 });
    const toolResults = JSON.parse(toolOutput) as Array<{ rows?: Array<Record<string, unknown>>; status?: string; sqlstate?: string }>;
    assert.equal(toolResults[0].rows?.[0].role, 'studio_agent');
    assert.equal(toolResults[1].status, 'INSERT 0 1');
    assert.equal(toolResults[2].status, 'UPDATE 1');
    assert.equal(toolResults[3].status, 'DELETE 1');
    assert.deepEqual(toolResults.slice(4).map((result) => result.sqlstate), ['42501', '42501', '42501', '42501']);

    for (const sql of [
      'CREATE TABLE app.forbidden (id int)',
      'ALTER TABLE app.privilege_probe ADD COLUMN forbidden int',
      'DROP TABLE app.privilege_probe',
      'TRUNCATE app.privilege_probe',
      'CREATE TEMP TABLE forbidden (id int)',
      'CREATE TABLE public.forbidden (id int)',
      'CREATE SCHEMA forbidden',
      "ALTER ROLE studio_migrator PASSWORD 'synthetic-new-password'",
      'SET ROLE studio_migrator',
      'SELECT * FROM public._prisma_migrations',
      'SELECT app.privilege_probe_function()',
      'SELECT rolpassword FROM pg_authid',
    ]) {
      await assert.rejects(agent.query(sql), (error: unknown) => {
        assert.equal((error as { code?: string }).code, '42501', `Expected insufficient privileges for: ${sql}`);
        return true;
      });
    }
    // PostgreSQL permits a login role to change its own password without CREATEROLE.
    // This availability risk is documented and must not be mistaken for schema DDL permission.
    assert.equal((await agent.query("ALTER ROLE studio_agent PASSWORD 'synthetic-new-password'")).command, 'ALTER');
    compose('run', '--rm', 'db-bootstrap');
    await agent.end();
    agent = new Client({ ...connection, user: 'studio_agent', password: passwords.agent });
    await agent.connect();
    assert.equal((await agent.query('SELECT current_user')).rows[0].current_user, 'studio_agent');
  } finally {
    await agent?.end();
    await migrator?.end();
    await admin?.end();
    try {
      compose('down', '--volumes', '--remove-orphans');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
});
