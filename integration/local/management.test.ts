import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parse } from 'yaml';

test('management component is packaged without activating the operational identity transition', async () => {
  const dockerfile = await readFile('hermes/Dockerfile', 'utf8');
  for (const file of ['identity_management.py', 'identity-flow-runner.mjs', 'src/identity-flow.ts']) assert.ok(dockerfile.includes(file));
  const compose = parse(await readFile('compose.yaml', 'utf8'));
  assert.equal(JSON.stringify(compose).includes('PILATES_MANAGER_PHONE'), false);
  const entrypoint = await readFile('hermes/entrypoint.sh', 'utf8');
  assert.ok(entrypoint.includes('WHATSAPP_CLOUD_ALLOWED_USERS'));
  const soul = await readFile('hermes/SOUL.md', 'utf8');
  const guide = await readFile('docs/operations/US-017-gestione.md', 'utf8');
  for (const command of ['/anagrafica', '/annulla', '/conferma']) {
    assert.ok(soul.includes(command)); assert.ok(guide.includes(command));
  }
  assert.ok(soul.includes('dieci minuti')); assert.ok(soul.includes('riavvio'));
  assert.ok(guide.includes('management_only_enrollment'));
  assert.ok((await readFile('.env.example', 'utf8')).includes('PILATES_MANAGER_PHONE'));
  const sql = await readFile('prisma/migrations/20261113000000_management_bootstrap/migration.sql', 'utf8');
  assert.match(sql, /REVOKE ALL ON studio_private.management_sessions FROM PUBLIC, studio_agent/u);
  assert.match(sql, /author.management_only_enrollment/u);
});
