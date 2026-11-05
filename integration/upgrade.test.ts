import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { Client } from 'pg';

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
    'openrouter-key': 'synthetic-model-token',
    'whatsapp-access-token': 'synthetic-access-token',
    'whatsapp-app-secret': 'synthetic-app-secret',
    'whatsapp-verify-token': 'synthetic-verify-token',
    'whatsapp-allowed-users': '15555550102',
    'whatsapp-phone-number-id': '123456789012345',
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
    PILATES_MODEL: 'openai/gpt-6.1-terra',
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
    await writeFile(oldOverride, `services:\n  postgres:\n    image: postgres:17.9@sha256:2a0d0fe14825b0939f78a8cad5cd4e6aa68bf94d0e5dd96e24b6d23af4315545\n  hermes:\n    image: ${legacyImage}\nnetworks:\n  default:\n    internal: true\n`);
    await writeFile(newOverride, 'networks:\n  default:\n    internal: true\n');
    execFileSync('docker', ['build', '-f', oldDockerfile, '-t', legacyImage, '.'], { env, stdio: 'pipe', timeout: 600_000 });
    compose(newOverride, 'build', 'hermes');
    compose(oldOverride, 'up', '-d', '--wait', '--no-build', 'postgres');
    assert.equal(execFileSync('docker', ['network', 'inspect', `${project}_default`, '--format', '{{.Internal}}'], { encoding: 'utf8' }).trim(), 'true');
    compose(oldOverride, 'run', '--rm', 'db-bootstrap');
    const oldDatabase = compose(oldOverride, 'ps', '-q', 'postgres').trim();
    const oldDatabaseImage = execFileSync('docker', ['inspect', '--format', '{{.Image}}', oldDatabase], { encoding: 'utf8' }).trim();
    let databaseHost = address(oldDatabase);
    const migrate = (host: string) => {
      const url = new URL(`postgresql://${host}:5432/studio?schema=public`);
      url.username = 'studio_migrator';
      url.password = password;
      execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
        env: { ...env, DATABASE_URL: url.toString() }, stdio: 'pipe', timeout: 90_000,
      });
    };
    migrate(databaseHost);
    migrator = new Client({ host: databaseHost, port: 5432, database: 'studio', user: 'studio_migrator', password });
    await migrator.connect();
    assert.match((await migrator.query<{ server_version: string }>('SHOW server_version')).rows[0].server_version, /^17\.9/);
    await migrator.query('CREATE TABLE app.upgrade_probe (id int PRIMARY KEY, value text NOT NULL)');
    await migrator.query("INSERT INTO app.upgrade_probe VALUES (1, 'synthetic-before-upgrade')");
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
    assert.equal((await migrator.query('SELECT value FROM app.upgrade_probe WHERE id=1')).rows[0].value, 'synthetic-before-upgrade');
    agent = new Client({ host: databaseHost, port: 5432, database: 'studio', user: 'studio_agent', password: secrets['db-agent'] });
    await agent.connect();
    assert.equal((await agent.query('SELECT value FROM app.upgrade_probe WHERE id=1')).rows[0].value, 'synthetic-before-upgrade');
    await assert.rejects(agent.query('CREATE TABLE app.upgrade_forbidden (id int)'), (error: unknown) => (error as { code?: string }).code === '42501');
    compose(newOverride, 'up', '-d', '--wait', '--wait-timeout', '150', '--no-build', 'hermes');
    const newGateway = compose(newOverride, 'ps', '-q', 'hermes').trim();
    assert.notEqual(newGateway, oldGateway);
    assert.notEqual(execFileSync('docker', ['inspect', '--format', '{{.Image}}', newGateway], { encoding: 'utf8' }).trim(), oldGatewayImage);
    stateContains(newGateway, ['synthetic-before-upgrade']);
    await send(newGateway, 'synthetic-after-upgrade');
    stateContains(newGateway, ['synthetic-before-upgrade', 'synthetic-after-upgrade']);
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
