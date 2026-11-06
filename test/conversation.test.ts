import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type ActualState, type ExpectedState, isHarnessNotice, responseMatches, stateMatches } from '../src/conversation.js';

const expected: ExpectedState = {
  clients: [{ firstName: 'Antonio', lastName: 'Rossi', authorPhone: '15555550102', authorName: 'Sintetico' }],
  rules: [{ textContains: ['Antonio', 'Rossi'], client: 'Antonio Rossi', weekday: 5, time: '09:00', authorPhone: '15555550102', authorName: 'Sintetico' }],
};
const actual: ActualState = {
  clients: [...expected.clients],
  rules: [{ text: 'Antonio Rossi venerdì alle 9', clients: ['Antonio Rossi'], slots: [{ weekday: 5, time: '09:00' }], authorPhone: '15555550102', authorName: 'Sintetico', active: true }],
};

test('only the known home-channel notice is excluded from replies', () => {
  assert.equal(isHarnessNotice('📬 No home channel is set for Whatsapp. Synthetic notice.'), true);
  assert.equal(isHarnessNotice('Nessuna lezione trovata.'), false);
});

test('conversation response checks name and time without requiring exact wording', () => {
  const response = { contains: ['Antonio', 'Rossi'], time: '09:00' };
  assert.ok(responseMatches('Antonio Rossi: ore 9:00', response));
  assert.ok(responseMatches('Antonio Rossi alle 9', response));
  assert.equal(responseMatches('Antonio Rossi alle 19:00', response), false);
  assert.equal(responseMatches('Antonio Rossi alle 9:30', response), false);
  assert.equal(responseMatches('Antonio Rossi alle 9:30', { ...response, time: '09:30' }), true);
  assert.equal(responseMatches('Antonio Rossi alle 10', response), false);
  assert.equal(responseMatches('Antonio alle 9', response), false);
});

test('conversation state rejects missing or extra records and wrong attribution, slot or activity', () => {
  assert.ok(stateMatches(actual, expected));
  assert.equal(stateMatches({ ...actual, clients: [] }, expected), false);
  assert.equal(stateMatches({ ...actual, rules: [...actual.rules, actual.rules[0]] }, expected), false);
  assert.equal(stateMatches({ ...actual, rules: [{ ...actual.rules[0], authorPhone: '999' }] }, expected), false);
  assert.equal(stateMatches({ ...actual, rules: [{ ...actual.rules[0], active: false }] }, expected), false);
  assert.equal(stateMatches({ ...actual, rules: [{ ...actual.rules[0], slots: [{ weekday: 4, time: '09:00' }] }] }, expected), false);
  assert.equal(stateMatches({ ...actual, rules: [{ ...actual.rules[0], clients: ['Altro Cliente'] }] }, expected), false);
});
