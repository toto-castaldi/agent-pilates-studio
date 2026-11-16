import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parse } from 'yaml';

test('guided management and database admission are active together in gateway and broker', async () => {
  const dockerfile = await readFile('hermes/Dockerfile', 'utf8');
  for (const file of ['identity_management.py', 'identity-flow-runner.mjs', 'src/identity-flow.ts']) assert.ok(dockerfile.includes(file));
  // One configured number reaches both consumers through the same private file;
  // no allowlist, home channel or teacher mapping is mounted anywhere.
  const compose = parse(await readFile('compose.yaml', 'utf8'));
  for (const service of ['hermes', 'author-broker']) {
    assert.ok(compose.services[service].secrets.includes('whatsapp_manager_phone'), service);
    for (const obsolete of ['whatsapp_allowed_users', 'whatsapp_home_channel', 'whatsapp_teacher_links']) {
      assert.equal(compose.services[service].secrets.includes(obsolete), false, `${service} ${obsolete}`);
    }
  }
  assert.deepEqual(Object.keys(compose.secrets).filter((name) => /allowed|home_channel|teacher_links/u.test(name)), []);
  assert.equal(JSON.stringify(compose).includes('PILATES_MANAGER_PHONE'), false, 'the number is not an environment value in Compose');
  const entrypoint = await readFile('hermes/entrypoint.sh', 'utf8');
  assert.match(entrypoint, /WHATSAPP_CLOUD_HOME_CHANNEL="\$\{PILATES_MANAGER_PHONE#\+\}"/u);
  assert.match(entrypoint, /unset WHATSAPP_CLOUD_ALLOWED_USERS/u);
  assert.doesNotMatch(entrypoint, /export WHATSAPP_CLOUD_ALLOWED_USERS/u);
  const broker = await readFile('hermes/broker-entrypoint.sh', 'utf8');
  assert.ok(broker.includes('whatsapp_manager_phone') && !broker.includes('whatsapp_allowed_users'));
  const trusted = await readFile('hermes/pilates_trusted.py', 'utf8');
  assert.ok(trusted.includes("'/v1/admission'") && trusted.includes("'/v1/turn'"));
  assert.doesNotMatch(trusted, /WHATSAPP_CLOUD_ALLOWED_USERS|send_evidence/u);
  const soul = await readFile('hermes/SOUL.md', 'utf8');
  const guide = await readFile('docs/operations/US-017-gestione.md', 'utf8');
  assert.ok(soul.includes('/anagrafica'));
  for (const command of ['/anagrafica', '/annulla', '/conferma']) assert.ok(guide.includes(command));
  assert.ok((await readFile('.env.example', 'utf8')).includes('PILATES_MANAGER_PHONE'));
  const sql = await readFile('prisma/migrations/20261113000000_management_bootstrap/migration.sql', 'utf8');
  assert.match(sql, /REVOKE ALL ON studio_private.management_sessions FROM PUBLIC, studio_agent/u);
  const activation = await readFile('prisma/migrations/20261117000000_unified_sender_identity/migration.sql', 'utf8');
  for (const pattern of [/DROP FUNCTION studio_private\.insert_legacy_teacher\(\)/u, /DROP COLUMN management_only_enrollment/u,
    /ALTER COLUMN identity_revision SET NOT NULL/u, /DROP FUNCTION studio_private\.configured_teacher_id/u]) assert.match(activation, pattern);
});
