import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type ActualState, fixtureCancellationReason, fixtureRuleDeactivationReason, historyPreserved, seededTeacherFixturesMatch, snapshotsMatch,
  type TeacherAssignmentFixture, type TeacherRuleFixture, teacherFixtureOrder } from '../src/conversation.js';

const author = { authorPhone: '15555550102', authorName: 'Operatore Sintetico' };
const now = '2026-11-14 12:00:00.123456+00';
const teachers = [
  { id: '1', firstName: 'Antonio', lastName: 'Neri', createdAt: now, ...author },
  { id: '2', firstName: 'Francesca', lastName: 'Blu', createdAt: now, ...author },
];
const rules: TeacherRuleFixture[] = [
  { teacher: 'Giulia Rosa', text: 'Giulia Rosa sabato mattina', intervals: [{ weekday: 6, min: '06:00', max: '12:59' }] },
  { teacher: 'Antonio Neri', text: 'Antonio Neri venerdì alle 19:00', intervals: [{ weekday: 5, min: '19:00', max: '19:00' }],
    createdAt: '2025-09-01T09:00:00Z', deactivatedAt: '2025-10-15T09:00:00Z' },
  { teacher: 'Francesca Blu', text: 'Francesca Blu mercoledì e venerdì', intervals: [{ weekday: 5, min: '19:00', max: '19:00' }, { weekday: 3, min: '18:00', max: '23:59' }],
    createdAt: '2025-10-15T09:00:00Z' },
];
const assignments: TeacherAssignmentFixture[] = [
  { teacher: 'Francesca Blu', lessonDate: '2025-10-13', time: '18:00', createdAt: '2025-10-13T19:00:00Z' },
  { teacher: 'Antonio Neri', lessonDate: '2025-10-08', time: '19:00', createdAt: '2025-10-07T09:00:00Z', cancelledAt: '2025-10-07T10:00:00Z' },
];
const inactive = { deactivatedAt: null, deactivatedByPhone: null, deactivatedByName: null, deactivationReason: null };
// Snapshot text as PostgreSQL renders timestamptz in another session time zone.
const seeded: ActualState = {
  clients: [],
  rules: [],
  attendance: [],
  teachers: [...teachers, { id: '3', firstName: 'Giulia', lastName: 'Rosa', createdAt: now, ...author }],
  teacherRules: [
    { id: '10', teacher: 'Antonio Neri', text: rules[1].text, createdAt: '2025-09-01 11:00:00+02', ...author,
      deactivatedAt: '2025-10-15 11:00:00+02', deactivatedByPhone: author.authorPhone, deactivatedByName: author.authorName,
      deactivationReason: fixtureRuleDeactivationReason, intervals: [{ weekday: 5, min: '19:00', max: '19:00', isActive: false }] },
    { id: '11', teacher: 'Francesca Blu', text: rules[2].text, createdAt: '2025-10-15 09:00:00+00', ...author, ...inactive,
      intervals: [{ weekday: 3, min: '18:00', max: '23:59', isActive: true }, { weekday: 5, min: '19:00', max: '19:00', isActive: true }] },
    { id: '12', teacher: 'Giulia Rosa', text: rules[0].text, createdAt: now, ...author, ...inactive,
      intervals: [{ weekday: 6, min: '06:00', max: '12:59', isActive: true }] },
  ],
  teacherAssignments: [
    { id: '20', teacherId: '2', teacher: 'Francesca Blu', lessonDate: '2025-10-13', time: '18:00', createdAt: '2025-10-13 21:00:00+02', ...author,
      cancelledAt: null, cancelledByPhone: null, cancelledByName: null, cancellationReason: null },
    { id: '21', teacherId: '1', teacher: 'Antonio Neri', lessonDate: '2025-10-08', time: '19:00', createdAt: '2025-10-07 09:00:00+00', ...author,
      cancelledAt: '2025-10-07 12:00:00+02', cancelledByPhone: author.authorPhone, cancelledByName: author.authorName, cancellationReason: fixtureCancellationReason },
  ],
};
const matches = (state: ActualState, ruleFixtures = rules, assignmentFixtures = assignments) =>
  seededTeacherFixturesMatch(state, ruleFixtures, assignmentFixtures, author.authorPhone, author.authorName);
const withRule = (index: number, change: object) => ({ ...seeded, teacherRules: seeded.teacherRules?.map((row, at) => (at === index ? { ...row, ...change } : row)) });
const withAssignment = (index: number, change: object) => ({ ...seeded, teacherAssignments: seeded.teacherAssignments?.map((row, at) => (at === index ? { ...row, ...change } : row)) });

test('historical teacher fixtures precede current rules and keep the catalog order', () => {
  assert.deepEqual(teacherFixtureOrder(rules).map((rule) => rule.teacher), ['Antonio Neri', 'Francesca Blu', 'Giulia Rosa']);
  assert.deepEqual(teacherFixtureOrder([]), []);
});

test('seeded teacher history matches instants, intervals, authors and fixed reasons exactly', () => {
  assert.ok(matches(seeded));
  assert.ok(matches({ ...seeded, teacherAssignments: [] }, rules, []));
  for (const change of [
    { createdAt: '2025-09-01 09:00:01+00' }, { createdAt: 'invalid' }, { deactivatedAt: null }, { deactivatedAt: '2025-10-15 09:01:00+00' },
    { deactivatedByPhone: '15555550103' }, { deactivatedByName: 'Falso' }, { deactivationReason: 'Altro motivo' },
    { intervals: [{ weekday: 5, min: '19:00', max: '19:00', isActive: true }] }, { intervals: [{ weekday: 5, min: '19:00', max: '19:01', isActive: false }] },
    { teacher: 'Francesca Blu' }, { text: 'Antonio Neri venerdì' }, { authorPhone: '15555550103' }, { authorName: null }, { id: '' },
  ]) assert.equal(matches(withRule(0, change)), false, JSON.stringify(change));
  for (const change of [{ deactivatedAt: '2025-10-16 09:00:00+00', deactivatedByPhone: author.authorPhone, deactivationReason: 'x' }, { createdAt: '2025-10-15 09:00:01+00' }]) {
    assert.equal(matches(withRule(1, change)), false, JSON.stringify(change));
  }
  assert.equal(matches(withRule(2, { createdAt: '' })), false, 'current rules need a creation instant');
  assert.equal(matches({ ...seeded, teacherRules: [...(seeded.teacherRules ?? [])].reverse() }), false);
  assert.equal(matches({ ...seeded, teacherRules: seeded.teacherRules?.slice(1) }), false);
  assert.equal(matches({ ...seeded, teacherRules: [...(seeded.teacherRules ?? []), { ...(seeded.teacherRules?.[2] ?? {}), id: '13' } as never] }), false);
  assert.equal(matches(withRule(2, { id: '10' })), false, 'duplicate IDs are rejected');
  // A deactivation fixture without its historical creation is invalid.
  const antonio = { ...seeded, teacherRules: seeded.teacherRules?.slice(0, 1), teacherAssignments: [] };
  assert.ok(matches(antonio, [rules[1]], []));
  assert.equal(matches(antonio, [{ ...rules[1], createdAt: undefined }], []), false);
});

test('seeded assignments check teacher key, lesson, instants, author and cancellation', () => {
  for (const change of [
    { teacherId: '1' }, { teacherId: '9' }, { teacher: 'Antonio Neri' }, { lessonDate: '2025-10-14' }, { time: '18:01' },
    { createdAt: '2025-10-13 19:00:01+00' }, { authorPhone: '15555550103' }, { authorName: 'Falso' }, { id: '' },
    { cancelledAt: '2025-10-14 09:00:00+00', cancelledByPhone: author.authorPhone, cancelledByName: author.authorName, cancellationReason: fixtureCancellationReason },
  ]) assert.equal(matches(withAssignment(0, change)), false, JSON.stringify(change));
  for (const change of [
    { cancelledAt: null }, { cancelledAt: '2025-10-07 10:00:01+00' }, { cancelledAt: '2025-10-07 09:00:00+00' }, { cancelledByPhone: '15555550103' },
    { cancelledByName: null }, { cancellationReason: 'Errore' },
  ]) assert.equal(matches(withAssignment(1, change)), false, JSON.stringify(change));
  assert.equal(matches({ ...seeded, teacherAssignments: [...(seeded.teacherAssignments ?? [])].reverse() }), false);
  assert.equal(matches({ ...seeded, teacherAssignments: seeded.teacherAssignments?.slice(1) }), false);
  assert.equal(matches({ ...seeded, teachers: teachers.slice(1) }), false, 'the teacher key must resolve to the named teacher');
});

test('consultations must leave the seeded history exactly unchanged', () => {
  const copy = structuredClone(seeded);
  assert.ok(snapshotsMatch(seeded, copy) && historyPreserved(seeded, copy));
  const cancelled = withAssignment(0, { cancelledAt: '2026-11-14 12:00:00+00', cancelledByPhone: author.authorPhone, cancelledByName: author.authorName, cancellationReason: 'Errore' });
  assert.equal(snapshotsMatch(seeded, cancelled), false, 'a consultation cannot cancel an indication');
  assert.equal(snapshotsMatch(seeded, withRule(1, { deactivatedAt: '2026-11-14 12:00:00+00', deactivatedByPhone: author.authorPhone, deactivationReason: 'x' })), false);
  assert.equal(snapshotsMatch(seeded, { ...seeded, teacherAssignments: seeded.teacherAssignments?.slice(1) }), false);
});
