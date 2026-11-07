import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const { contextWindow, compactionThreshold, idleSeconds } = createRequire(import.meta.url)('../../scripts/compaction-policy.mjs');

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
