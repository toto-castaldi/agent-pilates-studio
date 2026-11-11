import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parse } from 'yaml';

test('studio context is mounted read-only and matches the versioned schema without secrets', async () => {
  const soul = await readFile('hermes/SOUL.md', 'utf8');
  const requirements = await readFile('docs/REQUIREMENTS.md', 'utf8');
  const name = requirements.match(/il nome dell'agente è ([\p{L}]+)\./u)?.[1];
  assert.ok(name, 'missing agreed agent name');
  assert.ok(soul.includes(name), 'SOUL must contain the agreed agent name');
  const config = parse(await readFile('hermes/config.yaml', 'utf8'));
  assert.equal(config.onboarding.profile_build, 'off', 'native profile onboarding must be disabled with a string');
  assert.deepEqual(config.memory, { memory_enabled: false, user_profile_enabled: false, provider: '' });
  const migration = (await Promise.all([
    'prisma/migrations/20261105000000_studio_planning/migration.sql',
    'prisma/migrations/20261107000000_attendance/migration.sql',
  ].map((file) => readFile(file, 'utf8')))).join('\n');
  const compose = parse(await readFile('compose.yaml', 'utf8')) as { services: { hermes: { volumes: (string | { type: string; target: string; image?: { subpath: string } })[] } } };
  const soulMount = compose.services.hermes.volumes.find((entry) => typeof entry !== 'string' && entry.target === '/opt/data/SOUL.md');
  assert.deepEqual(typeof soulMount === 'object' && [soulMount.type, soulMount.image?.subpath], ['image', 'opt/pilates/release/SOUL.md']);
  const expected: Record<string, string[]> = {
    clients: ['id', 'first_name', 'last_name', 'created_at', 'created_by_phone', 'created_by_name'],
    training_rules: ['id', 'rule_text', 'created_at', 'created_by_phone', 'created_by_name', 'deactivated_at', 'deactivated_by_phone', 'deactivated_by_name', 'deactivation_reason'],
    rule_slots: ['rule_id', 'weekday', 'start_time'],
    rule_clients: ['rule_id', 'client_id'],
    attendance: ['id', 'client_id', 'lesson_date', 'start_time', 'outcome', 'created_at', 'created_by_phone', 'created_by_name', 'cancelled_at', 'cancelled_by_phone', 'cancelled_by_name', 'cancellation_reason'],
  };
  for (const [table, columns] of Object.entries(expected)) {
    const tableLine = soul.split('\n').find((line) => line.startsWith(`- \`app.${table}\`:`));
    assert.ok(tableLine, `missing table ${table}`);
    const mentioned = [...tableLine.matchAll(/`([a-z_]+)`/g)].map((match) => match[1]);
    assert.deepEqual(mentioned, columns, `unexpected columns for ${table}`);
    const definition = migration.match(new RegExp(`CREATE TABLE app\\.${table} \\(([\\s\\S]*?)\\n\\);`))?.[1];
    assert.ok(definition, `migration lacks ${table}`);
    const defined = [...definition.matchAll(/^\s{2}([a-z_]+)\s+(?:bigint|smallint|text|timestamptz|date|time)\b/gm)].map((match) => match[1]);
    assert.deepEqual(defined, columns, `schema columns differ for ${table}`);
    for (const column of columns) {
      assert.ok(soul.includes(`\`${column}\``), `missing column ${table}.${column}`);
      assert.match(definition, new RegExp(`^\\s*${column}\\s+`, 'm'));
    }
  }
  assert.doesNotMatch(soul, /(?:sk-or-v1-|sk-proj-|ghp_|xox[baprs]-)[a-z0-9-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b\d{10,15}\b/i);
  assert.doesNotMatch(soul, /(?:password|api[_ -]?key|token|secret)\s*[:=]\s*["']?[^\s"']{8,}/i);
  for (const file of ['hermes/config.yaml', 'hermes/pilates_trusted.py']) {
    assert.doesNotMatch(await readFile(file, 'utf8'), /06:00|12:59|13:00|17:59|18:00/);
  }
});
