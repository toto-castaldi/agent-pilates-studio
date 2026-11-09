import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const commit = 'a'.repeat(40);
const run = (args: string[], release = commit) => spawnSync('bash', ['scripts/prod.sh', ...args], {
  env: { ...process.env, PILATES_RELEASE: release, PILATES_HOME: '/nonexistent-synthetic-home' }, encoding: 'utf8',
});

test('production commands refuse a missing or mismatched commit before reaching Docker', () => {
  assert.notEqual(run([]).status, 0);
  for (const args of [['install'], ['update'], ['rollback', '/synthetic-backup'], ['install', 'main'], ['update', 'abc123']]) {
    const result = run(args);
    assert.notEqual(result.status, 0, args.join(' '));
    assert.doesNotMatch(result.stderr, /Docker/);
  }
  const mismatch = run(['update', commit], 'b'.repeat(40));
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /same commit/);
});
