import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('Pi 1.5.0 backlog viewer works in an isolated synthetic TUI', { timeout: 180_000 }, () => {
  const result = spawnSync('python3', ['-B', 'integration/pi-backlog-tui.py'], {
    encoding: 'utf8',
    timeout: 170_000,
    env: { PATH: process.env.PATH },
  });
  assert.equal(result.status, 0, `${result.error?.message ?? ''}\n${result.stderr}\n${result.stdout}`);
});
