import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diagnoseModelRequest, diagnoseResponse } from '../src/conversation-diagnostics.js';

test('model diagnostics expose only allowlisted structure, never source strings', () => {
  const privateValue = 'synthetic-private-marker-15555550102';
  const result = diagnoseModelRequest({ messages: [
    { role: 'assistant', tool_calls: [{ id: privateValue, function: { name: 'studio_sql_query', arguments: JSON.stringify({ query: `INSERT INTO app.teachers SELECT '${privateValue}'`, parameters: [privateValue] }) } }] },
    { role: 'tool', tool_call_id: privateValue, content: JSON.stringify({ error: privateValue, sqlstate: '42501' }) },
    { role: 'assistant', tool_calls: [{ id: 'other', function: { name: privateValue, arguments: privateValue } }] },
    { role: 'tool', tool_call_id: 'other', content: privateValue },
  ] });
  assert.equal(JSON.stringify(result).includes(privateValue), false);
  assert.deepEqual(result[0], { tool: 'sql', operations: ['select', 'insert'], tables: ['teachers'], senderFunction: false, validAttendanceFilter: false,
    rows: null, error: true, sqlstate: '42501', trustedContextUnavailable: false, genericExecutionFailure: false, skillContent: false });
  assert.deepEqual(diagnoseModelRequest({ messages: 'malformed' }), []);
});

test('response diagnostics distinguish lexical exclusion and explicit nonparticipation without echoing names', () => {
  const result = diagnoseResponse('Carla non risulta presente: registrazione annullata.', { contains: [], excludes: ['Carla'] });
  assert.equal(JSON.stringify(result).includes('Carla'), false);
  assert.equal(JSON.stringify(result).includes('annullata'), false);
  assert.equal((result as { matches: boolean }).matches, false, 'diagnostics must not waive an excluded name');
  assert.deepEqual((result as { excluded: object[] }).excluded, [{ mentioned: true,
    contexts: [{ presenceTerm: true, absenceTerm: false, cancellationTerm: true, missingRegistration: false,
      explicitExclusion: false, expectedTerm: false, negation: true }], nonparticipantOrCancellationContext: true }]);
});
