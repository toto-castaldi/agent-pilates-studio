import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// Simulates the documented agent procedure with real Git and the backlog CLI on synthetic repositories.
// It does not execute a model or guarantee that an agent follows the instructions.
test('add-item publication and recovery on isolated repositories', () => {
  const root = mkdtempSync(join(tmpdir(), 'pilates-add-item-'));
  const env = {
    PATH: process.env.PATH, HOME: root, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0', GIT_AUTHOR_NAME: 'Synthetic', GIT_COMMITTER_NAME: 'Synthetic',
    GIT_AUTHOR_EMAIL: 'synthetic@example.invalid', GIT_COMMITTER_EMAIL: 'synthetic@example.invalid',
  };
  const git = (dir: string, ...args: string[]) => spawnSync('git', ['-C', dir, ...args], { env, encoding: 'utf8' });
  const ok = (dir: string, ...args: string[]): string => {
    const result = git(dir, ...args);
    assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
    return result.stdout.trim();
  };
  const cli = (dir: string, ...args: string[]) => spawnSync('python3', [join(dir, '.agents/tools/backlog.py'), ...args], { env, encoding: 'utf8' });
  const cliOk = (dir: string, ...args: string[]) => {
    const result = cli(dir, ...args);
    assert.equal(result.status, 0, `backlog ${args.join(' ')}: ${result.stdout}${result.stderr}`);
    return result.stdout.trim();
  };
  const add = (dir: string, title: string) => cliOk(dir, 'add', '--type', 'TEC', '--title', title, '--version', 'v0.1.0', '--epic', 'EPIC-001', '--priority', 'P2', '--criterion', 'Criterio sintetico');
  const commitAddition = (dir: string, title: string) => {
    const id = add(dir, title);
    cliOk(dir, 'check');
    ok(dir, 'add', 'backlog');
    ok(dir, 'diff', '--cached', '--check');
    ok(dir, 'commit', '-qm', `docs(${id}): aggiunge item`);
    return id;
  };
  const preflight = (dir: string): 'ok' | 'no upstream' | 'dirty or branch' | 'pull failed' | 'ahead' => {
    if (ok(dir, 'branch', '--show-current') !== 'main' || ok(dir, 'status', '--porcelain') !== '') return 'dirty or branch';
    if (git(dir, 'rev-parse', '--abbrev-ref', '@{upstream}').status !== 0) return 'no upstream';
    if (git(dir, 'pull', '--ff-only').status !== 0) return 'pull failed';
    return ok(dir, 'log', '--oneline', '@{u}..') === '' ? 'ok' : 'ahead';
  };
  const fixture = (name: string) => {
    const path = join(root, name);
    mkdirSync(path);
    const seed = join(path, 'seed');
    const remote = join(path, 'origin.git');
    const main = join(path, 'project');
    const other = join(path, 'other');
    ok(path, 'init', '-q', '-b', 'main', seed);
    mkdirSync(join(seed, '.agents/tools'), { recursive: true });
    copyFileSync('.agents/tools/backlog.py', join(seed, '.agents/tools/backlog.py'));
    cliOk(seed, 'version', 'add', 'v0.1.0', '--goal', 'Sintetico');
    cliOk(seed, 'epic', 'add', '--title', 'Sintetico', '--scope', 'Sintetico');
    ok(seed, 'add', '.');
    ok(seed, 'commit', '-qm', 'base');
    ok(path, 'clone', '-q', '--bare', seed, remote);
    ok(path, 'clone', '-q', remote, main);
    ok(path, 'clone', '-q', remote, other);
    return { seed, remote, main, other };
  };
  try {
    const normal = fixture('normal');
    assert.equal(preflight(normal.main), 'ok');
    const base = ok(normal.main, 'rev-parse', 'HEAD');
    const id = commitAddition(normal.main, 'Aggiunta sintetica');
    assert.equal(id, 'TEC-001');
    assert.equal(ok(normal.main, 'rev-list', '--count', `${base}..HEAD`), '1');
    assert.equal(preflight(normal.main), 'ahead');
    ok(normal.main, 'push', '-q');
    assert.equal(preflight(normal.main), 'ok');
    assert.equal(ok(normal.remote, 'rev-parse', 'refs/heads/main'), ok(normal.main, 'rev-parse', 'HEAD'));
    ok(normal.other, 'pull', '--ff-only', '-q');
    assert.match(cliOk(normal.other, 'show', id), /Aggiunta sintetica/);

    // A pre-existing local commit, dirty tree or different branch stops before a new item or push.
    ok(normal.main, 'commit', '-q', '--allow-empty', '-m', 'altro lavoro');
    const remoteBefore = ok(normal.remote, 'rev-parse', 'refs/heads/main');
    assert.equal(preflight(normal.main), 'ahead');
    assert.equal(ok(normal.remote, 'rev-parse', 'refs/heads/main'), remoteBefore);
    writeFileSync(join(normal.main, 'dirty.txt'), 'sintetico');
    assert.equal(preflight(normal.main), 'dirty or branch');
    rmSync(join(normal.main, 'dirty.txt'));
    ok(normal.main, 'switch', '-qc', 'task/synthetic');
    assert.equal(preflight(normal.main), 'dirty or branch');

    // No upstream: commit is kept locally and no push is attempted.
    assert.equal(preflight(normal.seed), 'no upstream');
    commitAddition(normal.seed, 'Senza upstream');
    assert.equal(git(normal.seed, 'rev-parse', '--abbrev-ref', '@{upstream}').status !== 0, true);
    assert.equal(ok(normal.remote, 'rev-parse', 'refs/heads/main'), remoteBefore);

    // A concurrent unrelated upstream commit rejects the first push; rebase, check, retry.
    const moved = fixture('moved');
    assert.equal(preflight(moved.main), 'ok');
    commitAddition(moved.main, 'Aggiunta concorrente');
    writeFileSync(join(moved.other, 'other.txt'), 'altro cambiamento sintetico\n');
    ok(moved.other, 'add', 'other.txt');
    ok(moved.other, 'commit', '-qm', 'altro');
    ok(moved.other, 'push', '-q');
    assert.notEqual(git(moved.main, 'push').status, 0);
    ok(moved.main, 'pull', '--rebase');
    cliOk(moved.main, 'check');
    ok(moved.main, 'push', '-q');
    assert.equal(ok(moved.remote, 'rev-parse', 'refs/heads/main'), ok(moved.main, 'rev-parse', 'HEAD'));
    assert.match(cliOk(moved.main, 'show', 'TEC-001'), /Aggiunta concorrente/);

    // Concurrent allocation of the same ID conflicts: abort rebase, keep the original commit, do not push.
    const conflict = fixture('conflict');
    commitAddition(conflict.main, 'Locale');
    const localCommit = ok(conflict.main, 'rev-parse', 'HEAD');
    commitAddition(conflict.other, 'Remoto');
    ok(conflict.other, 'push', '-q');
    assert.notEqual(git(conflict.main, 'push').status, 0);
    assert.notEqual(git(conflict.main, 'pull', '--rebase').status, 0);
    ok(conflict.main, 'rebase', '--abort');
    assert.equal(ok(conflict.main, 'rev-parse', 'HEAD'), localCommit);
    assert.notEqual(ok(conflict.remote, 'rev-parse', 'refs/heads/main'), localCommit);
    assert.match(cliOk(conflict.main, 'show', 'TEC-001'), /Locale/);

    // A successful rebase followed by an invalid synthetic store must stop before retrying the push.
    const invalid = fixture('invalid');
    commitAddition(invalid.main, 'Locale');
    mkdirSync(join(invalid.other, 'backlog/items'), { recursive: true });
    writeFileSync(join(invalid.other, 'backlog/items/TEC-999.json'), '{}\n');
    ok(invalid.other, 'add', 'backlog');
    ok(invalid.other, 'commit', '-qm', 'store sintetico non valido');
    ok(invalid.other, 'push', '-q');
    const invalidRemote = ok(invalid.remote, 'rev-parse', 'refs/heads/main');
    assert.notEqual(git(invalid.main, 'push').status, 0);
    ok(invalid.main, 'pull', '--rebase');
    assert.notEqual(cli(invalid.main, 'check').status, 0);
    assert.equal(ok(invalid.remote, 'rev-parse', 'refs/heads/main'), invalidRemote);
    assert.equal(ok(invalid.main, 'log', '-1', '--format=%s'), 'docs(TEC-001): aggiunge item');

    // A non-fast-forward error is not assumed for other failures: retain the local commit.
    const rejected = fixture('rejected');
    commitAddition(rejected.main, 'Rifiutato');
    const kept = ok(rejected.main, 'rev-parse', 'HEAD');
    const previous = ok(rejected.remote, 'rev-parse', 'refs/heads/main');
    ok(rejected.remote, 'config', 'receive.denyNonFastForwards', 'true');
    writeFileSync(join(rejected.remote, 'hooks/pre-receive'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    assert.notEqual(git(rejected.main, 'push').status, 0);
    assert.equal(ok(rejected.main, 'rev-parse', 'HEAD'), kept);
    assert.equal(ok(rejected.remote, 'rev-parse', 'refs/heads/main'), previous);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adopted instructions contain publication safeguards and recovery', () => {
  const skill = readFileSync('.agents/skills/add-item/SKILL.md', 'utf8');
  for (const phrase of [
    'working tree is clean', 'git pull --ff-only', 'git log --oneline @{u}..',
    'If it is not empty, stop', 'exactly one commit on `main`', 'push it at once (`git push`)',
    'No quality gate is needed', 'Skip the push if there is no upstream', 'git pull --rebase',
    'backlog check', 'git rebase --abort', 'keep the local commit', 'Any other push failure',
  ]) assert.ok(skill.includes(phrase), phrase);
  const processDoc = readFileSync('docs/PROCESS.md', 'utf8');
  assert.ok(processDoc.includes('This is the only automatic push of `main`'));
  const agents = readFileSync('AGENTS.md', 'utf8');
  assert.ok(agents.includes('il push del solo commit documentale di aggiunta di un item non richiede il gate'));
});
