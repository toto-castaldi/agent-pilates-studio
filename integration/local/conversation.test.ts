import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { stateMatches } from '../../src/conversation.js';

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
      assert.ok(Array.isArray(turn.expected.clients) && Array.isArray(turn.expected.rules));
      for (const rule of turn.expected.rules) {
        assert.ok(rule.clients.length && rule.slots.length);
        assert.equal(rule.authorPhone, scenario.sender);
        assert.equal(rule.authorName, scenario.profile);
      }
      for (const client of turn.expected.clients) {
        assert.equal(client.authorPhone, scenario.sender);
        assert.equal(client.authorName, scenario.profile);
      }
    }
  }
  for (const id of ['consultazione-pianificazione', 'registrazione-consultazione', 'piu-orari-e-gruppo', 'cognome-mancante', 'nome-unico', 'nome-ambiguo', 'orario-mancante', 'giorno-mancante', 'autore-non-dichiarato']) {
    assert.ok(ids.has(id), `Missing scenario ${id}`);
  }
  const consultation = catalog.scenarios.find((scenario: { id: string }) => scenario.id === 'consultazione-pianificazione');
  assert.ok(consultation.setup.rules.some((rule: { active?: boolean }) => rule.active === false));
  const times = new Set(consultation.setup.rules.flatMap((rule: { slots: { time: string }[] }) => rule.slots.map((slot) => slot.time)));
  for (const time of ['05:59', '06:00', '12:59', '13:00', '17:59', '18:00']) assert.ok(times.has(time));
  assert.ok(consultation.turns.every((turn: { unchanged?: boolean }) => turn.unchanged));
  const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
  assert.doesNotMatch(workflow, /test:conversation/);
});
