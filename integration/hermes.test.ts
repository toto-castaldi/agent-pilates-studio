import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { Client } from 'pg';

test('Hermes native WhatsApp and SQL tool run with restricted data and logs', { timeout: 240_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pilates-stack-test-'));
  const project = `pilates-stack-${randomBytes(8).toString('hex')}`;
  const databasePassword = randomBytes(32).toString('hex');
  const secrets: Record<string, string> = {
    'db-admin': randomBytes(32).toString('hex'),
    'db-migrator': databasePassword,
    'db-agent': randomBytes(32).toString('hex'),
    'openrouter-key': 'synthetic-model-token',
    'whatsapp-access-token': 'synthetic-access-token',
    'whatsapp-app-secret': 'synthetic-app-secret',
    'whatsapp-verify-token': 'synthetic-verify-token',
    'whatsapp-allowed-users': '15555550102',
    'whatsapp-phone-number-id': '123456789012345',
  };
  const override = join(directory, 'compose.override.yaml');
  const env = {
    ...process.env,
    SECRETS_DIR: directory,
    POSTGRES_PORT: '0',
    WHATSAPP_WEBHOOK_PORT: '0',
    PILATES_MODEL: 'openai/gpt-6.1-terra',
  };
  const compose = (...args: string[]) =>
    execFileSync('docker', ['compose', '-p', project, '-f', 'compose.yaml', '-f', override, ...args], {
      env,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 150_000,
    });
  let migrator: Client | undefined;
  let imageBuilt = false;
  try {
    await Promise.all(Object.entries(secrets).map(([name, value]) => writeFile(join(directory, name), value, { mode: 0o600 })));
    await writeFile(override, 'networks:\n  default:\n    internal: true\n');
    compose('build', 'hermes');
    imageBuilt = true;
    compose('up', '-d', '--wait', 'postgres');
    compose('run', '--rm', 'db-bootstrap');
    const databaseId = compose('ps', '-q', 'postgres').trim();
    const address = (container: string) => execFileSync('docker', ['inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', container], { encoding: 'utf8' }).trim();
    const postgresHost = address(databaseId);
    assert.ok(postgresHost);
    const migrationUrl = new URL(`postgresql://${postgresHost}:5432/studio?schema=public`);
    migrationUrl.username = 'studio_migrator';
    migrationUrl.password = databasePassword;
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
      env: { ...env, DATABASE_URL: migrationUrl.toString() },
      stdio: 'pipe',
      timeout: 90_000,
    });
    migrator = new Client({ host: postgresHost, port: 5432, database: 'studio', user: 'studio_migrator', password: databasePassword });
    await migrator.connect();
    await migrator.query('CREATE TABLE app.stack_probe (id int PRIMARY KEY, value text NOT NULL)');
    compose('up', '-d', '--wait', '--wait-timeout', '120', 'hermes');
    const gatewayId = compose('ps', '-q', 'hermes').trim();
    const gatewayHost = address(gatewayId);
    assert.ok(gatewayId && gatewayHost);

    const python = [
      'import json',
      'from hermes_cli.plugins import discover_plugins',
      'from hermes_cli.config import load_config',
      'from hermes_cli.tools_config import _get_platform_tools',
      'from tools.registry import registry',
      'discover_plugins()',
      'config = load_config()',
      "calls = [{'query': 'SELECT current_user AS role'}, {'query': 'INSERT INTO app.stack_probe VALUES ($1, $2)', 'parameters': [1, 'synthetic']}, {'query': 'UPDATE app.stack_probe SET value = $1 WHERE id = $2', 'parameters': ['updated', 1]}, {'query': 'DELETE FROM app.stack_probe WHERE id = $1', 'parameters': [1]}, {'query': 'CREATE TABLE app.forbidden (id int)'}, {'query': 'SELECT * FROM public._prisma_migrations'}]",
      "print(json.dumps({'loaded': registry.get_entry('studio_sql_query') is not None, 'enabled': 'studio-postgres' in _get_platform_tools(config, 'whatsapp_cloud'), 'model': config.get('model'), 'results': [json.loads(registry.dispatch('studio_sql_query', call)) for call in calls]}))",
    ].join('\n');
    const result = execFileSync('docker', [
      'exec', '--user', '10000', '-e', 'PILATES_DB_PASSWORD_FILE=/run/pilates-agent/db_agent', gatewayId,
      '/opt/hermes/.venv/bin/python', '-c', python,
    ], { encoding: 'utf8', stdio: 'pipe', timeout: 90_000 });
    const tool = JSON.parse(result) as { loaded: boolean; enabled: boolean; model: { default: string; provider: string }; results: Array<{ rows?: Array<Record<string, unknown>>; status?: string; sqlstate?: string }> };
    assert.equal(tool.loaded, true);
    assert.equal(tool.enabled, true);
    assert.equal(tool.model.default, 'openai/gpt-6.1-terra');
    assert.equal(tool.model.provider, 'openrouter');
    assert.equal(tool.results[0].rows?.[0].role, 'studio_agent');
    assert.equal(tool.results[1].status, 'INSERT 0 1');
    assert.equal(tool.results[2].status, 'UPDATE 1');
    assert.equal(tool.results[3].status, 'DELETE 1');
    assert.deepEqual(tool.results.slice(4).map((item) => item.sqlstate), ['42501', '42501']);
    execFileSync('docker', ['exec', gatewayId, 'sh', '-c', 'test ! -e /run/secrets/db_migrator && test ! -e /run/secrets/db_admin'], { stdio: 'pipe' });

    const endpoint = `http://${gatewayHost}:8090/whatsapp/webhook`;
    assert.equal((await fetch(`${endpoint}?hub.mode=subscribe&hub.verify_token=synthetic-verify-token&hub.challenge=ok`)).status, 200);
    assert.equal((await fetch(`${endpoint}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=ok`)).status, 403);
    const payload = (sender: string, type: 'text' | 'interactive', text: string) => {
      const message = type === 'text'
        ? { from: sender, id: `wamid.synthetic.${text}`, type, text: { body: text } }
        : { from: sender, id: 'wamid.synthetic.tap', type, interactive: { type: 'button_reply', button_reply: { id: 'cl:x:1', title: 'synthetic' } } };
      return JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: '999999', changes: [{ field: 'messages', value: { metadata: { phone_number_id: '123456789012345' }, messages: [message] } }] }] });
    };
    const denied = payload('15555550101', 'text', 'synthetic-unauthorized-message');
    const signed = (body: string) => `sha256=${createHmac('sha256', secrets['whatsapp-app-secret']).update(body).digest('hex')}`;
    const post = (body: string, signature?: string) => fetch(endpoint, {
      method: 'POST', body, headers: { 'content-type': 'application/json', ...(signature ? { 'x-hub-signature-256': signature } : {}) },
    });
    assert.equal((await post(denied)).status, 401);
    assert.equal((await post(denied, `sha256=${'0'.repeat(64)}`)).status, 401);
    assert.equal((await post(denied, signed(denied))).status, 200);
    const tap = payload('15555550101', 'interactive', '');
    assert.equal((await post(tap, signed(tap))).status, 200);
    const allowed = payload('15555550102', 'text', 'synthetic-allowed-message');
    assert.equal((await post(allowed, signed(allowed))).status, 200);
    await delay(8_000);

    for (const container of [databaseId, gatewayId]) {
      const logDriver = execFileSync('docker', ['inspect', '--format', '{{.HostConfig.LogConfig.Type}}', container], { encoding: 'utf8' }).trim();
      assert.equal(logDriver, 'none');
    }
    const inspection = [
      'import json',
      'from pathlib import Path',
      "bad = [b'15555550101', b'15555550102', b'synthetic-unauthorized-message', b'synthetic-allowed-message', b'synthetic-app-secret', b'synthetic-access-token']",
      "logs = b''.join(p.read_bytes() for p in Path('/opt/data/logs').rglob('*') if p.is_file())",
      "state = b''.join(p.read_bytes() for p in Path('/opt/data').glob('state.db*') if p.is_file())",
      "print(json.dumps({'logs_clean': not any(x in logs for x in bad), 'unauthorized_absent': b'synthetic-unauthorized-message' not in state, 'authorized_present': b'synthetic-allowed-message' in state}))",
    ].join('\n');
    const privacy = JSON.parse(execFileSync('docker', ['exec', gatewayId, '/opt/hermes/.venv/bin/python', '-c', inspection], { encoding: 'utf8', stdio: 'pipe' })) as { logs_clean: boolean; unauthorized_absent: boolean; authorized_present: boolean };
    assert.equal(privacy.logs_clean, true);
    assert.equal(privacy.unauthorized_absent, true);
    assert.equal(privacy.authorized_present, true);
  } finally {
    await migrator?.end();
    try {
      compose('down', '--volumes', '--remove-orphans');
    } finally {
      if (imageBuilt) spawnSync('docker', ['image', 'rm', `${project}-hermes`], { stdio: 'ignore' });
      await rm(directory, { recursive: true, force: true });
    }
  }
});
