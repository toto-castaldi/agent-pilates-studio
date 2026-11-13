import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

interface Response {
  id?: string;
  success?: boolean;
  data?: { commands?: { name: string }[] };
}

function runPi(project: string, home: string, agentDirectory: string, approved = true): Response[] {
  mkdirSync(join(project, 'scripts'), { recursive: true });
  mkdirSync(join(project, 'src'), { recursive: true });
  mkdirSync(join(project, '.pi'), { recursive: true });
  for (const file of ['scripts/start-pi.mjs', 'src/pi-workflow.ts']) copyFileSync(file, join(project, file));
  const workflowPath = join(project, '.pi/workflow.json');
  if (!existsSync(workflowPath)) {
    const settingsPath = join(project, '.pi/settings.json');
    const existing = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, 'utf8')) : {};
    writeFileSync(workflowPath, JSON.stringify(Object.fromEntries(['packages', 'skills', 'extensions', 'prompts'].filter((key) => key in existing).map((key) => [key, existing[key]]))));
  }
  const input = [
    { id: 'commands', type: 'get_commands' },
    { id: 'change', type: 'set_steering_mode', mode: 'all' },
  ].map((record) => JSON.stringify(record)).join('\n');
  // No inherited credentials or Pi state: all files and configuration are synthetic.
  const result = spawnSync(process.execPath, ['scripts/start-pi.mjs', '--mode', 'rpc', '--no-session', approved ? '--approve' : '--no-approve', '--offline', '--no-mcp', '--no-context-files'], {
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

test('Pi --approve loads an extension without the trust dialog and does not persist trust', { timeout: 120_000 }, () => {
  const result = spawnSync('python3', ['integration/pi-approve-tui.py'], {
    encoding: 'utf8', timeout: 110_000, env: { PATH: process.env.PATH },
  });
  assert.equal(result.status, 0, `${result.error?.message ?? ''}\n${result.stderr}\n${result.stdout}`);
});

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

test('Pi discovers approved project templates only with project trust', { timeout: 90_000 }, () => {
  const root = mkdtempSync(join(tmpdir(), 'pi-start-integration-'));
  const project = join(root, 'project');
  const agent = join(root, 'agent');
  try {
    mkdirSync(join(project, '.pi', 'prompts'), { recursive: true });
    mkdirSync(agent);
    for (const name of ['work-alone']) {
      copyFileSync(`.pi/prompts/${name}.md`, join(project, '.pi', 'prompts', `${name}.md`));
    }
    for (const approved of [true, false]) {
      const response = runPi(project, root, agent, approved).find((entry) => entry.id === 'commands');
      assert.equal(response?.success, true);
      for (const name of ['work-alone']) {
        assert.equal(response?.data?.commands?.some((command) => command.name === name), approved, name);
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Pi discovers the backlog extension only with project trust', { timeout: 90_000 }, () => {
  const root = mkdtempSync(join(tmpdir(), 'pi-backlog-trust-'));
  const project = join(root, 'project');
  const agent = join(root, 'agent');
  try {
    mkdirSync(join(project, '.pi', 'extensions', 'backlog'), { recursive: true });
    mkdirSync(agent);
    copyFileSync('.pi/extensions/backlog/index.ts', join(project, '.pi', 'extensions', 'backlog', 'index.ts'));
    for (const approved of [true, false]) {
      const response = runPi(project, root, agent, approved).find((entry) => entry.id === 'commands');
      assert.equal(response?.success, true);
      assert.equal(response?.data?.commands?.some((command) => command.name === 'backlog'), approved);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Pi exposes explicit process commands with trust and never lists the Claude plugin as a skill', { timeout: 90_000 }, () => {
  const root = mkdtempSync(join(tmpdir(), 'pi-orchestrate-skill-'));
  const project = join(root, 'project');
  const agent = join(root, 'agent');
  try {
    mkdirSync(join(project, '.pi', 'extensions'), { recursive: true });
    mkdirSync(agent);
    const skills = ['orchestrate', 'start-task', 'finish-task', 'merge-task'];
    for (const name of skills) {
      mkdirSync(join(project, '.agents', 'skills', name), { recursive: true });
      copyFileSync(`.agents/skills/${name}/SKILL.md`, join(project, '.agents', 'skills', name, 'SKILL.md'));
    }
    cpSync('.agents/skills/backlog-overlay', join(project, '.agents/skills/backlog-overlay'), { recursive: true });
    // Synthetic probe: records only which skill names appear in the model-visible system prompt.
    writeFileSync(
      join(project, '.pi', 'extensions', 'probe.js'),
      `import { writeFileSync } from "node:fs"; export default function(pi) { pi.on("session_start", async (_event, ctx) => { const prompt = ctx.getSystemPrompt(); writeFileSync("skills-in-prompt.json", JSON.stringify(${JSON.stringify([...skills, 'backlog-overlay'])}.filter((name) => prompt.includes("<name>" + name + "</name>")))); }); }\n`,
    );
    for (const approved of [true, false]) {
      rmSync(join(project, 'skills-in-prompt.json'), { force: true });
      const response = runPi(project, root, agent, approved).find((entry) => entry.id === 'commands');
      assert.equal(response?.success, true);
      for (const name of skills) {
        assert.equal(response?.data?.commands?.some((command) => command.name === `skill:${name}`), approved, name);
      }
      assert.equal(response?.data?.commands?.some((command) => command.name === 'skill:backlog-overlay'), false);
      if (approved) {
        const visible = JSON.parse(readFileSync(join(project, 'skills-in-prompt.json'), 'utf8')) as string[];
        assert.deepEqual(visible, ['start-task', 'finish-task']);
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('prepared Pi preserves model/thinking and shared resources across restarts with agent directory .pi' , { timeout: 90_000 }, () => {
  const root = mkdtempSync(join(tmpdir(), 'pi-same-settings-integration-'));
  const project = join(root, 'project');
  const agent = join(project, '.pi');
  try {
    mkdirSync(agent, { recursive: true });
    const settingsPath = join(agent, 'settings.json');
    writeFileSync(settingsPath, JSON.stringify({ steeringMode: 'one-at-a-time', defaultProvider: 'openai', defaultModel: 'gpt-5', defaultThinkingLevel: 'low', modelThinkingLevels: { 'openai/gpt-5': 'high' }, theme: 'dark', unknown: { nested: ['kept'] } }));
    mkdirSync(join(agent, 'prompts'));
    writeFileSync(join(agent, 'prompts/shared.md'), '---\ndescription: Synthetic shared prompt\n---\nSynthetic only');
    writeFileSync(join(agent, 'workflow.json'), JSON.stringify({ prompts: ['./prompts/shared.md'] }));
    const responses = runPi(project, root, agent);
    assert.equal(responses.find((response) => response.id === 'change')?.success, true);
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    assert.equal(settings.steeringMode, 'all');
    // A local edit models preference changes made between sessions; Pi must read it on restart.
    settings.defaultModel = 'gpt-5'; settings.defaultThinkingLevel = 'high';
    settings.modelThinkingLevels['openai/gpt-5'] = 'low'; settings.theme = 'light';
    writeFileSync(settingsPath, JSON.stringify(settings));
    const restarted = runPi(project, root, './.pi');
    assert.ok(restarted.find((r) => r.id === 'commands')?.data?.commands?.some((c) => c.name === 'shared'));
    const persisted = JSON.parse(readFileSync(settingsPath, 'utf8'));
    assert.equal(persisted.defaultThinkingLevel, 'high');
    assert.equal(persisted.modelThinkingLevels['openai/gpt-5'], 'low');
    assert.equal(persisted.defaultModel, 'gpt-5');
    assert.equal(persisted.theme, 'light');
    assert.deepEqual(persisted.unknown, { nested: ['kept'] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
