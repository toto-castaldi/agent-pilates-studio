import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

interface RecordItem { id: string; title: string; status: string }
interface Exported {
  items: RecordItem[];
  branches?: { fetch: string; remotes: string[]; items: Record<string, { source: string; also_in: string[] }> };
}
interface BranchFixture { project: string; remote: string; first: string; second: string; branch_only: string }

function withFixture(exercise: (fixture: ReturnType<typeof makeFixture>) => void) {
  const root = mkdtempSync(join(tmpdir(), 'pilates-backlog-branches-'));
  try { exercise(makeFixture(root)); } finally { rmSync(root, { recursive: true, force: true }); }
}

function makeFixture(root: string) {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH, HOME: root, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '1', GIT_AUTHOR_NAME: 'Synthetic', GIT_COMMITTER_NAME: 'Synthetic',
    GIT_AUTHOR_EMAIL: 'synthetic@example.invalid', GIT_COMMITTER_EMAIL: 'synthetic@example.invalid',
  };
  const created = spawnSync('python3', ['integration/backlog_fixture.py', 'branches', root], { env, encoding: 'utf8' });
  assert.equal(created.status, 0, created.stderr);
  const data = JSON.parse(created.stdout) as BranchFixture;
  const run = (...args: string[]) => spawnSync('python3', [join(data.project, '.agents/tools/backlog.py'), ...args], {
    cwd: data.project, env, encoding: 'utf8', timeout: 25_000,
  });
  const cli = (...args: string[]) => {
    const result = run(...args);
    assert.equal(result.status, 0, `${result.error?.message ?? ''}\n${result.stderr}\n${result.stdout}`);
    return result.stdout;
  };
  const git = (...args: string[]) => {
    const result = spawnSync('git', ['-C', data.project, '-c', 'core.hooksPath=/dev/null', ...args], { env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const exported = (...args: string[]) => JSON.parse(cli('export', '--json', ...args)) as Exported;
  return { root, env, ...data, run, cli, git, exported };
}

function workingTree(root: string): [string, string][] {
  return readdirSync(root, { withFileTypes: true }).filter((entry) => entry.name !== '.git').flatMap((entry): [string, string][] => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? workingTree(path) : [[path, readFileSync(path).toString('base64')]];
  });
}

test('all five CLI views share branch resolution, provenance and no-fetch without worktree writes', () => withFixture((f) => {
  const before = workingTree(f.project);
  const status = f.git('status', '--porcelain');
  assert.equal(f.exported().items[0].status, 'Todo');
  assert.equal(f.exported().branches, undefined);
  const cached = f.exported('--branches', '--no-fetch');
  assert.equal(cached.branches?.fetch, 'skipped');
  assert.deepEqual(cached.branches?.items, { 'TEC-001': { source: f.second, also_in: [] } });
  assert.equal(cached.items[0].status, 'In Progress');
  assert.equal(f.git('branch', '-r', '--list', `origin/${f.first}`), '');
  const flags = ['--branches', '--no-fetch'];
  const statusView = JSON.parse(f.cli('status', '--json', ...flags));
  assert.equal(statusView.in_progress[0].id, 'TEC-001');
  assert.equal(JSON.parse(f.cli('list', '--json', ...flags)).items[0].status, 'In Progress');
  assert.equal(JSON.parse(f.cli('ready', '--json', ...flags)).total, 0);
  assert.equal(JSON.parse(f.cli('show', 'TEC-001', '--json', ...flags)).status, 'In Progress');
  assert.match(f.cli('export', ...flags), /\*\*Status:\*\* In Progress/);
  assert.equal(f.git('branch', '-r', '--list', `origin/${f.first}`), '', '--no-fetch must not contact the remote');

  const fetched = f.exported('--branches');
  assert.equal(fetched.branches?.fetch, 'done');
  assert.deepEqual(fetched.items.map((item) => item.id), ['TEC-001'], 'a branch-only item is not added');
  assert.deepEqual(fetched.branches?.items, { 'TEC-001': { source: f.second, also_in: [`origin/${f.first}`] } });
  assert.equal(fetched.items[0].status, 'In Progress', 'local wins even over the newer remote Done commit');
  assert.ok(Number(f.git('log', '-1', '--format=%ct', `origin/${f.second}`)) > Number(f.git('log', '-1', '--format=%ct', f.second)));
  const shown = f.cli('show', 'TEC-001', ...flags);
  assert.ok(shown.includes(`**From branch:** ${f.second}`));
  assert.ok(shown.includes(`**Also in:** origin/${f.first}`));
  // Explicitly agreed upstream contract: show JSON is the record only; export JSON holds provenance.
  assert.deepEqual(JSON.parse(f.cli('show', 'TEC-001', '--json', ...flags)), fetched.items[0]);
  assert.equal(JSON.parse(f.cli('ready', '--json')).total, 1, 'default remains checkout-only');
  assert.deepEqual(workingTree(f.project), before);
  assert.equal(f.git('status', '--porcelain'), status);
}));

test('the current item keeps its uncommitted working-tree record over every competing branch', () => withFixture((f) => {
  f.cli('export', '--branches', '--json');
  f.git('switch', '-q', f.second);
  f.cli('edit', 'TEC-001', '--title', 'Synthetic working copy');
  f.cli('block', 'TEC-001', '--reason', 'Synthetic uncommitted blocker');
  const before = workingTree(f.project);
  const view = f.exported('--branches', '--no-fetch');
  assert.equal(view.items[0].title, 'Synthetic working copy');
  assert.equal(view.items[0].status, 'Blocked');
  assert.deepEqual(view.branches?.items, {});
  assert.doesNotMatch(f.cli('show', 'TEC-001', '--branches', '--no-fetch'), /From branch|Also in/);
  assert.deepEqual(workingTree(f.project), before);
  assert.ok(f.git('status', '--porcelain').includes('backlog/items/TEC-001.json'));
}));

test('newest competing commit wins and invalid branch records fall back with a warning', () => withFixture((f) => {
  f.cli('export', '--branches', '--json');
  f.git('branch', '-D', f.second);
  let view = f.exported('--branches', '--no-fetch');
  assert.equal(view.items[0].status, 'Done');
  assert.deepEqual(view.branches?.items['TEC-001'], { source: `origin/${f.second}`, also_in: [`origin/${f.first}`] });
  const newest = 'task/TEC-001-newest';
  f.git('switch', '-qc', newest);
  f.cli('start', 'TEC-001', '--branch', newest);
  f.cli('block', 'TEC-001', '--reason', 'Synthetic newest');
  f.env.GIT_COMMITTER_DATE = '2020-01-07T00:00:00Z';
  f.git('commit', '-qam', 'Synthetic newest', '--date=2020-01-07T00:00:00Z');
  f.git('switch', '-q', 'main');
  view = f.exported('--branches', '--no-fetch');
  assert.equal(view.items[0].status, 'Blocked');
  assert.equal(view.branches?.items['TEC-001'].source, newest);
  const invalid = 'task/TEC-001-invalid';
  f.git('switch', '-qc', invalid);
  writeFileSync(join(f.project, 'backlog/items/TEC-001.json'), '{');
  f.env.GIT_COMMITTER_DATE = '2020-01-08T00:00:00Z';
  f.git('commit', '-qam', 'Synthetic invalid item', '--date=2020-01-08T00:00:00Z');
  f.git('switch', '-q', 'main');
  const result = f.run('export', '--json', '--branches', '--no-fetch');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /holds an invalid item file for TEC-001/);
  view = JSON.parse(result.stdout);
  assert.equal(view.branches?.items['TEC-001'].source, newest);
  assert.ok(view.branches?.items['TEC-001'].also_in.includes(invalid));
}));

test('branches merged into local main or a remote default other than main are excluded', () => withFixture((f) => {
  f.git('fetch', '--prune', 'origin');
  f.git('push', '-q', 'origin', `${f.second}:trunk`);
  f.git('fetch', '-q', 'origin');
  f.git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk');
  let view = f.exported('--branches', '--no-fetch');
  assert.equal(view.items[0].status, 'Blocked');
  assert.deepEqual(view.branches?.items, { 'TEC-001': { source: `origin/${f.first}`, also_in: [] } });
  f.git('merge', '--no-ff', '-qm', 'Synthetic integration', `origin/${f.first}`);
  view = f.exported('--branches', '--no-fetch');
  assert.deepEqual(view.branches?.items, {});
  assert.equal(view.items[0].status, 'Blocked');
}));

test('failed fetch warns and preserves usable cached references and the checkout', () => withFixture((f) => {
  const cached = f.exported('--branches');
  f.git('remote', 'set-url', 'origin', join(f.root, 'missing.git'));
  const before = workingTree(f.project);
  const result = f.run('export', '--json', '--branches');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /warning: git fetch failed, branch data may be stale/);
  const failed = JSON.parse(result.stdout) as Exported;
  assert.equal(failed.branches?.fetch, 'failed');
  assert.deepEqual(failed.branches?.items, cached.branches?.items);
  assert.deepEqual(failed.items, cached.items);
  assert.equal(f.run('export', '--json', '--branches', '--no-fetch').stderr, '');
  assert.deepEqual(workingTree(f.project), before);
}));

function spyOnFetch(f: ReturnType<typeof makeFixture>, delay: boolean) {
  const realGit = spawnSync('which', ['git'], { env: f.env, encoding: 'utf8' }).stdout.trim();
  assert.ok(realGit);
  const bin = join(f.root, 'bin');
  mkdirSync(bin);
  const log = join(f.root, 'fetch.json');
  const wrapper = join(bin, 'git');
  writeFileSync(wrapper, [
    '#!/usr/bin/env python3', 'import json, os, sys, time',
    "if len(sys.argv) > 3 and sys.argv[3] == 'fetch':",
    `    open(${JSON.stringify(log)}, 'w').write(json.dumps({'argv': sys.argv[3:], 'prompt': os.environ.get('GIT_TERMINAL_PROMPT')}))`,
    `    time.sleep(${delay ? 30 : 0})`,
    `os.execv(${JSON.stringify(realGit)}, ['git', *sys.argv[1:]])`, '',
  ].join('\n'));
  chmodSync(wrapper, 0o755);
  f.env.PATH = `${bin}:${f.env.PATH}`;
  return () => JSON.parse(readFileSync(log, 'utf8')) as { argv: string[]; prompt: string };
}

test('fetch really times out after ten seconds, without prompting or losing cached branch states', { timeout: 35_000 }, () => withFixture((f) => {
  const before = workingTree(f.project);
  const fetch = spyOnFetch(f, true);
  const start = Date.now();
  const result = f.run('export', '--json', '--branches');
  const elapsed = Date.now() - start;
  assert.equal(result.status, 0, `${result.error?.message ?? ''}\n${result.stderr}`);
  assert.match(result.stderr, /git fetch timed out after 10 s/);
  assert.ok(elapsed >= 9_500 && elapsed < 20_000, `fetch took ${elapsed} ms`);
  assert.deepEqual(fetch(), { argv: ['fetch', '--prune', '--quiet', 'origin'], prompt: '0' });
  const view = JSON.parse(result.stdout) as Exported;
  assert.equal(view.branches?.fetch, 'failed');
  assert.equal(view.items[0].status, 'In Progress');
  assert.deepEqual(workingTree(f.project), before);
}));

test('fetch chooses origin, falls back without origin, and reports non-Git stores without writing', () => withFixture((f) => {
  f.git('remote', 'add', 'unused', join(f.root, 'missing.git'));
  const fetch = spyOnFetch(f, false);
  assert.equal(f.exported('--branches').branches?.fetch, 'done');
  assert.deepEqual(fetch(), { argv: ['fetch', '--prune', '--quiet', 'origin'], prompt: '0' });
  f.git('remote', 'remove', 'unused');
  f.git('remote', 'rename', 'origin', 'upstream');
  const view = f.exported('--branches');
  assert.equal(view.branches?.fetch, 'done');
  assert.deepEqual(fetch(), { argv: ['fetch', '--prune', '--quiet'], prompt: '0' });
  assert.deepEqual(view.branches?.items['TEC-001'], { source: f.second, also_in: [`upstream/${f.first}`] });
  f.git('remote', 'remove', 'upstream');
  const withoutRemote = f.exported('--branches');
  assert.equal(withoutRemote.branches?.fetch, 'skipped');
  assert.deepEqual(withoutRemote.branches?.remotes, []);
  assert.equal(withoutRemote.items[0].status, 'In Progress');
  rmSync(join(f.project, '.git'), { recursive: true });
  const before = workingTree(f.project);
  const outside = f.run('export', '--json', '--branches');
  assert.equal(outside.status, 0, outside.stderr);
  assert.match(outside.stderr, /not a git repository, branch data not available/);
  assert.equal((JSON.parse(outside.stdout) as Exported).branches?.fetch, 'none');
  assert.deepEqual(workingTree(f.project), before);
}));
