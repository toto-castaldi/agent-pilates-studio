import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Client } from 'pg';

test('ops recovery compensates only the latest recovery when alignment fails', { timeout: 420_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'pilates-mrecover-'));
  const secretsDir = join(root, 'secrets');
  const project = `pilates-mrecover-${randomBytes(4).toString('hex')}`;
  const opsImage = `${project}-ops`;
  const phones = { a: '+15555550140', b: '+15555550141', c: '+15555550142' };
  const password = randomBytes(24).toString('hex');
  const secrets: Record<string, string> = {
    'db-admin': randomBytes(24).toString('hex'), 'db-migrator': password, 'db-agent': randomBytes(24).toString('hex'),
    'db-broker': randomBytes(24).toString('hex'), 'bridge-token': randomBytes(24).toString('hex'),
    'openrouter-key': 'synthetic', 'whatsapp-access-token': 'synthetic', 'whatsapp-app-secret': 'synthetic',
    'whatsapp-verify-token': 'synthetic', 'whatsapp-manager-phone': phones.c, 'whatsapp-phone-number-id': '123456789012345',
  };
  const envFile = join(root, 'local.env');
  const env = { ...process.env, COMPOSE_ENV_FILES: '/dev/null', SECRETS_DIR: secretsDir, POSTGRES_PORT: '0', WHATSAPP_WEBHOOK_PORT: '0' };
  const compose = (...args: string[]) => execFileSync('docker', ['compose', '-p', project, '-f', 'compose.yaml', ...args], { env, encoding: 'utf8', stdio: 'pipe', timeout: 180_000 });
  let migrator: Client | undefined;
  let broker: Client | undefined;
  try {
    await mkdir(secretsDir, { recursive: true, mode: 0o700 });
    await chmod(root, 0o700);
    await Promise.all(Object.entries(secrets).map(([name, value]) => writeFile(join(secretsDir, name), `${value}\n`, { mode: 0o600 })));
    await writeFile(join(root, 'prod.env'), 'POSTGRES_PORT=55433\nWHATSAPP_WEBHOOK_PORT=18190\nWHATSAPP_WEBHOOK_PATH=/whatsapp/webhook\n', { mode: 0o600 });
    await writeFile(envFile, `OTHER=synthetic\nPILATES_MANAGER_PHONE=${phones.c}\n`, { mode: 0o600 });
    await writeFile(join(root, 'mv-fault'), `#!/bin/sh
dest=
for arg in "$@"; do dest=$arg; done
if [ "$dest" = "$FAULT_ENV" ] && [ ! -e "$FAULT_MARK" ]; then
  touch "$FAULT_MARK"
  exit 1
fi
exec /bin/mv "$@"
`, { mode: 0o755 });
    compose('up', '-d', '--wait', 'postgres');
    compose('run', '--rm', 'db-bootstrap');
    const published = compose('port', 'postgres', '5432').trim();
    const port = Number(published.slice(published.lastIndexOf(':') + 1));
    const url = new URL(`postgresql://127.0.0.1:${port}/studio?schema=public`);
    url.username = 'studio_migrator';
    url.password = password;
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: { ...env, DATABASE_URL: url.toString() }, stdio: 'pipe', timeout: 120_000 });
    migrator = new Client({ host: '127.0.0.1', port, database: 'studio', user: 'studio_migrator', password });
    broker = new Client({ host: '127.0.0.1', port, database: 'studio', user: 'studio_broker', password: secrets['db-broker'] });
    await migrator.connect();
    await broker.connect();
    const mutate = (sender: string, manager: string, operation: string, id: string | null, first: string | null, last: string | null, phone: string | null) =>
      broker?.query('SELECT * FROM studio_private.manage_teacher_identity($1,$2,$3,$4,$5,$6,$7)', [sender, manager, operation, id, first, last, phone]);
    const a = String((await mutate('15555550140', phones.a, 'bootstrap', null, 'Alpha', 'Synthetic', phones.a))?.rows[0].id);
    await mutate('15555550140', phones.a, 'enroll', null, 'Beta', 'Synthetic', phones.b);
    const c = String((await mutate('15555550140', phones.a, 'enroll', null, 'Gamma', 'Synthetic', phones.c))?.rows[0].id);
    await migrator.query("SELECT studio_private.operator_manager_change('transfer', $1, $2)", [phones.a, phones.b]);
    await migrator.query("SELECT studio_private.operator_manager_change('transfer', $1, $2)", [phones.b, phones.c]);
    execFileSync('docker', ['build', '-f', 'scripts/ops.Dockerfile', '--build-arg', `PILATES_RELEASE=${'a'.repeat(40)}`, '-t', opsImage, '.'], { stdio: 'pipe', timeout: 180_000 });
    const faultMark = join(root, 'fault-mark');
    const run = () => spawnSync('docker', ['run', '--rm', '--network', 'none', '--env', `PILATES_HOME=${root}`, '--env', `PILATES_PROJECT=${project}`, '--env', 'COMPOSE_ENV_FILES=/dev/null', '--env', `PILATES_ENV_FILE=${envFile}`, '--env', `FAULT_ENV=${envFile}`, '--env', `FAULT_MARK=${faultMark}`, '--env', 'PATH=/opt/fault:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', '--mount', 'type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock', '--mount', `type=bind,src=${root},dst=${root}`, '--mount', `type=bind,src=${join(root, 'mv-fault')},dst=/opt/fault/mv`, opsImage, 'manager-recover'], { encoding: 'utf8', timeout: 120_000 });
    const failed = run();
    assert.equal(failed.status, 1, failed.stderr);
    assert.match(failed.stderr, /Manager recovery was compensated\. Configuration matches the registry\. No earlier change was consumed\./);
    assert.doesNotMatch(failed.stdout + failed.stderr, /1555555/);
    assert.equal(await readFile(join(secretsDir, 'whatsapp-manager-phone'), 'utf8'), `${phones.c}\n`);
    assert.equal(await readFile(envFile, 'utf8'), `OTHER=synthetic\nPILATES_MANAGER_PHONE=${phones.c}\n`);
    const retried = run();
    assert.equal(retried.status, 0, retried.stderr);
    assert.match(retried.stdout, /Manager configuration aligned/);
    assert.doesNotMatch(retried.stdout + retried.stderr, /1555555/);
    assert.equal(await readFile(join(secretsDir, 'whatsapp-manager-phone'), 'utf8'), `${phones.b}\n`);
    assert.equal(await readFile(envFile, 'utf8'), `OTHER=synthetic\nPILATES_MANAGER_PHONE=${phones.b}\n`);
    await rm(faultMark);
    const failedAgain = run();
    assert.equal(failedAgain.status, 1, failedAgain.stderr);
    assert.match(failedAgain.stderr, /No earlier change was consumed/);
    assert.equal(await readFile(join(secretsDir, 'whatsapp-manager-phone'), 'utf8'), `${phones.b}\n`);
    const retriedAgain = run();
    assert.equal(retriedAgain.status, 0, retriedAgain.stderr);
    assert.equal(await readFile(join(secretsDir, 'whatsapp-manager-phone'), 'utf8'), `${phones.a}\n`);
    assert.equal(await readFile(envFile, 'utf8'), `OTHER=synthetic\nPILATES_MANAGER_PHONE=${phones.a}\n`);
    assert.equal((await migrator.query("SELECT count(*)::int AS n FROM studio_private.manager_role_changes c WHERE c.operation = 'transfer' AND NOT EXISTS (SELECT 1 FROM studio_private.manager_role_changes r WHERE r.reverses = c.id AND r.operation = 'recover' AND NOT EXISTS (SELECT 1 FROM studio_private.manager_role_changes k WHERE k.reverses = r.id AND k.operation = 'compensate'))")).rows[0].n, 0);
    assert.equal((await migrator.query('SELECT phone FROM studio_private.teachers WHERE id = $1', [a])).rows[0].phone, phones.a);
    assert.equal((await migrator.query('SELECT phone FROM studio_private.teachers WHERE id = $1', [c])).rows[0].phone, phones.c);
  } finally {
    await broker?.end().catch(() => undefined);
    await migrator?.end().catch(() => undefined);
    try { compose('down', '-v', '--remove-orphans'); } catch { /* isolated project only */ }
    spawnSync('docker', ['image', 'rm', '-f', opsImage], { stdio: 'ignore' });
    await rm(root, { recursive: true, force: true });
  }
});
