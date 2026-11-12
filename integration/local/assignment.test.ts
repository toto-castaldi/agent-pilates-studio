import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('assignment catalog covers recording, confirmations, identity, correction and unchanged rules', async () => {
  const catalog = JSON.parse(await readFile('scenarios/basic.json', 'utf8'));
  const scenario = (id: string) => {
    const found = catalog.scenarios.find((entry: { id: string }) => entry.id === id);
    assert.ok(found, `Missing scenario ${id}`);
    return found;
  };
  const past = scenario('indicazione-passata-senza-presenze');
  assert.ok(past.setup.clients.length && !past.setup.attendance?.length);
  assert.deepEqual(past.turns[0].assignmentExpected, past.turns[1].assignmentExpected);
  assert.equal(past.turns[0].assignmentExpected.assignments[0].lessonDate, '$YESTERDAY');
  const extra = scenario('indicazione-lezione-extra');
  assert.deepEqual(extra.setup.clients, []);
  assert.deepEqual(extra.setup.rules, []);
  assert.equal(extra.turns[1].assignmentExpected.assignments[1].lessonDate, '2099-01-06');
  assert.equal(extra.turns[1].assignmentExpected.assignments[1].time, '19:30');
  assert.ok(extra.turns[0].response.anyOf.length >= 2);
  const single = scenario('sostituzione-singola');
  assert.ok(single.setup.clients.length > 1, 'multiple clients must still identify one lesson');
  assert.deepEqual(single.turns[0].assignmentExpected, single.turns[1].assignmentExpected);
  assert.equal(single.turns[0].assignmentExpected.assignments.length, 1);
  const multiple = scenario('sostituzione-piu-lezioni');
  for (const turn of multiple.turns.slice(0, 3)) assert.deepEqual(turn.assignmentExpected, { addedTeachers: [], assignments: [] });
  assert.ok(multiple.turns[0].response.question && multiple.turns[2].response.question);
  assert.equal(multiple.turns[3].assignmentExpected.addedTeachers.length, 1);
  assert.deepEqual(multiple.turns[3].assignmentExpected.assignments.map((row: { time: string }) => row.time), ['13:00', '17:59']);
  const period = scenario('sostituzione-periodo');
  assert.deepEqual(period.turns[0].assignmentExpected, { addedTeachers: [], assignments: [] });
  assert.equal(period.turns[0].response.question, true);
  assert.deepEqual(period.turns[1].assignmentExpected.assignments.map((row: { lessonDate: string }) => row.lessonDate), ['$NEXT_MONDAY', '$NEXT_MONDAY+7']);
  for (const id of ['sostituzione-non-attesa-ambigua', 'sostituzione-senza-lezioni']) {
    const rejected = scenario(id);
    assert.ok(rejected.turns[0].response.question);
    assert.ok(rejected.turns.every((turn: { assignmentExpected: { assignments: unknown[]; addedTeachers: unknown[] } }) => !turn.assignmentExpected.assignments.length && !turn.assignmentExpected.addedTeachers.length));
  }
  const noLessons = scenario('sostituzione-senza-lezioni');
  assert.ok(noLessons.setup.teacherRules.length && !noLessons.setup.clients.length && !noLessons.setup.attendance?.length);
  const linked = scenario('indicazione-mittente-collegato');
  assert.ok(linked.teacherLinks.length);
  assert.ok(linked.turns.every((turn: { assignmentExpected: { assignments: { teacher: string }[] } }) => turn.assignmentExpected.assignments.every((row) => row.teacher === 'Antonio Neri')));
  for (const id of ['indicazione-mittente-non-collegato', 'indicazione-mittente-collegato-inesistente']) {
    const unlinked = scenario(id);
    assert.deepEqual(unlinked.turns[0].assignmentExpected, { addedTeachers: [], assignments: [] });
    assert.equal(unlinked.turns[0].response.question, true);
    assert.equal(unlinked.turns[1].assignmentExpected.assignments.length, 1);
  }
  assert.equal(scenario('indicazione-mittente-collegato-inesistente').turns[1].assignmentExpected.assignments[0].authorName, null);
  const naming = scenario('indicazione-nome-chiarimento');
  assert.ok(naming.turns[0].response.question && naming.turns[2].response.question);
  assert.deepEqual(naming.turns[2].assignmentExpected, naming.turns[1].assignmentExpected);
  assert.equal(naming.turns[3].assignmentExpected.addedTeachers[0].firstName, 'Elena');
  const attendance = scenario('presenze-senza-indicazione');
  assert.ok(attendance.teacherLinks.length && attendance.setup.teachers.length);
  assert.ok(attendance.turns.every((turn: { attendanceExpected?: unknown; response: { excludes: string[] } }) => turn.attendanceExpected && turn.response.excludes.includes('insegnant')));
  const correction = scenario('indicazione-correzione-annullamento');
  assert.equal(correction.turns[1].response.question, true);
  assert.deepEqual(correction.turns[0].assignmentExpected, correction.turns[1].assignmentExpected);
  assert.deepEqual(correction.turns.map((turn: { assignmentExpected: { assignments: { cancellation?: unknown }[] } }) => turn.assignmentExpected.assignments.filter((row) => row.cancellation).length), [0, 0, 1, 2, 3, 3, 3]);
  assert.ok(correction.turns[4].response.contains.includes('Francesca'));
  assert.ok(correction.turns[6].response.contains.includes('Operatore'));
  const harness = await readFile('scripts/conversation.mjs', 'utf8');
  assert.match(harness, /assignmentScenarioMatches\(seededSnapshot, current, assignmentExpected\)/);
  assert.match(harness, /historyPreserved\(previous, current\)/);
  assert.ok(harness.indexOf('const stateOk =') < harness.indexOf('if (!responseMatches(text, expectedResponse))'), 'database checks must also run on a lexical failure');
  assert.doesNotMatch(harness, /DISABLE TRIGGER (?:teachers_author|teacher_rules_author|teacher_assignments_author)/);
});
