import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

function blob(text: string): string {
  return createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');
}

test('shared resources match the pinned v2.2.1 blobs, with only the agreed Pi refresh adaptation', () => {
  // Public template commit e77bc386ab25d421186e3057eb0fa9e6cfc6c4c3, verified for TEC-044.
  const hashes: Record<string, string> = {
    'docs/PROCESS.md': '56fd65fba0e0047b233c37b9fea80f37f649c62c',
    'docs/PROCESS-PARALLEL.md': '0ad72b31d8165badf06fa5ee186f0f28cb387ff3',
    '.agents/tools/backlog.py': '7e926aba169355a6d8c4403f454d7bd2ddc35c62',
    '.agents/skills/orchestrate/SKILL.md': '5798c265311b2125d2cc13bef2c20e27c25bf381',
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
