import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { responseMatches, stateMatches } from '../../src/conversation.js';

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
    for (const row of scenario.setup?.attendance ?? []) {
      assert.match(row.createdAt, /^(?:\d{4}-\d\d-\d\d|\$YESTERDAY)T\d\d:\d\d:\d\dZ$/);
      assert.match(row.lessonDate, /^(?:\d{4}-\d\d-\d\d|\$YESTERDAY)$/);
      assert.ok(['present', 'excused_absence', 'unexcused_absence'].includes(row.outcome));
      assert.ok(scenario.setup.clients.some((client: { firstName: string; lastName: string }) => `${client.firstName} ${client.lastName}` === row.client));
      const lessonDate = row.lessonDate.replace('$YESTERDAY', '2025-01-06');
      const createdAt = row.createdAt.replace('$YESTERDAY', '2025-01-06');
      if (row.outcome !== 'excused_absence') assert.ok(Date.parse(createdAt) > Date.parse(`${lessonDate}T${row.time}:00Z`));
      if (row.cancelledAt) assert.ok(Date.parse(row.cancelledAt.replace('$YESTERDAY', '2025-01-06')) > Date.parse(createdAt));
    }
    for (const turn of scenario.turns) {
      assert.ok(turn.message && Array.isArray(turn.response.contains));
      assert.ok(turn.response.contains.length || turn.response.anyOf?.length || turn.response.counts?.length);
      if (turn.unchanged) {
        assert.ok(scenario.setup && !turn.expected);
        continue;
      }
      if (turn.attendanceExpected) {
        assert.ok(scenario.setup && !turn.expected);
        assert.ok(Array.isArray(turn.attendanceExpected.addedClients) && Array.isArray(turn.attendanceExpected.attendance));
        for (const row of turn.attendanceExpected.attendance) {
          assert.ok(row.client && /^(?:\d{4}-\d{2}-\d{2}|\$TODAY|\$NEXT_MONDAY(?:\+\d+)?)$/.test(row.lessonDate));
          assert.match(row.time, /^(?:[01]\d|2[0-3]):[0-5]\d$/);
          assert.ok(['present', 'excused_absence', 'unexcused_absence'].includes(row.outcome));
          assert.equal(row.authorPhone, scenario.sender);
          assert.equal(row.authorName, scenario.profile);
          if (row.cancellation) {
            assert.equal(row.cancellation.authorPhone, scenario.sender);
            assert.equal(row.cancellation.authorName, scenario.profile);
          }
        }
        for (const person of turn.attendanceExpected.addedClients) {
          assert.ok(person.firstName && person.lastName);
          assert.equal(person.authorPhone, scenario.sender);
          assert.equal(person.authorName, scenario.profile);
        }
        continue;
      }
      assert.ok(Array.isArray(turn.expected.clients) && Array.isArray(turn.expected.rules));
      for (const rule of turn.expected.rules) {
        assert.ok(rule.clients.length && rule.slots.length);
        assert.equal(rule.authorPhone, scenario.sender);
        assert.equal(rule.authorName, scenario.profile);
        if (rule.deactivation) {
          assert.equal(rule.deactivation.authorPhone, scenario.sender);
          assert.equal(rule.deactivation.authorName, scenario.profile);
          assert.ok(rule.deactivation.reasonAnyOf?.length);
        }
      }
      for (const client of turn.expected.clients) {
        assert.equal(client.authorPhone, scenario.sender);
        assert.equal(client.authorName, scenario.profile);
      }
    }
  }
  for (const id of ['assenze-esplicite-chiarimento', 'assenze-attesi-presenze', 'presenze-data-odierna', 'presenze-nomi-duplicato-futuro', 'presenze-attesi-storici', 'consultazione-pianificazione', 'registrazione-consultazione', 'piu-orari-e-gruppo', 'cognome-mancante', 'nome-unico', 'nome-ambiguo', 'orario-mancante', 'giorno-mancante', 'autore-non-dichiarato', 'disattivazione-esplicita-storico', 'aggiornamento-implicito', 'cambio-cliente-gruppo']) {
    assert.ok(ids.has(id), `Missing scenario ${id}`);
  }
  for (const id of ['assenza-anticipata-singola-annullamento', 'assenza-anticipata-ambigua-non-attesa', 'assenza-anticipata-periodo', 'assenza-anticipata-conflitto-presenza', 'assenza-anticipata-conflitto-assenza', 'assenza-anticipata-conflitto-tutti-tranne', 'assenza-anticipata-conflitto-esplicito']) assert.ok(ids.has(id), `Missing scenario ${id}`);
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
    assert.deepEqual(scenario.turns[2].response.contains, [scenario.profile]);
    assert.ok(responseMatches(`Su WhatsApp ti chiami ${scenario.profile}.`, scenario.turns[2].response));
    assert.equal(responseMatches(`Su WhatsApp ti chiami ${scenario.profile}. Vuoi creare un profilo?`, scenario.turns[2].response), false);
  }
  const noName = catalog.scenarios.find((scenario: { id: string }) => scenario.id === 'nessun-profilo-nome-assente');
  assert.ok(noName);
  assert.equal(noName.profile, undefined, 'the webhook must omit the profile name');
  assert.ok(responseMatches('WhatsApp non mi ha fornito il tuo nome.', noName.turns[1].response));
  assert.equal(responseMatches('WhatsApp non mi ha fornito il tuo nome. Dimmi il tuo nome.', noName.turns[1].response), false);
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
  const requirements = await readFile('docs/REQUIREMENTS.md', 'utf8');
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
