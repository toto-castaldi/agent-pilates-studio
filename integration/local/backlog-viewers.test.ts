import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

function blob(text: string): string {
  return createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');
}

test('shared resources match the pinned v4.0.0 blobs, with only the agreed Pi refresh adaptation', () => {
  // Public template commit b642da351cc848df6af89242fd31872b80c38a66 (tag v4.0.0), verified for TEC-048.
  const hashes: Record<string, string> = {
    'docs/PROCESS.md': 'f72bb6ccd438d174f0d6e14c3b91d2bb2aee15e3',
    'docs/PROCESS-PARALLEL.md': 'a59075dc9503ce1e11685be88511478b494153f5',
    'docs/process/backlog.md': '2b7042d43533b3a5f6540ecebc696bfe5d437860',
    'docs/process/docs.md': '8eeeade8783a51c1b9e778a904ce4b4473a27d4d',
    'docs/process/git.md': '568dd279891ada8c39dbcc581f962f14927563af',
    'docs/process/release.md': '583edc900552e6b2feaa3d8e2e03e9d9bd7259ae',
    '.agents/tools/backlog.py': '0392a6588f98d5bfe292751326f7f498788bf289',
    '.agents/skills/orchestrate/SKILL.md': '1c5907180bd22820fe769d7f67fa2d9496455f56',
    '.agents/skills/orchestrate/herdr.md': 'f3de0e9afa2a1341db4b42e9f68cb9eddbb1e1ca',
    '.agents/skills/orchestrate/claude-code.md': 'b5ec4ae987c1c75ac829a8c3382970a71cfb12e3',
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
    '.agents/skills/backlog-overlay/hooks/register.tsx': '00eb24701eddc868e61e166df0f4a004d0848350',
    '.agents/skills/backlog-overlay/types/index.d.ts': 'db0296efdf55632732b25b09ff70090f3b7a35fe',
  };
  for (const [path, expected] of Object.entries(hashes)) assert.equal(blob(readFileSync(path, 'utf8')), expected, path);
  const pi = readFileSync('.pi/extensions/backlog/index.ts', 'utf8');
  const adapted = '\t\t// Never break the overlay: it keeps showing what it has and reports the failure.\n\t\tif (!isClosed()) overlay.setFetchState("failed");';
  assert.equal(pi.split(adapted).length, 2);
  assert.equal(blob(pi.replace(adapted, '\t\t// Never break the overlay: it keeps showing what it has.')), 'db6b75e5c9bc4af9c99e0e435af3454a50b24cfc');
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
