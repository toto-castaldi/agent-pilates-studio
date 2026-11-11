import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// Production has no checkout: only compose.yaml and the published images exist.
test('stack runs from images alone and each image provides its own read-only release files', { timeout: 900_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pilates-images-test-'));
  const project = `pilates-images-${randomBytes(8).toString('hex')}`;
  const hermes = `${project}-published-hermes`;
  const postgres = `${project}-published-postgres`;
  const updated = `${hermes}-updated`;
  const databasePassword = randomBytes(32).toString('hex');
  const secrets: Record<string, string> = {
    'db-admin': randomBytes(32).toString('hex'),
    'db-migrator': databasePassword,
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
  const baseEnv = {
    ...process.env,
    COMPOSE_ENV_FILES: '/dev/null',
    SECRETS_DIR: directory,
    POSTGRES_PORT: '0',
    WHATSAPP_WEBHOOK_PORT: '0',
    WHATSAPP_WEBHOOK_PATH: '/webhooks/whatsapp',
    PILATES_MODEL: 'synthetic/test-model',
    PILATES_POSTGRES_IMAGE: postgres,
  };
  const compose = (image: string, ...args: string[]) => execFileSync('docker', ['compose', '-p', project, '-f', 'compose.yaml', '-f', 'override.yaml', ...args], {
    cwd: directory, env: { ...baseEnv, PILATES_HERMES_IMAGE: image }, encoding: 'utf8', stdio: 'pipe', timeout: 240_000,
  });
  const inContainer = (id: string, script: string) => execFileSync('docker', ['exec', '--user', '10000:10000', id, 'sh', '-c', script], { encoding: 'utf8', stdio: 'pipe' });
  try {
    await Promise.all(Object.entries(secrets).map(([name, value]) => writeFile(join(directory, name), value, { mode: 0o600 })));
    execFileSync('docker', ['build', '-f', 'hermes/Dockerfile', '-t', hermes, '.'], { stdio: 'pipe', timeout: 600_000 });
    execFileSync('docker', ['build', '-f', 'db/Dockerfile', '-t', postgres, '.'], { stdio: 'pipe', timeout: 600_000 });
    await copyFile('compose.yaml', join(directory, 'compose.yaml'));
    await copyFile('integration/model_stub.py', join(directory, 'model_stub.py'));
    await writeFile(join(directory, 'override.yaml'), `services:\n  model-stub:\n    image: ${hermes}\n    entrypoint: ["/opt/hermes/.venv/bin/python", "/model_stub.py"]\n    volumes:\n      - ./model_stub.py:/model_stub.py:ro\n    logging:\n      driver: none\n  hermes:\n    environment:\n      OPENROUTER_BASE_URL: http://model-stub:8088/v1\nnetworks:\n  default:\n    internal: true\n`);
    compose(hermes, 'up', '-d', '--no-build', '--wait', 'postgres', 'model-stub');
    compose(hermes, 'run', '--rm', 'db-bootstrap');
    const database = compose(hermes, 'ps', '-q', 'postgres').trim();
    const host = execFileSync('docker', ['inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', database], { encoding: 'utf8' }).trim();
    const url = new URL(`postgresql://${host}:5432/studio?schema=public`);
    url.username = 'studio_migrator';
    url.password = databasePassword;
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: { ...baseEnv, DATABASE_URL: url.toString() }, stdio: 'pipe', timeout: 120_000 });
    compose(hermes, 'up', '-d', '--no-build', '--wait', 'author-broker', 'hermes');
    const first = compose(hermes, 'ps', '-q', 'hermes').trim();
    const soul = await readFile('hermes/SOUL.md', 'utf8');
    assert.equal(inContainer(first, 'cat /opt/data/SOUL.md'), soul);
    const mounts = JSON.parse(execFileSync('docker', ['inspect', '--format', '{{json .Mounts}}', first], { encoding: 'utf8' })) as { Type: string; Source?: string; Destination: string; RW: boolean }[];
    for (const target of ['/opt/data/SOUL.md', '/opt/data/config.yaml', '/opt/data/plugins/pilates-postgres']) {
      const mount = mounts.find((entry) => entry.Destination === target);
      assert.equal(mount?.Type, 'image', target);
      assert.equal(mount?.RW, false, target);
    }
    // Secrets are the only host files; nothing comes from a checkout.
    assert.deepEqual(mounts.filter((entry) => entry.Type === 'bind' && !entry.Destination.startsWith('/run/secrets/')), []);
    assert.throws(() => inContainer(first, 'echo tampered >> /opt/data/SOUL.md'));
    assert.throws(() => inContainer(first, 'mv /opt/data/SOUL.md /opt/data/SOUL.old'));
    inContainer(first, 'echo synthetic-volume-marker > /opt/data/images-probe');

    // A new image must reach an existing volume, which keeps its own state.
    await writeFile(join(directory, 'Dockerfile.updated'), `FROM ${hermes}\nRUN echo SYNTHETIC_UPDATED_SOUL >> /opt/pilates/release/SOUL.md\n`);
    execFileSync('docker', ['build', '-f', join(directory, 'Dockerfile.updated'), '-t', updated, directory], { stdio: 'pipe', timeout: 300_000 });
    compose(updated, 'up', '-d', '--no-build', '--no-deps', '--force-recreate', '--wait', 'hermes');
    const second = compose(updated, 'ps', '-q', 'hermes').trim();
    assert.notEqual(second, first);
    assert.match(inContainer(second, 'cat /opt/data/SOUL.md'), /SYNTHETIC_UPDATED_SOUL/);
    assert.match(inContainer(second, 'cat /opt/data/images-probe'), /synthetic-volume-marker/);
  } finally {
    try { compose(hermes, 'down', '--volumes', '--remove-orphans'); } catch { /* best effort */ }
    try { execFileSync('docker', ['image', 'rm', '-f', hermes, postgres, updated], { stdio: 'ignore' }); } catch { /* best effort */ }
    await rm(directory, { recursive: true, force: true });
  }
});
