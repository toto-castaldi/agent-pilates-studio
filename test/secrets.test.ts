import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

test('secret initialization is private and never replaces existing passwords', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'pilates-secrets-test-'));
  const directory = join(parent, 'secrets');
  const env = { ...process.env, SECRETS_DIR: directory };
  const script = resolve('scripts/init-secrets.mjs');
  const run = () => execFileSync(process.execPath, [script], { cwd: parent, env, encoding: 'utf8', stdio: 'pipe' });
  try {
    run();
    const passwordFile = join(directory, 'db-admin');
    const first = await readFile(passwordFile, 'utf8');
    assert.match(first, /^[a-f0-9]{64}\n$/);
    assert.equal((await stat(directory)).mode & 0o077, 0);
    for (const name of ['db-admin', 'db-migrator', 'db-agent', 'whatsapp-verify-token']) {
      assert.equal((await stat(join(directory, name))).mode & 0o077, 0);
    }
    run();
    assert.equal(await readFile(passwordFile, 'utf8'), first);
    await chmod(passwordFile, 0o644);
    const invalid = spawnSync(process.execPath, [script], { cwd: parent, env, encoding: 'utf8', stdio: 'pipe' });
    assert.notEqual(invalid.status, 0);
    assert.equal((invalid.stderr ?? '').includes(first.trim()), false);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
