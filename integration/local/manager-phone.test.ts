import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const commit = 'a'.repeat(40);

test('manager recovery compensation does not consume an earlier change when alignment fails', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pilates-manager-fault-'));
  const root = join(directory, 'production');
  const bin = join(directory, 'bin');
  const calls = join(directory, 'sql');
  const envFile = join(root, 'local.env');
  const secret = join(root, 'secrets/whatsapp-manager-phone');
  await mkdir(bin, { recursive: true });
  await mkdir(join(root, 'secrets'), { recursive: true, mode: 0o700 });
  await chmod(root, 0o700);
  await writeFile(join(bin, 'docker'), ['#!/usr/bin/env bash', 'if [[ " $* " == *\' psql \'* ]]; then', '  sql=$(cat)', '  printf \'%s\\n\' "$sql" >> "$FAKE_SQL"', '  if [[ $sql == *operator_manager_compensate* ]]; then printf \'+15555550103\\n\'; exit 0; fi', '  if [[ $sql == *operator_manager_recover* ]]; then printf \'+15555550102\\n\'; exit 0; fi', '  printf \'+15555550103\\n\'', '  exit 0', 'fi', 'case "$1" in', '  version) printf \'29.0.0\\n\' ;;', '  compose) exit 0 ;;', '  *) exit 1 ;;', 'esac', ''].join('\n'), { mode: 0o755 });
  await writeFile(join(bin, 'mv'), [
    '#!/bin/sh',
    'last=',
    'for arg in "$@"; do last=$arg; done',
    'if [ "$FAULT" = align ] && [ "$last" = "$FAULT_ENV" ] && [ ! -e "$FAULT_MARK" ]; then',
    '  touch "$FAULT_MARK"',
    '  exit 1',
    'fi',
    'if [ "$FAULT" = secret ] && [ "$last" = "$FAULT_SECRET" ] && [ ! -e "$FAULT_MARK" ]; then',
    '  touch "$FAULT_MARK"',
    '  exit 1',
    'fi',
    'exec /bin/mv "$@"',
    '',
  ].join('\n'), { mode: 0o755 });
  for (const name of ['db-admin', 'db-migrator', 'db-agent', 'db-broker', 'db-grafana', 'bridge-token', 'openrouter-key', 'whatsapp-access-token', 'whatsapp-app-secret', 'whatsapp-verify-token', 'whatsapp-phone-number-id']) {
    await writeFile(join(root, 'secrets', name), 'synthetic\n', { mode: 0o600 });
  }
  await writeFile(join(root, 'secrets', 'grafana-admin-password'), 'synthetic-grafana-admin\n', { mode: 0o600 });
  await writeFile(secret, '+15555550103\n', { mode: 0o600 });
  await writeFile(envFile, 'OTHER=synthetic\nPILATES_MANAGER_PHONE=+15555550103\n', { mode: 0o600 });
  await writeFile(join(root, 'prod.env'), 'POSTGRES_PORT=55433\nWHATSAPP_WEBHOOK_PORT=18190\nWHATSAPP_WEBHOOK_PATH=/whatsapp/webhook\n', { mode: 0o600 });
  const invoke = (fault: string) => spawnSync('bash', ['scripts/prod.sh', 'manager-recover'], {
    env: {
      ...process.env, PATH: `${bin}:${process.env.PATH}`, PILATES_HOME: root, PILATES_PROJECT: 'pilates-synthetic',
      PILATES_RELEASE: commit, PILATES_ENV_FILE: envFile, COMPOSE_ENV_FILES: '/dev/null', FAKE_SQL: calls,
      FAULT: fault, FAULT_ENV: envFile, FAULT_SECRET: secret, FAULT_MARK: join(directory, `fault-${fault}`),
    },
    encoding: 'utf8',
  });
  try {
    for (const fault of ['align', 'secret']) {
      await writeFile(secret, '+15555550103\n', { mode: 0o600 });
      await writeFile(envFile, 'OTHER=synthetic\nPILATES_MANAGER_PHONE=+15555550103\n', { mode: 0o600 });
      await writeFile(calls, '');
      const result = invoke(fault);
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /Manager recovery was compensated\. Configuration matches the registry\. No earlier change was consumed\./);
      assert.doesNotMatch(result.stdout + result.stderr, /1555555/);
      const sql = await readFile(calls, 'utf8');
      assert.equal(sql.match(/operator_manager_recover/g)?.length, 1, fault);
      assert.equal(sql.match(/operator_manager_compensate/g)?.length, 1, fault);
      assert.equal(await readFile(secret, 'utf8'), '+15555550103\n');
      assert.equal(await readFile(envFile, 'utf8'), 'OTHER=synthetic\nPILATES_MANAGER_PHONE=+15555550103\n');
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
