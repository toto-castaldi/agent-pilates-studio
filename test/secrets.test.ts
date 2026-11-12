import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { memorySystem } from './memory-system.js';

const { initSecrets } = createRequire(import.meta.url)('../../scripts/init-secrets-core.mjs');

test('secret initialization uses private files and preserves existing passwords in memory', async () => {
  const system = memorySystem();
  const args = { ...system, directory: '/synthetic/secrets' };
  await initSecrets(args);
  const first = system.content('/synthetic/secrets/db-admin');
  assert.match(first ?? '', /^[a-f0-9]{64}\n$/);
  assert.equal((await system.lstat('/synthetic/secrets')).mode & 0o077, 0);
  for (const name of ['db-admin', 'db-migrator', 'db-agent', 'db-broker', 'bridge-token', 'whatsapp-verify-token']) {
    assert.equal((await system.lstat(`/synthetic/secrets/${name}`)).mode & 0o077, 0);
  }
  assert.equal(system.content('/synthetic/secrets/whatsapp-teacher-links'), '[]\n');
  system.put('/synthetic/secrets/whatsapp-teacher-links', '[{"phone":"15555550102","firstName":"Antonio","lastName":"Neri"}]\n');
  await initSecrets(args);
  assert.equal(system.content('/synthetic/secrets/db-admin'), first);
  assert.match(system.content('/synthetic/secrets/whatsapp-teacher-links') ?? '', /Antonio/);
  system.mode('/synthetic/secrets/db-admin', 0o644);
  await assert.rejects(initSecrets(args), /private regular file/);
  assert.ok(!system.logs.join(' ').includes(first?.trim() ?? 'missing'));
});
