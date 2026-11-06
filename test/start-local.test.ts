import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { memorySystem } from './memory-system.js';

const { startLocal } = createRequire(import.meta.url)('../../scripts/start-local-core.mjs');
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

test('local start validates configuration, preserves secrets and suppresses child output in memory', async () => {
  const system = memorySystem();
  system.put('.env', configuration);
  assert.equal(await startLocal(system), 0);
  const password = system.content('.local/secrets/db-admin');
  assert.equal(await startLocal(system), 0);
  assert.equal(system.content('.local/secrets/db-admin'), password);
  assert.ok(system.calls.every((call) => call.stdio === 'ignore'));
  assert.ok(system.calls.every((call) => call.env.DB_ADMIN_PASSWORD === undefined));
  assert.doesNotMatch([...system.logs, ...system.errors].join(' '), /synthetic-sensitive|15555550102/);
  system.failCommand('hermes');
  let logCount = system.logs.length;
  assert.equal(await startLocal(system), 1);
  assert.doesNotMatch(system.logs.slice(logCount).join(' '), /sono sani|synthetic-sensitive|15555550102/);
  system.failCommand('npm');
  logCount = system.logs.length;
  assert.equal(await startLocal(system), 1);
  assert.doesNotMatch(system.logs.slice(logCount).join(' '), /sono sani|synthetic-sensitive/);
  system.failCommand('');
  system.put('.env', configuration.replace('POSTGRES_PORT=55432', 'POSTGRES_PORT=70000'));
  assert.equal(await startLocal(system), 1);
  system.put('.env', configuration.replace('synthetic-admin-password', 'different-admin-password'));
  assert.equal(await startLocal(system), 1);
  assert.match(system.errors.at(-1) ?? '', /non corrisponde/);
  assert.equal(system.content('.local/secrets/db-admin'), password);
  system.put('.env', configuration.replace('WHATSAPP_ALLOWED_USERS=15555550102', 'WHATSAPP_ALLOWED_USERS='));
  assert.equal(await startLocal(system), 1);
  assert.match(system.errors.at(-1) ?? '', /WHATSAPP_ALLOWED_USERS/);
  system.mode('.env', 0o644);
  assert.equal(await startLocal(system), 1);
});
