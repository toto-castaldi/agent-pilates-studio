import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, statSync, symlinkSync, linkSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

test('launcher prepares fresh/existing clones, preserves preferences and args/status without Git changes', () => {
  const root = mkdtempSync(join(tmpdir(), 'pi-workflow-'));
  try {
    const project = join(root, 'project');
    for (const path of ['.pi', 'src', 'scripts', 'bin']) mkdirSync(join(project, path), { recursive: true });
    for (const path of ['src/pi-workflow.ts', 'scripts/start-pi.mjs', '.gitignore']) copyFileSync(path, join(project, path));
    const settings = join(project, '.pi/settings.json');
    const manifest = join(project, '.pi/workflow.json');
    const local = { defaultModel: 'synthetic', defaultThinkingLevel: 'high', modelThinkingLevels: { 'synthetic/model': 'low' }, theme: 'dark', themes: ['./local'], unknown: { nested: [null, true] } };
    const git = (...args: string[]) => {
      const r = spawnSync('git', args, { cwd: project, encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr); return r.stdout;
    };
    git('init', '-q'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'Synthetic');
    writeFileSync(manifest, JSON.stringify({ skills: ['+new', '!old'] }));
    // Simulate the old tracked file, a private backup, index removal and restoration.
    writeFileSync(settings, JSON.stringify(local));
    git('add', '-f', '.pi/settings.json'); git('commit', '-qm', 'old synthetic settings');
    copyFileSync(settings, join(project, '.pi/recovery.json')); chmodSync(join(project, '.pi/recovery.json'), 0o600);
    git('rm', '--cached', '.pi/settings.json');
    writeFileSync(join(project, 'bin/pi'), '#!/usr/bin/env node\nconst fs = require("node:fs"); fs.writeFileSync(".pi/args.json",JSON.stringify(process.argv.slice(2))); process.exit(23);\n');
    chmodSync(join(project, 'bin/pi'), 0o700);
    git('add', '.'); git('commit', '-qm', 'workflow transition');
    const run = () => spawnSync(process.execPath, ['scripts/start-pi.mjs', '--approve', '--resume', 'text with spaces'], { cwd: project, encoding: 'utf8', timeout: 10_000, env: { PATH: `${join(project, 'bin')}:${process.env.PATH}`, HOME: root, PI_CODING_AGENT_DIR: './.pi' } });
    assert.equal(run().status, 23);
    assert.deepEqual(JSON.parse(readFileSync(settings, 'utf8')), { ...local, skills: ['+new', '!old'] });
    assert.deepEqual(JSON.parse(readFileSync(join(project, '.pi/args.json'), 'utf8')), ['--approve', '--resume', 'text with spaces']);
    const before = statSync(settings);
    assert.equal(run().status, 23);
    assert.equal(statSync(settings).mtimeMs, before.mtimeMs);
    assert.equal(statSync(settings).ino, before.ino);
    writeFileSync(settings, JSON.stringify({ ...local, defaultModel: 'changed', defaultThinkingLevel: 'low', theme: 'light', unknown: { nested: [false] } }));
    writeFileSync(manifest, '{}');
    assert.equal(run().status, 23);
    assert.equal(JSON.parse(readFileSync(settings, 'utf8')).skills, undefined);
    git('add', '.pi/workflow.json'); git('commit', '-qm', 'remove resources');
    assert.equal(git('status', '--porcelain'), '');
    git('diff', '--exit-code'); git('diff', '--cached', '--exit-code');
    assert.deepEqual(JSON.parse(readFileSync(join(project, '.pi/recovery.json'), 'utf8')), local);
    rmSync(settings); assert.equal(run().status, 23); assert.deepEqual(JSON.parse(readFileSync(settings, 'utf8')), {});
    assert.equal(statSync(settings).mode & 0o777, 0o600);
    // Every failure leaves existing bytes intact and never invokes Pi or echoes input.
    for (const [workflow, content] of [['{', 'private-marker'], ['{"themes":[]}', '{}'], ['{}', '[]'], ['{}', '{"secret":"private-marker",']]) {
      writeFileSync(manifest, workflow); writeFileSync(settings, content);
      rmSync(join(project, '.pi/args.json'), { force: true });
      const result = run(); assert.equal(result.status, 1);
      assert.equal(readFileSync(settings, 'utf8'), content);
      assert.doesNotMatch(result.stdout + result.stderr, /private-marker/);
    }
    writeFileSync(manifest, '{}'); rmSync(settings);
    for (const kind of ['symlink', 'directory', 'hardlink', 'fifo']) {
      if (kind === 'symlink') symlinkSync('recovery.json', settings);
      if (kind === 'directory') mkdirSync(settings);
      if (kind === 'hardlink') linkSync(join(project, '.pi/recovery.json'), settings);
      if (kind === 'fifo') assert.equal(spawnSync('mkfifo', [settings]).status, 0);
      assert.equal(run().status, 1, kind); rmSync(settings, { recursive: true });
    }
    chmodSync(join(project, '.pi'), 0o777); assert.equal(run().status, 1); chmodSync(join(project, '.pi'), 0o700);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
