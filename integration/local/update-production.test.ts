import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const launcher = resolve('scripts/update-agent-pilates.sh');

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'pilates-update-launcher-'));
  const bin = join(directory, 'bin');
  const calls = join(directory, 'docker-args');
  await mkdir(bin);
  await writeFile(join(bin, 'docker'), '#!/usr/bin/env bash\nprintf \'%s\\n\' "$@" > "$FAKE_DOCKER_CALLS"\nexit "$FAKE_DOCKER_STATUS"\n', { mode: 0o755 });
  return {
    directory,
    invoke: (args: string[], status = 0) => spawnSync(launcher, args, {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_DOCKER_CALLS: calls, FAKE_DOCKER_STATUS: String(status) },
      encoding: 'utf8', timeout: 10_000,
    }),
    args: async () => (await readFile(calls, 'utf8')).trimEnd().split('\n'),
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}

test('production update launcher rejects missing, extra and invalid commits before Docker', async () => {
  const fake = await fixture();
  const commit = 'a'.repeat(40);
  try {
    for (const args of [[], [commit, commit], ['main'], ['latest'], ['abc123'], ['A'.repeat(40)], ['g'.repeat(40)], ['a'.repeat(39)], ['a'.repeat(41)], [` ${commit}`], [`${commit}\n`], [`${commit}; exit 0`], ['synthetic-private-value'], ['--help', commit]]) {
      const result = fake.invoke(args);
      assert.equal(result.status, 2);
      assert.match(result.stderr, /Usage: update-agent-pilates.sh <commit-sha>/);
      assert.doesNotMatch(result.stdout + result.stderr, /synthetic-private-value/);
      assert.deepEqual(await readdir(fake.directory), ['bin'], 'invalid arguments must not reach Docker');
    }
  } finally {
    await fake.cleanup();
  }
});

test('production update launcher help never reaches Docker', async () => {
  const fake = await fixture();
  try {
    for (const help of ['--help', '-h']) {
      const result = fake.invoke([help]);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /40-character lowercase hexadecimal SHA with published images/);
      assert.equal(result.stderr, '');
      assert.deepEqual(await readdir(fake.directory), ['bin']);
    }
  } finally {
    await fake.cleanup();
  }
});

test('production update launcher forwards the exact commit and only the required mounts and propagates errors', async () => {
  const fake = await fixture();
  try {
    for (const [commit, status] of [['a'.repeat(40), 0], ['b'.repeat(40), 9]] as const) {
      const result = fake.invoke([commit], status);
      assert.equal(result.status, status, result.stderr);
      assert.equal(result.stdout, '');
      assert.equal(result.stderr, '');
      assert.deepEqual(await fake.args(), [
        'run', '--rm',
        '--mount', 'type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock',
        '--mount', 'type=bind,src=/opt/agent-pilates-prod,dst=/opt/agent-pilates-prod',
        `ghcr.io/toto-castaldi/agent-pilates-studio/ops:${commit}`, 'update', commit,
      ]);
    }
  } finally {
    await fake.cleanup();
  }
});
