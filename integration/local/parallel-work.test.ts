import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// Synthetic simulation of the orchestrator and worker procedures of docs/PROCESS.md §6.5 and of the
// orchestrate, start-task, finish-task and merge-task skills. It proves the Git commands and record
// checks the instructions rely on; it does not prove that a model follows the instructions.

const STATES = ['Todo', 'In Progress', 'Blocked', 'Done'] as const;
type State = (typeof STATES)[number];

interface Item {
  id: string;
  title: string;
  module: string | null;
  state: State;
  dependencies: string[];
}

function mechanicalCountCommand(version: string): string {
  const processDoc = readFileSync('docs/PROCESS.md', 'utf8');
  const line = processDoc.split('\n').map((entry) => entry.trim()).find((entry) => entry.startsWith("awk '/^## Version vX.Y.Z/"));
  assert.ok(line, 'mechanical count command missing from docs/PROCESS.md §7');
  return line.replace('vX.Y.Z', version);
}

/** Runs the literal command of docs/PROCESS.md §7 and returns the count per state. */
function mechanicalCount(directory: string, version: string): Record<State, number> {
  const result = spawnSync('bash', ['-c', mechanicalCountCommand(version)], { cwd: directory, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const counts: Record<State, number> = { Todo: 0, 'In Progress': 0, Blocked: 0, Done: 0 };
  for (const line of result.stdout.split('\n')) {
    const match = /^\s*(\d+) Status:\*\* (.+?)\s*$/.exec(line);
    if (match === null) continue;
    assert.ok((STATES as readonly string[]).includes(match[2]), `unexpected state ${match[2]}`);
    counts[match[2] as State] = Number(match[1]);
  }
  return counts;
}

function parseItems(backlog: string, version: string | null): Item[] {
  const section = version === null ? backlog : backlog.split(`## Version ${version}`)[1]?.split(/\n## /)[0] ?? '';
  return section.split(/\n(?=#### )/).filter((block) => block.startsWith('#### ')).map((block) => {
    const heading = /^#### (\S+) — (.+)$/m.exec(block);
    const state = /\*\*Status:\*\* ([A-Za-z ]+?)\s*$/m.exec(block.split(/\n## /)[0]);
    const module = /\*\*Module:\*\* (MOD-\d+)/.exec(block);
    const dependencies = /\*\*Dependencies:\*\* (.+)$/m.exec(block)?.[1]?.split(/[;(]/)[0].trim() ?? 'none';
    if (heading === null || state === null) {
      assert.equal(version, null, `item without heading or state in ${version}`);
      return null;
    }
    return {
      id: heading[1],
      title: heading[2],
      module: module?.[1] ?? null,
      state: state[1] as State,
      dependencies: dependencies === 'none' ? [] : dependencies.split(',').map((entry) => entry.trim()),
    };
  }).filter((item): item is Item => item !== null);
}

/** Todo items of the version whose dependencies, in any version, are all Done. */
function nextReady(items: Item[], all: Item[] = items): Item[] {
  const done = new Set(all.filter((item) => item.state === 'Done').map((item) => item.id));
  return items.filter((item) => item.state === 'Todo' && item.dependencies.every((dependency) => done.has(dependency)));
}

/** Regenerates the synthetic STATUS.md from BACKLOG.md, as required for conflicts (§6.3, §7). */
function renderStatus(backlog: string, version: string, date: string): string {
  const items = parseItems(backlog, version);
  const count = (state: State) => items.filter((item) => item.state === state).length;
  const done = count('Done');
  const rows = (selected: Item[]) => selected.length === 0 ? 'None.' : selected.map((item) => `| ${item.id} | ${item.module ?? '—'} | ${item.title} |`).join('\n');
  return [
    '# Project status', '', `**Last update:** ${date}`, '', '## Current version', '',
    `| ${version} | Open | ${done}/${items.length} items done (${Math.round((done / items.length) * 100)}%) |`, '',
    ...STATES.map((state) => `| ${state} | ${count(state)} |`), '',
    '## In progress', '', rows(items.filter((item) => item.state === 'In Progress')), '',
    '## Blocked', '', rows(items.filter((item) => item.state === 'Blocked')), '',
    '## Next ready items', '', rows(nextReady(items)), '',
  ].join('\n');
}

function sectionIds(status: string, heading: string): string[] {
  const body = status.split(`## ${heading}`)[1]?.split(/\n## /)[0] ?? '';
  return [...body.matchAll(/^\| ((?:US|TEC|SPIKE|BUG)-\d+) \|/gm)].map((match) => match[1]);
}

/** The check of docs/PROCESS.md §7: mechanical count against state table, progress and lists. */
function statusProblems(directory: string): string[] {
  const status = readFileSync(join(directory, 'STATUS.md'), 'utf8');
  const backlog = readFileSync(join(directory, 'BACKLOG.md'), 'utf8');
  const current = /^\| (v\d+\.\d+\.\d+) \| Open \|.*?(\d+)\/(\d+) items done \((\d+)%\)/m.exec(status);
  if (current === null) return ['current version or progress missing'];
  const version = current[1];
  const counts = mechanicalCount(directory, version);
  const total = STATES.reduce((sum, state) => sum + counts[state], 0);
  const problems: string[] = [];
  for (const state of STATES) {
    const row = new RegExp(`^\\| ${state} \\| *(\\d+) \\|`, 'm').exec(status);
    if (Number(row?.[1]) !== counts[state]) problems.push(`count ${state}`);
  }
  if (Number(current[2]) !== counts.Done || Number(current[3]) !== total) problems.push('progress');
  if (total > 0 && Number(current[4]) !== Math.round((counts.Done / total) * 100)) problems.push('percentage');
  const items = parseItems(backlog, version);
  const ids = new Set(items.map((item) => item.id));
  // Lists may also show items outside the current version (for example unassigned ones): compare the version items.
  const expect = (heading: string, selected: Item[]) => {
    if (sectionIds(status, heading).filter((id) => ids.has(id)).sort().join() !== selected.map((item) => item.id).sort().join()) problems.push(heading);
  };
  expect('In progress', items.filter((item) => item.state === 'In Progress'));
  expect('Blocked', items.filter((item) => item.state === 'Blocked'));
  expect('Next ready items', nextReady(items, parseItems(backlog, null)));
  return problems;
}

function itemBlock(id: string, title: string, state: State, dependencies: string, module: string | null): string {
  return [
    `#### ${id} — ${title}`, '',
    '- **Epic:** EPIC-001 — Sintetico',
    ...(module === null ? [] : [`- **Module:** ${module} — Sintetico`]),
    `- **Type:** Task · **Priority:** P1 · **Status:** ${state}`,
    `- **Dependencies:** ${dependencies}`,
    '- **Acceptance criteria:**', '  - Criterio sintetico verificabile.', '',
  ].join('\n');
}

function setState(backlog: string, id: string, state: State, extra = ''): string {
  const pattern = new RegExp(`(#### ${id} — [^\\n]*\\n(?:(?!#### )[\\s\\S])*?\\*\\*Status:\\*\\* )[A-Za-z ]+`);
  assert.match(backlog, pattern);
  const updated = backlog.replace(pattern, `$1${state}`);
  return extra === '' ? updated : updated.replace(new RegExp(`(#### ${id} — [^\\n]*\\n(?:(?!#### )[\\s\\S])*?- \\*\\*Acceptance criteria:\\*\\*\\n  - [^\\n]*\\n)`), `$1${extra}\n`);
}

test('orchestrated parallel work on isolated synthetic repositories', () => {
  const root = mkdtempSync(join(tmpdir(), 'pilates-parallel-'));
  try {
    const env = {
      PATH: process.env.PATH, HOME: root, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
      GIT_TERMINAL_PROMPT: '0', GIT_AUTHOR_NAME: 'Synthetic', GIT_COMMITTER_NAME: 'Synthetic',
      GIT_AUTHOR_EMAIL: 'synthetic@example.invalid', GIT_COMMITTER_EMAIL: 'synthetic@example.invalid',
    };
    const git = (cwd: string, ...args: string[]) => spawnSync('git', ['-C', cwd, '-c', 'core.hooksPath=/dev/null', ...args], { env, encoding: 'utf8' });
    const ok = (cwd: string, ...args: string[]): string => {
      const result = git(cwd, ...args);
      assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
      return result.stdout.trim();
    };
    const today = spawnSync('date', ['+%F'], { encoding: 'utf8' }).stdout.trim();
    assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
    const version = 'v0.1.0';
    const read = (directory: string, file: string) => readFileSync(join(directory, file), 'utf8');
    const write = (directory: string, file: string, text: string) => writeFileSync(join(directory, file), text);

    // Synthetic project and origin.
    const remote = join(root, 'origin.git');
    const main = join(root, 'synthetic-project');
    const workspaceRoot = join(root, 'synthetic-project-work');
    const seed = join(root, 'seed');
    ok(root, 'init', '-q', '-b', 'main', seed);
    const backlog = [
      '# Backlog', '', `## Version ${version}`, '', '**State:** Open', '',
      itemBlock('TEC-001', 'Base', 'Done', 'none', null),
      itemBlock('US-001', 'Prima funzione', 'Todo', 'TEC-001', 'MOD-001'),
      itemBlock('TEC-002', 'Attivita indipendente', 'Todo', 'none', null),
      itemBlock('US-002', 'Seconda funzione', 'Todo', 'TEC-001', 'MOD-001'),
      itemBlock('US-003', 'Funzione dipendente', 'Todo', 'US-001', 'MOD-001'),
      itemBlock('TEC-003', 'Attivita rilasciabile', 'Todo', 'none', null),
      '## Dependencies and suggested order', '', 'Sintetico.', '',
    ].join('\n');
    write(seed, 'BACKLOG.md', backlog);
    write(seed, 'STATUS.md', renderStatus(backlog, version, today));
    write(seed, 'AGENTS.md', '## 10. Parallel work\n\n- **Shared claims:** `on`\n- **Parallel work:** `on`\n- **Workspace root:** `../synthetic-project-work`\n- **Worker agent command:** `pi`\n');
    ok(seed, 'add', '.');
    ok(seed, 'commit', '-qm', 'base sintetica');
    ok(root, 'clone', '-q', '--bare', seed, remote);
    ok(root, 'clone', '-q', remote, main);
    assert.deepEqual(statusProblems(main), []);

    // Orchestrator checks: Parallel work and Shared claims on, origin present; otherwise no workers.
    const settingsProblems = (agents: string, directory: string): string[] => {
      const problems: string[] = [];
      for (const setting of ['Shared claims', 'Parallel work']) {
        if (!new RegExp(`- \\*\\*${setting}:\\*\\* \`on\``).test(agents)) problems.push(setting);
      }
      if (!ok(directory, 'remote').split('\n').includes('origin')) problems.push('origin');
      return problems;
    };
    assert.deepEqual(settingsProblems(read(main, 'AGENTS.md'), main), []);
    assert.deepEqual(settingsProblems(read(main, 'AGENTS.md').replace('**Parallel work:** `on`', '**Parallel work:** `off`'), main), ['Parallel work']);
    const noOrigin = join(root, 'no-origin');
    ok(root, 'init', '-q', noOrigin);
    assert.deepEqual(settingsProblems(read(main, 'AGENTS.md'), noOrigin), ['origin']);

    // Another clone already claimed TEC-002.
    const other = join(root, 'other-clone');
    ok(root, 'clone', '-q', remote, other);
    ok(other, 'switch', '-qc', 'task/TEC-002-attivita-indipendente');
    ok(other, 'push', '-qu', 'origin', 'task/TEC-002-attivita-indipendente');

    // Selection: ready, without any local or remote branch; overlaps by module are reported.
    const branchFor = (directory: string, id: string) => ok(directory, 'branch', '-a', '--list', `*/${id}-*`, '--format=%(refname:short)');
    const select = () => {
      ok(main, 'fetch', '--prune', 'origin');
      const ready = nextReady(parseItems(read(main, 'BACKLOG.md'), version)).filter((item) => branchFor(main, item.id) === '');
      const overlaps = ready.flatMap((first, index) => ready.slice(index + 1)
        .filter((second) => first.module !== null && first.module === second.module)
        .map((second) => `${first.id}+${second.id}`));
      return { ready: ready.map((item) => item.id), overlaps };
    };
    assert.deepEqual(select(), { ready: ['US-001', 'US-002', 'TEC-003'], overlaps: ['US-001+US-002'] });

    // Launch: one clone per item on main even if origin HEAD points elsewhere; never overwrite a folder.
    ok(root, '--git-dir', remote, 'symbolic-ref', 'HEAD', 'refs/heads/task/TEC-002-attivita-indipendente');
    const launch = (id: string): string | null => {
      const clone = join(workspaceRoot, id);
      if (existsSync(clone)) return null;
      mkdirSync(workspaceRoot, { recursive: true });
      ok(root, 'clone', '-q', '--branch', 'main', ok(main, 'remote', 'get-url', 'origin'), clone);
      return clone;
    };
    const workers = new Map<string, { clone: string; branch: string; go: boolean }>();
    const workerFor = (id: string) => {
      const worker = workers.get(id);
      assert.ok(worker, id);
      return worker;
    };
    const slugs: Record<string, string> = { 'US-001': 'us/US-001-prima-funzione', 'US-002': 'us/US-002-seconda-funzione', 'TEC-003': 'task/TEC-003-attivita-rilasciabile' };
    for (const id of ['US-001', 'US-002', 'TEC-003']) {
      const clone = launch(id);
      assert.ok(clone);
      assert.equal(ok(clone, 'branch', '--show-current'), 'main');
      workers.set(id, { clone, branch: slugs[id], go: false });
    }
    assert.equal(launch('US-001'), null);

    // Worker start: claim pushed, In Progress, mechanical count checked, then ready and stop.
    const startItem = (id: string) => {
      const worker = workers.get(id);
      assert.ok(worker);
      ok(worker.clone, 'fetch', '--prune', 'origin');
      assert.equal(branchFor(worker.clone, id), '');
      ok(worker.clone, 'switch', '-qc', worker.branch);
      const updated = setState(read(worker.clone, 'BACKLOG.md'), id, 'In Progress');
      write(worker.clone, 'BACKLOG.md', updated);
      write(worker.clone, 'STATUS.md', renderStatus(updated, version, today));
      assert.deepEqual(statusProblems(worker.clone), []);
      ok(worker.clone, 'commit', '-qam', `chore(${id}): avvia attività`);
      ok(worker.clone, 'push', '-qu', 'origin', worker.branch);
      return 'ready';
    };
    for (const id of workers.keys()) assert.equal(startItem(id), 'ready');
    assert.deepEqual(select().ready, []);

    // Orchestrator view: waiting for the go = item branch with only the start commit.
    const view = (id: string) => {
      const worker = workers.get(id);
      assert.ok(worker);
      ok(main, 'fetch', '--prune', 'origin');
      const state = parseItems(ok(main, 'show', `origin/${worker.branch}:BACKLOG.md`), version).find((item) => item.id === id)?.state;
      const commits = ok(main, 'log', '--format=%s', `origin/main..origin/${worker.branch}`).split('\n');
      const waitingGo = commits.length === 1 && commits[0] === `chore(${id}): avvia attività`;
      return { state, waitingGo, waitingMerge: state === 'Done' };
    };
    for (const id of workers.keys()) assert.deepEqual(view(id), { state: 'In Progress', waitingGo: true, waitingMerge: false });

    // A worker implements only after the user's go.
    const implement = (id: string, file: string, date = today) => {
      const worker = workers.get(id);
      assert.ok(worker);
      if (!worker.go) return 'waiting for go';
      write(worker.clone, file, `contenuto sintetico ${id}\n`);
      ok(worker.clone, 'add', file);
      ok(worker.clone, 'commit', '-qm', `feat(${id}): implementazione sintetica`);
      const updated = setState(read(worker.clone, 'BACKLOG.md'), id, 'Done', `- **Outcome:** Consegna sintetica. Completato il ${date}.`);
      write(worker.clone, 'BACKLOG.md', updated);
      write(worker.clone, 'STATUS.md', renderStatus(updated, version, date));
      assert.deepEqual(statusProblems(worker.clone), []);
      ok(worker.clone, 'commit', '-qam', `chore(${id}): completa attività`);
      ok(worker.clone, 'push', '-q', 'origin', worker.branch);
      return 'done';
    };
    const usOneBefore = ok(main, 'rev-parse', `origin/${slugs['US-001']}`);
    assert.equal(implement('US-001', 'one.txt'), 'waiting for go');
    ok(main, 'fetch', '--prune', 'origin');
    assert.equal(ok(main, 'rev-parse', `origin/${slugs['US-001']}`), usOneBefore);

    // Release is refused once the branch contains more than the start commit.
    const releaseAllowed = (id: string) => view(id).waitingGo;
    for (const id of ['US-001', 'US-002']) workerFor(id).go = true;
    assert.equal(implement('US-001', 'one.txt'), 'done');
    assert.equal(implement('US-002', 'two.txt', '2000-01-01'), 'done');
    assert.equal(releaseAllowed('US-001'), false);
    assert.deepEqual(view('US-001'), { state: 'Done', waitingGo: false, waitingMerge: true });

    // Pre-merge record check on the branch: Outcome date from the clock and mechanical count.
    const recordProblems = (id: string): string[] => {
      const worker = workers.get(id);
      assert.ok(worker);
      ok(main, 'switch', '-q', worker.branch);
      try {
        const item = read(main, 'BACKLOG.md').split(`#### ${id} — `)[1]?.split('\n#### ')[0] ?? '';
        const outcome = /\*\*Outcome:\*\*.*?(\d{4}-\d{2}-\d{2})/.exec(item)?.[1];
        const problems = statusProblems(main);
        const committed = ok(main, 'log', '-1', '--format=%cs');
        if (outcome !== committed) problems.push(`outcome date ${outcome ?? 'missing'}`);
        if (!new RegExp(`\\*\\*Last update:\\*\\* ${committed}`).test(read(main, 'STATUS.md'))) problems.push('status date');
        return problems;
      } finally {
        ok(main, 'switch', '-q', 'main');
      }
    };
    const merge = (id: string): { merged: boolean; conflicts: string[] } => {
      const worker = workers.get(id);
      assert.ok(worker);
      if (recordProblems(id).length > 0) return { merged: false, conflicts: [] };
      const result = git(main, 'merge', '--no-ff', '-m', `merge(${id}): sintetico`, worker.branch);
      const conflicts = ok(main, 'diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
      if (result.status !== 0) {
        assert.deepEqual(conflicts, ['STATUS.md'], 'only STATUS.md may be resolved by regeneration');
        // Never pick a side: regenerate STATUS.md from the merged BACKLOG.md, then count mechanically.
        write(main, 'STATUS.md', renderStatus(read(main, 'BACKLOG.md'), version, today));
        assert.deepEqual(statusProblems(main), []);
        ok(main, 'add', 'STATUS.md');
        ok(main, 'commit', '-q', '--no-edit');
      }
      ok(main, 'push', '-q', 'origin', 'main');
      ok(main, 'push', '-q', 'origin', '--delete', worker.branch);
      ok(main, 'branch', '-D', worker.branch);
      return { merged: true, conflicts };
    };

    // A wrong date blocks the merge; the worker fixes it on its branch, never in the merge commit.
    const mainBefore = ok(main, 'rev-parse', 'main');
    assert.ok(recordProblems('US-002').some((problem) => problem.startsWith('outcome date')));
    assert.deepEqual(merge('US-002'), { merged: false, conflicts: [] });
    assert.equal(ok(main, 'rev-parse', 'main'), mainBefore);
    const usTwo = workerFor('US-002');
    write(usTwo.clone, 'BACKLOG.md', read(usTwo.clone, 'BACKLOG.md').replace('Completato il 2000-01-01', `Completato il ${today}`));
    write(usTwo.clone, 'STATUS.md', read(usTwo.clone, 'STATUS.md').replace('2000-01-01', today));
    ok(usTwo.clone, 'commit', '-qam', 'chore(US-002): corregge la data');
    ok(usTwo.clone, 'push', '-q', 'origin', usTwo.branch);
    ok(main, 'fetch', '--prune', 'origin');
    ok(main, 'branch', '-f', usTwo.branch, `origin/${usTwo.branch}`);
    ok(main, 'branch', '-f', slugs['US-001'], `origin/${slugs['US-001']}`);
    assert.deepEqual(recordProblems('US-002'), []);

    // Merge one at a time; the second merge conflicts only in STATUS.md.
    assert.deepEqual(merge('US-001'), { merged: true, conflicts: [] });
    const second = merge('US-002');
    assert.deepEqual(second, { merged: true, conflicts: ['STATUS.md'] });
    // The merge commit changes nothing beyond the conflict resolution: compared with Git's own merge
    // of the two parents, only the conflicted file differs.
    const automatic = git(main, 'merge-tree', '--write-tree', 'HEAD^1', 'HEAD^2');
    assert.equal(automatic.status, 1, automatic.stderr);
    assert.equal(ok(main, 'diff', '--name-only', automatic.stdout.split('\n')[0], 'HEAD'), 'STATUS.md');
    for (const file of ['one.txt', 'two.txt']) ok(main, 'cat-file', '-e', `HEAD:${file}`);
    assert.deepEqual(statusProblems(main), []);
    assert.deepEqual(parseItems(read(main, 'BACKLOG.md'), version).filter((item) => item.state === 'Done').map((item) => item.id), ['TEC-001', 'US-001', 'US-002']);
    assert.match(read(main, 'STATUS.md'), /^\| US-003 \|/m);

    // A STATUS.md with a wrong count is detected even if the progress line was updated.
    const wrong = join(root, 'wrong-status');
    mkdirSync(wrong);
    write(wrong, 'BACKLOG.md', read(main, 'BACKLOG.md'));
    write(wrong, 'STATUS.md', read(main, 'STATUS.md').replace(/^\| Todo \| \d+ \|/m, '| Todo | 9 |'));
    assert.deepEqual(statusProblems(wrong), ['count Todo']);

    // Cleanup: only merged and deleted branches, never with uncommitted or unpushed work.
    const cleanup = (id: string): 'removed' | 'kept' => {
      const worker = workers.get(id);
      assert.ok(worker);
      ok(main, 'fetch', '--prune', 'origin');
      assert.equal(ok(main, 'branch', '-r', '--list', `origin/*/${id}-*`), '');
      ok(worker.clone, 'fetch', '--prune', 'origin');
      if (ok(worker.clone, 'status', '--porcelain') !== '' || ok(worker.clone, 'log', '--branches', '--not', '--remotes', '--oneline') !== '') return 'kept';
      rmSync(worker.clone, { recursive: true });
      return 'removed';
    };
    const usOne = workerFor('US-001');
    write(usOne.clone, 'unsaved.txt', 'lavoro non salvato\n');
    assert.equal(cleanup('US-001'), 'kept');
    rmSync(join(usOne.clone, 'unsaved.txt'));
    write(usOne.clone, 'unsaved.txt', 'commit non pubblicato\n');
    ok(usOne.clone, 'add', 'unsaved.txt');
    ok(usOne.clone, 'commit', '-qm', 'locale');
    assert.equal(cleanup('US-001'), 'kept');
    assert.ok(existsSync(usOne.clone));
    ok(usOne.clone, 'reset', '-q', '--hard', 'HEAD^');
    assert.equal(cleanup('US-001'), 'removed');
    assert.equal(cleanup('US-002'), 'removed');

    // Release: a claimed item without the go, with only its start commit, after the cleanup checks.
    assert.equal(releaseAllowed('TEC-003'), true);
    const releasing = workerFor('TEC-003');
    assert.equal(ok(releasing.clone, 'status', '--porcelain'), '');
    assert.equal(ok(releasing.clone, 'log', '--branches', '--not', '--remotes', '--oneline'), '');
    ok(main, 'push', '-q', 'origin', '--delete', releasing.branch);
    rmSync(releasing.clone, { recursive: true });
    ok(main, 'fetch', '--prune', 'origin');
    assert.equal(parseItems(read(main, 'BACKLOG.md'), version).find((item) => item.id === 'TEC-003')?.state, 'Todo');
    assert.deepEqual(select(), { ready: ['US-003', 'TEC-003'], overlaps: [] });
    assert.ok(existsSync(workspaceRoot));
    assert.ok(existsSync(other));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('project STATUS.md matches the mechanical count of BACKLOG.md', () => {
  assert.deepEqual(statusProblems('.'), []);
});

test('parallel work settings and instructions keep the studio protections', () => {
  const agents = readFileSync('AGENTS.md', 'utf8');
  for (const setting of ['- **Shared claims:** `on`', '- **Parallel work:** `on`', '- **Workspace root:** `../agent-pilates-studio-work`', '- **Worker agent command:** `pi`']) {
    assert.ok(agents.includes(setting), setting);
  }
  assert.match(agents, /non copiare `\.env`, `\.local\/`/);
  const skill = readFileSync('.agents/skills/orchestrate/SKILL.md', 'utf8');
  assert.match(skill, /^disable-model-invocation: true$/m);
  for (const phrase of [
    'Run only because the user explicitly asked', 'never implement items yourself', 'Never give the go on your own',
    'Merge only on explicit user request, one item at a time', 'never overwrite it', 'do not remove the clone',
    'Never clean up a worker whose branch is not merged', 'Never merge, never push main, never remove clones and never start other agents',
  ]) {
    assert.ok(skill.includes(phrase), phrase);
  }
  const processDoc = readFileSync('docs/PROCESS.md', 'utf8');
  assert.match(processDoc, /\*\*Process version:\*\* 1\.6\.1/);
  for (const phrase of ['read from the system clock (`date +%F`)', 'After every update of `STATUS.md`, count the item states mechanically', 'The merge commit contains only the merge and the resolution of its conflicts', 'regenerate `STATUS.md` from the merged `BACKLOG.md`']) {
    assert.ok(processDoc.includes(phrase), phrase);
  }
  const merge = readFileSync('.agents/skills/merge-task/SKILL.md', 'utf8');
  assert.match(merge, /Check the item's records on the branch/);
  for (const name of ['add-item', 'start-task', 'finish-task', 'close-version']) {
    assert.match(readFileSync(`.agents/skills/${name}/SKILL.md`, 'utf8'), /date \+%F|mechanically/, name);
  }
});
