import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { checkQuestionPackage } from '../test/pi-contract.js';

test('pinned question package installs into an isolated Pi project and passes its offline tests', { timeout: 240_000 }, () => {
  const source = checkQuestionPackage(JSON.parse(readFileSync('.pi/settings.json', 'utf8')) as unknown);
  const expectedCommit = source.slice(source.lastIndexOf('@') + 1);
  const root = mkdtempSync(join(tmpdir(), 'pi-package-integration-'));
  const project = join(root, 'project');
  const agent = join(root, 'agent');
  mkdirSync(project);
  mkdirSync(agent);
  const env = {
    PATH: process.env.PATH,
    HOME: root,
    PI_CODING_AGENT_DIR: agent,
    PI_TELEMETRY: '0',
    PI_SKIP_VERSION_CHECK: '1',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    OPENAI_API_KEY: 'synthetic-test-key',
  };
  const run = (command: string, args: string[], cwd: string, input?: string) => {
    const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', input, timeout: 120_000 });
    assert.equal(result.status, 0, `${command} failed: ${result.error?.message ?? ''}\n${result.stderr}`);
    return result.stdout;
  };
  try {
    assert.equal(run('pi', ['--version'], project).trim(), '1.5.0');
    // Network is used only to install this public, pinned package and its test dependencies.
    run('pi', ['install', source, '--local'], project);
    const projectPi = join(project, '.pi');
    const settings = JSON.parse(readFileSync(join(projectPi, 'settings.json'), 'utf8')) as unknown;
    assert.equal(checkQuestionPackage(settings), source);
    writeFileSync(join(projectPi, 'probe.js'), `import { writeFileSync } from 'node:fs'; export default function(pi) { pi.on('session_start', (_event, ctx) => { const tools = pi.getAllTools().filter(t => ['question', 'questionnaire'].includes(t.name)); writeFileSync(ctx.cwd + '/inventory.json', JSON.stringify(tools.map(t => ({name:t.name, path:t.sourceInfo.path})))); }); }\n`);
    run('pi', ['--mode', 'rpc', '--no-session', '--approve', '--offline', '--no-mcp', '--no-context-files', '-e', join(projectPi, 'probe.js')], project, '{"id":"check","type":"get_state"}\n');
    const tools = JSON.parse(readFileSync(join(project, 'inventory.json'), 'utf8')) as { name: string; path: string }[];
    assert.deepEqual(tools.map((tool) => tool.name).sort(), ['question', 'questionnaire']);
    assert.ok(tools.every((tool) => tool.path.includes('question-tool')));
    const packageRoot = dirname(dirname(dirname(dirname(tools[0].path))));
    assert.equal(run('git', ['rev-parse', 'HEAD'], packageRoot).trim(), expectedCommit);
    run('npm', ['ci', '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund'], packageRoot);
    run('npm', ['test'], packageRoot);
    run('python3', ['tests/pi-osc-test.py'], packageRoot);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
