import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

interface Response {
  id?: string;
  success?: boolean;
  data?: { commands?: { name: string }[] };
}

function runPi(project: string, home: string, agentDirectory: string, approved = true): Response[] {
  const input = [
    { id: 'commands', type: 'get_commands' },
    { id: 'change', type: 'set_steering_mode', mode: 'all' },
  ].map((record) => JSON.stringify(record)).join('\n');
  // No inherited credentials or Pi state: all files and configuration are synthetic.
  const result = spawnSync('pi', ['--mode', 'rpc', '--no-session', approved ? '--approve' : '--no-approve', '--offline', '--no-mcp', '--no-context-files'], {
    cwd: project,
    input: `${input}\n`,
    encoding: 'utf8',
    timeout: 60_000,
    env: {
      PATH: process.env.PATH,
      HOME: home,
      PI_CODING_AGENT_DIR: agentDirectory,
      PI_TELEMETRY: '0',
      PI_SKIP_VERSION_CHECK: '1',
      OPENAI_API_KEY: 'synthetic-test-key',
    },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim().split('\n').map((line) => JSON.parse(line) as Response);
}

test('direct Pi startup loads project and personal resources without changing project settings when directories differ', { timeout: 90_000 }, () => {
  const root = mkdtempSync(join(tmpdir(), 'pi-settings-integration-'));
  const project = join(root, 'project');
  const agent = join(root, 'agent');
  try {
    mkdirSync(join(project, '.pi'), { recursive: true });
    mkdirSync(agent);
    const settingsPath = join(project, '.pi', 'settings.json');
    const settings = `${JSON.stringify({ extensions: ['./synthetic-project.js'], defaultTools: ['read'] }, null, 2)}\n`;
    writeFileSync(settingsPath, settings);
    writeFileSync(join(agent, 'settings.json'), JSON.stringify({ extensions: ['./synthetic-personal.js'], defaultTools: ['bash'] }));
    writeFileSync(join(agent, 'synthetic-personal.js'), 'export default function(pi) { pi.registerCommand("synthetic-personal", { description: "Synthetic", handler: async () => {} }); }\n');
    writeFileSync(
      join(project, '.pi', 'synthetic-project.js'),
      'import { writeFileSync } from "node:fs"; export default function(pi) { pi.registerCommand("synthetic-project", { description: "Synthetic", handler: async () => {} }); pi.on("session_start", async () => writeFileSync("active-tools.json", JSON.stringify(pi.getActiveTools()))); }\n',
    );
    const responses = runPi(project, root, agent);
    assert.equal(responses.find((response) => response.id === 'change')?.success, true);
    const commands = responses.find((response) => response.id === 'commands');
    assert.equal(commands?.success, true);
    assert.ok(commands?.data?.commands?.some((command) => command.name === 'synthetic-project'));
    assert.ok(commands?.data?.commands?.some((command) => command.name === 'synthetic-personal'));
    const activeTools = JSON.parse(readFileSync(join(project, 'active-tools.json'), 'utf8')) as string[];
    assert.ok(activeTools.includes('read'));
    assert.ok(!activeTools.includes('bash'));
    assert.equal(readFileSync(settingsPath, 'utf8'), settings);
    const personal = JSON.parse(readFileSync(join(agent, 'settings.json'), 'utf8')) as { steeringMode?: string };
    assert.equal(personal.steeringMode, 'all');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Pi discovers the project start template only with project trust', { timeout: 90_000 }, () => {
  const root = mkdtempSync(join(tmpdir(), 'pi-start-integration-'));
  const project = join(root, 'project');
  const agent = join(root, 'agent');
  try {
    mkdirSync(join(project, '.pi', 'prompts'), { recursive: true });
    mkdirSync(agent);
    copyFileSync('.pi/prompts/start.md', join(project, '.pi', 'prompts', 'start.md'));
    for (const approved of [true, false]) {
      const response = runPi(project, root, agent, approved).find((entry) => entry.id === 'commands');
      assert.equal(response?.success, true);
      assert.equal(response?.data?.commands?.some((command) => command.name === 'start'), approved);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('direct Pi startup can update project settings if its agent directory is the project .pi directory', { timeout: 90_000 }, () => {
  const root = mkdtempSync(join(tmpdir(), 'pi-same-settings-integration-'));
  const project = join(root, 'project');
  const agent = join(project, '.pi');
  try {
    mkdirSync(agent, { recursive: true });
    const settingsPath = join(agent, 'settings.json');
    writeFileSync(settingsPath, JSON.stringify({ steeringMode: 'one-at-a-time' }));
    const responses = runPi(project, root, agent);
    assert.equal(responses.find((response) => response.id === 'change')?.success, true);
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as { steeringMode?: string };
    assert.equal(settings.steeringMode, 'all');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
