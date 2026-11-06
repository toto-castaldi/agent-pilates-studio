import assert from 'node:assert/strict';
import { test } from 'node:test';
import { proxyHeaders } from '../src/conversation-proxy.js';

test('model relay requires the synthetic bearer, method and API path', () => {
  const original = { authorization: 'Bearer synthetic', host: 'local', connection: 'keep-alive', 'transfer-encoding': 'chunked', 'content-type': 'application/json' };
  assert.equal(proxyHeaders('POST', '/api/v1/chat/completions', original, 'wrong', 'key'), null);
  assert.equal(proxyHeaders('GET', '/other', original, 'synthetic', 'key'), null);
  assert.equal(proxyHeaders('DELETE', '/api/v1/models', original, 'synthetic', 'key'), null);
  const result = proxyHeaders('POST', '/api/v1/chat/completions', original, 'synthetic', 'key');
  assert.deepEqual(result, { authorization: 'Bearer key', host: 'openrouter.ai', 'content-type': 'application/json' });
  assert.equal(original.authorization, 'Bearer synthetic');
});
