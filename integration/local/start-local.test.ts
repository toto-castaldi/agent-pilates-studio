import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const script = resolve('scripts/start-local.mjs');
const configuration = `POSTGRES_PORT=55432
WHATSAPP_WEBHOOK_PORT=18090
DB_ADMIN_PASSWORD=synthetic-admin-password
DB_MIGRATOR_PASSWORD=synthetic-migrator-password
DB_AGENT_PASSWORD=synthetic-agent-password
OPENROUTER_API_KEY=synthetic-sensitive-model-token
WHATSAPP_ACCESS_TOKEN=synthetic-sensitive-access-token
WHATSAPP_APP_SECRET=synthetic-sensitive-app-secret
WHATSAPP_VERIFY_TOKEN=synthetic-sensitive-verify-token
WHATSAPP_ALLOWED_USERS=15555550102
WHATSAPP_PHONE_NUMBER_ID=123456789
`;

test('local start validates private configuration, preserves secrets and suppresses child output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pilates-start-unit-'));
  const bin = join(dir, 'bin');
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, COMPOSE_PROJECT_NAME: 'synthetic-unit' };
  const start = (extra = {}) => spawnSync(process.execPath, [script], { cwd: dir, env: { ...env, ...extra }, encoding: 'utf8' });
  try {
    await mkdir(bin);
    await mkdir(join(dir, 'node_modules/prisma/build'), { recursive: true });
    await writeFile(join(dir, 'node_modules/prisma/build/index.js'), "console.log('synthetic-sensitive-migration-output');\n");
    await writeFile(join(bin, 'docker'), '#!/bin/sh\necho synthetic-sensitive-docker-output\ncase "$*" in *hermes*) [ "$FAKE_FAIL" != yes ] || exit 1 ;; esac\n', { mode: 0o755 });
    await writeFile(join(bin, 'npm'), '#!/bin/sh\necho synthetic-sensitive-npm-output\n[ "$FAKE_NPM_FAIL" != yes ]\n', { mode: 0o755 });
    await writeFile(join(dir, '.env'), configuration, { mode: 0o600 });
    let result = start();
    assert.equal(result.status, 0);
    assert.match(result.stdout, /sono sani/);
    assert.doesNotMatch(result.stdout + result.stderr, /synthetic-sensitive|15555550102/);
    const password = await readFile(join(dir, '.local/secrets/db-admin'), 'utf8');
    result = start();
    assert.equal(result.status, 0);
    assert.equal(await readFile(join(dir, '.local/secrets/db-admin'), 'utf8'), password);
    result = start({ FAKE_FAIL: 'yes' });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout + result.stderr, /sono sani|synthetic-sensitive|15555550102/);
    result = start({ FAKE_NPM_FAIL: 'yes' });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout + result.stderr, /sono sani|synthetic-sensitive/);
    await writeFile(join(dir, '.env'), configuration.replace('POSTGRES_PORT=55432', 'POSTGRES_PORT=70000'));
    assert.notEqual(start().status, 0);
    await writeFile(join(dir, '.env'), configuration.replace('synthetic-admin-password', 'different-admin-password'));
    result = start();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /non corrisponde/);
    assert.equal(await readFile(join(dir, '.local/secrets/db-admin'), 'utf8'), password);
    await writeFile(join(dir, '.env'), configuration.replace('WHATSAPP_ALLOWED_USERS=15555550102', 'WHATSAPP_ALLOWED_USERS='));
    result = start();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /WHATSAPP_ALLOWED_USERS/);
    await chmod(join(dir, '.env'), 0o644);
    assert.notEqual(start().status, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
