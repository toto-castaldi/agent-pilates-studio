import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// Synthetic stores for the backlog.py commands and options adopted from template v4.4.0:
// changelog, done --changelog, edit --changelog, short show, three recent items in status and --help.

const DATE = /\d{4}-\d{2}-\d{2}/;

function fixture(exercise: (f: ReturnType<typeof setup>) => void) {
  const root = mkdtempSync(join(tmpdir(), 'pilates-backlog-changelog-'));
  try { exercise(setup(root)); } finally { rmSync(root, { recursive: true, force: true }); }
}

function setup(root: string) {
  mkdirSync(join(root, '.agents/tools'), { recursive: true });
  copyFileSync('.agents/tools/backlog.py', join(root, '.agents/tools/backlog.py'));
  const run = (...args: string[]) => spawnSync('python3', ['.agents/tools/backlog.py', ...args], {
    cwd: root, encoding: 'utf8', timeout: 10_000,
    env: { PATH: process.env.PATH, HOME: root, PYTHONDONTWRITEBYTECODE: '1' },
  });
  const cli = (...args: string[]) => {
    const result = run(...args);
    assert.equal(result.status, 0, `${result.error?.message ?? ''}\n${result.stderr}\n${result.stdout}`);
    return result.stdout;
  };
  const fails = (pattern: RegExp, ...args: string[]) => {
    const result = run(...args);
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stdout + result.stderr, pattern);
  };
  const snapshot = () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path); else files.push(`${path}\n${readFileSync(join(root, path), 'utf8')}`);
      }
    };
    walk('backlog');
    return files.sort();
  };
  cli('version', 'add', 'v0.1.0', '--goal', 'Synthetic');
  cli('version', 'add', 'v0.2.0', '--goal', 'Synthetic next', '--planned');
  cli('epic', 'add', '--title', 'Synthetic', '--scope', 'Synthetic');
  const add = (version: string, ...args: string[]) => cli('add', '--type', 'TEC', '--title', 'Synthetic item',
    '--version', version, '--epic', 'EPIC-001', '--priority', 'P1', '--criterion', 'Synthetic criterion', ...args).trim();
  const finish = (id: string, ...args: string[]) => {
    cli('start', id, '--branch', `task/${id}-synthetic`);
    return cli('done', id, '--outcome', 'Synthetic outcome', ...args);
  };
  return { root, run, cli, fails, snapshot, add, finish };
}

test('done --changelog records one normalized entry and changelog builds the open version section', () => fixture((f) => {
  for (let i = 0; i < 5; i++) f.add('v0.1.0');
  const other = f.add('v0.2.0');
  assert.equal(f.cli('changelog'), '## [Unreleased]\n');

  f.finish('TEC-003', '--changelog', 'Fixed:   synthetic   repair');
  f.finish('TEC-001', '--changelog', 'Added: synthetic feature');
  f.finish('TEC-002', '--changelog', 'Added: another synthetic feature');
  f.finish('TEC-004');
  f.cli('start', 'TEC-005', '--branch', 'task/TEC-005-synthetic');
  assert.equal(JSON.parse(f.cli('show', 'TEC-003', '--json')).changelog, 'Fixed: synthetic repair');
  assert.equal(JSON.parse(f.cli('show', 'TEC-004', '--json')).changelog, undefined);
  f.cli('check');

  // Sections in Keep a Changelog order, items by ID, ID appended by the CLI; items without an entry,
  // items not Done and items of other versions are left out.
  const expected = '## [Unreleased]\n\n### Added\n\n- synthetic feature (TEC-001)\n- another synthetic feature (TEC-002)\n\n'
    + '### Fixed\n\n- synthetic repair (TEC-003)\n';
  const before = f.snapshot();
  assert.equal(f.cli('changelog'), expected);
  assert.equal(f.cli('changelog', 'v0.1.0'), expected);
  assert.equal(f.cli('changelog', 'v0.2.0'), '## [Unreleased]\n');
  assert.deepEqual(f.snapshot(), before, 'changelog writes nothing');
  f.fails(/version v9\.9\.9 not found/, 'changelog', 'v9.9.9');
  assert.equal(other, 'TEC-006');
}));

test('changelog entries are validated, editable only on Done items and removed by reopen', () => fixture((f) => {
  f.add('v0.1.0');
  f.add('v0.1.0');
  f.cli('start', 'TEC-001', '--branch', 'task/TEC-001-synthetic');
  for (const entry of ['Synthetic without section', 'Improved: synthetic', 'Added:', 'added: synthetic']) {
    f.fails(/invalid changelog/, 'done', 'TEC-001', '--outcome', 'Synthetic', '--changelog', entry);
    assert.equal(JSON.parse(f.cli('show', 'TEC-001', '--json')).status, 'In Progress', 'a rejected done changes nothing');
  }

  f.fails(/is not Done/, 'edit', 'TEC-002', '--changelog', 'Added: synthetic');
  f.cli('done', 'TEC-001', '--outcome', 'Synthetic', '--changelog', 'Changed: synthetic first');
  f.cli('edit', 'TEC-001', '--changelog', 'Removed:  synthetic   correction');
  assert.equal(JSON.parse(f.cli('show', 'TEC-001', '--json')).changelog, 'Removed: synthetic correction');
  f.fails(/invalid changelog/, 'edit', 'TEC-001', '--changelog', 'Synthetic');
  assert.match(f.cli('show', 'TEC-001'), /- \*\*Changelog:\*\* Removed: synthetic correction/);
  f.cli('edit', 'TEC-001', '--changelog', '');
  assert.equal(f.cli('changelog'), '## [Unreleased]\n');

  f.cli('edit', 'TEC-001', '--changelog', 'Added: synthetic again');
  f.cli('reopen', 'TEC-001');
  const reopened = JSON.parse(f.cli('show', 'TEC-001', '--json'));
  assert.equal(reopened.changelog, undefined);
  assert.equal(reopened.outcome, undefined);
  f.cli('check');
}));

test('check rejects an invalid or non-Done changelog and close-version dates the generated section', () => fixture((f) => {
  f.add('v0.1.0');
  f.finish('TEC-001', '--changelog', 'Added: synthetic release');
  const record = join(f.root, 'backlog/items/TEC-001.json');
  const valid = readFileSync(record, 'utf8');
  const write = (changes: Record<string, unknown>) => {
    const data = { ...JSON.parse(valid), ...changes };
    writeFileSync(record, `${JSON.stringify(data, null, 2)}\n`);
  };
  write({ changelog: 'Synthetic' });
  f.fails(/invalid changelog/, 'check');
  write({ status: 'In Progress', outcome: undefined, closed_at: undefined });
  f.fails(/In Progress with changelog/, 'check');
  writeFileSync(record, valid);
  f.cli('check');

  f.cli('close-version', 'v0.1.0');
  const section = f.cli('changelog', 'v0.1.0');
  const heading = section.split('\n')[0];
  assert.match(heading, new RegExp(`^## \\[0\\.1\\.0\\] - ${DATE.source}$`));
  assert.equal(heading.slice(-10), JSON.parse(readFileSync(join(f.root, 'backlog/versions/v0.1.0.json'), 'utf8')).closed_at);
  assert.equal(section, `${heading}\n\n### Added\n\n- synthetic release (TEC-001)\n`);
  f.fails(/no open version/, 'changelog');
}));

test('show shortens Done and Dropped items unless --full, and status lists the three most recent items', () => fixture((f) => {
  const long = `Synthetic ${'x'.repeat(400)} tail`;
  for (let i = 0; i < 5; i++) f.add('v0.1.0', '--description', long, '--remark', 'Synthetic remark');
  f.cli('edit', 'TEC-001', '--criterion', 'First synthetic criterion', '--criterion', 'Second synthetic criterion');
  f.finish('TEC-001', '--changelog', 'Added: synthetic');
  f.finish('TEC-002');
  f.finish('TEC-003');
  f.finish('TEC-004');
  f.cli('drop', 'TEC-005', '--reason', 'Synthetic');

  const short = f.cli('show', 'TEC-001');
  const description = short.split('\n').find((line) => line.startsWith('- **Description:**')) ?? '';
  assert.ok(description.length < long.length, 'long description shortened');
  assert.ok(!short.includes('tail'));
  assert.match(short, /- \*\*Not shown:\*\* 2 acceptance criteria, 1 remarks \(show --full\)/);
  assert.ok(!short.includes('First synthetic criterion'));
  assert.match(short, /- \*\*Changelog:\*\* Added: synthetic/);
  assert.match(f.cli('show', 'TEC-005'), /Not shown:\*\* 1 acceptance criteria, 1 remarks/);

  const full = f.cli('show', 'TEC-001', '--full');
  assert.ok(full.includes(long));
  assert.match(full, /- \*\*Acceptance criteria:\*\*\n {2}- First synthetic criterion\n {2}- Second synthetic criterion/);
  assert.match(full, /- \*\*Remarks:\*\*\n {2}- Synthetic remark/);
  assert.ok(!full.includes('Not shown'));
  assert.equal(JSON.parse(f.cli('show', 'TEC-001', '--json')).description, long, '--json keeps the whole record');

  f.add('v0.1.0', '--description', long);
  const open = f.cli('show', 'TEC-006');
  assert.ok(open.includes(long), 'open items are shown in full');
  assert.match(open, /- \*\*Acceptance criteria:\*\*\n {2}- Synthetic criterion/);

  const status = f.cli('status');
  const recent = status.slice(status.indexOf('Recently completed'), status.indexOf('Closed versions'));
  assert.match(recent, /^Recently completed \(4\)\n/);
  assert.equal(recent.split('\n').filter((line) => /^ {2}\d{4}-/.test(line)).length, 3);
  assert.match(recent, /… 1 more/);
  assert.equal(JSON.parse(f.cli('status', '--json')).completed.length, 4, '--json keeps every Done item; Dropped ones are not completed');
}));

test('--help gives the syntax of every command in one call, and each command keeps its own help', () => fixture((f) => {
  const help = f.cli('--help');
  assert.match(help, /^usage: backlog\.py <command> \[options\]\n/);
  assert.match(help, /One line per command; `<command> --help` explains its options\./);
  const lines = help.split('\n').filter((line) => line.startsWith('  ')).map((line) => line.trim());
  const commands = lines.map((line) => line.split(' ').filter((word) => /^[a-z][a-z-]*$/.test(word)).slice(0, 2));
  for (const name of ['status', 'list', 'ready', 'show', 'export', 'check', 'docs', 'notes', 'ideas', 'add', 'edit',
    'start', 'block', 'resume', 'done', 'reopen', 'drop', 'epic', 'import-md', 'migrate-docs', 'migrate-process',
    'changelog', 'close-version', 'template-check']) {
    assert.ok(commands.some((words) => words[0] === name), `${name} listed`);
  }
  for (const name of ['add', 'open', 'edit']) assert.ok(lines.some((line) => line.startsWith(`version ${name} `)), `version ${name}`);
  assert.ok(lines.includes('done --outcome OUTCOME [--changelog ENTRY] id'));
  assert.ok(lines.includes('changelog [id]'));
  assert.ok(lines.some((line) => line.startsWith('show ') && line.includes('[--full]')));
  assert.ok(lines.some((line) => line.startsWith('edit ') && line.includes('[--changelog ENTRY]')));
  assert.ok(!lines.some((line) => line.startsWith('add ') && line.includes('--changelog')), 'add has no changelog');
  assert.ok(!help.includes('[-h]'));

  const done = f.cli('done', '--help');
  assert.match(done, /^usage: backlog\.py done \[-h\] --outcome OUTCOME \[--changelog ENTRY\] id/);
  assert.match(done, /--changelog ENTRY\s+user-visible change/);
  const wrong = f.run('nope');
  assert.notEqual(wrong.status, 0);
  assert.match(wrong.stderr, /usage: backlog\.py <command> \[options\] \(--help lists the commands\)/);
}));
