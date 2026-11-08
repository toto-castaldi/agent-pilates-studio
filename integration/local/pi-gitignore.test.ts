import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

test('Pi ignore rules expose only approved files and protect local state', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pi-gitignore-'));
  try {
    const init = spawnSync('git', ['init', '-q', directory], { encoding: 'utf8' });
    assert.equal(init.status, 0, init.stderr);
    copyFileSync('.gitignore', join(directory, '.gitignore'));

    function isIgnored(path: string): boolean {
      const result = spawnSync('git', ['-C', directory, 'check-ignore', '--no-index', '-q', path], {
        encoding: 'utf8',
      });
      assert.ok(result.status === 0 || result.status === 1, result.stderr);
      return result.status === 0;
    }

    for (const path of ['.pi/settings.json', '.pi/prompts/work-alone.md', '.pi/extensions/backlog/index.ts', '.agents/skills/start-task/SKILL.md']) {
      assert.equal(isIgnored(path), false, `${path} must be eligible for versioning`);
    }
    for (const path of [
      '.pi/auth.json',
      '.pi/credentials.json',
      '.pi/models.json',
      '.pi/mcp.json',
      '.pi/logs/private.log',
      '.pi/local/settings.json',
      '.pi/local/auth.json',
      '.pi/local/sessions/example.jsonl',
      '.pi/trust.json',
      '.pi/sessions/example.jsonl',
      '.pi/pi-voice.log',
      '.pi/npm/node_modules/example/index.js',
      '.pi/prompts/private.md',
      '.pi/prompts/avvio.md',
      '.pi/prompts/start.md',
      '.pi/prompts/nested/start.md',
      '.pi/extensions/unreviewed.ts',
      '.pi/extensions/other/index.ts',
      '.pi/extensions/backlog/private.ts',
      '.pi/extensions/backlog/auth.json',
      '.pi/extensions/backlog/nested/index.ts',
      '.pi/skills/private/SKILL.md',
      '.env',
      '.local/secrets/db-admin',
    ]) {
      assert.equal(isIgnored(path), true, `${path} must remain ignored`);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
