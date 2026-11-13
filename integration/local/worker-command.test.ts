import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// Execute the skill's shell wrapper with a synthetic hc and worker, never a real agent or Herdr.
test('Herdr and manual launch preserve the configured worker arguments', () => {
  const root = mkdtempSync(join(tmpdir(), 'pilates-worker-command-'));
  try {
    const bin = join(root, 'bin');
    const project = join(root, 'project');
    mkdirSync(bin);
    mkdirSync(project);
    for (const directory of ['scripts', 'src', '.pi']) mkdirSync(join(project, directory));
    for (const file of ['scripts/start-pi.mjs', 'src/pi-workflow.ts']) copyFileSync(file, join(project, file));
    writeFileSync(join(project, '.pi/workflow.json'), '{}');
    const workerLog = join(root, 'worker.json');
    const hcLog = join(root, 'hc.json');
    const executable = (name: string, text: string) => {
      const path = join(bin, name);
      writeFileSync(path, `#!/usr/bin/env node\n${text}\n`);
      chmodSync(path, 0o755);
    };
    executable('pi', 'require("node:fs").writeFileSync(process.env.WORKER_LOG, JSON.stringify({args: process.argv.slice(2), cwd: process.cwd()}));');
    executable('hc', [
      'const fs = require("node:fs"), cp = require("node:child_process");',
      'const args = process.argv.slice(2); fs.writeFileSync(process.env.HC_LOG, JSON.stringify(args));',
      'const index = args.indexOf("--cwd"); if (args[0] !== "run" || index < 0) process.exit(2);',
      'const result = cp.spawnSync(args[index + 2], args.slice(index + 3), {cwd: args[index + 1], env: process.env, encoding: "utf8"});',
      'if (result.error || result.status !== 0) { console.error(result.error || result.stderr); process.exit(3); }',
    ].join('\n'));
    const env = {
      PATH: `${bin}:${process.env.PATH}`, HOME: root, SHELL: '/bin/bash', TERM: 'dumb',
      WORKER_LOG: workerLog, HC_LOG: hcLog,
    };
    const agents = readFileSync('AGENTS.md', 'utf8');
    const configured = /^- \*\*Worker agent command:\*\* `([^`]+)`$/m.exec(agents)?.[1];
    assert.equal(configured, 'node scripts/start-pi.mjs --approve');
    const skill = readFileSync('.agents/skills/orchestrate/SKILL.md', 'utf8');
    const template = /```bash\n\s*(hc run --bg --json --no-parent[\s\S]*?)\n\s*```/.exec(skill)?.[1];
    assert.ok(template, 'actual Herdr launch command missing');
    const task = 'Synthetic task with spaces';
    for (const command of [configured, `${configured} --no-session`]) {
      const commandArgs = command.split(' ').slice(1);
      const expected = commandArgs.slice(1);
      const herdr = template.replaceAll('<name>', 'synthetic').replaceAll('<space>', 'synthetic-space')
        .replaceAll('<Workspace root>/<ID>', project).replaceAll('<Worker agent command>', command).replaceAll('<task>', task);
      const run = (script: string) => {
        rmSync(workerLog, { force: true });
        const result = spawnSync('/bin/bash', ['-c', script], { env, encoding: 'utf8', timeout: 10_000 });
        assert.equal(result.status, 0, `${result.error?.message ?? ''}\n${result.stderr}`);
        assert.deepEqual(JSON.parse(readFileSync(workerLog, 'utf8')), { args: [...expected, task], cwd: project });
      };
      run(herdr);
      const args = JSON.parse(readFileSync(hcLog, 'utf8')) as string[];
      assert.ok(args.includes('--no-parent'));
      assert.ok(!args.includes('--outlive-parent'));
      assert.ok(args.includes('herdr.space=synthetic-space'));
      assert.deepEqual(args.slice(0, 4), ['run', '--bg', '--json', '--no-parent']);
      assert.deepEqual(args.slice(-commandArgs.length - 2), ['node', ...commandArgs, task]);
      // Manual mode uses the same configured command with the task as one shell argument.
      assert.ok(skill.includes('&& <Worker agent command> "<task>"'));
      run(`cd ${project} && ${command} "${task}"`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
