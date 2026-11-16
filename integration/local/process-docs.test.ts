import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

function fixture(exercise: (f: ReturnType<typeof setup>) => void) {
  const root = mkdtempSync(join(tmpdir(), 'pilates-process-docs-'));
  try { exercise(setup(root)); } finally { rmSync(root, { recursive: true, force: true }); }
}

function setup(root: string) {
  for (const folder of ['.agents/tools', 'backlog/items', 'backlog/epics', 'backlog/versions', 'docs/design', 'docs/requirements', 'docs/adr']) {
    mkdirSync(join(root, folder), { recursive: true });
  }
  copyFileSync('.agents/tools/backlog.py', join(root, '.agents/tools/backlog.py'));
  const put = (path: string, text: string) => writeFileSync(join(root, path), text);
  const run = (...args: string[]) => spawnSync('python3', ['.agents/tools/backlog.py', ...args], {
    cwd: root, encoding: 'utf8', timeout: 10_000,
    env: { PATH: process.env.PATH, HOME: root, PYTHONDONTWRITEBYTECODE: '1' },
  });
  const cli = (...args: string[]) => {
    const result = run(...args);
    assert.equal(result.status, 0, `${result.error?.message ?? ''}\n${result.stderr}\n${result.stdout}`);
    return result.stdout;
  };
  cli('version', 'add', 'v0.1.0', '--goal', 'Synthetic');
  cli('epic', 'add', '--title', 'Synthetic', '--scope', 'Synthetic');
  const add = (...args: string[]) => cli('add', '--type', 'TEC', '--title', 'Synthetic', '--version', 'v0.1.0',
    '--epic', 'EPIC-001', '--priority', 'P0', '--criterion', 'Synthetic criterion', ...args);
  const currentProcess = () => {
    copyFileSync('docs/PROCESS.md', join(root, 'docs/PROCESS.md'));
    cpSync('docs/process', join(root, 'docs/process'), { recursive: true });
  };
  return { root, put, run, cli, add, currentProcess };
}

test('docs --for resolves requirements, design, ADR, sections and module, reporting free references without writes', () => fixture((f) => {
  f.currentProcess();
  f.put('docs/requirements/REQ-NFR-001.md', '# REQ-NFR-001 — Synthetic\n\n**State:** Active\n');
  f.put('docs/design/synthetic.md', '# Synthetic\n');
  f.put('docs/design/modules.md', '# Modules\n\n**MOD-001 — Synthetic:** test module\n');
  f.put('docs/adr/ADR-001-synthetic.md', '# Synthetic ADR\n');
  f.put('AGENTS.md', '# Synthetic\n\n## 10. Parallel work\n');
  f.put('docs/requirements/README.md', '# Requirements\n');
  f.add('--requirements', 'REQ-NFR-001', '--module', 'MOD-001', '--design-references',
    'design/synthetic,requirements/README,ADR-001,PROCESS §6,process/git §3,AGENTS §10,free/reference');
  const before = f.cli('export', '--json');
  const output = JSON.parse(f.cli('docs', '--for', 'TEC-001', '--json'));
  assert.deepEqual(output, { item: 'TEC-001', files: [
    { reference: 'REQ-NFR-001', path: 'docs/requirements/REQ-NFR-001.md' },
    { reference: 'design/synthetic', path: 'docs/design/synthetic.md' },
    { reference: 'requirements/README', path: 'docs/requirements/README.md' },
    { reference: 'ADR-001', path: 'docs/adr/ADR-001-synthetic.md' },
    { reference: 'PROCESS §6', path: 'docs/PROCESS.md', section: '6' },
    { reference: 'process/git §3', path: 'docs/process/git.md', section: '3' },
    { reference: 'AGENTS §10', path: 'AGENTS.md', section: '10' },
    { reference: 'MOD-001', path: 'docs/design/modules.md', entry: 'MOD-001' },
  ], unresolved: ['free/reference'] });
  assert.match(f.cli('docs', '--for', 'TEC-001'), /docs\/process\/git.md §3/);
  assert.match(f.cli('docs', '--for', 'TEC-001'), /Not resolved to a file:\n- free\/reference/);
  f.cli('check');
  assert.equal(f.cli('export', '--json'), before);
  assert.notEqual(f.run('docs', '--for', 'TEC-999').status, 0);
}));

test('check rejects missing process files and sections and docs --for reports unresolved references', () => fixture((f) => {
  // Create a valid record, then change only the synthetic docs to invalidate it.
  f.currentProcess();
  f.put('docs/PROCESS.md', '# Synthetic\n\n## 99. Synthetic\n');
  f.put('docs/process/git.md', '# Synthetic\n\n## 99. Synthetic\n');
  f.put('docs/process/missing.md', '# Synthetic\n');
  f.add('--design-references', 'PROCESS §99,process/git §99,process/missing');
  f.currentProcess();
  rmSync(join(f.root, 'docs/process/missing.md'));
  const checked = f.run('check');
  assert.notEqual(checked.status, 0);
  const message = checked.stdout + checked.stderr;
  assert.match(message, /PROCESS.md has no section 99/);
  assert.match(message, /process\/git.md has no section 99/);
  assert.match(message, /process\/missing.md does not exist/);
  assert.deepEqual(JSON.parse(f.cli('docs', '--for', 'TEC-001', '--json')).unresolved,
    ['PROCESS §99', 'process/git §99', 'process/missing']);
}));

test('migrate-process previews without writes, maps 3.x references once and preserves every other field', () => fixture((f) => {
  f.add('--design-references', 'PROCESS §4.1,PROCESS §4.4,PROCESS §5.3,PROCESS §6.1,PROCESS §6.3,PROCESS §8,PROCESS §9,PROCESS §10,AGENTS §10');
  f.currentProcess();
  f.put('AGENTS.md', '# Synthetic\n\nSee `docs/PROCESS.md` §8.\n');
  const before = JSON.parse(f.cli('show', 'TEC-001', '--json'));
  const exported = f.cli('export', '--json');
  const preview = f.cli('migrate-process', '--dry-run');
  assert.match(preview, /1 item\(s\) with rewritten references/);
  assert.match(preview, /dry run: nothing was written/);
  assert.equal(f.cli('export', '--json'), exported);
  assert.match(f.cli('migrate-process'), /check by hand: AGENTS.md:3/);
  assert.deepEqual(JSON.parse(f.cli('show', 'TEC-001', '--json')), { ...before, design_references: [
    'process/backlog §1', 'process/backlog §3', 'process/docs §3', 'PROCESS §5.1', 'process/git §1',
    'PROCESS §5.3', 'process/git §3', 'PROCESS §6', 'process/release', 'PROCESS §7', 'AGENTS §10',
  ] });
  f.cli('check');
  const migrated = f.cli('export', '--json');
  assert.match(f.run('migrate-process').stderr, /migrate only once/);
  assert.equal(f.cli('export', '--json'), migrated);
  assert.equal(readFileSync(join(f.root, 'AGENTS.md'), 'utf8'), '# Synthetic\n\nSee `docs/PROCESS.md` §8.\n');
}));

test('migrate-process reports unknown sections without silently rewriting them', () => fixture((f) => {
  f.add('--design-references', 'PROCESS §99');
  f.currentProcess();
  const before = f.cli('export', '--json');
  assert.match(f.cli('migrate-process', '--dry-run'), /unknown section left as it is: PROCESS §99/);
  assert.equal(f.cli('export', '--json'), before);
  const result = f.run('migrate-process');
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /migration written but check failed/);
  assert.equal(f.cli('export', '--json'), before);
}));
