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
WHATSAPP_HOME_CHANNEL=15555550102
WHATSAPP_PHONE_NUMBER_ID=123456789
`;

test('local start validates configuration, preserves secrets and suppresses child output in memory', async () => {
  const system = memorySystem();
  system.put('.env', configuration);
  assert.equal(await startLocal(system), 0);
  const password = system.content('.local/secrets/db-admin');
  assert.equal(await startLocal(system), 0);
  assert.equal(system.content('.local/secrets/db-admin'), password);
  assert.ok(system.calls.some((call) => call.args.includes('--force-recreate') && call.args.includes('--no-deps') && call.args.includes('hermes')));
  assert.ok(system.calls.every((call) => call.stdio === 'ignore'));
  assert.ok(system.calls.every((call) => call.env.DB_ADMIN_PASSWORD === undefined && call.env.WHATSAPP_HOME_CHANNEL === undefined));
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
  for (const value of ['', '15555550103', '15555550102,15555550103']) {
    system.put('.env', configuration.replace('WHATSAPP_HOME_CHANNEL=15555550102', `WHATSAPP_HOME_CHANNEL=${value}`));
    assert.equal(await startLocal(system), 1);
    assert.doesNotMatch(system.errors.at(-1) ?? '', /1555555010[23]/);
  }
  system.mode('.env', 0o644);
  assert.equal(await startLocal(system), 1);
});

test('local start follows only the configuration link and validates the opened file', async () => {
  const system = memorySystem();
  system.put('private.env', configuration);
  system.link('.env', 'private.env');
  assert.equal(await startLocal(system), 0);
  assert.equal(system.content('private.env'), configuration);
  system.mode('private.env', 0o644);
  const calls = system.calls.length;
  assert.equal(await startLocal(system), 1);
  assert.equal(system.calls.length, calls);
  system.link('.env', 'missing.env');
  assert.equal(await startLocal(system), 1);
  await system.mkdir('directory', { mode: 0o700 });
  system.link('.env', 'directory');
  assert.equal(await startLocal(system), 1);
  system.link('.env', 'private.env');
  system.mode('private.env', 0o600);
  system.link('.local/secrets/db-admin', 'other-secret');
  assert.equal(await startLocal(system), 1);
  assert.doesNotMatch([...system.logs, ...system.errors].join(' '), /synthetic-sensitive|15555550102/);
});

test('configuration validation and reading use the same opened file', async () => {
  const system = memorySystem();
  system.put('private.env', configuration);
  system.put('other.env', configuration.replace('POSTGRES_PORT=55432', 'POSTGRES_PORT=70000'), 0o644);
  system.link('.env', 'private.env');
  const open = system.open;
  system.open = async (path: string) => {
    const handle = await open(path);
    system.link('.env', 'other.env');
    return handle;
  };
  assert.equal(await startLocal(system), 0);
});
