import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const record = 'docs/TEMPLATE-ORIGIN.md';

test('template origin is available in a clean project clone', () => {
  const root = mkdtempSync(join(tmpdir(), 'pilates-template-clone-'));
  try {
    const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', HOME: root };
    const clone = join(root, 'project');
    execFileSync('git', ['-c', 'core.hooksPath=/dev/null', 'clone', '--quiet', '--no-local', '--', process.cwd(), clone], { env });
    const text = readFileSync(join(clone, record), 'utf8');
    assert.equal(text, readFileSync(record, 'utf8'));
    assert.match(text, /aba6fcd50d25861a2ab0ea759f937d45e817dec7/);
    assert.match(text, /e16bbec69c067bc9432bc588acd0d232716f3dbf/);
    assert.match(text, /6bea086a1ef9f1cd4b7ab79e86a504ddceb81788/);
    assert.match(text, /base sconosciuta/i);
    assert.match(text, /solo confrontato/i);
    assert.equal(execFileSync('git', ['-C', clone, 'status', '--porcelain'], { encoding: 'utf8', env }), '');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('isolated template comparison distinguishes upstream, customization and unknown base', () => {
  const root = mkdtempSync(join(tmpdir(), 'pilates-template-compare-'));
  try {
    const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', HOME: root };
    const template = join(root, 'template');
    const projectSource = join(root, 'project-source');
    const project = join(root, 'project');
    const templateFile = join(root, 'template-file');
    function git(cwd: string, args: string[]): string {
      return execFileSync('git', ['-C', cwd, '-c', 'core.hooksPath=/dev/null', ...args], { encoding: 'utf8', env });
    }
    function commit(cwd: string): void {
      git(cwd, ['add', '--all']);
      git(cwd, ['-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', 'commit', '-qm', 'synthetic']);
    }
    for (const directory of [template, projectSource]) {
      mkdirSync(join(directory, 'docs'), { recursive: true });
      git(directory, ['init', '-q']);
    }
    const path = 'docs/PROCESS.md';
    writeFileSync(join(template, path), 'baseline sintetica\n');
    commit(template);
    const base = git(template, ['rev-parse', 'HEAD']).trim();
    writeFileSync(join(template, path), 'aggiornamento sintetico\n');
    commit(template);
    const target = git(template, ['rev-parse', 'HEAD']).trim();

    writeFileSync(join(projectSource, path), 'personalizzazione sintetica\n');
    writeFileSync(join(projectSource, record), readFileSync(record));
    commit(projectSource);
    execFileSync('git', ['-c', 'core.hooksPath=/dev/null', 'clone', '--quiet', '--no-local', '--', projectSource, project], { env });
    assert.equal(git(project, ['status', '--porcelain']), '');
    assert.equal(readFileSync(join(project, record), 'utf8'), readFileSync(record, 'utf8'));

    function compare(adoptedBase: string | null): { upstream: string | null; projectDiff: string } {
      git(template, ['cat-file', '-e', `${target}^{commit}`]);
      let upstream: string | null = null;
      if (adoptedBase !== null) {
        git(template, ['cat-file', '-e', `${adoptedBase}^{commit}`]);
        upstream = git(template, ['diff', adoptedBase, target, '--', path]);
      }
      writeFileSync(templateFile, git(template, ['show', `${target}:${path}`]));
      const comparison = spawnSync('git', ['-C', project, 'diff', '--no-index', '--', templateFile, path], { encoding: 'utf8', env });
      assert.equal(comparison.status, 1, comparison.stderr);
      return { upstream, projectDiff: comparison.stdout };
    }
    const known = compare(base);
    assert.match(known.upstream ?? '', /-baseline sintetica/);
    assert.match(known.upstream ?? '', /\+aggiornamento sintetico/);
    assert.match(known.projectDiff, /-aggiornamento sintetico/);
    assert.match(known.projectDiff, /\+personalizzazione sintetica/);

    const missing = spawnSync('git', ['-C', template, 'cat-file', '-e', `${'0'.repeat(40)}^{commit}`], { encoding: 'utf8', env });
    assert.notEqual(missing.status, 0);
    const unknown = compare(null);
    assert.equal(unknown.upstream, null);
    assert.match(unknown.projectDiff, /\+personalizzazione sintetica/);
    assert.equal(git(project, ['status', '--porcelain']), '');
    assert.equal(readFileSync(join(project, path), 'utf8'), 'personalizzazione sintetica\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
