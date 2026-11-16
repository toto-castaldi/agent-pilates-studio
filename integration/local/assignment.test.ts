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
  assert.equal(multiple.turns[3].assignmentExpected.addedTeachers.length, 0, 'Antonio Neri is registered beforehand');
  assert.ok(multiple.setup.teachers.some((person: { firstName: string }) => person.firstName === 'Antonio'));
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
  // «io» is the registered sender, despite a declared different name.
  const linked = scenario('indicazione-mittente-collegato');
  assert.deepEqual(linked.identity, { firstName: 'Antonio', lastName: 'Neri', teacher: true });
  assert.ok(linked.turns.every((turn: { assignmentExpected: { assignments: { teacher: string; authorName: string }[] } }) => turn.assignmentExpected.assignments.every((row) => row.teacher === 'Antonio Neri' && row.authorName === 'Antonio Neri')));
  // An unknown teacher is never created: the gestore must register it first.
  const unknown = scenario('insegnante-sconosciuto-indicazione');
  for (const turn of unknown.turns) {
    assert.deepEqual(turn.assignmentExpected, { addedTeachers: [], assignments: [] });
    assert.ok(turn.response.anyOf.some((group: string[]) => group.includes('gestore')));
  }
  const naming = scenario('indicazione-nome-chiarimento');
  assert.ok(naming.turns[0].response.question);
  assert.equal(naming.turns.length, 3);
  assert.deepEqual(naming.turns[2].assignmentExpected, naming.turns[1].assignmentExpected);
  assert.ok(naming.turns[2].message.includes('Elena Neri'));
  const attendance = scenario('presenze-senza-indicazione');
  assert.ok(attendance.identity.teacher && attendance.setup.teachers.length);
  assert.ok(attendance.turns.every((turn: { attendanceExpected?: unknown; response: { excludes: string[] } }) => turn.attendanceExpected && turn.response.excludes.includes('insegnant')));
  const correction = scenario('indicazione-correzione-annullamento');
  assert.equal(correction.turns[1].response.question, true);
  assert.deepEqual(correction.turns[0].assignmentExpected, correction.turns[1].assignmentExpected);
  assert.deepEqual(correction.turns.map((turn: { assignmentExpected: { assignments: { cancellation?: unknown }[] } }) => turn.assignmentExpected.assignments.filter((row) => row.cancellation).length), [0, 0, 1, 2, 3, 3, 3]);
  assert.ok(correction.turns[4].response.contains.includes('Francesca'));
  assert.ok(correction.turns[6].response.contains.includes(correction.identity.firstName), 'the author is the registered name');
  const harness = await readFile('scripts/conversation.mjs', 'utf8');
  assert.match(harness, /assignmentScenarioMatches\(seededSnapshot, current, assignmentExpected\)/);
  assert.match(harness, /historyPreserved\(previous, current\)/);
  assert.ok(harness.indexOf('const stateOk =') < harness.indexOf('if (!responseMatches(text, expectedResponse))'), 'database checks must also run on a lexical failure');
  // US-015: historical fixtures may bypass only the rule and assignment author
  // triggers, inside the migrator's setup transaction; teachers keep theirs and
  // are registered only through the guided management functions (TEC-042).
  assert.match(harness, /manage_teacher_identity/);
  assert.doesNotMatch(harness, /INSERT INTO (?:app|studio_private)\.teachers/);
  assert.doesNotMatch(harness, /DISABLE TRIGGER (?:teachers_author|ALL|USER)\b/);
  assert.equal([...harness.matchAll(/DISABLE TRIGGER (\w+)/g)].map((match) => match[1]).sort().join(','), 'attendance_author,teacher_assignments_author,teacher_rules_author');
  const begin = harness.indexOf("await client.query('BEGIN')");
  const commit = harness.indexOf("await client.query('COMMIT')");
  for (const [table, trigger] of [['teacher_rules', 'teacher_rules_author'], ['teacher_assignments', 'teacher_assignments_author'], ['attendance', 'attendance_author']]) {
    const disable = harness.indexOf(`ALTER TABLE studio_private.${table} DISABLE TRIGGER ${trigger}`);
    const enable = harness.indexOf(`ALTER TABLE studio_private.${table} ENABLE TRIGGER ${trigger}`);
    assert.ok(begin > 0 && disable > begin && enable > disable && commit > enable, `${trigger} must be restored inside the setup transaction`);
  }
  const flush = harness.indexOf('SET CONSTRAINTS studio_private.teacher_rules_complete IMMEDIATE');
  assert.ok(flush > 0 && flush < harness.indexOf('ALTER TABLE studio_private.teacher_rules ENABLE TRIGGER teacher_rules_author'), 'pending rule checks must run before ALTER TABLE');
  assert.ok(harness.indexOf('SET CONSTRAINTS studio_private.teacher_rules_complete DEFERRED') > flush);
  assert.match(harness, /tgenabled !== 'O'/);
  assert.match(harness, /seededTeacherFixturesMatch\(seededSnapshot, setup\.teacherRules \?\? \[\], setup\.assignments \?\? \[\]/);
});
