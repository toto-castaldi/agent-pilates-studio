import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type ActualState, type AssignmentExpectation, type TeacherAssignmentState, assignmentScenarioMatches, attendanceScenarioMatches, historyPreserved, snapshotsMatch } from '../src/conversation.js';

const author = { authorPhone: '15555550102', authorName: 'Operatore Sintetico' };
const createdAt = '2026-01-01T09:00:00Z';
const teachers = [
  { id: '1', firstName: 'Antonio', lastName: 'Neri', createdAt, ...author },
  { id: '2', firstName: 'Francesca', lastName: 'Blu', createdAt, ...author },
];
const before: ActualState = {
  clients: [{ id: '1', firstName: 'Ada', lastName: 'Verdi', createdAt, ...author }],
  rules: [{ id: '1', text: 'Ada Verdi lunedì alle 15', clients: ['Ada Verdi'], slots: [{ weekday: 1, time: '15:00' }], createdAt, hasCreatedAt: true, active: true, ...author }],
  attendance: [{ id: '1', client: 'Ada Verdi', lessonDate: '2025-01-06', time: '15:00', outcome: 'present', createdAt, ...author }],
  teachers,
  teacherRules: [{ id: '1', teacher: 'Francesca Blu', text: 'Francesca lunedì pomeriggio', createdAt, ...author,
    deactivatedAt: null, deactivatedByPhone: null, deactivatedByName: null, deactivationReason: null,
    intervals: [{ weekday: 1, min: '13:00', max: '17:59', isActive: true }] }],
  teacherAssignments: [],
};
const assignment: TeacherAssignmentState = {
  id: '1', teacher: 'Antonio Neri', teacherId: '1', lessonDate: '2025-01-06', time: '15:00', createdAt, ...author,
  cancelledAt: null, cancelledByPhone: null, cancelledByName: null, cancellationReason: null,
};
const expected: AssignmentExpectation = { addedTeachers: [], assignments: [assignment] };
const withAssignment = { ...before, teacherAssignments: [assignment] };

test('assignment snapshots verify exact lessons, authenticated authors and teacher foreign keys', () => {
  assert.ok(assignmentScenarioMatches(before, withAssignment, expected));
  assert.ok(historyPreserved(before, withAssignment));
  assert.ok(assignmentScenarioMatches(before, before, { addedTeachers: [], assignments: [] }));
  assert.ok(assignmentScenarioMatches(before, { ...withAssignment, teacherAssignments: [{ ...assignment, teacher: 'ANTONIO NERI' }] }, expected));
  for (const change of [
    { teacher: 'Francesca Blu' }, { teacherId: '2' }, { teacherId: '' }, { teacherId: '99' },
    { lessonDate: '2025-01-07' }, { time: '15:01' }, { authorPhone: '15555550103' }, { authorName: 'Falso' },
    { id: '' }, { createdAt: '' }, { createdAt: 'invalid' }, { cancelledAt: createdAt },
    { cancelledByPhone: author.authorPhone }, { cancelledByName: 'Falso' }, { cancellationReason: 'Errore' },
  ]) assert.equal(assignmentScenarioMatches(before, { ...withAssignment, teacherAssignments: [{ ...assignment, ...change }] }, expected), false);
  assert.equal(assignmentScenarioMatches(before, before, expected), false);
  assert.equal(assignmentScenarioMatches(before, withAssignment, { addedTeachers: [], assignments: [] }), false);
  assert.equal(assignmentScenarioMatches(before, { ...withAssignment, teacherAssignments: [assignment, { ...assignment, id: '2' }] }, { ...expected, assignments: [assignment, assignment] }), false);
  assert.equal(assignmentScenarioMatches(before, { ...withAssignment, teacherAssignments: [assignment, assignment] }, { ...expected, assignments: [assignment, assignment] }), false);
  for (const change of [{ time: '15:00:00' }, { lessonDate: 'yesterday' }]) {
    const invalid = { ...assignment, ...change };
    assert.equal(assignmentScenarioMatches(before, { ...withAssignment, teacherAssignments: [invalid] }, { ...expected, assignments: [invalid] }), false);
  }
  const future = { ...assignment, id: '2', lessonDate: '2099-01-06', time: '19:30' };
  assert.ok(assignmentScenarioMatches(before, { ...withAssignment, teacherAssignments: [assignment, future] }, { ...expected, assignments: [future, assignment] }));
});

test('assignment scenarios allow only expected new teachers and preserve all unrelated tables', () => {
  const person = { id: '3', firstName: 'Luisa', lastName: 'Rossi', createdAt, ...author };
  const row = { ...assignment, teacherId: '3', teacher: 'Luisa Rossi' };
  const after = { ...before, teachers: [...teachers, person], teacherAssignments: [row] };
  const expectation = { addedTeachers: [person], assignments: [row] };
  assert.ok(assignmentScenarioMatches(before, after, expectation));
  assert.equal(assignmentScenarioMatches(before, after, { ...expectation, addedTeachers: [] }), false);
  assert.equal(assignmentScenarioMatches(before, { ...after, teachers }, expectation), false);
  for (const change of [{ id: '' }, { id: '1' }, { firstName: 'Altra' }, { lastName: 'Blu' }, { createdAt: 'invalid' }, { authorPhone: '999' }, { authorName: 'Falso' }]) {
    assert.equal(assignmentScenarioMatches(before, { ...after, teachers: [...teachers, { ...person, ...change }] }, expectation), false);
  }
  for (const changed of [
    { ...after, clients: [] }, { ...after, rules: [] }, { ...after, attendance: [] }, { ...after, teacherRules: [] },
    { ...after, teachers: [teachers[1], teachers[0], person] },
    { ...after, teachers: [{ ...teachers[0], createdAt: '2025-01-01' }, teachers[1], person] },
    { ...after, teacherRules: before.teacherRules?.map((rule) => ({ ...rule, deactivationReason: 'Cambiata' })) },
  ]) assert.equal(assignmentScenarioMatches(before, changed, expectation), false);
  assert.equal(attendanceScenarioMatches(before, withAssignment, { addedClients: [], attendance: before.attendance ?? [] }), false);
  assert.equal(snapshotsMatch(before, withAssignment), false);
});

test('assignment cancellation verifies timestamp, author, reason and immutable historical fields', () => {
  const cancellation = { authorPhone: '15555550103', authorName: null, reasonAnyOf: ['errore'] };
  const cancelled = { ...assignment, cancelledAt: '2026-01-02T09:00:00Z', cancelledByPhone: cancellation.authorPhone,
    cancelledByName: null, cancellationReason: 'Errore insegnante' };
  const corrected = { ...assignment, id: '2', teacher: 'Francesca Blu', teacherId: '2', createdAt: cancelled.cancelledAt };
  const after = { ...before, teacherAssignments: [cancelled, corrected] };
  const expectation = { addedTeachers: [], assignments: [{ ...assignment, cancellation }, corrected] };
  assert.ok(assignmentScenarioMatches(before, after, expectation));
  assert.ok(historyPreserved(withAssignment, after));
  assert.ok(historyPreserved(after, structuredClone(after)));
  for (const change of [
    { cancelledAt: null }, { cancelledAt: 'invalid' }, { cancelledAt: '2025-01-01T09:00:00Z' },
    { cancelledByPhone: author.authorPhone }, { cancelledByName: 'Falso' }, { cancellationReason: ' ' }, { cancellationReason: 'Altro' },
  ]) assert.equal(assignmentScenarioMatches(before, { ...after, teacherAssignments: [{ ...cancelled, ...change }, corrected] }, expectation), false);
  for (const change of [
    { id: '3' }, { teacherId: '2' }, { teacher: 'Francesca Blu' }, { lessonDate: '2025-01-07' }, { time: '16:00' },
    { createdAt: '2025-01-01T09:00:00Z' }, { authorPhone: '999' }, { authorName: 'Falso' },
    { cancelledAt: 'invalid' }, { cancelledAt: '2025-01-01T09:00:00Z' }, { cancelledByPhone: '' }, { cancellationReason: ' ' },
  ]) assert.equal(historyPreserved(withAssignment, { ...after, teacherAssignments: [{ ...cancelled, ...change }, corrected] }), false);
  for (const change of [
    { cancelledAt: '2026-01-03T09:00:00Z' }, { cancelledAt: null }, { cancelledByPhone: author.authorPhone },
    { cancelledByName: 'Riscritto' }, { cancellationReason: 'Riscritto' }, { teacherId: '2' },
  ]) assert.equal(historyPreserved(after, { ...after, teacherAssignments: [{ ...cancelled, ...change }, corrected] }), false);
  assert.equal(historyPreserved(withAssignment, { ...after, teacherAssignments: [corrected] }), false);
  assert.equal(historyPreserved(withAssignment, { ...after, teacherAssignments: [cancelled, cancelled] }), false);
  const cancelOnly = { ...before, teacherAssignments: [cancelled] };
  assert.ok(assignmentScenarioMatches(before, cancelOnly, { addedTeachers: [], assignments: [{ ...assignment, cancellation }] }));
  assert.ok(historyPreserved(withAssignment, cancelOnly));
  assert.equal(historyPreserved({ ...withAssignment, teacherAssignments: [{ ...assignment, cancelledByPhone: 'partial' }] }, cancelOnly), false);
  assert.equal(historyPreserved({ ...withAssignment, teacherAssignments: [{ ...assignment, createdAt: 'invalid' }] }, cancelOnly), false);
});
