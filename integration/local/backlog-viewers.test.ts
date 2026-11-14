import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

function blob(text: string): string {
  return createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');
}

test('shared resources match the pinned v3.0.0 blobs, with only the agreed Pi refresh adaptation', () => {
  // Public template commit c880d61848bb665cd96f270895c4f083ca4c004d (tag v3.0.0), verified for TEC-047.
  const hashes: Record<string, string> = {
    'docs/PROCESS.md': '49ada5d12c7f35d9fc89c4909a889bd284677dd8',
    'docs/PROCESS-PARALLEL.md': 'bb5d94da8777a26aa6bc01d8ad14d3b0399b1b36',
    '.agents/tools/backlog.py': '64f83cdf4506aec2c0b776b1ef981eb17b717e0b',
    '.agents/skills/orchestrate/SKILL.md': 'c5acf4b53278b7c6a3004e438c2df16a7133321f',
    '.agents/skills/add-item/SKILL.md': '98b5e183b1713197e36c1afad7f28fabab924472',
    '.agents/skills/start-task/SKILL.md': '4b85caafccf11a207e0e05376df0c5817fa63b2d',
    '.agents/skills/finish-task/SKILL.md': 'f477085f7a8259cd6851d5d1f6fe6a15a63809fa',
    '.agents/skills/close-version/SKILL.md': '5aaa5419f974452f0d8645795634c496e5a049fc',
    '.agents/skills/kickoff/SKILL.md': 'f8ec1c080724f2548e423b153daf8ad18e1f27e1',
    '.agents/skills/merge-task/SKILL.md': '4bb3cda765cb41d5e18da12d29cacbdd4af4ba78',
    'docs/requirements/_TEMPLATE.md': '0a0a56f9453428e7e350baa7a4392609d6693a3d',
    'docs/design/_TEMPLATE.md': 'f166771727b13bb74dfdd78d2805ea9930862838',
    '.agents/skills/backlog-overlay/.claude-plugin/plugin.json': '0953298a0c504bbfc7c3bb4ab5757b566c08f77c',
    '.agents/skills/backlog-overlay/hooks/hooks.json': '5a63f649593a5d89af8775a8e3d12db0f0940b12',
    '.agents/skills/backlog-overlay/hooks/register.tsx': '00eb24701eddc868e61e166df0f4a004d0848350',
    '.agents/skills/backlog-overlay/types/index.d.ts': 'db0296efdf55632732b25b09ff70090f3b7a35fe',
  };
  for (const [path, expected] of Object.entries(hashes)) assert.equal(blob(readFileSync(path, 'utf8')), expected, path);
  const pi = readFileSync('.pi/extensions/backlog/index.ts', 'utf8');
  const adapted = '\t\t// Never break the overlay: it keeps showing what it has and reports the failure.\n\t\tif (!isClosed()) overlay.setFetchState("failed");';
  assert.equal(pi.split(adapted).length, 2);
  assert.equal(blob(pi.replace(adapted, '\t\t// Never break the overlay: it keeps showing what it has.')), '8d8a4f07a5abff499ca10323c74529c53a21e308');
});

test('Claude backlog is a project plugin, not a new skill, and both viewers only delegate Git resolution to the CLI', () => {
  const root = '.agents/skills/backlog-overlay';
  assert.equal(existsSync(join(root, 'SKILL.md')), false);
  assert.equal(readlinkSync('.claude/skills'), '../.agents/skills');
  const skills = readdirSync('.agents/skills').filter((name) => existsSync(join('.agents/skills', name, 'SKILL.md')));
  assert.ok(!skills.includes('backlog-overlay'));
  const manifest = JSON.parse(readFileSync(join(root, '.claude-plugin/plugin.json'), 'utf8'));
  assert.equal(manifest.name, 'backlog-overlay');
  assert.equal(manifest.types, './types/index.d.ts');
  assert.deepEqual(JSON.parse(readFileSync(join(root, 'hooks/hooks.json'), 'utf8')), { modules: ['./register.tsx'] });
  const claude = readFileSync(join(root, 'hooks/register.tsx'), 'utf8');
  const pi = readFileSync('.pi/extensions/backlog/index.ts', 'utf8');
  for (const source of [claude, pi]) {
    assert.ok(source.includes('--branches'));
    assert.ok(source.includes('--no-fetch'));
    assert.doesNotMatch(source, /function (?:git|mergeTargets|itemBranches)|ITEM_BRANCH/);
    assert.doesNotMatch(source, /(?:execFile(?:Sync)?|process\.run)\(\s*(?:\[\s*)?["']git["']/);
  }
  assert.ok(claude.includes("name: 'backlog'"));
  assert.ok(claude.includes('immediate: true'));
  assert.ok(pi.includes('pi.registerCommand("backlog"'));
});
