import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const { contextWindow, compactionThreshold, idleSeconds, resolveCompaction } = createRequire(import.meta.url)('../../scripts/compaction-policy.mjs');

test('the compaction threshold follows the exact configured model window', () => {
  const catalog = { data: [
    { id: 'synthetic/small', context_length: 32_000 },
    { id: 'synthetic/large', context_length: 1_050_001 },
  ] };
  assert.equal(compactionThreshold(contextWindow(catalog, 'synthetic/small')), 12_800);
  assert.equal(compactionThreshold(contextWindow(catalog, 'synthetic/large')), 420_000);
  assert.equal(compactionThreshold(Number.MAX_SAFE_INTEGER), 3_602_879_701_896_396);
  for (const invalid of [0, -1, 2, 3.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '100']) {
    assert.throws(() => compactionThreshold(invalid));
  }
});

test('missing, ambiguous and invalid model metadata never produce a guessed window', () => {
  for (const [catalog, model] of [
    [{ data: [] }, 'synthetic/missing'],
    [{ data: [{ id: 'synthetic/a', context_length: 42 }, { id: 'synthetic/a', context_length: 100 }] }, 'synthetic/a'],
    [{ data: [{ id: 'synthetic/a', context_length: null }] }, 'synthetic/a'],
    [{ data: [{ id: 'synthetic/a', context_length: '65536' }] }, 'synthetic/a'],
    [{ data: {} }, 'synthetic/a'],
    [null, 'synthetic/a'],
  ] as const) assert.throws(() => contextWindow(catalog, model));
});

test('inactivity defaults to four hours and accepts only bounded positive integer seconds', () => {
  assert.equal(idleSeconds(undefined), 14_400);
  assert.equal(idleSeconds('1'), 1);
  assert.equal(idleSeconds('2147483647'), 2_147_483_647);
  for (const value of ['', '0', '-1', '1.5', ' 10', '01', '1e3', '2147483648', '99999999999999999', null]) {
    assert.throws(() => idleSeconds(value));
  }
});

test('container settings fetch the configured model window and fail closed', async () => {
  const requests: { url: string; headers: Record<string, string>; redirect: string }[] = [];
  const catalog = { data: [{ id: 'synthetic/model', context_length: 200_000 }] };
  const fetch = async (url: string, options: { headers: Record<string, string>; redirect: string }) => {
    requests.push({ url, headers: options.headers, redirect: options.redirect });
    return { ok: true, json: async () => catalog };
  };
  const env = { PILATES_MODEL: 'synthetic/model', OPENROUTER_BASE_URL: 'http://model-stub:8088/v1/', OPENROUTER_API_KEY: 'synthetic-key' };
  assert.deepEqual(await resolveCompaction({ env, fetch }), { threshold: 80_000, idle: 14_400 });
  assert.deepEqual(requests, [{ url: 'http://model-stub:8088/v1/models', headers: { Authorization: 'Bearer synthetic-key' }, redirect: 'error' }]);
  assert.deepEqual(await resolveCompaction({ env: { ...env, PILATES_IDLE_COMPACT_SECONDS: '' }, fetch }), { threshold: 80_000, idle: 14_400 });
  assert.deepEqual(await resolveCompaction({ env: { ...env, PILATES_IDLE_COMPACT_SECONDS: '30' }, fetch }), { threshold: 80_000, idle: 30 });
  await resolveCompaction({ env: { PILATES_MODEL: 'synthetic/model' }, fetch });
  assert.equal(requests.at(-1)?.url, 'https://openrouter.ai/api/v1/models');
  assert.deepEqual(requests.at(-1)?.headers, {});
  const count = requests.length;
  for (const invalid of [{ PILATES_IDLE_COMPACT_SECONDS: '0' }, { PILATES_MODEL: '' }, { PILATES_MODEL: 'bad model' }, { OPENROUTER_BASE_URL: 'file:///etc' }]) {
    await assert.rejects(resolveCompaction({ env: { ...env, ...invalid }, fetch }));
  }
  assert.equal(requests.length, count);
  await assert.rejects(resolveCompaction({ env: { ...env, PILATES_MODEL: 'synthetic/missing' }, fetch }));
  await assert.rejects(resolveCompaction({ env, fetch: async () => ({ ok: false, json: async () => catalog }) }));
  await assert.rejects(resolveCompaction({ env, fetch: async () => ({ ok: true, json: async () => { throw new SyntaxError('bad'); } }) }));
  await assert.rejects(resolveCompaction({ env, fetch: async () => { throw new Error('offline'); } }));
});
