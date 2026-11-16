import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { relativeDateTokens, responseMatches, scenarioRelativeDate, scenarioRelativeTimestamp, stateMatches } from '../../src/conversation.js';

// Fixture dates are absolute or one of the relative tokens resolved at the
// start of a scenario; a fixed reference keeps the chronological checks stable.
const token = `\\$(?:${relativeDateTokens.join('|')})(?:\\+\\d+)?`;
const fixtureDate = new RegExp(`^(?:\\d{4}-\\d\\d-\\d\\d|${token})$`);
const fixtureInstant = new RegExp(`^(?:\\d{4}-\\d\\d-\\d\\d|${token})T\\d\\d:\\d\\d:\\d\\dZ$`);
const reference = new Date('2026-11-14T12:00:00Z');
const resolveDate = (value: string) => scenarioRelativeDate(reference, value);
const resolveInstant = (value: string) => Date.parse(scenarioRelativeTimestamp(reference, value) ?? '');

test('conversation catalog is synthetic, complete and excluded from CI', async () => {
  const catalog = JSON.parse(await readFile('scenarios/basic.json', 'utf8'));
  assert.equal(catalog.version, 1);
  assert.ok(catalog.scenarios.length > 0);
  const ids = new Set<string>();
  for (const scenario of catalog.scenarios) {
    assert.equal(ids.has(scenario.id), false);
    ids.add(scenario.id);
    assert.match(scenario.id, /^[a-z0-9-]+$/);
    assert.match(scenario.sender, /^1555555\d{4}$/);
    assert.ok(stateMatches({ clients: [], rules: [] }, scenario.initial));
    assert.ok(scenario.turns.length >= 2);
    // Every sender is a registered identity whose name differs from the
    // WhatsApp profile; no configuration link or mapping exists any more.
    assert.equal('teacherLinks' in scenario, false);
    assert.ok(scenario.identity?.firstName && scenario.identity?.lastName);
    const registered = `${scenario.identity.firstName} ${scenario.identity.lastName}`;
    assert.notEqual(scenario.profile, registered);
    for (const turn of scenario.turns) assert.deepEqual(turn.assignmentExpected?.addedTeachers ?? [], [], 'the model never creates teachers');
    for (const person of scenario.setup?.teachers ?? []) assert.ok(person.firstName && person.lastName);
    for (const rule of scenario.setup?.teacherRules ?? []) {
      assert.ok(scenario.setup.teachers.some((person: { firstName: string; lastName: string }) => `${person.firstName} ${person.lastName}` === rule.teacher));
      assert.ok(rule.text?.trim() && rule.intervals.length);
      assert.ok(!rule.inactive, 'historical deactivation is expressed with deactivatedAt');
      if (rule.createdAt) assert.match(rule.createdAt, fixtureInstant);
      if (rule.deactivatedAt) {
        assert.ok(rule.createdAt, 'only historical rules can be seeded as deactivated');
        assert.match(rule.deactivatedAt, fixtureInstant);
        assert.ok(resolveInstant(rule.deactivatedAt) > resolveInstant(rule.createdAt));
      }
      for (const interval of rule.intervals) {
        assert.ok(Number.isInteger(interval.weekday) && interval.weekday >= 1 && interval.weekday <= 7);
        assert.match(interval.min, /^(?:[01]\d|2[0-3]):[0-5]\d$/);
        assert.match(interval.max, /^(?:[01]\d|2[0-3]):[0-5]\d$/);
        assert.ok(interval.min <= interval.max);
      }
    }
    for (const row of scenario.setup?.attendance ?? []) {
      assert.match(row.createdAt, fixtureInstant);
      assert.match(row.lessonDate, fixtureDate);
      assert.ok(['present', 'excused_absence', 'unexcused_absence'].includes(row.outcome));
      assert.ok(scenario.setup.clients.some((client: { firstName: string; lastName: string }) => `${client.firstName} ${client.lastName}` === row.client));
      const createdAt = resolveInstant(row.createdAt);
      if (row.outcome !== 'excused_absence') assert.ok(createdAt > Date.parse(`${resolveDate(row.lessonDate)}T${row.time}:00Z`));
      if (row.cancelledAt) assert.ok(resolveInstant(row.cancelledAt) > createdAt);
    }
    for (const row of scenario.setup?.assignments ?? []) {
      assert.ok(scenario.setup.teachers.some((person: { firstName: string; lastName: string }) => `${person.firstName} ${person.lastName}` === row.teacher));
      assert.match(row.lessonDate, fixtureDate);
      assert.match(row.time, /^(?:[01]\d|2[0-3]):[0-5]\d$/);
      assert.match(row.createdAt, fixtureInstant);
      if (row.cancelledAt) {
        assert.match(row.cancelledAt, fixtureInstant);
        assert.ok(resolveInstant(row.cancelledAt) > resolveInstant(row.createdAt));
      }
    }
    for (const turn of scenario.turns) {
      assert.ok(turn.message && Array.isArray(turn.response.contains));
      assert.ok(turn.response.contains.length || turn.response.anyOf?.length || turn.response.counts?.length);
      assert.equal([turn.expected, turn.teacherExpected, turn.assignmentExpected, turn.attendanceExpected, turn.unchanged].filter(Boolean).length, 1);
      if (turn.assignmentExpected) {
        assert.ok(scenario.setup);
        assert.ok(Array.isArray(turn.assignmentExpected.addedTeachers) && Array.isArray(turn.assignmentExpected.assignments));
        const teachers = [...(scenario.setup.teachers ?? []), ...turn.assignmentExpected.addedTeachers];
        for (const row of turn.assignmentExpected.assignments) {
          assert.ok(teachers.some((person: { firstName: string; lastName: string }) => `${person.firstName} ${person.lastName}` === row.teacher));
          assert.match(row.lessonDate, fixtureDate);
          assert.match(row.time, /^(?:[01]\d|2[0-3]):[0-5]\d$/);
          assert.equal(row.authorPhone, scenario.sender);
          assert.equal(row.authorName, registered);
          if (row.cancellation) {
            assert.equal(row.cancellation.authorPhone, scenario.sender);
            assert.equal(row.cancellation.authorName, registered);
          }
        }
        for (const person of turn.assignmentExpected.addedTeachers) {
          assert.ok(person.firstName && person.lastName);
          assert.equal(person.authorPhone, scenario.sender);
          assert.equal(person.authorName, registered);
        }
        continue;
      }
      if (turn.teacherExpected) {
        assert.ok(!turn.expected && !turn.unchanged && !turn.attendanceExpected);
        assert.ok(Array.isArray(turn.teacherExpected.teachers) && Array.isArray(turn.teacherExpected.rules));
        for (const rule of turn.teacherExpected.rules) {
          assert.ok(turn.teacherExpected.teachers.some((person: { firstName: string; lastName: string }) => `${person.firstName} ${person.lastName}` === rule.teacher));
          assert.ok(rule.intervals.length > 0);
          for (const interval of rule.intervals) {
            assert.ok(Number.isInteger(interval.weekday) && interval.weekday >= 1 && interval.weekday <= 7);
            assert.match(interval.min, /^(?:[01]\d|2[0-3]):[0-5]\d$/);
            assert.match(interval.max, /^(?:[01]\d|2[0-3]):[0-5]\d$/);
            assert.ok(interval.min <= interval.max);
          }
        }
        continue;
      }
      if (turn.unchanged) {
        assert.ok(scenario.setup && !turn.expected);
        continue;
      }
      if (turn.attendanceExpected) {
        assert.ok(scenario.setup && !turn.expected);
        assert.ok(Array.isArray(turn.attendanceExpected.addedClients) && Array.isArray(turn.attendanceExpected.attendance));
        for (const row of turn.attendanceExpected.attendance) {
          assert.ok(row.client && fixtureDate.test(row.lessonDate));
          assert.match(row.time, /^(?:[01]\d|2[0-3]):[0-5]\d$/);
          assert.ok(['present', 'excused_absence', 'unexcused_absence'].includes(row.outcome));
          assert.equal(row.authorPhone, scenario.sender);
          assert.equal(row.authorName, registered);
          if (row.cancellation) {
            assert.equal(row.cancellation.authorPhone, scenario.sender);
            assert.equal(row.cancellation.authorName, registered);
          }
        }
        for (const person of turn.attendanceExpected.addedClients) {
          assert.ok(person.firstName && person.lastName);
          assert.equal(person.authorPhone, scenario.sender);
          assert.equal(person.authorName, registered);
        }
        continue;
      }
      assert.ok(Array.isArray(turn.expected.clients) && Array.isArray(turn.expected.rules));
      for (const rule of turn.expected.rules) {
        assert.ok(rule.clients.length && rule.slots.length);
        assert.equal(rule.authorPhone, scenario.sender);
        assert.equal(rule.authorName, registered);
        if (rule.deactivation) {
          assert.equal(rule.deactivation.authorPhone, scenario.sender);
          assert.equal(rule.deactivation.authorName, registered);
          assert.ok(rule.deactivation.reasonAnyOf?.length);
        }
      }
      for (const client of turn.expected.clients) {
        assert.equal(client.authorPhone, scenario.sender);
        assert.equal(client.authorName, registered);
      }
    }
  }
  for (const id of ['assenze-esplicite-chiarimento', 'assenze-attesi-presenze', 'presenze-data-odierna', 'presenze-nomi-duplicato-futuro', 'presenze-attesi-storici', 'consultazione-pianificazione', 'registrazione-consultazione', 'piu-orari-e-gruppo', 'cognome-mancante', 'nome-unico', 'nome-ambiguo', 'orario-mancante', 'giorno-mancante', 'autore-non-dichiarato', 'disattivazione-esplicita-storico', 'aggiornamento-implicito', 'cambio-cliente-gruppo']) {
    assert.ok(ids.has(id), `Missing scenario ${id}`);
  }
  for (const id of ['assenza-anticipata-singola-annullamento', 'assenza-anticipata-ambigua-non-attesa', 'assenza-anticipata-periodo', 'assenza-anticipata-conflitto-presenza', 'assenza-anticipata-conflitto-assenza', 'assenza-anticipata-conflitto-tutti-tranne', 'assenza-anticipata-conflitto-esplicito']) assert.ok(ids.has(id), `Missing scenario ${id}`);
  for (const id of ['insegnanti-fasce-e-orari', 'insegnanti-cognome-e-riconoscimento', 'insegnanti-sovrapposizione-conferma', 'insegnanti-sovrapposizione-stesso', 'insegnanti-disattivazione-parziale', 'insegnanti-mittente-collegato', 'insegnante-sconosciuto-regola', 'insegnanti-io-nome-censito']) assert.ok(ids.has(id), `Missing scenario ${id}`);
  // Unified identity (TEC-042): registered name instead of the profile, false
  // declared identity, «io» for rules and assignments, system author and
  // unknown teachers never created.
  const byId = (id: string) => catalog.scenarios.find((entry: { id: string }) => entry.id === id);
  for (const id of ['indicazione-mittente-collegato', 'insegnanti-mittente-collegato', 'insegnanti-io-nome-censito', 'insegnante-sconosciuto-regola']) {
    assert.equal(byId(id).identity.teacher, true, id);
  }
  assert.ok(byId('indicazione-mittente-collegato').turns[1].message.includes('Mi chiamo Francesca Blu'));
  assert.ok(byId('insegnanti-mittente-collegato').turns[2].message.includes('Mi chiamo Francesca Blu'));
  assert.ok(byId('insegnanti-io-nome-censito').turns[1].response.contains.includes('Maria Verdi'));
  assert.ok(byId('insegnanti-io-nome-censito').turns[1].response.excludes.includes(byId('insegnanti-io-nome-censito').profile));
  for (const id of ['insegnante-sconosciuto-regola', 'insegnante-sconosciuto-indicazione', 'indicazione-nome-chiarimento']) {
    const scenario = byId(id);
    const last = scenario.turns.at(-1);
    assert.ok(scenario.turns.some((turn: { response: { anyOf?: string[][] } }) => turn.response.anyOf?.some((group) => group.includes('gestore'))), id);
    if (last.assignmentExpected) assert.ok(last.assignmentExpected.assignments.every((row: { teacher: string }) => !['Luisa Rossi', 'Elena Neri'].includes(row.teacher)));
  }
  assert.deepEqual(byId('insegnante-sconosciuto-regola').turns[0].teacherExpected.rules, []);
  assert.ok(byId('autore-non-dichiarato').turns[0].message.includes('Operatore Falso'));
  const teacherOverlap = catalog.scenarios.find((scenario: { id: string }) => scenario.id === 'insegnanti-sovrapposizione-conferma');
  assert.ok(teacherOverlap.turns[1].response.question && teacherOverlap.turns[3].response.question);
  for (const turn of teacherOverlap.turns.slice(1, 4)) assert.deepEqual(turn.teacherExpected, teacherOverlap.turns[0].teacherExpected);
  assert.ok(teacherOverlap.turns[4].teacherExpected.rules.some((rule: { inactive?: boolean }) => rule.inactive));
  const selfOverlap = catalog.scenarios.find((scenario: { id: string }) => scenario.id === 'insegnanti-sovrapposizione-stesso');
  assert.equal(selfOverlap.turns[1].response.question, true);
  for (const turn of selfOverlap.turns.slice(1)) assert.deepEqual(turn.teacherExpected, selfOverlap.turns[0].teacherExpected);
  const future = catalog.scenarios.find((scenario: { id: string }) => scenario.id === 'assenza-anticipata-singola-annullamento');
  assert.ok(future.turns[2].attendanceExpected.attendance[0].cancellation);
  const conflict = catalog.scenarios.find((scenario: { id: string }) => scenario.id === 'assenza-anticipata-conflitto-presenza');
  assert.ok(conflict.setup.attendance[0].createdAt < `${conflict.setup.attendance[0].lessonDate}T19:00:00Z`);
  assert.ok(conflict.turns[1].attendanceExpected.attendance[0].cancellation);
  const corrections = catalog.scenarios.find((scenario: { id: string }) => scenario.id === 'correzioni-presenze-storico');
  assert.ok(corrections);
  assert.equal(corrections.turns[1].response.question, true);
  assert.deepEqual(corrections.turns[1].attendanceExpected, corrections.turns[0].attendanceExpected);
  assert.deepEqual(corrections.turns.map((turn: { attendanceExpected: { attendance: { cancellation?: unknown }[] } }) => turn.attendanceExpected.attendance.filter((row) => row.cancellation).length), [0, 0, 1, 2, 3, 3, 3]);
  assert.deepEqual(corrections.turns.slice(4).map((turn: { attendanceExpected: { attendance: { outcome: string }[] } }) => turn.attendanceExpected.attendance.map((row) => row.outcome)), Array(3).fill(['present', 'present', 'excused_absence', 'unexcused_absence']));
  const explicitAbsences = catalog.scenarios.find((scenario: { id: string }) => scenario.id === 'assenze-esplicite-chiarimento');
  assert.deepEqual(explicitAbsences.turns.map((turn: { attendanceExpected: { attendance: unknown[] } }) => turn.attendanceExpected.attendance.length), [1, 2, 2, 3, 3, 3]);
  assert.equal(explicitAbsences.turns[2].response.question, true);
  assert.deepEqual(explicitAbsences.turns[3].attendanceExpected.attendance.map((row: { outcome: string }) => row.outcome), ['excused_absence', 'unexcused_absence', 'excused_absence']);
  const missingAttendees = catalog.scenarios.find((scenario: { id: string }) => scenario.id === 'assenze-attesi-presenze');
  assert.deepEqual(missingAttendees.turns.map((turn: { attendanceExpected: { attendance: unknown[] } }) => turn.attendanceExpected.attendance.length), [1, 2, 3, 3, 4, 5]);
  assert.ok([0, 2, 4].every((index) => missingAttendees.turns[index].response.question));
  assert.deepEqual(missingAttendees.turns[3].attendanceExpected, missingAttendees.turns[2].attendanceExpected);
  assert.equal(missingAttendees.turns[5].attendanceExpected.attendance[4].outcome, 'unexcused_absence');
  const historical = catalog.scenarios.find((scenario: { id: string }) => scenario.id === 'presenze-attesi-storici');
  assert.ok(historical.setup.rules.some((rule: { active?: boolean; deactivatedAt?: string }) => rule.active === false && rule.deactivatedAt === '2025-01-07T09:00:00Z'));
  assert.ok(historical.setup.rules.some((rule: { createdAt?: string }) => rule.createdAt === '2025-01-08T09:00:00Z'));
  assert.deepEqual(historical.turns.slice(0, 2).map((turn: { attendanceExpected: { attendance: { client: string }[] } }) => turn.attendanceExpected.attendance.map((row) => row.client)), [['Ada Verdi', 'Bruno Neri'], ['Ada Verdi', 'Bruno Neri', 'Carla Rossi']]);
  const today = catalog.scenarios.find((scenario: { id: string }) => scenario.id === 'presenze-data-odierna');
  assert.ok(today.turns.every((turn: { attendanceExpected: { attendance: { lessonDate: string }[] } }) => turn.attendanceExpected.attendance[0].lessonDate === '$TODAY'));
  const greeting = catalog.scenarios.find((scenario: { id: string }) => scenario.id === 'nessun-profilo-saluto');
  const firstRequest = catalog.scenarios.find((scenario: { id: string }) => scenario.id === 'nessun-profilo-richiesta');
  assert.ok(greeting && firstRequest);
  assert.notEqual(greeting.sender, firstRequest.sender);
  for (const scenario of [greeting, firstRequest]) {
    assert.equal(scenario.turns.length, 3);
    assert.ok(scenario.turns[0].response.contains.includes('Ambrogio'));
    assert.ok(scenario.turns[1].response.excludes.includes('Ambrogio'));
    for (const [index, turn] of scenario.turns.entries()) {
      if (index < 2) assert.ok(turn.response.excludes.includes('profil'));
      assert.deepEqual(turn.expected, { clients: [], rules: [] });
      assert.equal(responseMatches('Vuoi creare un profilo?', turn.response), false);
    }
    const registered = `${scenario.identity.firstName} ${scenario.identity.lastName}`;
    assert.deepEqual(scenario.turns[2].response.contains, [registered]);
    assert.ok(responseMatches(`Ti chiami ${registered}.`, scenario.turns[2].response));
    assert.equal(responseMatches(`Ti chiami ${registered}, su WhatsApp ${scenario.profile}.`, scenario.turns[2].response), false);
    assert.equal(responseMatches(`Ti chiami ${registered}. Vuoi creare un profilo?`, scenario.turns[2].response), false);
  }
  const noName = catalog.scenarios.find((scenario: { id: string }) => scenario.id === 'nessun-profilo-nome-assente');
  assert.ok(noName);
  assert.equal(noName.profile, undefined, 'the webhook must omit the profile name');
  assert.ok(responseMatches(`Ti chiami ${noName.identity.firstName} ${noName.identity.lastName}.`, noName.turns[1].response));
  assert.equal(responseMatches('Non conosco il tuo nome: come ti chiami?', noName.turns[1].response), false);
  assert.equal(responseMatches('Ti chiami Operatore Sintetico.', noName.turns[1].response), false);
  assert.ok(responseMatches('Ciao, sono Ambrogio!', greeting.turns[0].response));
  assert.equal(responseMatches('Ciao!', greeting.turns[0].response), false);
  for (const proposal of ['un profilo', 'un account', 'una scheda personale', 'registrarti']) {
    assert.equal(responseMatches(`Ciao, sono Ambrogio! Vuoi creare ${proposal}?`, greeting.turns[0].response), false);
  }
  assert.ok(responseMatches('Sono Ambrogio, non ci sono lezioni.', firstRequest.turns[0].response));
  assert.equal(responseMatches('Sono Ambrogio.', firstRequest.turns[0].response), false);
  assert.ok(responseMatches('Non ci sono lezioni.', firstRequest.turns[1].response));
  assert.equal(responseMatches('Non ci sono lezioni. Vuoi un profilo?', firstRequest.turns[1].response), false);
  const naming = catalog.scenarios.find((scenario: { id: string }) => scenario.id === 'nome-prima-conversazione');
  const otherNaming = catalog.scenarios.find((scenario: { id: string }) => scenario.id === 'nome-altro-interlocutore');
  assert.ok(naming && otherNaming);
  assert.notEqual(naming.sender, otherNaming.sender);
  const requirements = await readFile('docs/requirements/REQ-AGENT-005.md', 'utf8');
  const name = requirements.match(/il nome dell'agente è ([\p{L}]+)\./u)?.[1];
  assert.ok(name);
  assert.ok(naming.turns[0].response.contains.includes(name));
  assert.ok(naming.turns[1].response.excludes.includes(name));
  assert.ok(naming.turns.slice(2).every((turn: { response: { contains: string[] } }) => turn.response.contains.includes(name)));
  assert.ok(otherNaming.turns[0].response.contains.includes(name));
  assert.ok(otherNaming.turns[1].response.contains.includes(name));
  assert.ok(otherNaming.turns[2].response.excludes.includes(name));
  assert.ok(responseMatches(`Sono ${name}; non ci sono lezioni.`, naming.turns[0].response));
  assert.equal(responseMatches(`Sono ${name}.`, naming.turns[0].response), false);
  assert.equal(responseMatches('Non ci sono lezioni.', naming.turns[0].response), false);
  assert.ok(responseMatches('Non ci sono lezioni.', naming.turns[1].response));
  assert.equal(responseMatches(`Sono ${name}; non ci sono lezioni.`, naming.turns[1].response), false);
  assert.ok(responseMatches(`Sono ${name}.`, naming.turns[2].response));
  assert.equal(responseMatches('Non ho un nome.', naming.turns[2].response), false);
  const relativeAttendance = catalog.scenarios.find((scenario: { id: string }) => scenario.id === 'consultazione-presenze-ieri');
  assert.ok(relativeAttendance?.turns.every((turn: { unchanged?: boolean }) => turn.unchanged));
  assert.ok(relativeAttendance.setup.attendance.every((row: { lessonDate: string }) => row.lessonDate === '$YESTERDAY'));
  const attendanceConsultation = catalog.scenarios.find((scenario: { id: string }) => scenario.id === 'consultazione-presenze-statistiche');
  assert.ok(attendanceConsultation);
  assert.ok(attendanceConsultation.turns.every((turn: { unchanged?: boolean }) => turn.unchanged));
  assert.equal(attendanceConsultation.turns.filter((turn: { sqlAggregate?: boolean }) => turn.sqlAggregate).length, 3);
  assert.ok(attendanceConsultation.setup.attendance.some((row: { cancelledAt?: string }) => row.cancelledAt));
  assert.ok(attendanceConsultation.setup.rules.some((rule: { deactivatedAt?: string }) => rule.deactivatedAt === '2025-01-07T09:00:00Z'));
  assert.ok(attendanceConsultation.turns.some((turn: { response: { counts?: { value: number }[] } }) => turn.response.counts?.some((count) => count.value === 4)));
  const consultation = catalog.scenarios.find((scenario: { id: string }) => scenario.id === 'consultazione-pianificazione');
  assert.ok(consultation.setup.rules.some((rule: { active?: boolean }) => rule.active === false));
  const times = new Set(consultation.setup.rules.flatMap((rule: { slots: { time: string }[] }) => rule.slots.map((slot) => slot.time)));
  for (const time of ['05:59', '06:00', '12:59', '13:00', '17:59', '18:00']) assert.ok(times.has(time));
  assert.ok(consultation.turns.every((turn: { unchanged?: boolean }) => turn.unchanged));
  const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
  assert.doesNotMatch(workflow, /test:conversation/);
});
