import assert from 'node:assert/strict';
import { test } from 'node:test';
import { skills, soul } from '../src/agent-context.js';

test('the always-present context fits without Hermes truncation and retains shared safeguards', () => {
  assert.ok([...soul].length <= 15_000, `${[...soul].length} characters exceeds 15000`);
  for (const text of ['Ambrogio', 'Europe/Rome', '06:00–12:59', '13:00–17:59', '18:00',
    'studio_sql_query', 'skill_view', 'app.current_sender_teacher_id()', 'sistema', 'confermat',
    'Risoluzione condivisa', '$1::text::date', '$2::text::date']) {
    assert.ok(soul.includes(text), `Missing core context: ${text}`);
  }
});

test('the seven detail skills have only declarative name and short description metadata', () => {
  assert.deepEqual(Object.keys(skills).sort(), ['studio-insegnanti-consultazioni', 'studio-insegnanti-indicazioni',
    'studio-insegnanti-regole', 'studio-partecipazioni-previste', 'studio-presenze', 'studio-presenze-consultazioni', 'studio-regole-clienti']);
  for (const [name, content] of Object.entries(skills)) {
    const metadata = content.match(/^---\nname: ([^\n]+)\ndescription: ([^\n]+)\n---\n/);
    assert.ok(metadata, `Unexpected metadata: ${name}`);
    assert.equal(metadata[1], name);
    assert.ok(metadata[2].length <= 60);
    assert.ok(soul.includes(name), `Missing routing for ${name}`);
    assert.ok(content.length > 500);
  }
});
