import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, openSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const commit = 'a'.repeat(40);
const run = (args: string[], release = commit) => spawnSync('bash', ['scripts/prod.sh', ...args], {
  env: { ...process.env, PILATES_RELEASE: release, PILATES_HOME: '/nonexistent-synthetic-home' }, encoding: 'utf8',
});

test('production initializes and preserves an empty private teacher mapping for upgrades', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pilates-prod-links-'));
  const bin = join(directory, 'bin');
  const root = join(directory, 'production');
  await mkdir(bin);
  await mkdir(root);
  await writeFile(join(bin, 'docker'), '#!/bin/sh\n[ "$1" = version ] && { echo 29.0.0; exit 0; }\nexit 1\n', { mode: 0o755 });
  const invoke = (args: string[]) => spawnSync('bash', ['scripts/prod.sh', ...args], {
    env: { ...process.env, PILATES_RELEASE: commit, PILATES_HOME: root, PATH: `${bin}:${process.env.PATH}` }, encoding: 'utf8',
  });
  try {
    assert.equal(invoke(['init']).status, 0);
    const mapping = join(root, 'secrets/whatsapp-teacher-links');
    assert.equal(await readFile(mapping, 'utf8'), '[]\n');
    assert.equal((await stat(mapping)).mode & 0o077, 0);
    const configured = '[{"phone":"15555550102","firstName":"Antonio","lastName":"Neri"}]\n';
    await writeFile(mapping, configured);
    assert.equal(invoke(['init']).status, 0);
    assert.equal(await readFile(mapping, 'utf8'), configured);
    // Simulate a production directory created by an older release. Upgrade
    // creates an empty file before the release check, without touching a stack.
    await rm(mapping);
    for (const name of ['openrouter-key', 'whatsapp-access-token', 'whatsapp-app-secret', 'whatsapp-verify-token', 'whatsapp-allowed-users', 'whatsapp-home-channel', 'whatsapp-phone-number-id']) {
      await writeFile(join(root, 'secrets', name), 'synthetic\n', { mode: 0o600 });
    }
    const upgrade = invoke(['update', commit]);
    assert.notEqual(upgrade.status, 0);
    assert.match(upgrade.stderr, /No installed release/);
    assert.equal(await readFile(mapping, 'utf8'), '[]\n');
    assert.doesNotMatch(upgrade.stdout + upgrade.stderr, /Antonio|Neri|15555550102/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('production commands refuse a missing or mismatched commit before reaching Docker', () => {
  assert.notEqual(run([]).status, 0);
  for (const args of [['install'], ['update'], ['backup-hot'], ['rollback', '/synthetic-backup'], ['install', 'main'], ['update', 'abc123'], ['backup-hot', 'main']]) {
    const result = run(args);
    assert.notEqual(result.status, 0, args.join(' '));
    assert.doesNotMatch(result.stderr, /Docker/);
  }
  const mismatch = run(['update', commit], 'b'.repeat(40));
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /same commit/);
  const hotMismatch = run(['backup-hot', commit], 'b'.repeat(40));
  assert.notEqual(hotMismatch.status, 0);
  assert.match(hotMismatch.stderr, /same commit/);
});

test('hot backup keeps failures private, never stops services and is rejected by rollback', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pilates-hot-local-'));
  const root = join(directory, 'production');
  const bin = join(directory, 'bin');
  const calls = join(directory, 'docker-calls');
  const raw = 'synthetic-private-tool-output';
  await mkdir(root, { mode: 0o700 });
  await mkdir(join(root, 'backups'), { mode: 0o700 });
  await mkdir(bin);
  await writeFile(join(root, 'prod.env'), 'POSTGRES_PORT=55433\nWHATSAPP_WEBHOOK_PORT=18190\n', { mode: 0o600 });
  await writeFile(join(bin, 'docker'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_CALLS"
case "$1" in
  version) printf '29.0.0\\n' ;;
  inspect)
    if [[ $FAKE_FAILURE == inspect ]]; then echo ${raw} >&2; exit 9; fi
    echo healthy ;;
  compose)
    case " $* " in
      *' ps -q --status running postgres '*)
        if [[ $FAKE_FAILURE == ps ]]; then echo ${raw} >&2; exit 9; fi
        echo synthetic-postgres ;;
      *' exec -T --interactive=false postgres pg_dump '*)
        echo ${raw}
        echo ${raw} >&2
        [[ $FAKE_FAILURE != dump ]] || exit 9 ;;
      *) echo ${raw} >&2; exit 9 ;;
    esac ;;
  *) echo ${raw} >&2; exit 9 ;;
esac
`, { mode: 0o755 });
  await writeFile(join(bin, 'sha256sum'), `#!/usr/bin/env bash
if [[ $FAKE_FAILURE == checksum ]]; then echo ${raw} >&2; exit 9; fi
exec /usr/bin/sha256sum "$@"
`, { mode: 0o755 });
  for (const tool of ['chown', 'mv']) {
    await writeFile(join(bin, tool), `#!/usr/bin/env bash
if [[ $FAKE_FAILURE == ${tool} ]]; then echo ${raw} >&2; exit 9; fi
exec /usr/bin/${tool} "$@"
`, { mode: 0o755 });
  }
  const env = {
    ...process.env, PILATES_HOME: root, PILATES_PROJECT: 'pilates-synthetic', PILATES_RELEASE: commit,
    COMPOSE_ENV_FILES: '/dev/null', FAKE_CALLS: calls, PATH: `${bin}:${process.env.PATH}`,
  };
  const invoke = (args: string[], failure = '') => spawnSync('bash', ['scripts/prod.sh', ...args], {
    env: { ...env, FAKE_FAILURE: failure }, encoding: 'utf8',
  });
  const directories = async () => (await readdir(join(root, 'backups'))).sort();
  const newDirectory = async (before: string[]) => {
    const added = (await directories()).filter((name) => !before.includes(name));
    assert.equal(added.length, 1);
    assert.match(added[0], /^hot-\d{8}T\d{6}Z-a{12}-[A-Za-z0-9]{8}$/);
    return join(root, 'backups', added[0]);
  };
  try {
    for (const failure of ['ps', 'inspect', 'dump', 'checksum', 'chown', 'mv']) {
      const before = await directories();
      const result = invoke(['backup-hot', commit], failure);
      assert.notEqual(result.status, 0, failure);
      assert.match(result.stderr, /Backup incomplete/);
      assert.doesNotMatch(result.stdout + result.stderr, new RegExp(raw));
      assert.doesNotMatch(result.stdout + result.stderr, /backup completed/i);
      const backup = await newDirectory(before);
      const files = await readdir(backup);
      assert.ok(files.includes('INCOMPLETE'));
      assert.ok(!files.includes('COMPLETE'));
      assert.equal((await stat(backup)).mode & 0o777, 0o700);
      for (const file of files) assert.equal((await stat(join(backup, file))).mode & 0o777, 0o600);
    }
    // If reporting completion fails, the marker is reverted before exit.
    const outputBefore = await directories();
    const full = openSync('/dev/full', 'w');
    try {
      const outputFailure = spawnSync('bash', ['scripts/prod.sh', 'backup-hot', commit], {
        env: { ...env, FAKE_FAILURE: '' }, encoding: 'utf8', stdio: ['ignore', full, 'pipe'],
      });
      assert.notEqual(outputFailure.status, 0);
      assert.match(outputFailure.stderr, /Backup incomplete/);
      const incomplete = await newDirectory(outputBefore);
      assert.ok((await readdir(incomplete)).includes('INCOMPLETE'));
      assert.ok(!(await readdir(incomplete)).includes('COMPLETE'));
    } finally {
      closeSync(full);
    }
    const before = await directories();
    const success = invoke(['backup-hot', commit]);
    assert.equal(success.status, 0, success.stderr);
    assert.doesNotMatch(success.stdout + success.stderr, new RegExp(raw));
    const backup = await newDirectory(before);
    assert.match(success.stdout, /Hot PostgreSQL backup completed/);
    assert.deepEqual((await readdir(backup)).sort(), ['COMPLETE', 'SHA256SUMS', 'postgres.dump']);
    assert.equal(await readFile(join(backup, 'COMPLETE'), 'utf8'), 'hot-postgres-v1\n');
    const dump = await readFile(join(backup, 'postgres.dump'));
    assert.equal(await readFile(join(backup, 'SHA256SUMS'), 'utf8'), `${createHash('sha256').update(dump).digest('hex')}  postgres.dump\n`);
    assert.equal((await stat(backup)).mode & 0o777, 0o700);
    for (const file of await readdir(backup)) assert.equal((await stat(join(backup, file))).mode & 0o777, 0o600);

    // Even a hot directory supplemented with a plausible Hermes archive and
    // checksum cannot pass the quiescent marker check, before any stop or pull.
    const tar = Buffer.from('synthetic-hermes-archive');
    await writeFile(join(backup, 'hermes.tar'), tar, { mode: 0o600 });
    await writeFile(join(backup, 'SHA256SUMS'), `${createHash('sha256').update(dump).digest('hex')}  postgres.dump\n${createHash('sha256').update(tar).digest('hex')}  hermes.tar\n`);
    const rollback = invoke(['rollback', backup, commit]);
    assert.notEqual(rollback.status, 0);
    assert.match(rollback.stderr, /completion marker is invalid/);
    const restore = spawnSync('bash', ['scripts/restore.sh', 'pilates-synthetic-restore', backup], { env, encoding: 'utf8' });
    assert.notEqual(restore.status, 0);
    assert.match(restore.stderr, /completion marker is invalid/);

    // A valid quiescent format reaches the later secret check; a corrupted
    // one is rejected before even contacting Docker or stopping anything.
    const quiescent = join(root, 'backups', 'quiescent-synthetic');
    await mkdir(quiescent, { mode: 0o700 });
    await mkdir(join(root, 'secrets'), { mode: 0o700 });
    await writeFile(join(quiescent, 'COMPLETE'), '1\n', { mode: 0o600 });
    await writeFile(join(quiescent, 'postgres.dump'), dump, { mode: 0o600 });
    await writeFile(join(quiescent, 'hermes.tar'), tar, { mode: 0o600 });
    await writeFile(join(quiescent, 'SHA256SUMS'), `${createHash('sha256').update(dump).digest('hex')}  postgres.dump\n${createHash('sha256').update(tar).digest('hex')}  hermes.tar\n`, { mode: 0o600 });
    const validFormat = invoke(['rollback', quiescent, commit]);
    assert.notEqual(validFormat.status, 0);
    assert.match(validFormat.stderr, /Secret is missing or empty: db-admin/);
    const callsBeforeCorruption = await readFile(calls, 'utf8');
    await writeFile(join(quiescent, 'hermes.tar'), 'synthetic-corruption');
    const corrupted = invoke(['rollback', quiescent, commit]);
    assert.notEqual(corrupted.status, 0);
    assert.match(corrupted.stderr, /checksum verification failed/);
    assert.equal(await readFile(calls, 'utf8'), callsBeforeCorruption);
    assert.doesNotMatch(callsBeforeCorruption, /\b(?:kill|stop|pull|up|down)\b/);

    await chmod(join(root, 'backups'), 0o755);
    const unsafeBefore = await directories();
    const unsafe = invoke(['backup-hot', commit]);
    assert.notEqual(unsafe.status, 0);
    assert.match(unsafe.stderr, /insecure permissions/);
    assert.deepEqual(await directories(), unsafeBefore);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
