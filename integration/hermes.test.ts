import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { access, appendFile, chmod, cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { Client } from 'pg';

test('Hermes native WhatsApp and SQL tool run with restricted data and logs', { timeout: 360_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pilates-stack-test-'));
  const project = `pilates-stack-${randomBytes(8).toString('hex')}`;
  const recoveryProject = `pilates-recovery-${randomBytes(8).toString('hex')}`;
  const corruptProject = `pilates-corrupt-${randomBytes(8).toString('hex')}`;
  const databasePassword = randomBytes(32).toString('hex');
  const secrets: Record<string, string> = {
    'db-admin': randomBytes(32).toString('hex'),
    'db-migrator': databasePassword,
    'db-agent': randomBytes(32).toString('hex'),
    'db-broker': randomBytes(32).toString('hex'),
    'bridge-token': randomBytes(32).toString('hex'),
    'openrouter-key': 'synthetic-model-token',
    'whatsapp-access-token': 'synthetic-access-token',
    'whatsapp-app-secret': 'synthetic-app-secret',
    'whatsapp-verify-token': 'synthetic-verify-token',
    'whatsapp-allowed-users': '15555550102',
    'whatsapp-home-channel': '15555550102',
    'whatsapp-phone-number-id': '123456789012345',
  };
  const override = join(directory, 'compose.override.yaml');
  const env = {
    ...process.env,
    COMPOSE_ENV_FILES: '/dev/null',
    SECRETS_DIR: directory,
    POSTGRES_PORT: '0',
    WHATSAPP_WEBHOOK_PORT: '0',
    WHATSAPP_WEBHOOK_PATH: '/webhooks/whatsapp',
    PILATES_MODEL: 'synthetic/test-model',
  };
  const compose = (...args: string[]) =>
    execFileSync('docker', ['compose', '-p', project, '-f', 'compose.yaml', '-f', override, ...args], {
      env,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 150_000,
    });
  const recoveryCompose = (...args: string[]) =>
    execFileSync('docker', ['compose', '-p', recoveryProject, '-f', 'compose.yaml', ...args], {
      env,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 150_000,
    });
  let migrator: Client | undefined;
  let restored: Client | undefined;
  let restoredAgent: Client | undefined;
  let imageBuilt = false;
  try {
    await Promise.all(Object.entries(secrets).map(([name, value]) => writeFile(join(directory, name), value, { mode: 0o600 })));
    // The gateway derives its compaction threshold from a model catalog at start.
    await writeFile(override, `services:\n  model-stub:\n    image: ${project}-hermes\n    entrypoint: ["/opt/hermes/.venv/bin/python", "/model_stub.py"]\n    volumes:\n      - ${JSON.stringify(`${resolve('integration/model_stub.py')}:/model_stub.py:ro`)}\n    logging:\n      driver: none\n  hermes:\n    environment:\n      OPENROUTER_BASE_URL: http://model-stub:8088/v1\nnetworks:\n  default:\n    internal: true\n`);
    compose('build', 'hermes');
    imageBuilt = true;
    compose('up', '-d', '--wait', 'postgres', 'model-stub');
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
    const allowlistFile = join(directory, 'whatsapp-allowed-users');
    const assertSafePreflight = () => assert.throws(() => compose('run', '--rm', '--no-deps', 'hermes'), (error: unknown) => {
      const output = error as { stdout?: string; stderr?: string };
      const combined = `${output.stdout ?? ''}${output.stderr ?? ''}`;
      assert.match(combined, /hermes_preflight_failed/);
      assert.doesNotMatch(combined, /synthetic-app-secret|synthetic-access-token|synthetic-invalid-allowlist|1555555010[23]/);
      return true;
    });
    try {
      await writeFile(allowlistFile, '');
      assertSafePreflight();
      await writeFile(allowlistFile, 'synthetic-invalid-allowlist');
      assertSafePreflight();
      await writeFile(allowlistFile, secrets['whatsapp-allowed-users']);
      await chmod(allowlistFile, 0o644);
      assertSafePreflight();
    } finally {
      await chmod(allowlistFile, 0o600);
      await writeFile(allowlistFile, secrets['whatsapp-allowed-users']);
    }
    const homeFile = join(directory, 'whatsapp-home-channel');
    try {
      await writeFile(homeFile, '');
      assertSafePreflight();
      await writeFile(homeFile, '15555550103');
      assertSafePreflight();
    } finally {
      await writeFile(homeFile, secrets['whatsapp-home-channel']);
    }
    compose('up', '-d', '--wait', '--wait-timeout', '120', 'hermes');
    const gatewayId = compose('ps', '-q', 'hermes').trim();
    const gatewayHost = address(gatewayId);
    assert.ok(gatewayId && gatewayHost);
    const brokerId = compose('ps', '-q', 'author-broker').trim();
    const brokerHost = address(brokerId);
    const proof = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: {
      metadata: { phone_number_id: secrets['whatsapp-phone-number-id'] },
      contacts: [{ wa_id: '15555550102', profile: { name: 'Synthetic Profile' } }],
      messages: [{ from: '15555550102', id: 'wamid.synthetic.tool', timestamp: String(Math.floor(Date.now() / 1000)), type: 'text' }],
    } }] }] });
    const signature = `sha256=${createHmac('sha256', secrets['whatsapp-app-secret']).update(proof).digest('hex')}`;
    assert.equal((await fetch(`http://${brokerHost}:8091/v1/evidence`, { method: 'POST', body: proof, headers: { 'X-Pilates-Bridge': secrets['bridge-token'], 'X-Hub-Signature-256': signature } })).status, 204);
    execFileSync('docker', ['exec', gatewayId, 'sh', '-c', 'test ! -e /run/secrets/db_broker'], { stdio: 'pipe' });
    execFileSync('docker', ['exec', brokerId, 'sh', '-c', 'test ! -e /run/secrets/db_agent && test ! -e /run/secrets/db_migrator && test ! -e /run/secrets/db_admin'], { stdio: 'pipe' });

    const python = [
      'import json, secrets',
      'from pilates_trusted import current_turn',
      'from hermes_cli.plugins import discover_plugins',
      'from hermes_cli.config import load_config',
      'from hermes_cli.tools_config import _get_platform_tools',
      'from tools.registry import registry',
      'discover_plugins()',
      'config = load_config()',
      "calls = [{'query': 'SELECT current_user AS role'}, {'query': 'INSERT INTO app.stack_probe VALUES ($1, $2)', 'parameters': [1, 'synthetic']}, {'query': 'UPDATE app.stack_probe SET value = $1 WHERE id = $2', 'parameters': ['updated', 1]}, {'query': 'DELETE FROM app.stack_probe WHERE id = $1', 'parameters': [1]}, {'query': 'CREATE TABLE app.forbidden (id int)'}, {'query': 'SELECT * FROM public._prisma_migrations'}]",
      "untrusted = json.loads(registry.dispatch('studio_sql_query', calls[0]))",
      "current_turn.set(('wamid.synthetic.tool', '15555550102', secrets.token_hex(32)))",
      "print(json.dumps({'loaded': registry.get_entry('studio_sql_query') is not None, 'enabled': sorted(_get_platform_tools(config, 'whatsapp_cloud')), 'untrusted': untrusted, 'model': config.get('model'), 'results': [json.loads(registry.dispatch('studio_sql_query', call)) for call in calls]}))",
    ].join('\n');
    const result = execFileSync('docker', [
      'exec', '--user', '10000', '-e', 'PILATES_DB_PASSWORD_FILE=/run/pilates-agent/db_agent', gatewayId,
      '/opt/hermes/.venv/bin/python', '-c', python,
    ], { encoding: 'utf8', stdio: 'pipe', timeout: 90_000 });
    const tool = JSON.parse(result) as { loaded: boolean; enabled: string[]; untrusted: { error?: string }; model: { default: string; provider: string }; results: Array<{ rows?: Array<Record<string, unknown>>; status?: string; sqlstate?: string }> };
    assert.equal(tool.loaded, true);
    assert.deepEqual(tool.enabled, ['studio-postgres']);
    assert.equal(tool.untrusted.error, 'An authenticated WhatsApp turn is required.');
    assert.equal(tool.model.default, env.PILATES_MODEL);
    assert.equal(tool.model.provider, 'openrouter');
    assert.equal(tool.results[0].rows?.[0].role, 'studio_agent');
    assert.equal(tool.results[1].status, 'INSERT 0 1');
    assert.equal(tool.results[2].status, 'UPDATE 1');
    assert.equal(tool.results[3].status, 'DELETE 1');
    assert.deepEqual(tool.results.slice(4).map((item) => item.sqlstate), ['42501', '42501']);
    execFileSync('docker', ['exec', gatewayId, 'sh', '-c', 'test ! -e /run/secrets/db_migrator && test ! -e /run/secrets/db_admin'], { stdio: 'pipe' });

    const endpoint = `http://${gatewayHost}:8090/webhooks/whatsapp`;
    assert.equal((await fetch(`http://${gatewayHost}:8090/whatsapp/webhook`)).status, 404);
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
    await assert.rejects(migrator.query("SELECT 'synthetic-postgres-credential'::integer"), (error: unknown) => {
      assert.equal((error as { code?: string }).code, '22P02');
      return true;
    });

    for (const [container, expected] of [[databaseId, 'postgres_launch'], [gatewayId, 'hermes_launch']]) {
      const logDriver = execFileSync('docker', ['inspect', '--format', '{{.HostConfig.LogConfig.Type}}', container], { encoding: 'utf8' }).trim();
      assert.equal(logDriver, 'local');
      const options = JSON.parse(execFileSync('docker', ['inspect', '--format', '{{json .HostConfig.LogConfig.Config}}', container], { encoding: 'utf8' })) as Record<string, string>;
      assert.equal(options['max-size'], '1m');
      assert.equal(options['max-file'], '3');
      const log = execFileSync('docker', ['logs', container], { encoding: 'utf8', stdio: 'pipe' });
      assert.deepEqual(log.trim().split('\n'), [expected]);
      for (const forbidden of [...Object.values(secrets), '15555550101', '15555550102', 'synthetic-unauthorized-message', 'synthetic-allowed-message', 'synthetic-postgres-credential']) {
        assert.equal(log.includes(forbidden), false);
      }
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

    const backupDirectory = join(directory, 'backup');
    const backup = () => execFileSync('bash', ['scripts/backup.sh', project, backupDirectory], {
      env, encoding: 'utf8', stdio: 'pipe', timeout: 150_000,
    });
    const restore = (target: string, archive: string) => execFileSync('bash', ['scripts/restore.sh', target, archive], {
      env, encoding: 'utf8', stdio: 'pipe', timeout: 180_000,
    });
    const expectFailure = (operation: () => unknown, message: RegExp) => assert.throws(operation, (error: unknown) => {
      assert.match(String((error as { stderr?: string }).stderr), message);
      return true;
    });
    // Refuse to snapshot a live gateway or overwrite existing resources.
    expectFailure(backup, /Stop Hermes before taking a backup/);
    await assert.rejects(access(backupDirectory));
    await migrator.query("INSERT INTO app.stack_probe VALUES (77, 'backup-synthetic')");
    compose('stop', 'hermes');
    expectFailure(backup, /Stop author-broker before taking a backup/);
    compose('stop', 'author-broker');
    // A backup must never restore an ephemeral PID/transaction binding.
    await migrator.query("INSERT INTO studio_private.author_context VALUES (1, 1, '15555550102', 'Synthetic Profile', clock_timestamp() + interval '1 hour')");

    // Rehearse persistence across a restart and a same-image container replacement.
    await migrator.end();
    migrator = undefined;
    const sourceImage = execFileSync('docker', ['inspect', '--format', '{{.Image}}', databaseId], { encoding: 'utf8' }).trim();
    compose('restart', 'postgres');
    compose('up', '-d', '--wait', 'postgres');
    compose('up', '-d', '--force-recreate', '--wait', 'postgres');
    const newDatabaseId = compose('ps', '-q', 'postgres').trim();
    assert.notEqual(newDatabaseId, databaseId);
    assert.equal(execFileSync('docker', ['inspect', '--format', '{{.Image}}', newDatabaseId], { encoding: 'utf8' }).trim(), sourceImage);
    assert.equal(execFileSync('docker', ['logs', newDatabaseId], { encoding: 'utf8', stdio: 'pipe' }).trim(), 'postgres_launch');
    migrator = new Client({ host: address(newDatabaseId), port: 5432, database: 'studio', user: 'studio_migrator', password: databasePassword });
    await migrator.connect();
    assert.equal((await migrator.query('SELECT value FROM app.stack_probe WHERE id = 77')).rows[0].value, 'backup-synthetic');
    backup();
    expectFailure(backup, /backup directory must be new/);
    expectFailure(() => restore(project, backupDirectory), /Target project has containers/);

    const damaged = join(directory, 'damaged');
    await cp(backupDirectory, damaged, { recursive: true });
    await appendFile(join(damaged, 'postgres.dump'), 'corruption');
    expectFailure(() => restore(corruptProject, damaged), /Backup checksum verification failed/);
    const damagedVolume = join(directory, 'damaged-volume');
    await cp(backupDirectory, damagedVolume, { recursive: true });
    await appendFile(join(damagedVolume, 'hermes.tar'), 'corruption');
    expectFailure(() => restore(corruptProject, damagedVolume), /Backup checksum verification failed/);
    await chmod(join(directory, 'db-migrator'), 0o644);
    try {
      expectFailure(() => restore(corruptProject, backupDirectory), /database secret has insecure permissions/);
    } finally {
      await chmod(join(directory, 'db-migrator'), 0o600);
    }
    for (const resource of [['ps', '-aq'], ['volume', 'ls', '-q'], ['network', 'ls', '-q']]) {
      assert.equal(execFileSync('docker', [...resource, '--filter', `label=com.docker.compose.project=${corruptProject}`], { encoding: 'utf8' }).trim(), '');
    }

    restore(recoveryProject, backupDirectory);
    const restoredPort = Number(recoveryCompose('port', 'postgres', '5432').trim().split(':').at(-1));
    assert.ok(Number.isInteger(restoredPort) && restoredPort > 0);
    restored = new Client({ host: '127.0.0.1', port: restoredPort, database: 'studio', user: 'studio_migrator', password: databasePassword });
    await restored.connect();
    assert.equal((await restored.query('SELECT value FROM app.stack_probe WHERE id = 77')).rows[0].value, 'backup-synthetic');
    assert.equal(Number((await restored.query('SELECT count(*) FROM studio_private.author_context')).rows[0].count), 0);
    restoredAgent = new Client({ host: '127.0.0.1', port: restoredPort, database: 'studio', user: 'studio_agent', password: secrets['db-agent'] });
    await restoredAgent.connect();
    assert.equal((await restoredAgent.query('SELECT value FROM app.stack_probe WHERE id = 77')).rows[0].value, 'backup-synthetic');
    await assert.rejects(restoredAgent.query('CREATE TABLE app.restore_forbidden (id int)'), (error: unknown) => {
      assert.equal((error as { code?: string }).code, '42501');
      return true;
    });
    expectFailure(() => restore(recoveryProject, backupDirectory), /Target project has containers/);
    assert.equal((await restored.query('SELECT value FROM app.stack_probe WHERE id = 77')).rows[0].value, 'backup-synthetic');
    assert.equal(recoveryCompose('ps', '-q', '--status', 'running', 'hermes').trim(), '');

    // Compare the real Hermes SQLite files, ownership and integrity after restoring.
    const checkState = (volume: string) => {
      const pythonCheck = [
        'import hashlib, json, os, pathlib, shutil, sqlite3',
        "root = pathlib.Path('/data')",
        "files = sorted(root.glob('state.db*'))",
        "state = {p.name: {'hash': hashlib.sha256(p.read_bytes()).hexdigest(), 'uid': p.stat().st_uid, 'gid': p.stat().st_gid, 'mode': p.stat().st_mode & 0o777} for p in files if p.is_file()}",
        "assert 'state.db' in state",
        "copy = pathlib.Path('/tmp/state-copy'); copy.mkdir()",
        '[shutil.copyfile(p, copy / p.name) for p in files if p.is_file()]',
        "db = sqlite3.connect(str(copy / 'state.db'))",
        "assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'",
        'db.close()',
        'print(json.dumps(state, sort_keys=True))',
      ].join('\n');
      return JSON.parse(execFileSync('docker', [
        'run', '--rm', '--network', 'none', '--read-only', '--tmpfs', '/tmp:mode=1777',
        '--mount', `type=volume,src=${volume},dst=/data,readonly`,
        '--entrypoint', '/opt/hermes/.venv/bin/python',
        'nousresearch/hermes-agent:v0.22.7@sha256:e6d81ae52ebf6a43efa529701405509f20054ba818f179ddd748bed4f8af584c',
        '-c', pythonCheck,
      ], { encoding: 'utf8', stdio: 'pipe', timeout: 90_000 }));
    };
    assert.deepEqual(checkState(`${project}_hermes_data`), checkState(`${recoveryProject}_hermes_data`));
  } finally {
    await restoredAgent?.end();
    await restored?.end();
    await migrator?.end();
    try {
      try {
        recoveryCompose('down', '--volumes', '--remove-orphans');
      } finally {
        try {
          execFileSync('docker', ['compose', '-p', corruptProject, '-f', 'compose.yaml', 'down', '--volumes', '--remove-orphans'], { env, stdio: 'pipe', timeout: 150_000 });
        } finally {
          compose('down', '--volumes', '--remove-orphans');
        }
      }
    } finally {
      if (imageBuilt) spawnSync('docker', ['image', 'rm', `${project}-hermes`], { stdio: 'ignore' });
      await rm(directory, { recursive: true, force: true });
    }
  }
});
