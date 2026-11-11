import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readlink, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
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
  const config = `POSTGRES_PORT=${databasePort}\nWHATSAPP_WEBHOOK_PORT=${webhookPort}\nPILATES_MODEL=synthetic/test-model\nDB_ADMIN_PASSWORD=${admin}\nDB_MIGRATOR_PASSWORD="${migrator}"\nDB_AGENT_PASSWORD=${agentPassword}\nOPENROUTER_API_KEY=synthetic-private-model-token\nWHATSAPP_ACCESS_TOKEN=synthetic-private-access-token\nWHATSAPP_APP_SECRET=synthetic-private-app-secret\nWHATSAPP_VERIFY_TOKEN=synthetic-private-verify-token\nWHATSAPP_ALLOWED_USERS=15555550102\nWHATSAPP_HOME_CHANNEL=15555550102\nWHATSAPP_PHONE_NUMBER_ID=123456789\nPILATES_IDLE_COMPACT_SECONDS=1800\nWHATSAPP_TEACHER_LINKS='[{"phone":"15555550102","firstName":"Antonio","lastName":"Neri"}]'\n`;
  const env = { ...process.env, COMPOSE_PROJECT_NAME: project, SECRETS_DIR: join(dir, '.local/secrets'), POSTGRES_PORT: String(databasePort), WHATSAPP_WEBHOOK_PORT: String(webhookPort) };
  const compose = (...args: string[]) => execFileSync('docker', ['compose', '--env-file', '/dev/null', ...args], { cwd: dir, env, encoding: 'utf8', stdio: 'pipe', timeout: 180_000 });
  // start:local starts services with --no-deps; the synthetic model catalog read by
  // Hermes at every start (TEC-025) must already be running.
  const startResult = (extra: NodeJS.ProcessEnv = {}) => {
    compose('up', '-d', '--no-deps', 'model-stub');
    return spawnSync('npm', ['run', 'start:local', '--silent'], { cwd: dir, env: { ...env, ...extra }, encoding: 'utf8', timeout: 600_000 });
  };
  const start = () => {
    const result = startResult();
    assert.equal(result.status, 0, `start failed: ${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /sono sani/);
    assert.doesNotMatch(result.stdout + result.stderr, /synthetic-private|synthetic-new|1555555010[23]|123456789|987654321/);
    for (const password of [admin, migrator, agentPassword]) assert.equal((result.stdout + result.stderr).includes(password), false);
  };
  try {
    await mkdir(join(dir, 'scenarios'));
    await mkdir(join(dir, 'integration'));
    for (const path of ['compose.yaml', '.dockerignore', 'package.json', 'package-lock.json', 'prisma.config.ts', 'prisma', 'scripts', 'db', 'hermes', 'scenarios/gateway-launcher.sh', 'scenarios/meta_stub.py', 'integration/model_stub.py']) {
      await cp(path, join(dir, path), { recursive: true });
    }
    // Only the gateway is confined to an internal network; the host must reach PostgreSQL for Prisma.
    // The model stub can build the shared image because it starts before start:local.
    await writeFile(join(dir, 'compose.override.yaml'), `services:\n  postgres:\n    networks: [default, private]\n  author-broker:\n    networks: [private]\n  model-stub:\n    image: ${project}-hermes\n    build:\n      context: .\n      dockerfile: hermes/Dockerfile\n    entrypoint: ["/opt/hermes/.venv/bin/python", "/model_stub.py"]\n    volumes: ["./integration/model_stub.py:/model_stub.py:ro"]\n    networks: [private]\n  meta-stub:\n    image: ${project}-hermes\n    entrypoint: ["/opt/hermes/.venv/bin/python", "/meta_stub.py"]\n    volumes: ["./scenarios/meta_stub.py:/meta_stub.py:ro"]\n    networks: [private]\n  hermes:\n    networks: [private]\n    environment:\n      OPENROUTER_BASE_URL: http://model-stub:8088/v1\n      NO_PROXY: model-stub,meta-stub,localhost,127.0.0.1\n    volumes: ["./scenarios/gateway-launcher.sh:/opt/hermes/libexec/hermes:ro"]\nnetworks:\n  private:\n    internal: true\n`);
    await writeFile(join(dir, 'private.env'), config, { mode: 0o600 });
    await symlink('private.env', join(dir, '.env'));
    start(); // No node_modules or volumes: also exercises dependency preparation.
    assert.equal(await readlink(join(dir, '.env')), 'private.env');
    assert.equal(await readFile(join(dir, 'private.env'), 'utf8'), config);
    const linksPath = join(dir, '.local/secrets/whatsapp-teacher-links');
    assert.deepEqual(JSON.parse(await readFile(linksPath, 'utf8')), [{ phone: '15555550102', firstName: 'Antonio', lastName: 'Neri' }]);
    const originalGateway = compose('ps', '-q', 'hermes').trim();
    await writeFile(join(dir, 'private.env'), config.replace('"phone":"15555550102"', '"phone":"15555550109"'));
    const invalidLinks = startResult();
    assert.notEqual(invalidLinks.status, 0);
    assert.match(invalidLinks.stderr, /Collegamenti degli insegnanti non validi/);
    assert.doesNotMatch(invalidLinks.stdout + invalidLinks.stderr, /1555555010[29]|Antonio|Neri/);
    assert.deepEqual(JSON.parse(await readFile(linksPath, 'utf8')), [{ phone: '15555550102', firstName: 'Antonio', lastName: 'Neri' }]);
    assert.equal(compose('ps', '--status', 'running', '-q', 'hermes').trim(), originalGateway);
    await writeFile(join(dir, 'private.env'), config);
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
    const compactionSettings = (container: string) => execFileSync('docker', ['exec', container, 'sh', '-c', 'for f in /proc/[0-9]*/environ; do { tr "\\0" "\\n" < "$f"; } 2>/dev/null | grep -E "^PILATES_(COMPACTION_THRESHOLD_TOKENS|IDLE_COMPACT_SECONDS)="; done | sort -u'], { encoding: 'utf8' }).trim().split('\n');
    assert.deepEqual(compactionSettings(hermes), ['PILATES_COMPACTION_THRESHOLD_TOKENS=26214', 'PILATES_IDLE_COMPACT_SECONDS=1800']);
    const mounts = execFileSync('docker', ['inspect', '--format', '{{json .Mounts}}', hermes], { encoding: 'utf8' });
    assert.doesNotMatch(mounts, /db-admin|db-migrator|\.env/);
    execFileSync('docker', ['exec', '--user', 'root', hermes, 'sh', '-c', 'printf synthetic-volume-marker > /opt/data/start-probe']);
    const adminFile = await readFile(join(dir, '.local/secrets/db-admin'), 'utf8');
    const agentFile = join(dir, '.local/secrets/db-agent');
    await rename(agentFile, `${agentFile}.saved`);
    try {
      const missing = startResult();
      assert.notEqual(missing.status, 0);
      assert.match(missing.stderr, /Segreto database mancante/);
    } finally { await rename(`${agentFile}.saved`, agentFile); }
    const postgresId = compose('ps', '-q', 'postgres').trim();
    const soulPath = join(dir, 'hermes/SOUL.md');
    await writeFile(`${soulPath}.new`, `${await readFile(soulPath, 'utf8')}\nSYNTHETIC_UPDATED_SOUL\n`);
    await rename(`${soulPath}.new`, soulPath); // Simulates a checkout replacing the bind-mounted inode.
    start();
    const updatedHermes = compose('ps', '-q', 'hermes').trim();
    assert.notEqual(updatedHermes, hermes);
    assert.equal(compose('ps', '-q', 'postgres').trim(), postgresId);
    execFileSync('docker', ['exec', updatedHermes, 'grep', '-q', 'SYNTHETIC_UPDATED_SOUL', '/opt/data/SOUL.md'], { stdio: 'pipe' });
    compose('stop');
    start();
    const after = new Client({ host: '127.0.0.1', port: databasePort, database: 'studio', user: 'studio_agent', password: agentPassword });
    await after.connect();
    try { assert.equal((await after.query('SELECT id FROM app.start_probe')).rows[0].id, 42); } finally { await after.end(); }
    assert.equal(await readFile(join(dir, '.local/secrets/db-admin'), 'utf8'), adminFile);
    const restartedHermes = compose('ps', '-q', 'hermes').trim();
    assert.equal(execFileSync('docker', ['exec', restartedHermes, 'cat', '/opt/data/start-probe'], { encoding: 'utf8' }), 'synthetic-volume-marker');
    // Replace the target inode and change every external secret without changing DB credentials.
    compose('up', '-d', '--no-deps', 'model-stub', 'meta-stub');
    const changed = config.replace('synthetic-private-model-token', 'synthetic-new-model-token')
      .replace('synthetic-private-access-token', 'synthetic-new-access-token')
      .replace('synthetic-private-app-secret', 'synthetic-new-app-secret')
      .replace('synthetic-private-verify-token', 'synthetic-new-verify-token')
      .replaceAll('15555550102', '15555550103')
      .replace('123456789', '987654321')
      .replace('synthetic/test-model', 'synthetic/updated-model')
      .concat('WHATSAPP_WEBHOOK_PATH=/whatsapp/updated\n');
    await writeFile(join(dir, 'replacement.env'), changed, { mode: 0o600 });
    await rename(join(dir, 'replacement.env'), join(dir, 'private.env'));
    start();
    assert.deepEqual(JSON.parse(await readFile(linksPath, 'utf8')), [{ phone: '15555550103', firstName: 'Antonio', lastName: 'Neri' }]);
    const address = (service: string) => {
      const id = compose('ps', '-q', service).trim();
      return execFileSync('docker', ['inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', id], { encoding: 'utf8' }).trim();
    };
    const gatewayId = compose('ps', '-q', 'hermes').trim();
    // A changed model updates the compaction threshold at the next start (TEC-025).
    assert.deepEqual(compactionSettings(gatewayId), ['PILATES_COMPACTION_THRESHOLD_TOKENS=52428', 'PILATES_IDLE_COMPACT_SECONDS=1800']);
    execFileSync('docker', ['exec', '--user', 'root', gatewayId, 'sh', '-c', 'test "$(cat /run/secrets/openrouter_key)" = synthetic-new-model-token && test "$(cat /run/secrets/whatsapp_access_token)" = synthetic-new-access-token && test "$(cat /run/secrets/whatsapp_verify_token)" = synthetic-new-verify-token && test "$(cat /run/secrets/whatsapp_home_channel)" = 15555550103 && test "$PILATES_MODEL" = synthetic/updated-model'], { stdio: 'pipe' });
    const gateway = `http://${address('hermes')}:8090/whatsapp/updated`;
    const meta = `http://${address('meta-stub')}:8088/observations`;
    const broker = `http://${address('author-broker')}:8091`;
    const bridge = (await readFile(join(dir, '.local/secrets/bridge-token'), 'utf8')).trim();
    const payload = (sender: string, id: string) => JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: '999', changes: [{ field: 'messages', value: {
      metadata: { phone_number_id: '987654321' }, contacts: [{ wa_id: sender, profile: { name: 'Synthetic' } }],
      messages: [{ from: sender, id, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'beta' } }],
    } }] }] });
    const headers = (body: string, secret = 'synthetic-new-app-secret') => ({ 'Content-Type': 'application/json', 'X-Hub-Signature-256': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}` });
    const allowed = payload('15555550103', 'synthetic-allowed');
    assert.equal((await fetch(gateway, { method: 'POST', body: allowed, headers: headers(allowed, 'synthetic-private-app-secret') })).status, 401);
    assert.equal((await fetch(gateway, { method: 'POST', body: allowed, headers: headers(allowed) })).status, 200);
    let replied = false;
    for (let i = 0; i < 90; i++) {
      const replies = await (await fetch(meta)).json() as { to: string }[];
      if (replies.some((entry) => entry.to === '15555550103')) { replied = true; break; }
      await delay(1000);
    }
    assert.equal(replied, true);
    const verify = new Client({ host: '127.0.0.1', port: databasePort, database: 'studio', user: 'studio_migrator', password: migrator });
    await verify.connect();
    try {
      const row = await verify.query("SELECT created_by_phone FROM app.clients WHERE first_name = 'beta'");
      assert.equal(row.rows[0]?.created_by_phone, '15555550103');
    } finally { await verify.end(); }
    const denied = payload('15555550102', 'synthetic-denied');
    assert.equal((await fetch(gateway, { method: 'POST', body: denied, headers: headers(denied) })).status, 200);
    assert.equal((await fetch(`${broker}/v1/evidence`, { method: 'POST', body: denied, headers: { ...headers(denied), 'X-Pilates-Bridge': bridge } })).status, 204);
    assert.equal((await fetch(`${broker}/v1/context`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pilates-Bridge': bridge }, body: JSON.stringify({ message_id: 'synthetic-denied', sender: '15555550102', turn: 'a'.repeat(64), pid: 1, txid: '1' }) })).status, 403);
    await delay(3000);
    const replies = await (await fetch(meta)).json() as { to: string; text: string }[];
    assert.equal(replies.some((entry) => entry.to === '15555550102'), false, JSON.stringify(replies));
    const beforeMismatch = await readFile(join(dir, '.local/secrets/whatsapp-app-secret'), 'utf8');
    await writeFile(join(dir, 'private.env'), changed.replace(admin, 'synthetic-different-admin-password').replace('synthetic-new-app-secret', 'synthetic-other-app-secret'));
    const mismatch = startResult();
    assert.notEqual(mismatch.status, 0);
    assert.match(mismatch.stderr, /non corrisponde/);
    assert.equal(await readFile(join(dir, '.local/secrets/whatsapp-app-secret'), 'utf8'), beforeMismatch);
    assert.equal(compose('ps', '--status', 'running', '-q', 'hermes').trim(), gatewayId);
    // A role password changed in the database, even with unchanged secret files,
    // must not be reset by bootstrap or allow external changes to be applied.
    const administrator = new Client({ host: '127.0.0.1', port: databasePort, database: 'studio', user: 'studio_admin', password: admin });
    await administrator.connect();
    try {
      await administrator.query("ALTER ROLE studio_agent PASSWORD 'synthetic-different-database-password'");
      await writeFile(join(dir, 'private.env'), changed.replace('synthetic-new-app-secret', 'synthetic-other-app-secret')
        .replace(`POSTGRES_PORT=${databasePort}`, `POSTGRES_PORT=${databasePort === 65535 ? 65534 : databasePort + 1}`));
      const drift = startResult();
      assert.notEqual(drift.status, 0);
      assert.match(drift.stderr, /Verifica credenziali PostgreSQL/);
      assert.equal(await readFile(join(dir, '.local/secrets/whatsapp-app-secret'), 'utf8'), beforeMismatch);
      assert.equal(compose('ps', '-q', 'postgres').trim(), postgresId);
      const probe = new Client({ host: '127.0.0.1', port: databasePort, database: 'studio', user: 'studio_agent', password: 'synthetic-different-database-password' });
      await probe.connect();
      await probe.end();
    } finally {
      await administrator.query(`ALTER ROLE studio_agent PASSWORD '${agentPassword}'`);
      await administrator.end();
    }
    await writeFile(join(dir, 'private.env'), changed);
    // Force a real startup failure after the broker has started. Cleanup must
    // leave neither component running, and a subsequent normal start recovers.
    const bin = join(dir, 'failure-bin');
    await mkdir(bin);
    const docker = execFileSync('which', ['docker'], { encoding: 'utf8' }).trim();
    await writeFile(join(bin, 'docker'), `#!/bin/sh\ncase "$*" in *" up "*" hermes") exit 1 ;; esac\nexec ${JSON.stringify(docker)} "$@"\n`, { mode: 0o755 });
    const failed = startResult({ PATH: `${bin}:${process.env.PATH}` });
    assert.notEqual(failed.status, 0);
    assert.doesNotMatch(failed.stdout + failed.stderr, /sono sani|synthetic-new|15555550103/);
    assert.equal(compose('ps', '--status', 'running', '-q', 'hermes', 'author-broker').trim(), '');
    start();
    const logs = compose('logs', '--no-color', 'postgres', 'hermes');
    assert.doesNotMatch(logs, /synthetic-private|synthetic-new|1555555010[23]|123456789|987654321/);
    for (const password of [admin, migrator, agentPassword]) assert.equal(logs.includes(password), false);
    // Recreate from an existing volume with no PostgreSQL container: the
    // credential probe uses a temporary container without publishing ports.
    compose('down', '--remove-orphans');
    start();
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
