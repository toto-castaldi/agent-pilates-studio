import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type ActualState, type ExpectedState, attendanceScenarioMatches, hasHomeChannelNotice, historyPreserved, responseMatches, romeDate, snapshotsMatch, stateMatches } from '../src/conversation.js';

const expected: ExpectedState = {
  clients: [{ firstName: 'Antonio', lastName: 'Rossi', authorPhone: '15555550102', authorName: 'Sintetico' }],
  rules: [{ textContains: ['Antonio', 'Rossi'], clients: ['Antonio Rossi'], slots: [{ weekday: 5, time: '09:00' }], authorPhone: '15555550102', authorName: 'Sintetico' }],
};
const actual: ActualState = {
  clients: [...expected.clients],
  rules: [{ text: 'Antonio Rossi venerdì alle 9', clients: ['Antonio Rossi'], slots: [{ weekday: 5, time: '09:00' }], authorPhone: '15555550102', authorName: 'Sintetico', active: true, hasCreatedAt: true }],
};

test('attendance snapshots check exact rows, authenticated authors and unchanged rules and clients', () => {
  const client = { ...actual.clients[0], id: '1', createdAt: '2024-01-01T09:00:00Z' };
  const rule = { ...actual.rules[0], id: '10', createdAt: '2024-01-01T09:00:00Z' };
  const before = { clients: [client], rules: [rule], attendance: [] };
  const row = { id: '4', client: 'Antonio Rossi', lessonDate: '2025-01-06', time: '19:00', outcome: 'present', authorPhone: '15555550102', authorName: 'Sintetico', createdAt: '2026-01-01T09:00:00Z', cancelledAt: null, cancelledByPhone: null, cancelledByName: null, cancellationReason: null };
  const after = { ...before, attendance: [row] };
  const expectation = { addedClients: [], attendance: [row] };
  assert.ok(attendanceScenarioMatches(before, after, expectation));
  assert.equal(stateMatches(after, expected), false);
  for (const change of [{ lessonDate: '2025-01-07' }, { time: '19:01' }, { outcome: 'excused_absence' }, { authorPhone: '999' }, { authorName: 'Falso' }, { createdAt: '' }, { cancelledAt: '2026-01-01' }]) {
    assert.equal(attendanceScenarioMatches(before, { ...after, attendance: [{ ...row, ...change }] }, expectation), false);
  }
  assert.equal(attendanceScenarioMatches(before, { ...after, attendance: [row, row] }, expectation), false);
  assert.equal(attendanceScenarioMatches(before, { ...after, rules: [] }, expectation), false);
  assert.equal(attendanceScenarioMatches(before, { ...after, clients: [{ ...client, createdAt: '2025-01-01' }] }, expectation), false);
  const extra = { firstName: 'Lucia', lastName: 'Verdi', id: '2', createdAt: '2026-01-01T09:00:00Z', authorPhone: '15555550102', authorName: 'Sintetico' };
  assert.ok(attendanceScenarioMatches(before, { ...after, clients: [client, extra] }, { ...expectation, addedClients: [extra] }));
  assert.equal(attendanceScenarioMatches(before, { ...after, clients: [client, { ...extra, authorPhone: '999' }] }, { ...expectation, addedClients: [extra] }), false);
  assert.ok(historyPreserved(after, after));
  assert.equal(historyPreserved(after, { ...after, attendance: [{ ...row, id: '5' }] }), false);
});

test('relative day uses the Rome calendar across midnight and DST', () => {
  assert.equal(romeDate(new Date('2025-01-05T23:30:00Z')), '2025-01-06');
  assert.equal(romeDate(new Date('2025-07-05T22:30:00Z')), '2025-07-06');
  assert.equal(romeDate(new Date('2025-01-05T22:30:00Z')), '2025-01-05');
});

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
  assert.ok(responseMatches('Inserita il 07/11/2026', { contains: [], date: true }));
  assert.ok(responseMatches('Disattivata il 7 novembre 2026', { contains: [], date: true }));
  assert.equal(responseMatches('Inserita il 07/11', { contains: [], date: true }), false);
});

test('state rejects missing or extra records and wrong attribution, slot, date or activity', () => {
  assert.ok(stateMatches(actual, expected));
  assert.equal(stateMatches({ ...actual, clients: [] }, expected), false);
  assert.equal(stateMatches({ ...actual, rules: [...actual.rules, actual.rules[0]] }, expected), false);
  assert.equal(stateMatches({ ...actual, rules: [{ ...actual.rules[0], authorPhone: '999' }] }, expected), false);
  assert.equal(stateMatches({ ...actual, rules: [{ ...actual.rules[0], active: false }] }, expected), false);
  const inactiveExpected = { ...expected, rules: [{ ...expected.rules[0], deactivation: { authorPhone: '15555550102', authorName: 'Sintetico' } }] };
  assert.equal(stateMatches({ ...actual, rules: [{ ...actual.rules[0], active: false }] }, inactiveExpected), false);
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

test('deactivated rules require date, authenticated author and nonempty reason', () => {
  const deactivation = { authorPhone: '15555550102', authorName: 'Sintetico' };
  const expectedHistory = { ...expected, rules: [{ ...expected.rules[0], deactivation }] };
  const row = { ...actual.rules[0], active: false, deactivatedAt: '2026-11-07', deactivatedByPhone: deactivation.authorPhone, deactivatedByName: deactivation.authorName, deactivationReason: 'Ha smesso' };
  const state = { ...actual, rules: [row] };
  assert.ok(stateMatches(state, expectedHistory));
  assert.equal(stateMatches(state, expected), false);
  assert.equal(stateMatches(state, { ...expected, rules: [{ ...expected.rules[0], deactivation: { ...deactivation, reasonAnyOf: ['spostat'] } }] }), false);
  for (const change of [{ deactivatedAt: null }, { deactivatedByPhone: '999' }, { deactivatedByName: 'Falso' }, { deactivationReason: '  ' }, { active: true }]) {
    assert.equal(stateMatches({ ...state, rules: [{ ...row, ...change }] }, expectedHistory), false);
  }
});

test('history retains original rows and associations and never changes a prior deactivation', () => {
  const row = { ...actual.rules[0], id: '1', createdAt: '2026-11-01' };
  const before = { ...actual, rules: [row] };
  const stopped = { ...row, active: false, deactivatedAt: '2026-11-07', deactivatedByPhone: '15555550102', deactivatedByName: 'Sintetico', deactivationReason: 'Ha smesso' };
  const after = { ...actual, rules: [stopped] };
  assert.ok(historyPreserved(before, after));
  assert.ok(historyPreserved(after, after));
  assert.equal(historyPreserved(after, { ...after, rules: [] }), false);
  for (const change of [{ text: 'Riscritta' }, { id: '2' }, { createdAt: 'altro' }, { clients: ['Altro Cliente'] }, { slots: [] }, { deactivationReason: 'Altro' }, { deactivatedAt: 'altro' }, { deactivatedByPhone: '999' }, { active: true }]) {
    assert.equal(historyPreserved(after, { ...after, rules: [{ ...stopped, ...change }] }), false);
  }
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
