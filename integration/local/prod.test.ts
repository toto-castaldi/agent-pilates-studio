import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const commit = 'a'.repeat(40);
const run = (args: string[], release = commit) => spawnSync('bash', ['scripts/prod.sh', ...args], {
  env: { ...process.env, PILATES_RELEASE: release, PILATES_HOME: '/nonexistent-synthetic-home' }, encoding: 'utf8',
});

test('production initializes and preserves an empty private teacher mapping for upgrades', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pilates-prod-links-'));
  const bin = join(directory, 'bin');
  const root = join(directory, 'production');
  await mkdir(bin);
  await mkdir(root);
  await writeFile(join(bin, 'docker'), '#!/bin/sh\n[ "$1" = version ] && { echo 29.0.0; exit 0; }\nexit 1\n', { mode: 0o755 });
  const invoke = (args: string[]) => spawnSync('bash', ['scripts/prod.sh', ...args], {
    env: { ...process.env, PILATES_RELEASE: commit, PILATES_HOME: root, PATH: `${bin}:${process.env.PATH}` }, encoding: 'utf8',
  });
  try {
    assert.equal(invoke(['init']).status, 0);
    const mapping = join(root, 'secrets/whatsapp-teacher-links');
    assert.equal(await readFile(mapping, 'utf8'), '[]\n');
    assert.equal((await stat(mapping)).mode & 0o077, 0);
    const configured = '[{"phone":"15555550102","firstName":"Antonio","lastName":"Neri"}]\n';
    await writeFile(mapping, configured);
    assert.equal(invoke(['init']).status, 0);
    assert.equal(await readFile(mapping, 'utf8'), configured);
    // Simulate a production directory created by an older release. Upgrade
    // creates an empty file before the release check, without touching a stack.
    await rm(mapping);
    for (const name of ['openrouter-key', 'whatsapp-access-token', 'whatsapp-app-secret', 'whatsapp-verify-token', 'whatsapp-allowed-users', 'whatsapp-home-channel', 'whatsapp-phone-number-id']) {
      await writeFile(join(root, 'secrets', name), 'synthetic\n', { mode: 0o600 });
    }
    const upgrade = invoke(['update', commit]);
    assert.notEqual(upgrade.status, 0);
    assert.match(upgrade.stderr, /No installed release/);
    assert.equal(await readFile(mapping, 'utf8'), '[]\n');
    assert.doesNotMatch(upgrade.stdout + upgrade.stderr, /Antonio|Neri|15555550102/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('production commands refuse a missing or mismatched commit before reaching Docker', () => {
  assert.notEqual(run([]).status, 0);
  for (const args of [['install'], ['update'], ['rollback', '/synthetic-backup'], ['install', 'main'], ['update', 'abc123']]) {
    const result = run(args);
    assert.notEqual(result.status, 0, args.join(' '));
    assert.doesNotMatch(result.stderr, /Docker/);
  }
  const mismatch = run(['update', commit], 'b'.repeat(40));
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /same commit/);
});
