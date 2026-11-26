import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

// BUG-005: the healthcheck must not report the socket-only initdb server as ready.
test('PostgreSQL is healthy only when the final server accepts TCP during first initialization', { timeout: 300_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pilates-readiness-'));
  const project = `pilates-ready-${randomBytes(8).toString('hex')}`;
  const env = { ...process.env, COMPOSE_ENV_FILES: '/dev/null', SECRETS_DIR: directory, POSTGRES_PORT: '0' };
  const gate = join(directory, 'init-gate.sh');
  const override = join(directory, 'compose.override.yaml');
  const files = ['-p', project, '-f', resolve('compose.yaml'), '-f', override];
  const compose = (...args: string[]) =>
    execFileSync('docker', ['compose', ...files, ...args], { env, encoding: 'utf8', stdio: 'pipe', timeout: 180_000 });
  try {
    for (const name of ['admin', 'migrator', 'agent', 'broker', 'grafana']) {
      await writeFile(join(directory, `db-${name}`), `${randomBytes(32).toString('hex')}\n`, { mode: 0o600 });
    }
    // Holds the entrypoint at its temporary server, which listens on the Unix socket only.
    await writeFile(gate, 'touch /tmp/pilates-init-waiting\nwhile [ ! -f /tmp/pilates-init-release ]; do sleep 0.1; done\n', { mode: 0o644 });
    await writeFile(override, `services:\n  postgres:\n    volumes:\n      - type: bind\n        source: ${gate}\n        target: /docker-entrypoint-initdb.d/00-gate.sh\n        read_only: true\n`);
    const config = JSON.parse(compose('config', '--format', 'json')) as { services: { postgres: { healthcheck: { test: string[] } } } };
    const check = config.services.postgres.healthcheck.test;
    assert.equal(check[0], 'CMD-SHELL');
    compose('up', '-d', 'postgres');
    const container = compose('ps', '--all', '--quiet', 'postgres').trim();
    assert.ok(container);
    const exec = (...args: string[]) => spawnSync('docker', ['exec', container, ...args], { stdio: 'ignore', timeout: 10_000 }).status === 0;
    let initializing = false;
    for (let i = 0; i < 240 && !initializing; i++) {
      initializing = exec('test', '-f', '/tmp/pilates-init-waiting');
      if (!initializing) await delay(250);
    }
    assert.equal(initializing, true, 'PostgreSQL did not reach the initdb gate');

    // The window is real: the previous socket check passes here.
    assert.equal(exec('pg_isready', '-U', 'studio_admin', '-d', 'studio'), true, 'temporary server should accept socket connections');
    assert.equal(exec('sh', '-c', check[1] ?? ''), false, 'configured healthcheck must fail on the temporary server');

    // A bootstrap started now waits for the healthy final server instead of failing.
    const bootstrap = spawn('docker', ['compose', ...files, 'run', '--rm', 'db-bootstrap'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    bootstrap.stdout.on('data', (chunk) => { output += chunk; });
    bootstrap.stderr.on('data', (chunk) => { output += chunk; });
    const finished = new Promise<number | null>((resolveExit) => bootstrap.on('close', resolveExit));
    // Several healthcheck intervals (2 s) while the temporary server is up.
    await delay(8_000);
    const health = () => spawnSync('docker', ['inspect', '--format', '{{.State.Health.Status}}', container], { encoding: 'utf8' }).stdout.trim();
    assert.notEqual(health(), 'healthy', 'healthcheck reported the temporary initdb server as healthy');
    assert.equal(bootstrap.exitCode, null, 'bootstrap must not start before PostgreSQL is healthy');

    assert.equal(exec('touch', '/tmp/pilates-init-release'), true);
    const status = await finished;
    assert.equal(status, 0, 'bootstrap failed after initialization');
    assert.match(output, /Database roles configured\./);
    assert.doesNotMatch(output, /Database role setup failed/);
    assert.equal(health(), 'healthy');
  } finally {
    // Removes only the randomly named synthetic project and its volumes.
    spawnSync('docker', ['compose', ...files, 'down', '--volumes', '--remove-orphans'], { env, stdio: 'ignore', timeout: 120_000 });
    await rm(directory, { recursive: true, force: true });
  }
});
