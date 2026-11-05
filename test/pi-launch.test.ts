import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';

test('Pi launcher isolates personal state and forwards arguments from outside the project', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pi launcher '));
  try {
    const project = join(directory, 'project with spaces');
    const scripts = join(project, 'scripts');
    const bin = join(directory, 'bin');
    mkdirSync(scripts, { recursive: true });
    mkdirSync(bin);
    copyFileSync('scripts/pi.sh', join(scripts, 'pi.sh'));
    writeFileSync(
      join(bin, 'pi'),
      `#!/bin/sh\nprintf "%s\\n" "$PWD" "$PI_CODING_AGENT_DIR" "\${PI_CODING_AGENT_SESSION_DIR-unset}" "$@"\n`,
      { mode: 0o755 },
    );
    const result = spawnSync('sh', [join(scripts, 'pi.sh'), '--resume', 'argument with spaces'], {
      cwd: directory,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
        PI_CODING_AGENT_DIR: '/wrong/agent',
        PI_CODING_AGENT_SESSION_DIR: '/wrong/sessions',
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.stdout.trimEnd().split('\n'), [
      project,
      join(project, '.pi', 'local'),
      'unset',
      '--resume',
      'argument with spaces',
    ]);
    assert.equal(statSync(join(project, '.pi', 'local')).mode & 0o777, 0o700);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('shared Pi settings contain resources, not transient personal preferences', () => {
  const settings = JSON.parse(readFileSync('.pi/settings.json', 'utf8')) as Record<string, unknown>;
  for (const key of ['extensions', 'packages', 'skills']) {
    assert.ok(Array.isArray(settings[key]) && settings[key].length > 0, `${key} must remain shared`);
  }
  for (const key of [
    'lastChangelogVersion',
    'theme',
    'defaultProvider',
    'defaultModel',
    'defaultThinkingLevel',
    'modelThinkingLevels',
    'hideThinkingBlock',
  ]) {
    assert.equal(key in settings, false, `${key} must remain personal`);
  }
});
