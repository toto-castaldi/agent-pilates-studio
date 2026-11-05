import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Client } from 'pg';

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No TCP port');
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

test('one command initializes a clean isolated stack, preserves data and recreates removed volumes', { timeout: 1_200_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pilates-start-integration-'));
  const project = `pilates-start-${randomBytes(8).toString('hex')}`;
  const databasePort = await freePort();
  let webhookPort = await freePort();
  while (webhookPort === databasePort) webhookPort = await freePort();
  const admin = randomBytes(24).toString('hex');
  const migrator = `${randomBytes(24).toString('hex')}:@$/#%'`;
  const agentPassword = randomBytes(24).toString('hex');
  const config = `POSTGRES_PORT=${databasePort}\nWHATSAPP_WEBHOOK_PORT=${webhookPort}\nDB_ADMIN_PASSWORD=${admin}\nDB_MIGRATOR_PASSWORD="${migrator}"\nDB_AGENT_PASSWORD=${agentPassword}\nOPENROUTER_API_KEY=synthetic-private-model-token\nWHATSAPP_ACCESS_TOKEN=synthetic-private-access-token\nWHATSAPP_APP_SECRET=synthetic-private-app-secret\nWHATSAPP_VERIFY_TOKEN=synthetic-private-verify-token\nWHATSAPP_ALLOWED_USERS=15555550102\nWHATSAPP_PHONE_NUMBER_ID=123456789\n`;
  const env = { ...process.env, COMPOSE_PROJECT_NAME: project, SECRETS_DIR: join(dir, '.local/secrets'), POSTGRES_PORT: String(databasePort), WHATSAPP_WEBHOOK_PORT: String(webhookPort) };
  const compose = (...args: string[]) => execFileSync('docker', ['compose', '--env-file', '/dev/null', ...args], { cwd: dir, env, encoding: 'utf8', stdio: 'pipe', timeout: 180_000 });
  const start = () => {
    const result = spawnSync('npm', ['run', 'start:local', '--silent'], { cwd: dir, env, encoding: 'utf8', timeout: 600_000 });
    assert.equal(result.status, 0, `start failed: ${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /sono sani/);
    assert.doesNotMatch(result.stdout + result.stderr, /synthetic-private|15555550102|123456789/);
    for (const password of [admin, migrator, agentPassword]) assert.equal((result.stdout + result.stderr).includes(password), false);
  };
  try {
    for (const path of ['compose.yaml', '.dockerignore', 'package.json', 'package-lock.json', 'prisma.config.ts', 'prisma', 'scripts', 'db', 'hermes']) {
      await cp(path, join(dir, path), { recursive: true });
    }
    // Only the gateway is confined to an internal network; the host must reach PostgreSQL for Prisma.
    await writeFile(join(dir, 'compose.override.yaml'), 'services:\n  postgres:\n    networks: [default, private]\n  author-broker:\n    networks: [private]\n  hermes:\n    networks: [private]\nnetworks:\n  private:\n    internal: true\n');
    await writeFile(join(dir, '.env'), config, { mode: 0o600 });
    start(); // No node_modules or volumes: also exercises dependency preparation.
    const db = new Client({ host: '127.0.0.1', port: databasePort, database: 'studio', user: 'studio_migrator', password: migrator });
    await db.connect();
    try {
      assert.equal((await db.query('SELECT count(*)::int AS n FROM public._prisma_migrations')).rows[0].n > 0, true);
      await db.query('CREATE TABLE app.start_probe (id int PRIMARY KEY)');
      await db.query('INSERT INTO app.start_probe VALUES (42)');
    } finally { await db.end(); }
    const agent = new Client({ host: '127.0.0.1', port: databasePort, database: 'studio', user: 'studio_agent', password: agentPassword });
    await agent.connect();
    try {
      assert.equal((await agent.query('SELECT id FROM app.start_probe')).rows[0].id, 42);
      await assert.rejects(agent.query('CREATE TABLE app.forbidden (id int)'));
    } finally { await agent.end(); }
    const hermes = compose('ps', '-q', 'hermes').trim();
    const mounts = execFileSync('docker', ['inspect', '--format', '{{json .Mounts}}', hermes], { encoding: 'utf8' });
    assert.doesNotMatch(mounts, /db-admin|db-migrator|\.env/);
    execFileSync('docker', ['exec', '--user', 'root', hermes, 'sh', '-c', 'printf synthetic-volume-marker > /opt/data/start-probe']);
    const adminFile = await readFile(join(dir, '.local/secrets/db-admin'), 'utf8');
    compose('stop');
    start();
    const after = new Client({ host: '127.0.0.1', port: databasePort, database: 'studio', user: 'studio_agent', password: agentPassword });
    await after.connect();
    try { assert.equal((await after.query('SELECT id FROM app.start_probe')).rows[0].id, 42); } finally { await after.end(); }
    assert.equal(await readFile(join(dir, '.local/secrets/db-admin'), 'utf8'), adminFile);
    const restartedHermes = compose('ps', '-q', 'hermes').trim();
    assert.equal(execFileSync('docker', ['exec', restartedHermes, 'cat', '/opt/data/start-probe'], { encoding: 'utf8' }), 'synthetic-volume-marker');
    const logs = compose('logs', '--no-color', 'postgres', 'hermes');
    assert.doesNotMatch(logs, /synthetic-private|15555550102|123456789/);
    for (const password of [admin, migrator, agentPassword]) assert.equal(logs.includes(password), false);
    // This removes only the randomly named synthetic test project and its volumes.
    compose('down', '--volumes', '--remove-orphans');
    start();
    const fresh = new Client({ host: '127.0.0.1', port: databasePort, database: 'studio', user: 'studio_agent', password: agentPassword });
    await fresh.connect();
    try { assert.equal((await fresh.query('SELECT current_user AS role')).rows[0].role, 'studio_agent'); } finally { await fresh.end(); }
  } finally {
    try { compose('down', '--volumes', '--remove-orphans'); } catch { /* Best-effort cleanup of the synthetic project. */ }
    spawnSync('docker', ['image', 'rm', `${project}-hermes`], { stdio: 'ignore', timeout: 90_000 });
    await rm(dir, { recursive: true, force: true });
  }
});
