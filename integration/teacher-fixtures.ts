import assert from 'node:assert/strict';
import type { Client } from 'pg';

export const teacherTables = ['teachers', 'teacher_rules', 'teacher_rule_intervals', 'teacher_assignments'] as const;

export async function readTeacherState(connection: Client): Promise<Record<string, unknown[]>> {
  const state: Record<string, unknown[]> = {};
  for (const table of teacherTables) {
    const order = table === 'teacher_rule_intervals' ? 'rule_id, weekday, start_time_min, start_time_max' : 'id';
    state[table] = (await connection.query(`SELECT * FROM app.${table} ORDER BY ${order}`)).rows;
  }
  return state;
}

// The caller supplies a trusted transaction. Fixtures never disable triggers and
// exercise the same construction, deactivation and cancellation path as the agent.
export async function seedTeacherHistory(connection: Client): Promise<{ activeRuleId: string; validAssignmentId: string }> {
  const original = (await connection.query("INSERT INTO app.teachers (first_name, last_name) VALUES ('History', 'Synthetic') RETURNING id")).rows[0].id as string;
  const replacement = (await connection.query("INSERT INTO app.teachers (first_name, last_name) VALUES ('Replacement', 'Synthetic') RETURNING id")).rows[0].id as string;
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

export async function checkTeacherHistoryProtection(agent: Client, migrator: Client): Promise<void> {
  for (const connection of [agent, migrator]) {
    for (const table of teacherTables) {
      await assert.rejects(connection.query(`DELETE FROM app.${table}`), { code: '42501' });
      await assert.rejects(connection.query(`TRUNCATE app.${table} CASCADE`), { code: '42501' });
    }
  }
  for (const table of teacherTables) {
    await assert.rejects(agent.query(`ALTER TABLE app.${table} ADD COLUMN forbidden text`), { code: '42501' });
  }
}
