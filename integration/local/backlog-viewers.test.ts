import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

function blob(text: string): string {
  return createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');
}

test('shared resources match the pinned v4.3.0 blobs, with only the agreed Pi refresh adaptation', () => {
  // Public template commit 73f4dd3810a035b07e15197ebe00fa5cce4d2628 (tag v4.3.0), verified for TEC-055;
  // files unchanged since v4.2.0 (f8865eea054c12a801d98249e13e188bd5411260, TEC-054) or v4.0.0 (b642da351cc848df6af89242fd31872b80c38a66, TEC-048) keep their blobs.
  const hashes: Record<string, string> = {
    'docs/PROCESS.md': '9aa1584582c182bef44e37072bb288580edc80b6',
    'docs/PROCESS-PARALLEL.md': 'ae671d2023dd38a06c397e6489d298ad6a654257',
    'docs/process/backlog.md': '2b7042d43533b3a5f6540ecebc696bfe5d437860',
    'docs/process/docs.md': '8eeeade8783a51c1b9e778a904ce4b4473a27d4d',
    'docs/process/git.md': '568dd279891ada8c39dbcc581f962f14927563af',
    'docs/process/release.md': '583edc900552e6b2feaa3d8e2e03e9d9bd7259ae',
    '.agents/tools/backlog.py': 'f0dde5067ac3429d112dc2a91b9a4798d203497a',
    '.claude/settings.json': '2606966b9d8d39bf155a1bc7cb2c5bd5f3c84768',
    '.pi/extensions/template-check/index.ts': '3d11519af02259a103c09fd1c3879368dea1b575',
    '.agents/skills/orchestrate/SKILL.md': 'ceac6f3c0ba51daab6bee193e5a366d6aa3811fb',
    '.agents/skills/orchestrate/herdr.md': '37e89c38280cd2fb58154428a0e524a7f314cff6',
    '.agents/skills/orchestrate/claude-code.md': '91151f34a3b659ab811279e02416e4e5f36e2ce8',
    '.agents/skills/orchestrate/manual.md': '62431d3d14b222ff0dc0ce568782a4ef5ca70403',
    '.agents/skills/add-item/SKILL.md': '624ad3dc8ed0fd99282cc83179dcfddb6f01569b',
    '.agents/skills/start-task/SKILL.md': 'de4a8c4d813c12e38b73caa8b21a44aca0d24674',
    '.agents/skills/finish-task/SKILL.md': '0ab08b54fcc6e707a3aba733c792e5c204a18b6d',
    '.agents/skills/close-version/SKILL.md': '9d18f99043a69d23065fca81ccacd8940b19dbc8',
    '.agents/skills/kickoff/SKILL.md': '58305fd176b81f3a29877b476f1673a76ece5783',
    '.agents/skills/merge-task/SKILL.md': 'f448f5fe952f6d5320f29c20422dbd5d19eba47f',
    'docs/requirements/_TEMPLATE.md': '0a0a56f9453428e7e350baa7a4392609d6693a3d',
    'docs/design/_TEMPLATE.md': 'f166771727b13bb74dfdd78d2805ea9930862838',
    '.agents/skills/backlog-overlay/.claude-plugin/plugin.json': '0953298a0c504bbfc7c3bb4ab5757b566c08f77c',
    '.agents/skills/backlog-overlay/hooks/hooks.json': '5a63f649593a5d89af8775a8e3d12db0f0940b12',
    '.agents/skills/backlog-overlay/hooks/register.tsx': '79f4f670ebd057b21fe1a7794db9f5232827f05d',
    '.agents/skills/backlog-overlay/types/index.d.ts': 'd4c86c45b66bd511d1dcd9ddee84ef1e5e4a9934',
  };
  for (const [path, expected] of Object.entries(hashes)) assert.equal(blob(readFileSync(path, 'utf8')), expected, path);
  const pi = readFileSync('.pi/extensions/backlog/index.ts', 'utf8');
  const adapted = '\t\t// Never break the overlay: it keeps showing what it has and reports the failure.\n\t\tif (!isClosed()) overlay.setFetchState("failed");';
  assert.equal(pi.split(adapted).length, 2);
  assert.equal(blob(pi.replace(adapted, '\t\t// Never break the overlay: it keeps showing what it has.')), 'f2188c43c842786ac9e71c1693330595e786b18e');
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
