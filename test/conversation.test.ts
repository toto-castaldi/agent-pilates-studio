import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type ActualState, type ExpectedState, hasHomeChannelNotice, responseMatches, snapshotsMatch, stateMatches } from '../src/conversation.js';

const expected: ExpectedState = {
  clients: [{ firstName: 'Antonio', lastName: 'Rossi', authorPhone: '15555550102', authorName: 'Sintetico' }],
  rules: [{ textContains: ['Antonio', 'Rossi'], clients: ['Antonio Rossi'], slots: [{ weekday: 5, time: '09:00' }], authorPhone: '15555550102', authorName: 'Sintetico' }],
};
const actual: ActualState = {
  clients: [...expected.clients],
  rules: [{ text: 'Antonio Rossi venerdì alle 9', clients: ['Antonio Rossi'], slots: [{ weekday: 5, time: '09:00' }], authorPhone: '15555550102', authorName: 'Sintetico', active: true, hasCreatedAt: true }],
};

test('home-channel notices are detected rather than excluded from replies', () => {
  assert.equal(hasHomeChannelNotice('📬 No home channel is set for Whatsapp. Synthetic notice.'), true);
  assert.equal(hasHomeChannelNotice('Digita /sethome'), true);
  assert.equal(hasHomeChannelNotice('Nessun canale principale impostato'), true);
  assert.equal(hasHomeChannelNotice('Nessuna lezione trovata.'), false);
});

test('responses support optional times, alternatives and forbidden phrases', () => {
  const response = { contains: ['Antonio', 'Rossi'], times: ['09:00'] };
  assert.ok(responseMatches('Antonio Rossi: ore 9:00', response));
  assert.ok(responseMatches('Antonio Rossi alle 9', response));
  assert.equal(responseMatches('Antonio Rossi alle 19:00', response), false);
  assert.equal(responseMatches('Antonio Rossi alle 9:30', response), false);
  assert.ok(responseMatches('Antonio Rossi alle 9:30', { ...response, times: ['09:30'] }));
  assert.equal(responseMatches('Antonio Rossi alle 10', response), false);
  assert.equal(responseMatches('Antonio alle 9', response), false);
  assert.equal(responseMatches('Antonio Rossi alle 9', { ...response, times: ['99:00'] }), false);
  assert.ok(responseMatches('Qual è il cognome?', { contains: [], anyOf: [['cognome', 'nome completo']] }));
  assert.equal(responseMatches('Qual è il giorno?', { contains: [], anyOf: [['cognome', 'nome completo']] }), false);
  assert.ok(responseMatches('Qual è il cognome?', { contains: [], anyOf: [['cognome']], question: true }));
  assert.equal(responseMatches('Il cognome è Rossi.', { contains: [], anyOf: [['cognome']], question: true }), false);
  assert.equal(responseMatches('Confermi Antonio?', { contains: ['Antonio'], excludes: ['confermi'] }), false);
  const grouped = { contains: [], groups: [{ time: '09:00', contains: ['Antonio', 'Lucia'] }, { time: '10:00', contains: ['Elisa'] }] };
  assert.ok(responseMatches('09:00 Antonio e Lucia\n10:00 Elisa', grouped));
  assert.equal(responseMatches('09:00 Antonio ed Elisa\n10:00 Lucia', grouped), false);
  assert.equal(responseMatches('09:00 Antonio e Lucia\n10:30 Elisa', grouped), false);
  const days = { contains: [], dayGroups: [{ day: 'lunedì', groups: [{ time: '09:00', contains: ['Antonio'] }] }, { day: 'venerdì', groups: [{ time: '10:00', contains: ['Lucia'] }] }] };
  assert.ok(responseMatches('Lunedì\n09:00 Antonio\nVenerdì\n10:00 Lucia', days));
  assert.equal(responseMatches('Lunedì\n10:00 Lucia\nVenerdì\n09:00 Antonio', days), false);
  assert.equal(responseMatches('09:00 Antonio\n10:00 Lucia', days), false);
});

test('state rejects missing or extra records and wrong attribution, slot, date or activity', () => {
  assert.ok(stateMatches(actual, expected));
  assert.equal(stateMatches({ ...actual, clients: [] }, expected), false);
  assert.equal(stateMatches({ ...actual, rules: [...actual.rules, actual.rules[0]] }, expected), false);
  assert.equal(stateMatches({ ...actual, rules: [{ ...actual.rules[0], authorPhone: '999' }] }, expected), false);
  assert.equal(stateMatches({ ...actual, rules: [{ ...actual.rules[0], active: false }] }, expected), false);
  const inactiveExpected = { ...expected, rules: [{ ...expected.rules[0], active: false }] };
  assert.ok(stateMatches({ ...actual, rules: [{ ...actual.rules[0], active: false }] }, inactiveExpected));
  assert.equal(stateMatches(actual, inactiveExpected), false);
  assert.equal(stateMatches({ ...actual, rules: [{ ...actual.rules[0], hasCreatedAt: false }] }, expected), false);
  assert.equal(stateMatches({ ...actual, rules: [{ ...actual.rules[0], slots: [{ weekday: 4, time: '09:00' }] }] }, expected), false);
  assert.equal(stateMatches({ ...actual, rules: [{ ...actual.rules[0], clients: ['Altro Cliente'] }] }, expected), false);
});

test('consultation snapshots detect changes to rules, clients and deactivation metadata', () => {
  const before = { ...actual, rules: [{ ...actual.rules[0], deactivationReason: 'sintetico', deactivatedAt: '2024-01-15' }] };
  assert.ok(snapshotsMatch(before, structuredClone(before)));
  assert.equal(snapshotsMatch(before, { ...before, clients: [] }), false);
  assert.equal(snapshotsMatch(before, { ...before, rules: [{ ...before.rules[0], active: false }] }), false);
  const changedMetadata = { ...before.rules[0], deactivationReason: 'cambiato' };
  assert.equal(snapshotsMatch(before, { ...before, rules: [changedMetadata] }), false);
});

test('multi-client and multi-slot groups allow different decompositions but no missing or duplicate associations', () => {
  const group = { ...expected.rules[0], textContains: [], clients: ['Antonio Rossi', 'Lucia Verdi'], slots: [{ weekday: 1, time: '08:00' }, { weekday: 4, time: '15:00' }], together: true };
  const clients = [...actual.clients, { firstName: 'Lucia', lastName: 'Verdi', authorPhone: '15555550102', authorName: 'Sintetico' }];
  const groups = { clients, rules: [group] };
  const row = { ...actual.rules[0], text: 'Antonio e Lucia insieme lunedì alle 8 e giovedì alle 15', clients: group.clients, slots: group.slots };
  assert.ok(stateMatches({ clients, rules: [row] }, groups));
  const split = group.slots.map((slot) => ({ ...row, slots: [slot] }));
  assert.ok(stateMatches({ clients, rules: split }, groups));
  assert.equal(stateMatches({ clients, rules: split.slice(0, 1) }, groups), false);
  assert.equal(stateMatches({ clients, rules: [...split, split[0]] }, groups), false);
  assert.equal(stateMatches({ clients, rules: [{ ...row, clients: [...row.clients, 'Altro Cliente'] }] }, groups), false);
  assert.equal(stateMatches({ clients, rules: [{ ...row, slots: [...row.slots, row.slots[0]] }] }, groups), false);
  assert.equal(stateMatches({ clients, rules: [{ ...row, text: 'Allenamento lunedì alle 8 e giovedì alle 15' }] }, groups), false);
  assert.equal(stateMatches({ clients, rules: [{ ...row, text: 'Antonio e Lucia insieme lunedì alle 8' }] }, groups), false);
});
