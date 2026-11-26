import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// Same Docker as production and CI (scripts/ci-install-docker.sh).
const dindImage = 'docker:29.9.2-dind@sha256:9e79b879b177fbd72c34376a3dd3d91747da5db49e1f560f76aea59561471977';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// BUG-004: a host reboot unmounts the image snapshots behind `type: image`
// mounts, and Docker cannot resolve them again when the restart policy starts
// the existing containers. Restarting a Docker-in-Docker container reproduces
// that: its daemon stops the containers, every mount of its namespace is gone
// and the new daemon starts the same containers from the same storage.
test('production stack restarts healthy by itself after a simulated host reboot', { timeout: 1_800_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pilates-reboot-test-'));
  const project = `pilates-reboot-${randomBytes(8).toString('hex')}`;
  const hermes = `${project}-published-hermes`;
  const postgres = `${project}-published-postgres`;
  const dind = `${project}-dind`;
  const databasePassword = randomBytes(32).toString('hex');
  const secrets: Record<string, string> = {
    'db-admin': randomBytes(32).toString('hex'),
    'db-migrator': databasePassword,
    'db-agent': randomBytes(32).toString('hex'),
    'db-broker': randomBytes(32).toString('hex'), 'db-grafana': randomBytes(32).toString('hex'),
    'bridge-token': randomBytes(32).toString('hex'),
    'openrouter-key': 'synthetic-model-token',
    'whatsapp-access-token': 'synthetic-access-token',
    'whatsapp-app-secret': 'synthetic-app-secret',
    'whatsapp-verify-token': 'synthetic-verify-token',
    'whatsapp-manager-phone': '+15555550103',
    'whatsapp-phone-number-id': '123456789012346',
  };
  const environment = {
    COMPOSE_ENV_FILES: '/dev/null',
    SECRETS_DIR: '/work',
    POSTGRES_PORT: '5432',
    WHATSAPP_WEBHOOK_PORT: '18090',
    WHATSAPP_WEBHOOK_PATH: '/webhooks/whatsapp',
    PILATES_MODEL: 'synthetic/test-model',
    PILATES_HERMES_IMAGE: hermes,
    PILATES_POSTGRES_IMAGE: postgres,
  };
  const inner = (...args: string[]) => execFileSync('docker', ['exec', dind, 'docker', ...args], { encoding: 'utf8', stdio: 'pipe', timeout: 240_000 });
  const compose = (...args: string[]) => execFileSync('docker', ['exec', '-w', '/work',
    ...Object.entries(environment).flatMap(([name, value]) => ['-e', `${name}=${value}`]),
    dind, 'docker', 'compose', '-p', project, '-f', 'compose.yaml', '-f', 'override.yaml', ...args], { encoding: 'utf8', stdio: 'pipe', timeout: 240_000 });
  const waitForDaemon = async () => {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      try { inner('info'); return; } catch { await sleep(1_000); }
    }
    assert.fail('inner Docker daemon did not start');
  };
  const state = (id: string) => inner('inspect', '--format', '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}} {{.Image}}', id).trim();
  try {
    await Promise.all(Object.entries(secrets).map(([name, value]) => writeFile(join(directory, name), value, { mode: 0o600 })));
    execFileSync('docker', ['build', '-f', 'hermes/Dockerfile', '-t', hermes, '.'], { stdio: 'pipe', timeout: 600_000 });
    execFileSync('docker', ['build', '-f', 'db/Dockerfile', '-t', postgres, '.'], { stdio: 'pipe', timeout: 600_000 });
    await copyFile('compose.yaml', join(directory, 'compose.yaml'));
    await copyFile('integration/model_stub.py', join(directory, 'model_stub.py'));
    // The database port is published on the inner host only to apply the migrations.
    await writeFile(join(directory, 'override.yaml'), `services:\n  postgres:\n    ports: !override\n      - "0.0.0.0:5432:5432"\n  model-stub:\n    image: ${hermes}\n    entrypoint: ["/opt/hermes/.venv/bin/python", "/model_stub.py"]\n    volumes:\n      - ./model_stub.py:/model_stub.py:ro\n    logging:\n      driver: none\n    restart: unless-stopped\n  hermes:\n    environment:\n      OPENROUTER_BASE_URL: http://model-stub:8088/v1\n`);

    execFileSync('docker', ['run', '-d', '--privileged', '--name', dind, '--mount', `type=volume,source=${dind},target=/var/lib/docker`,
      // The DinD entrypoint mounts a tmpfs on /tmp, so the files go elsewhere.
      '--mount', `type=bind,source=${directory},target=/work`, dindImage], { stdio: 'pipe', timeout: 300_000 });
    await waitForDaemon();
    await new Promise<void>((resolve, reject) => {
      const save = spawn('docker', ['save', hermes, postgres], { stdio: ['ignore', 'pipe', 'ignore'] });
      const load = spawn('docker', ['exec', '-i', dind, 'docker', 'load', '-q'], { stdio: ['pipe', 'ignore', 'ignore'] });
      save.stdout.pipe(load.stdin);
      save.on('error', reject);
      load.on('error', reject);
      load.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`image load failed: ${code}`))));
    });

    compose('up', '-d', '--no-build', '--wait', 'postgres', 'model-stub');
    compose('run', '--rm', 'db-bootstrap');
    const host = execFileSync('docker', ['inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', dind], { encoding: 'utf8' }).trim();
    const url = new URL(`postgresql://${host}:5432/studio?schema=public`);
    url.username = 'studio_migrator';
    url.password = databasePassword;
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
      env: { ...process.env, DATABASE_URL: url.toString() }, stdio: 'pipe', timeout: 120_000,
    });
    compose('up', '-d', '--no-build', '--wait', 'author-broker', 'hermes');

    const services = ['postgres', 'author-broker', 'hermes'];
    const ids = services.map((service) => compose('ps', '-q', service).trim());
    const before = ids.map(state);
    for (const value of before) assert.match(value, /^running healthy /);
    const mounts = JSON.parse(inner('inspect', '--format', '{{json .Mounts}}', ids[2])) as { Type: string }[];
    assert.deepEqual(mounts.filter((entry) => entry.Type === 'image'), []);
    // Control: a probe with an image subpath mount shows that the simulated
    // reboot reproduces the original failure.
    inner('run', '-d', '--name', 'image-mount-probe', '--restart', 'unless-stopped', '--entrypoint', 'sleep',
      '--mount', `type=image,source=${hermes},target=/probe/SOUL.md,image-subpath=opt/pilates/release/SOUL.md`, hermes, 'infinity');

    execFileSync('docker', ['restart', '--timeout', '60', dind], { stdio: 'pipe', timeout: 180_000 });
    await waitForDaemon();

    let after: string[] = [];
    for (let attempt = 0; attempt < 90; attempt += 1) {
      after = ids.map(state);
      if (after.every((value) => /^running healthy /.test(value))) break;
      await sleep(2_000);
    }
    // Same containers, same images, healthy without any operator command.
    assert.deepEqual(after, before);
    assert.deepEqual(services.map((service) => compose('ps', '-q', service).trim()), ids);
    const probe = inner('inspect', '--format', '{{.State.Status}} {{.State.Error}}', 'image-mount-probe');
    assert.match(probe, /^exited cannot access path /);
    // The gateway still serves the release files of its own image.
    assert.equal(inner('exec', '--user', '10000:10000', ids[2], 'cat', '/opt/data/SOUL.md'), await readFile('hermes/SOUL.md', 'utf8'));
  } finally {
    try { execFileSync('docker', ['rm', '-f', '-v', dind], { stdio: 'ignore' }); } catch { /* best effort */ }
    try { execFileSync('docker', ['volume', 'rm', '-f', dind], { stdio: 'ignore' }); } catch { /* best effort */ }
    try { execFileSync('docker', ['image', 'rm', '-f', hermes, postgres], { stdio: 'ignore' }); } catch { /* best effort */ }
    await rm(directory, { recursive: true, force: true });
  }
});
