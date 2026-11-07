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
    for (const turn of scenario.turns) {
      assert.ok(turn.message && Array.isArray(turn.response.contains));
      assert.ok(turn.response.contains.length || turn.response.anyOf?.length);
      if (turn.unchanged) {
        assert.ok(scenario.setup && !turn.expected);
        continue;
      }
      if (turn.attendanceExpected) {
        assert.ok(scenario.setup && !turn.expected);
        assert.ok(Array.isArray(turn.attendanceExpected.addedClients) && Array.isArray(turn.attendanceExpected.attendance));
        for (const row of turn.attendanceExpected.attendance) {
          assert.ok(row.client && /^(?:\d{4}-\d{2}-\d{2}|\$TODAY)$/.test(row.lessonDate));
          assert.match(row.time, /^(?:[01]\d|2[0-3]):[0-5]\d$/);
          assert.equal(row.outcome, 'present');
          assert.equal(row.authorPhone, scenario.sender);
          assert.equal(row.authorName, scenario.profile);
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
  for (const id of ['presenze-data-odierna', 'presenze-nomi-duplicato-futuro', 'presenze-attesi-storici', 'consultazione-pianificazione', 'registrazione-consultazione', 'piu-orari-e-gruppo', 'cognome-mancante', 'nome-unico', 'nome-ambiguo', 'orario-mancante', 'giorno-mancante', 'autore-non-dichiarato', 'disattivazione-esplicita-storico', 'aggiornamento-implicito', 'cambio-cliente-gruppo']) {
    assert.ok(ids.has(id), `Missing scenario ${id}`);
  }
  const historical = catalog.scenarios.find((scenario: { id: string }) => scenario.id === 'presenze-attesi-storici');
  assert.ok(historical.setup.rules.some((rule: { active?: boolean; deactivatedAt?: string }) => rule.active === false && rule.deactivatedAt === '2025-01-07T09:00:00Z'));
  assert.ok(historical.setup.rules.some((rule: { createdAt?: string }) => rule.createdAt === '2025-01-08T09:00:00Z'));
  assert.deepEqual(historical.turns.slice(0, 2).map((turn: { attendanceExpected: { attendance: { client: string }[] } }) => turn.attendanceExpected.attendance.map((row) => row.client)), [['Ada Verdi', 'Bruno Neri'], ['Ada Verdi', 'Bruno Neri', 'Carla Rossi']]);
  const today = catalog.scenarios.find((scenario: { id: string }) => scenario.id === 'presenze-data-odierna');
  assert.ok(today.turns.every((turn: { attendanceExpected: { attendance: { lessonDate: string }[] } }) => turn.attendanceExpected.attendance[0].lessonDate === '$TODAY'));
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
  const consultation = catalog.scenarios.find((scenario: { id: string }) => scenario.id === 'consultazione-pianificazione');
  assert.ok(consultation.setup.rules.some((rule: { active?: boolean }) => rule.active === false));
  const times = new Set(consultation.setup.rules.flatMap((rule: { slots: { time: string }[] }) => rule.slots.map((slot) => slot.time)));
  for (const time of ['05:59', '06:00', '12:59', '13:00', '17:59', '18:00']) assert.ok(times.has(time));
  assert.ok(consultation.turns.every((turn: { unchanged?: boolean }) => turn.unchanged));
  const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
  assert.doesNotMatch(workflow, /test:conversation/);
});
