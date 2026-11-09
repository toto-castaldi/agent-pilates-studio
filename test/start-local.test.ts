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
  assert.ok(system.calls.every((call) => call.stdio === 'ignore' || (Array.isArray(call.stdio) && call.stdio.join(',') === 'ignore,pipe,ignore')));
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
  for (const value of ['', '0', '-5', '1.5', 'quattro']) {
    system.put('.env', `${configuration}PILATES_IDLE_COMPACT_SECONDS=${value}\n`);
    assert.equal(await startLocal(system), 1);
    assert.equal(system.errors.at(-1), 'Avvio non riuscito: PILATES_IDLE_COMPACT_SECONDS non valido: indicare secondi interi positivi.');
  }
  system.mode('.env', 0o644);
  assert.equal(await startLocal(system), 1);
});

test('external configuration is replaced only after both services stop and both are recreated', async () => {
  const system = memorySystem();
  system.put('.env', configuration);
  assert.equal(await startLocal(system), 0);
  const internal = system.content('.local/secrets/bridge-token');
  const changed = configuration
    .replace('synthetic-sensitive-model-token', 'new-synthetic-model-token')
    .replace('synthetic-sensitive-app-secret', 'new-synthetic-app-secret')
    .replace('WHATSAPP_ALLOWED_USERS=15555550102', 'WHATSAPP_ALLOWED_USERS=15555550103')
    .replace('WHATSAPP_HOME_CHANNEL=15555550102', 'WHATSAPP_HOME_CHANNEL=15555550103');
  system.put('.env', changed);
  const start = system.calls.length;
  assert.equal(await startLocal(system), 0);
  assert.equal(system.content('.local/secrets/whatsapp-allowed-users'), '15555550103\n');
  assert.equal(system.content('.local/secrets/whatsapp-app-secret'), 'new-synthetic-app-secret\n');
  assert.equal(system.content('.local/secrets/bridge-token'), internal);
  const calls = system.calls.slice(start);
  assert.deepEqual(calls.filter((call) => call.args.includes('kill') || call.args.includes('stop')).slice(0, 2).map((call) => call.args.slice(-2)), [['SIGKILL', 'hermes'], ['stop', 'author-broker']]);
  assert.ok(calls.some((call) => call.args.includes('--force-recreate') && call.args.includes('author-broker')));
  assert.ok(calls.some((call) => call.args.includes('--force-recreate') && call.args.includes('hermes')));
  const count = system.calls.length;
  system.put('.env', changed.replace('synthetic-admin-password', 'different-admin-password').replace('15555550103', '15555550104'));
  assert.equal(await startLocal(system), 1);
  assert.equal(system.calls.length, count);
  assert.equal(system.content('.local/secrets/whatsapp-allowed-users'), '15555550103\n');
});

test('production project and volumes are refused before any service or secret changes', async () => {
  const resolvedProjects = [
    { name: 'agent-pilates-prod', volumes: { postgres_data: { name: 'synthetic_postgres_data' } } },
    { name: 'synthetic-dev', volumes: { postgres_data: { name: 'agent-pilates-prod_postgres_data' } } },
    { name: 'synthetic-dev', volumes: { postgres_data: { name: 'synthetic_postgres_data' }, hermes_data: { name: 'agent-pilates-prod_hermes_data' } } },
  ];
  for (const project of resolvedProjects) {
    const system = memorySystem();
    system.put('.env', configuration);
    const spawn = system.spawnSync;
    system.spawnSync = (command, args, options) => {
      const result = spawn(command, args, options);
      return args.includes('config') ? { ...result, stdout: JSON.stringify(project) } : result;
    };
    assert.equal(await startLocal(system), 1);
    assert.match(system.errors.at(-1) ?? '', /produzione/);
    assert.deepEqual(system.calls.filter((call) => !call.args.includes('config')), []);
    assert.equal(system.content('.local/secrets/whatsapp-app-secret'), undefined);
  }
});

test('volume prefix reaches Compose only when valid', async () => {
  const system = memorySystem();
  system.put('.env', `${configuration}PILATES_VOLUME_PREFIX=synthetic-dev\n`);
  assert.equal(await startLocal(system), 0);
  assert.ok(system.calls.every((call) => call.env.PILATES_VOLUME_PREFIX === 'synthetic-dev'));
  for (const value of ['../escape', 'Upper', '-dash']) {
    system.put('.env', `${configuration}PILATES_VOLUME_PREFIX=${value}\n`);
    assert.equal(await startLocal(system), 1);
    assert.equal(system.errors.at(-1), 'Avvio non riuscito: PILATES_VOLUME_PREFIX non valido.');
  }
});

test('missing database credential with an existing volume is never reconstructed', async () => {
  const system = memorySystem();
  system.put('.env', configuration);
  const spawn = system.spawnSync;
  system.spawnSync = (command, args, options) => {
    const result = spawn(command, args, options);
    return args.includes('volume') ? { ...result, stdout: 'synthetic_postgres_data\n' } : result;
  };
  assert.equal(await startLocal(system), 1);
  assert.match(system.errors.at(-1) ?? '', /Segreto database mancante/);
  assert.equal(system.content('.local/secrets/db-admin'), undefined);
  assert.equal(system.calls.some((call) => call.args.includes('stop')), false);
});

test('database authentication failure precedes external changes and service shutdown', async () => {
  const system = memorySystem();
  system.put('.env', configuration);
  assert.equal(await startLocal(system), 0);
  const spawn = system.spawnSync;
  system.spawnSync = (command, args, options) => {
    const result = spawn(command, args, options);
    if (args.includes('volume')) return { ...result, stdout: 'synthetic_postgres_data\n' };
    if (args.includes('db-bootstrap') && args.includes('--entrypoint')) return { ...result, status: 1 };
    return result;
  };
  system.put('.env', configuration.replace('synthetic-sensitive-app-secret', 'new-synthetic-app-secret'));
  const before = system.calls.length;
  assert.equal(await startLocal(system), 1);
  assert.equal(system.content('.local/secrets/whatsapp-app-secret'), 'synthetic-sensitive-app-secret\n');
  assert.equal(system.calls.slice(before).some((call) => call.args.includes('kill')), false);
});

test('temporary database probe is removed even when role authentication fails', async () => {
  const system = memorySystem();
  system.put('.env', configuration);
  assert.equal(await startLocal(system), 0);
  const spawn = system.spawnSync;
  system.spawnSync = (command, args, options) => {
    const result = spawn(command, args, options);
    if (args.includes('volume')) return { ...result, stdout: 'synthetic_postgres_data\n' };
    if (args.includes('ps')) return { ...result, stdout: '' };
    if (args.includes('db-bootstrap') && args.includes('--entrypoint')) return { ...result, status: 1 };
    return result;
  };
  const before = system.calls.length;
  assert.equal(await startLocal(system), 1);
  const calls = system.calls.slice(before);
  assert.ok(calls.some((call) => call.args.includes('--use-aliases')));
  assert.deepEqual(calls.slice(-2).map((call) => call.args[0]), ['stop', 'rm']);
  assert.equal(calls.some((call) => call.args.includes('kill')), false);
});

test('failed application and failed gateway startup stop both services', async () => {
  const system = memorySystem();
  system.put('.env', configuration);
  assert.equal(await startLocal(system), 0);
  const spawn = system.spawnSync;
  let failGateway = true;
  system.spawnSync = (command, args, options) => {
    const result = spawn(command, args, options);
    if (failGateway && args.includes('up') && args.includes('hermes')) { failGateway = false; return { status: 1, stdout: '' }; }
    return result;
  };
  const count = system.calls.length;
  assert.equal(await startLocal(system), 1);
  assert.deepEqual(system.calls.slice(count).slice(-2).map((call) => call.args.slice(-2)), [['SIGKILL', 'hermes'], ['stop', 'author-broker']]);
  const rename = system.rename;
  system.rename = async () => { throw new Error('synthetic write failure'); };
  const before = system.calls.length;
  assert.equal(await startLocal(system), 1);
  assert.deepEqual(system.calls.slice(before).slice(-2).map((call) => call.args.slice(-2)), [['SIGKILL', 'hermes'], ['stop', 'author-broker']]);
  system.rename = rename;
  assert.doesNotMatch([...system.logs, ...system.errors].join(' '), /synthetic-sensitive|15555550102/);
});

test('local start passes the default or configured inactivity interval to Compose', async () => {
  const system = memorySystem();
  system.put('.env', configuration);
  assert.equal(await startLocal(system), 0);
  assert.ok(system.calls.filter((call) => call.command === 'docker').every((call) => call.env.PILATES_IDLE_COMPACT_SECONDS === '14400'));
  system.put('.env', `${configuration}PILATES_IDLE_COMPACT_SECONDS=1800\n`);
  const before = system.calls.length;
  assert.equal(await startLocal(system), 0);
  assert.ok(system.calls.slice(before).filter((call) => call.command === 'docker').every((call) => call.env.PILATES_IDLE_COMPACT_SECONDS === '1800'));
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
