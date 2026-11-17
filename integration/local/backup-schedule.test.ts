import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const script = resolve('scripts/backup-agent-pilates.sh');
const release = 'c'.repeat(40);
const SECRET = 'synthetic-secret-value +390000000000';

// The fake Docker emulates `ops backup-hot`: it creates the new hot directory
// in the mounted root and prints the container path, or fails like prod.sh.
const fakeDocker = `#!/usr/bin/env bash
printf '%s\\n' "$@" >> "$FAKE_DOCKER_CALLS"
printf -- '--\\n' >> "$FAKE_DOCKER_CALLS"
case $FAKE_DOCKER_MODE in
  fail) printf 'Error: PostgreSQL is not healthy.\\n%s\\n' "$FAKE_SECRET" >&2; exit 1 ;;
  incomplete)
    dir="$FAKE_ROOT/backups/hot-20990101T000000Z-cccccccccccc-Inc0mpl3"
    mkdir -p "$dir"; printf 'hot-postgres-v1\\n' > "$dir/INCOMPLETE"
    printf 'Hot PostgreSQL backup completed: /opt/agent-pilates-prod/backups/%s\\n' "\${dir##*/}"; exit 0 ;;
  slow) touch "$FAKE_STARTED"; sleep 3 ;;
esac
name="hot-$(date -u +%Y%m%dT%H%M%SZ)-cccccccccccc-$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 8)"
mkdir -p "$FAKE_ROOT/backups/$name"
printf 'dump\\n' > "$FAKE_ROOT/backups/$name/postgres.dump"
printf 'hot-postgres-v1\\n' > "$FAKE_ROOT/backups/$name/COMPLETE"
printf '%s\\n' "$FAKE_SECRET"
printf 'Hot PostgreSQL backup completed: /opt/agent-pilates-prod/backups/%s\\n' "$name"
`;

function stamp(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

async function fixture({ installed = true } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'pilates-backup-schedule-'));
  const bin = join(directory, 'bin');
  const root = join(directory, 'prod');
  const log = join(directory, 'backup.log');
  const calls = join(directory, 'docker-args');
  await mkdir(bin);
  await writeFile(join(bin, 'docker'), fakeDocker, { mode: 0o755 });
  if (installed) {
    await mkdir(join(root, 'backups'), { recursive: true });
    await mkdir(join(root, 'state'));
    await writeFile(join(root, 'state', 'release'), `${release}\n`);
  }
  const env = (mode: string) => ({
    ...process.env, PATH: `${bin}:${process.env.PATH}`,
    PILATES_BACKUP_ROOT: root, PILATES_BACKUP_LOG: log, PILATES_BACKUP_LOCK: join(directory, 'lock'),
    FAKE_DOCKER_CALLS: calls, FAKE_DOCKER_MODE: mode, FAKE_ROOT: root, FAKE_SECRET: SECRET,
    FAKE_STARTED: join(directory, 'started'),
  });
  return {
    directory, root, env,
    run: (mode = 'ok', args: string[] = []) => spawnSync(script, args, { env: env(mode), encoding: 'utf8', timeout: 20_000 }),
    log: async () => readFile(log, 'utf8').catch(() => ''),
    calls: async () => (await readFile(calls, 'utf8').catch(() => '')).split('--\n').filter(Boolean).map((c) => c.trimEnd().split('\n')),
    backups: async () => (await readdir(join(root, 'backups'))).sort(),
    hot: async (name: string, files: Record<string, string>) => {
      await mkdir(join(root, 'backups', name));
      for (const [file, content] of Object.entries(files)) await writeFile(join(root, 'backups', name, file), content);
    },
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}

function assertPrivate(text: string) {
  assert.doesNotMatch(text, /synthetic-secret-value|\+39/);
}

test('scheduled backup runs backup-hot only for the recorded release with the launcher mounts and marks it', async () => {
  const fake = await fixture();
  try {
    const result = fake.run();
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(await fake.calls(), [[
      'run', '--rm',
      '--mount', 'type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock',
      '--mount', `type=bind,src=${fake.root},dst=/opt/agent-pilates-prod`,
      `ghcr.io/toto-castaldi/agent-pilates-studio/ops:${release}`, 'backup-hot', release,
    ]]);
    const [name] = await fake.backups();
    assert.match(name, /^hot-\d{8}T\d{6}Z-c{12}-[A-Za-z0-9]{8}$/);
    assert.equal(await readFile(join(fake.root, 'backups', name, 'SCHEDULED'), 'utf8'), 'scheduled-hot-v1\n');
    assert.equal(await readFile(join(fake.root, 'backups', name, 'COMPLETE'), 'utf8'), 'hot-postgres-v1\n');
    const log = await fake.log();
    assert.match(log, new RegExp(`Hot backup completed: ${name}`));
    assert.match(log, /expired backups removed: 0\./);
    assertPrivate(log + result.stdout + result.stderr);
    assert.equal((await stat(join(fake.directory, 'backup.log'))).mode & 0o777, 0o600);
  } finally {
    await fake.cleanup();
  }
});

test('scheduled backup rotates only complete scheduled hot backups older than 30 days', async () => {
  const fake = await fixture();
  const complete = { 'postgres.dump': 'dump', COMPLETE: 'hot-postgres-v1\n' };
  const scheduled = { ...complete, SCHEDULED: 'scheduled-hot-v1\n' };
  const keep = [
    `hot-${stamp(29)}-cccccccccccc-Recent01`,
    `hot-${stamp(40)}-cccccccccccc-Manual01`,
    `hot-${stamp(40)}-cccccccccccc-Incmpl01`,
    `hot-${stamp(40)}-cccccccccccc-NoMark01`,
    `hot-${stamp(40)}-cccccccccccc-WrongMk1`,
    `20000101T000000Z-cccccccccccc`,
  ];
  const expired = [`hot-${stamp(31)}-cccccccccccc-Expird01`, `hot-${stamp(400)}-cccccccccccc-Expird02`];
  try {
    await fake.hot(keep[0], scheduled);
    await fake.hot(keep[1], complete);
    await fake.hot(keep[2], { INCOMPLETE: 'hot-postgres-v1\n', SCHEDULED: 'scheduled-hot-v1\n' });
    await fake.hot(keep[3], { 'postgres.dump': 'partial', SCHEDULED: 'scheduled-hot-v1\n' });
    await fake.hot(keep[4], { COMPLETE: '1\n', SCHEDULED: 'scheduled-hot-v1\n', 'hermes.tar': 'x' });
    await fake.hot(keep[5], { COMPLETE: '1\n', 'postgres.dump': 'dump', 'hermes.tar': 'x' });
    for (const name of expired) await fake.hot(name, scheduled);
    const outside = join(fake.directory, 'outside');
    await mkdir(outside);
    await writeFile(join(outside, 'COMPLETE'), 'hot-postgres-v1\n');
    await writeFile(join(outside, 'SCHEDULED'), 'scheduled-hot-v1\n');
    const link = `hot-${stamp(50)}-cccccccccccc-Symlnk01`;
    await symlink(outside, join(fake.root, 'backups', link));

    const result = fake.run();
    assert.equal(result.status, 0, result.stderr);
    const remaining = await fake.backups();
    for (const name of [...keep, link]) assert.ok(remaining.includes(name), `${name} must be kept`);
    for (const name of expired) assert.ok(!remaining.includes(name), `${name} must be removed`);
    assert.equal(remaining.length, keep.length + 2);
    await access(join(outside, 'COMPLETE'));
    assert.match(await fake.log(), /expired backups removed: 2\./);
  } finally {
    await fake.cleanup();
  }
});

test('scheduled backup failures exit with an error, keep every backup and log no private data', async () => {
  const fake = await fixture();
  const old = `hot-${stamp(60)}-cccccccccccc-Expird01`;
  try {
    await fake.hot(old, { COMPLETE: 'hot-postgres-v1\n', SCHEDULED: 'scheduled-hot-v1\n' });
    const failed = fake.run('fail');
    assert.equal(failed.status, 1);
    let log = await fake.log();
    assert.match(log, /ops Error: PostgreSQL is not healthy\./);
    assert.match(log, /Error: Hot backup failed with exit code 1\./);
    assertPrivate(log + failed.stdout + failed.stderr);
    assert.deepEqual(await fake.backups(), [old]);

    const incomplete = fake.run('incomplete');
    assert.equal(incomplete.status, 1);
    log = await fake.log();
    assert.match(log, /Error: The new hot backup is not complete\./);
    const remaining = await fake.backups();
    assert.ok(remaining.includes(old));
    const partial = remaining.find((name) => name.includes('Inc0mpl3'));
    assert.ok(partial);
    await assert.rejects(access(join(fake.root, 'backups', partial, 'SCHEDULED')));
  } finally {
    await fake.cleanup();
  }
});

test('scheduled backup without installation or with an invalid release fails before Docker', async () => {
  const missing = await fixture({ installed: false });
  try {
    const result = missing.run();
    assert.equal(result.status, 1);
    assert.match(await missing.log(), /Error: Production is not installed\./);
    assert.deepEqual(await missing.calls(), []);
  } finally {
    await missing.cleanup();
  }
  const fake = await fixture();
  try {
    await rm(join(fake.root, 'state', 'release'));
    let result = fake.run();
    assert.equal(result.status, 1);
    assert.match(await fake.log(), /Error: No installed release recorded\./);
    for (const content of ['main\n', `${release}\n${release}\n`, `${release.toUpperCase()}\n`, `${SECRET}\n`]) {
      await writeFile(join(fake.root, 'state', 'release'), content);
      result = fake.run();
      assert.equal(result.status, 1);
    }
    const log = await fake.log();
    assert.match(log, /Error: The recorded release is invalid\./);
    assertPrivate(log);
    assert.deepEqual(await fake.calls(), []);
    for (const args of [['extra'], [release]]) {
      result = fake.run('ok', args);
      assert.equal(result.status, 2);
      assert.match(result.stderr, /Usage: backup-agent-pilates.sh/);
    }
    result = fake.run('ok', ['--help']);
    assert.equal(result.status, 0);
    assert.deepEqual(await fake.calls(), []);
  } finally {
    await fake.cleanup();
  }
});

test('scheduled backup refuses to overlap a running execution', async () => {
  const fake = await fixture();
  try {
    const first = spawn(script, [], { env: fake.env('slow'), stdio: 'ignore' });
    const exited = new Promise<number | null>((done) => first.on('exit', done));
    for (let i = 0; i < 100; i++) {
      if (await access(join(fake.directory, 'started')).then(() => true, () => false)) break;
      await new Promise((done) => setTimeout(done, 50));
    }
    const second = fake.run();
    assert.equal(second.status, 1);
    assert.match(await fake.log(), /Error: Another scheduled backup is running\./);
    assert.equal(await exited, 0);
    assert.equal((await fake.calls()).length, 1);
  } finally {
    await fake.cleanup();
  }
});

