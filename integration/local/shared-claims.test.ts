import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

test('shared claim commands on isolated synthetic repositories', () => {
  const root = mkdtempSync(join(tmpdir(), 'pilates-claims-'));
  try {
    const env = {
      PATH: process.env.PATH, HOME: root, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
      GIT_TERMINAL_PROMPT: '0', GIT_AUTHOR_NAME: 'Synthetic', GIT_COMMITTER_NAME: 'Synthetic',
      GIT_AUTHOR_EMAIL: 'synthetic@example.invalid', GIT_COMMITTER_EMAIL: 'synthetic@example.invalid',
    };
    function git(cwd: string, ...args: string[]) {
      return spawnSync('git', ['-C', cwd, '-c', 'core.hooksPath=/dev/null', ...args], { env, encoding: 'utf8' });
    }
    function ok(cwd: string, ...args: string[]): string {
      const result = git(cwd, ...args);
      assert.equal(result.status, 0, result.stderr);
      return result.stdout.trim();
    }
    const seed = join(root, 'seed');
    const remote = join(root, 'origin.git');
    const first = join(root, 'first');
    const second = join(root, 'second');
    ok(root, 'init', '-q', '-b', 'main', seed);
    const record = 'backlog/items/TEC-001.json';
    mkdirSync(join(seed, 'backlog/items'), { recursive: true });
    writeFileSync(join(seed, record), 'Synthetic: Todo\n');
    ok(seed, 'add', record);
    ok(seed, 'commit', '-qm', 'base');
    ok(root, 'clone', '-q', '--bare', seed, remote);
    ok(root, 'clone', '-q', remote, first);
    ok(root, 'clone', '-q', remote, second);
    const branch = 'task/TEC-001-synthetic';
    const match = () => ok(second, 'branch', '-a', '--list', '*/TEC-001-*', '--format=%(refname:short) %(committerdate:iso) %(authorname)');
    ok(second, 'fetch', '--prune', 'origin');
    assert.equal(match(), '');
    ok(first, 'switch', '-qc', branch);
    for (const state of ['In Progress', 'Blocked', 'In Progress', 'Done']) {
      writeFileSync(join(first, record), `Synthetic: ${state}\n`);
      ok(first, 'commit', '-qam', state);
      ok(first, 'push', '-u', 'origin', branch);
      ok(second, 'fetch', '--prune', 'origin');
      assert.match(match(), /origin\/task\/TEC-001-synthetic .*Synthetic/);
      assert.equal(ok(second, 'show', `origin/${branch}:${record}`), `Synthetic: ${state}`);
    }
    ok(second, 'branch', 'task/TEC-001-local', 'main');
    assert.match(match(), /task\/TEC-001-local/);
    ok(second, 'remote', 'set-url', 'origin', join(root, 'missing.git'));
    assert.notEqual(git(second, 'fetch', '--prune', 'origin').status, 0);
    writeFileSync(join(first, record), 'Synthetic: Blocked again\n');
    ok(first, 'commit', '-qam', 'blocked again');
    const before = ok(first, 'rev-parse', 'HEAD');
    ok(first, 'remote', 'set-url', 'origin', join(root, 'missing.git'));
    assert.notEqual(git(first, 'push', '-u', 'origin', branch).status, 0);
    assert.equal(ok(first, 'rev-parse', 'HEAD'), before);
    assert.equal(ok(root, '--git-dir', remote, 'show', `refs/heads/${branch}:${record}`), 'Synthetic: Done');
    ok(second, 'remote', 'remove', 'origin');
    assert.equal(ok(second, 'remote'), '');
    const processDoc = readFileSync('docs/PROCESS-PARALLEL.md', 'utf8');
    const start = readFileSync('.agents/skills/start-task/SKILL.md', 'utf8');
    const finish = readFileSync('.agents/skills/finish-task/SKILL.md', 'utf8');
    for (const phrase of ['Without one', 'If the fetch fails', 'If a push fails', 'not shared']) {
      assert.ok((processDoc + start + finish).includes(phrase), phrase);
    }
    assert.match(processDoc, /`main` is pushed automatically only after adding an item/);
    assert.match(processDoc, /workers never merge, never push `main`/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
