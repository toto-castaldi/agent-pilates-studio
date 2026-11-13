import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const PLUGIN = '.agents/skills/backlog-overlay';

function environment(root: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH, HOME: join(root, 'home'), CLAUDE_CONFIG_DIR: join(root, 'config'),
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_AUTOUPDATER: '1', DISABLE_TELEMETRY: '1',
    DISABLE_ERROR_REPORTING: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
    PYTHONDONTWRITEBYTECODE: '1',
  };
}

test('Claude Code 2.1.287+ validates and exercises the actual module with shared CLI fixtures', { timeout: 90_000 }, () => {
  const root = mkdtempSync(join(tmpdir(), 'pilates-claude-module-'));
  try {
    const env = environment(root);
    const run = (command: string, args: string[], cwd = root, timeout = 60_000) => {
      const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout });
      assert.equal(result.status, 0, `${result.error?.message ?? ''}\n${result.stdout}\n${result.stderr}`);
      return result.stdout;
    };
    const version = run('claude', ['--version']);
    const parsed = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
    assert.ok(parsed, version);
    const [major, minor, patch] = parsed.slice(1).map(Number);
    assert.ok(major > 2 || (major === 2 && (minor > 1 || (minor === 1 && patch >= 287))), version);
    const plugin = join(root, 'plugin');
    cpSync(PLUGIN, plugin, { recursive: true });
    // This is a project-local plugin, not a marketplace submission. The pinned manifest has no author.
    run('claude', ['plugin', 'validate', plugin]);
    const source = process.cwd();
    const viewer = join(root, 'viewer');
    const viewerData = JSON.parse(run('python3', [resolve('integration/backlog_fixture.py'), 'viewer', viewer]));
    const fixtureRoot = join(root, 'branches');
    mkdirSync(fixtureRoot);
    const fixture = JSON.parse(run('python3', [resolve('integration/backlog_fixture.py'), 'branches', fixtureRoot])) as { project: string; second: string };
    const cli = (project: string, ...args: string[]) => run('python3', [join(project, '.agents/tools/backlog.py'), ...args], project);
    const exported = (project: string, ...args: string[]) => JSON.parse(cli(project, 'export', '--json', ...args));
    const git = (...args: string[]) => run('git', ['-C', fixture.project, ...args]);
    const snapshots = {
      viewer: viewerData, viewerBranches: exported(viewer, '--branches', '--no-fetch'),
      base: exported(fixture.project), cached: exported(fixture.project, '--branches', '--no-fetch'),
      fetched: exported(fixture.project, '--branches'), failed: undefined, workingBase: undefined, working: undefined,
    };
    git('remote', 'set-url', 'origin', join(root, 'missing.git'));
    snapshots.failed = exported(fixture.project, '--branches');
    git('switch', '-q', fixture.second);
    cli(fixture.project, 'edit', 'TEC-001', '--title', 'Synthetic working copy');
    cli(fixture.project, 'block', 'TEC-001', '--reason', 'Synthetic working copy blocker');
    snapshots.workingBase = exported(fixture.project);
    snapshots.working = exported(fixture.project, '--branches', '--no-fetch');
    writeFileSync(join(plugin, 'fixture.ts'), `export const fixtures = ${JSON.stringify(snapshots)}\n`);
    copyFileSync(join(source, 'integration/claude-backlog-module.test.tsx'), join(plugin, 'backlog.test.tsx'));
    const native = spawnSync('claude', ['plugin', 'test', plugin], { cwd: root, env, encoding: 'utf8', timeout: 60_000 });
    const output = `${native.stdout}\n${native.stderr}`;
    assert.equal(native.status, 0, `${native.error?.message ?? ''}\n${output}`);
    assert.match(output, /3 pass/);
    assert.match(output, /0 fail/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Claude Code loads the project plugin after trust and operates its read-only TUI without a model', { timeout: 180_000 }, () => {
  const result = spawnSync('python3', ['-B', 'integration/claude-backlog-tui.py'], {
    encoding: 'utf8', timeout: 170_000, env: { PATH: process.env.PATH },
  });
  assert.equal(result.status, 0, `${result.error?.message ?? ''}\n${result.stderr}\n${result.stdout}`);
});
