import assert from 'node:assert/strict';
import { test } from 'node:test';
import { synchronizeWorkflow, validateWorkflow } from '../src/pi-workflow.js';

test('workflow validates only managed resource keys and package filters', () => {
  validateWorkflow({ packages: ['npm:example', { source: './package', autoload: false, skills: [], extensions: ['!old', '+new'], prompts: [] }], skills: ['!excluded'], extensions: [], prompts: [] });
  for (const value of [null, [], 1, { theme: 'dark' }, { themes: [] }, { defaultModel: 'private' }, { skills: 'x' }, { prompts: [null] }, { packages: [{}] }, { packages: [{ source: 'x', themes: [] }] }, { packages: [{ source: 'x', autoload: 'yes' }] }]) {
    assert.throws(() => validateWorkflow(value));
  }
});

test('workflow replaces/removes managed keys and preserves unknown nested preferences without mutation', () => {
  const local = JSON.parse('{"__proto__":{"safe":true},"unknown":{"nested":[1,null,{"future":true}]},"theme":"dark","themes":["./local"],"defaultProvider":"synthetic","defaultModel":"model","defaultThinkingLevel":"high","modelThinkingLevels":{"synthetic/model":"low"},"compaction":{"enabled":false},"lastChangelogVersion":"future","packages":["old"],"skills":["old"],"extensions":["old"]}');
  const before = structuredClone(local);
  const manifest = { packages: ['new'], prompts: ['+new', '!old'] };
  const merged = synchronizeWorkflow(manifest, local);
  assert.equal(merged.changed, true);
  const { packages: _p, skills: _s, extensions: _e, ...preferences } = before;
  assert.deepEqual(merged.settings, { ...preferences, ...manifest });
  assert.deepEqual(local, before);
  assert.equal(synchronizeWorkflow(manifest, merged.settings).changed, false);
  assert.deepEqual(synchronizeWorkflow({}, merged.settings).settings, preferences);
  for (const invalid of [null, [], 'secret']) assert.throws(() => synchronizeWorkflow({}, invalid));
});
