import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

test('real Pi keeps personal writes separate while loading a project extension', () => {
  const project = mkdtempSync(join(tmpdir(), 'pi-settings-integration-'));
  try {
    mkdirSync(join(project, 'scripts'));
    mkdirSync(join(project, '.pi'));
    copyFileSync('scripts/pi.sh', join(project, 'scripts', 'pi.sh'));
    const settingsPath = join(project, '.pi', 'settings.json');
    const settings = `${JSON.stringify({ extensions: ['./synthetic-extension.js'], defaultTools: ['read'] }, null, 2)}\n`;
    writeFileSync(settingsPath, settings);
    writeFileSync(
      join(project, '.pi', 'synthetic-extension.js'),
      'import { writeFileSync } from "node:fs"; export default function(pi) { pi.registerCommand("synthetic-check", { description: "Synthetic", handler: async () => {} }); pi.on("session_start", async () => writeFileSync("active-tools.json", JSON.stringify(pi.getActiveTools()))); }\n',
    );
    const input = [
      { id: 'commands', type: 'get_commands' },
      { id: 'change', type: 'set_steering_mode', mode: 'all' },
    ]
      .map((record) => JSON.stringify(record))
      .join('\n');
    const result = spawnSync('sh', [join(project, 'scripts', 'pi.sh'), '--mode', 'rpc', '--no-session', '--approve', '--offline', '--no-mcp'], {
      cwd: project,
      input: `${input}\n`,
      encoding: 'utf8',
      timeout: 30000,
      env: {
        PATH: process.env.PATH,
        HOME: project,
        PI_TELEMETRY: '0',
        PI_SKIP_VERSION_CHECK: '1',
        OPENAI_API_KEY: 'synthetic-test-key',
      },
    });
    assert.equal(result.status, 0, result.stderr);
    const responses = result.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { id?: string; success?: boolean; data?: { commands?: { name: string }[] } });
    assert.equal(responses.find((response) => response.id === 'change')?.success, true);
    const commands = responses.find((response) => response.id === 'commands');
    assert.equal(commands?.success, true);
    assert.ok(commands?.data?.commands?.some((command) => command.name === 'synthetic-check'));
    const activeTools = JSON.parse(readFileSync(join(project, 'active-tools.json'), 'utf8')) as string[];
    assert.ok(activeTools.includes('read'));
    assert.ok(!activeTools.includes('bash'));
    assert.equal(readFileSync(settingsPath, 'utf8'), settings);
    const personal = JSON.parse(readFileSync(join(project, '.pi', 'local', 'settings.json'), 'utf8')) as {
      steeringMode?: string;
    };
    assert.equal(personal.steeringMode, 'all');
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});
