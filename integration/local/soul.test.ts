import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { parse } from 'yaml';

test('studio context is mounted read-only and matches the versioned schema without secrets', async () => {
  const soul = await readFile('hermes/SOUL.md', 'utf8');
  const requirements = await readFile('docs/requirements/REQ-AGENT-005.md', 'utf8');
  const name = requirements.match(/il nome dell'agente è ([\p{L}]+)\./u)?.[1];
  assert.ok(name, 'missing agreed agent name');
  assert.ok(soul.includes(name), 'SOUL must contain the agreed agent name');
  const config = parse(await readFile('hermes/config.yaml', 'utf8'));
  assert.equal(config.onboarding.profile_build, 'off', 'native profile onboarding must be disabled with a string');
  assert.equal(config.privacy.redact_pii, true, 'session identifiers must be redacted');
  assert.deepEqual(config.memory, { memory_enabled: false, user_profile_enabled: false, provider: '' });
  const migration = (await Promise.all([
    'prisma/migrations/20261105000000_studio_planning/migration.sql',
    'prisma/migrations/20261107000000_attendance/migration.sql',
    'prisma/migrations/20261111000000_teachers/migration.sql',
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
    teachers: ['id', 'first_name', 'last_name', 'created_at', 'created_by_phone', 'created_by_name'],
    teacher_rules: ['id', 'teacher_id', 'rule_text', 'created_at', 'created_by_phone', 'created_by_name', 'deactivated_at', 'deactivated_by_phone', 'deactivated_by_name', 'deactivation_reason'],
    teacher_rule_intervals: ['rule_id', 'weekday', 'start_time_min', 'start_time_max', 'is_active'],
    teacher_assignments: ['id', 'teacher_id', 'lesson_date', 'start_time', 'created_at', 'created_by_phone', 'created_by_name', 'cancelled_at', 'cancelled_by_phone', 'cancelled_by_name', 'cancellation_reason'],
  };
  for (const [table, columns] of Object.entries(expected)) {
    const tableLine = soul.split('\n').find((line) => line.startsWith(`- \`app.${table}\`:`));
    assert.ok(tableLine, `missing table ${table}`);
    const mentioned = [...tableLine.matchAll(/`([a-z_]+)`/g)].map((match) => match[1]);
    assert.deepEqual(mentioned, columns, `unexpected columns for ${table}`);
    const definition = migration.match(new RegExp(`CREATE TABLE app\\.${table} \\(([\\s\\S]*?)\\n\\);`))?.[1];
    assert.ok(definition, `migration lacks ${table}`);
    const defined = [...definition.matchAll(/^\s{2}([a-z_]+)\s+(?:bigint|smallint|text|timestamptz|date|time|boolean)\b/gm)].map((match) => match[1]);
    assert.deepEqual(defined, columns, `schema columns differ for ${table}`);
    for (const column of columns) {
      assert.ok(soul.includes(`\`${column}\``), `missing column ${table}.${column}`);
      assert.match(definition, new RegExp(`^\\s*${column}\\s+`, 'm'));
    }
  }
  const identityMigration = await readFile('prisma/migrations/20261112000000_teacher_identity/migration.sql', 'utf8');
  assert.match(identityMigration, /ALTER TABLE app\.teachers SET SCHEMA studio_private;/);
  assert.match(identityMigration, /CREATE VIEW app\.teachers WITH \(security_barrier = true\)/);
  assert.match(identityMigration, /CREATE TRIGGER teachers_legacy_insert INSTEAD OF INSERT ON app\.teachers/);
  assert.match(identityMigration, /REVOKE ALL ON studio_private\.teachers FROM PUBLIC, studio_agent, studio_broker;/);
  for (const column of ['phone', 'access_enabled', 'legacy_identity', 'identity_revision']) {
    assert.match(identityMigration, new RegExp(`ADD COLUMN ${column} `));
    assert.ok(soul.includes(`\`${column}\``), `missing private identity column ${column}`);
  }
  assert.match(soul, /studio_private\.teachers.*inaccessibile/);
  assert.match(soul, /nuovo riconoscimento e il percorso guidato non sono ancora attivati/);
  assert.match(soul, /numeri degli autori storici.*passaggio comune/);
  const skillNames = await readdir('hermes/skills');
  const contexts = [soul, ...await Promise.all(skillNames.map((name) => readFile(`hermes/skills/${name}/SKILL.md`, 'utf8')))];
  const functions = await readFile('prisma/migrations/20261116000000_lesson_functions/migration.sql', 'utf8');
  for (const context of contexts) {
    for (const match of context.matchAll(/(?:FROM|JOIN|UPDATE|INTO)\s+app\.([a-z_]+)(?!\w|\s*\()/gi)) {
      assert.ok(expected[match[1]], `Unknown table in context: ${match[1]}`);
    }
    for (const match of context.matchAll(/INSERT INTO app\.([a-z_]+)\s*\(([^)]+)\)/g)) {
      for (const column of match[2].split(',').map((value) => value.trim())) {
        assert.ok(expected[match[1]]?.includes(column), `Unknown insert column ${match[1]}.${column}`);
      }
    }
    for (const block of context.matchAll(/```sql\n([\s\S]*?)```/g)) {
      const aliases = new Map<string, string>();
      for (const match of block[1].matchAll(/(?:FROM|JOIN)\s+app\.([a-z_]+)\s+(?:AS\s+)?([a-z_]+)/gi)) {
        if (expected[match[1]] && !['where', 'on', 'order', 'group'].includes(match[2].toLowerCase())) {
          aliases.set(match[2], match[1]);
        }
      }
      for (const match of block[1].matchAll(/\b([a-z_]+)\.([a-z_]+)\b/g)) {
        const table = aliases.get(match[1]);
        if (table) assert.ok(expected[table].includes(match[2]), `Unknown SQL column ${table}.${match[2]}`);
      }
    }
    for (const match of context.matchAll(/app\.(existing_lessons|expected_clients|lesson_teachers)\(/g)) {
      assert.ok(functions.includes(`CREATE FUNCTION app.${match[1]}(first_day date, last_day date)`));
    }
    assert.doesNotMatch(context, /(?:sk-or-v1-|sk-proj-|ghp_|xox[baprs]-)[a-z0-9-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b\d{10,15}\b/i);
  }
  assert.deepEqual(config.platform_toolsets.whatsapp_cloud, ['studio-postgres', 'skills']);
  assert.equal(config.auxiliary.background_review.enabled, false);
  const skillMount = compose.services.hermes.volumes.find((entry) => typeof entry !== 'string' && entry.target === '/opt/data/skills');
  assert.deepEqual(typeof skillMount === 'object' && [skillMount.type, skillMount.image?.subpath], ['image', 'opt/pilates/release/skills']);
  assert.doesNotMatch(soul, /(?:sk-or-v1-|sk-proj-|ghp_|xox[baprs]-)[a-z0-9-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b\d{10,15}\b/i);
  assert.doesNotMatch(soul, /(?:password|api[_ -]?key|token|secret)\s*[:=]\s*["']?[^\s"']{8,}/i);
  for (const file of ['hermes/config.yaml', 'hermes/pilates_trusted.py']) {
    assert.doesNotMatch(await readFile(file, 'utf8'), /06:00|12:59|13:00|17:59|18:00/);
  }
});
