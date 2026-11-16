import assert from 'node:assert/strict';
import type { Client } from 'pg';

export const teacherTables = ['teachers', 'teacher_rules', 'teacher_rule_intervals', 'teacher_assignments'] as const;

// The model-visible state. Author numbers are not part of it after the unified
// identity; they are stripped so that a pre-transition schema compares equal.
export async function readTeacherState(connection: Client): Promise<Record<string, unknown[]>> {
  const state: Record<string, unknown[]> = {};
  for (const table of teacherTables) {
    const order = table === 'teacher_rule_intervals' ? 'rule_id, weekday, start_time_min, start_time_max' : 'id';
    state[table] = (await connection.query(`SELECT * FROM app.${table} ORDER BY ${order}`)).rows
      .map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !key.endsWith('_phone'))));
  }
  return state;
}

// Every stored author number, from wherever the rows live in the given schema.
export async function readAuthorPhones(connection: Client, schema: 'app' | 'studio_private'): Promise<Record<string, unknown[]>> {
  const state: Record<string, unknown[]> = {};
  for (const table of ['clients', 'training_rules', 'attendance', 'teachers', 'teacher_rules', 'teacher_assignments']) {
    if ((await connection.query('SELECT to_regclass($1) AS name', [`${schema}.${table}`])).rows[0].name === null) continue;
    const columns = (await connection.query("SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name LIKE '%\\_phone' ORDER BY column_name", [schema, table])).rows.map((row) => row.column_name as string);
    if (columns.length) state[table] = (await connection.query(`SELECT id, ${columns.join(', ')} FROM ${schema}.${table} ORDER BY id`)).rows;
  }
  return state;
}

// The caller supplies a trusted transaction. Fixtures never disable triggers and
// exercise the same construction, deactivation and cancellation path as the agent.
// Before the unified identity the two teachers are created by the previous
// runtime; afterwards they must be registered beforehand and are passed in.
export async function seedTeacherHistory(connection: Client, registered?: { original: string; replacement: string }): Promise<{ activeRuleId: string; validAssignmentId: string }> {
  const original = registered?.original ?? (await connection.query("INSERT INTO app.teachers (first_name, last_name) VALUES ('History', 'Synthetic') RETURNING id")).rows[0].id as string;
  const replacement = registered?.replacement ?? (await connection.query("INSERT INTO app.teachers (first_name, last_name) VALUES ('Replacement', 'Synthetic') RETURNING id")).rows[0].id as string;
  const insertRule = `WITH rule AS (
    INSERT INTO app.teacher_rules (teacher_id, rule_text) VALUES ($1, $2) RETURNING id
  ), intervals AS (
    INSERT INTO app.teacher_rule_intervals (rule_id, weekday, start_time_min, start_time_max)
    SELECT rule.id, slots.weekday, slots.minimum, slots.maximum FROM rule CROSS JOIN
      (VALUES (1, time '09:00', time '10:00'), (3, time '09:00', time '10:00'), (7, time '23:59', time '23:59')) slots(weekday, minimum, maximum)
    RETURNING rule_id
  ) SELECT DISTINCT rule_id AS id FROM intervals`;
  const previous = (await connection.query(insertRule, [original, 'Synthetic historical teacher rule'])).rows[0].id as string;
  await connection.query("UPDATE app.teacher_rules SET deactivated_at = clock_timestamp(), deactivation_reason = 'synthetic replacement' WHERE id = $1", [previous]);
  const activeRuleId = (await connection.query(insertRule, [replacement, 'Synthetic current teacher rule'])).rows[0].id as string;
  const cancelled = (await connection.query("INSERT INTO app.teacher_assignments (teacher_id, lesson_date, start_time) VALUES ($1, '2020-01-01', '09:00') RETURNING id", [original])).rows[0].id as string;
  await connection.query("UPDATE app.teacher_assignments SET cancelled_at = clock_timestamp(), cancellation_reason = 'synthetic correction' WHERE id = $1", [cancelled]);
  const validAssignmentId = (await connection.query("INSERT INTO app.teacher_assignments (teacher_id, lesson_date, start_time) VALUES ($1, '2020-01-01', '09:00') RETURNING id", [replacement])).rows[0].id as string;
  await connection.query("INSERT INTO app.teacher_assignments (teacher_id, lesson_date, start_time) VALUES ($1, '2099-01-01', '09:00')", [replacement]);
  return { activeRuleId, validAssignmentId };
}

// Teachers, rules and assignments are phone-free projections of private rows:
// views cannot be truncated or altered (42809), and the backing tables still
// enforce the original no-delete/no-truncate triggers, even for the owner.
const projections = new Set(['teachers', 'teacher_rules', 'teacher_assignments']);
const denied = (table: string) => (error: unknown) => {
  const code = (error as { code?: string }).code;
  return code === '42501' || (projections.has(table) && code === '42809');
};

export async function checkTeacherHistoryProtection(agent: Client, migrator: Client): Promise<void> {
  for (const connection of [agent, migrator]) {
    for (const table of teacherTables) {
      await assert.rejects(connection.query(`DELETE FROM app.${table}`), { code: '42501' });
      await assert.rejects(connection.query(`TRUNCATE app.${table} CASCADE`), denied(table));
    }
  }
  for (const table of teacherTables) {
    await assert.rejects(agent.query(`ALTER TABLE app.${table} ADD COLUMN forbidden text`), denied(table));
  }
  for (const table of projections) {
    for (const action of ['DELETE FROM', 'TRUNCATE']) {
      await assert.rejects(migrator.query(`${action} studio_private.${table}${action === 'TRUNCATE' ? ' CASCADE' : ''}`), { code: '42501' });
    }
  }
}
