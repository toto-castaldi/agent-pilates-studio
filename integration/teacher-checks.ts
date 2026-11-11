import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { Client, type ClientConfig } from 'pg';
import { checkTeacherHistoryProtection, readTeacherState } from './teacher-fixtures.js';

// Direct trusted contexts are fixtures only. author.test.ts separately proves
// that gateway, plugin and broker establish them from signed WhatsApp messages.
export async function checkTeachers(agent: Client, migrator: Client, agentConfig: ClientConfig): Promise<void> {
  const bind = async (connection: Client, phone = '15555550102', name: string | null = 'Synthetic Alpha') => {
    await connection.query('BEGIN');
    const row = (await connection.query('SELECT pg_backend_pid() AS pid, txid_current() AS txid')).rows[0];
    await migrator.query("INSERT INTO studio_private.author_context VALUES ($1, $2, $3, $4, clock_timestamp() + interval '1 minute')", [row.pid, row.txid, phone, name]);
    return row.pid as number;
  };
  const reject = async (connection: Client, sql: string, code: string, parameters: unknown[] = []) => {
    await connection.query('SAVEPOINT invalid_teacher_data');
    await assert.rejects(connection.query(sql, parameters), { code });
    await connection.query('ROLLBACK TO SAVEPOINT invalid_teacher_data');
    await connection.query('RELEASE SAVEPOINT invalid_teacher_data');
  };
  const insertTeacher = "INSERT INTO app.teachers (first_name, last_name, created_at, created_by_phone, created_by_name) VALUES ('Synthetic', 'InstructorOne', '1900-01-01', 'forged', 'forged') RETURNING *";
  const insertRule = `WITH rule AS (
    INSERT INTO app.teacher_rules (teacher_id, rule_text, created_at, created_by_phone, created_by_name)
    VALUES ($1, $2, '1900-01-01', 'forged', 'forged') RETURNING *
  ), intervals AS (
    INSERT INTO app.teacher_rule_intervals (rule_id, weekday, start_time_min, start_time_max, is_active)
    SELECT id, $3::smallint, $4::time, $5::time, false FROM rule RETURNING rule_id
  ) SELECT rule.* FROM rule JOIN intervals ON rule.id = intervals.rule_id`;
  const insertAssignment = "INSERT INTO app.teacher_assignments (teacher_id, lesson_date, start_time, created_at, created_by_phone, created_by_name) VALUES ($1, $2, $3, '1900-01-01', 'forged', 'forged') RETURNING *";
  const untrustedInserts = [
    insertTeacher,
    "INSERT INTO app.teacher_rules (teacher_id, rule_text) VALUES (0, 'Synthetic no context')",
    "INSERT INTO app.teacher_rule_intervals (rule_id, weekday, start_time_min, start_time_max) VALUES (0, 1, '09:00', '10:00')",
    "INSERT INTO app.teacher_assignments (teacher_id, lesson_date, start_time) VALUES (0, '2020-01-01', '09:00')",
  ];
  await agent.query("SELECT set_config('studio.author', 'forged', false)");
  for (const sql of untrustedInserts) await assert.rejects(agent.query(sql), { code: '42501' });
  await agent.query('BEGIN');
  const expired = (await agent.query('SELECT pg_backend_pid() AS pid, txid_current() AS txid')).rows[0];
  await migrator.query("INSERT INTO studio_private.author_context VALUES ($1, $2, '15555550102', NULL, clock_timestamp() - interval '1 second')", [expired.pid, expired.txid]);
  for (const sql of untrustedInserts) await reject(agent, sql, '42501');
  await agent.query('ROLLBACK');
  for (const table of ['author_context', 'teacher_rule_builds']) {
    await assert.rejects(agent.query(`SELECT * FROM studio_private.${table}`), { code: '42501' });
    await assert.rejects(agent.query(`INSERT INTO studio_private.${table} DEFAULT VALUES`), { code: '42501' });
  }
  await assert.rejects(agent.query('SELECT studio_private.require_author_context()'), { code: '42501' });

  await bind(agent);
  const before = (await agent.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
  const teacher = (await agent.query(insertTeacher)).rows[0];
  const teacherId = teacher.id as string;
  assert.equal(teacher.created_by_phone, '15555550102');
  assert.equal(teacher.created_by_name, 'Synthetic Alpha');
  assert.ok((teacher.created_at as Date).getTime() >= before.getTime());
  // The name namespace is independent of clients.
  await agent.query("INSERT INTO app.clients (first_name, last_name) VALUES ('Synthetic', 'InstructorOne')");
  const otherTeacherId = (await agent.query("INSERT INTO app.teachers (first_name, last_name) VALUES ('Synthetic', 'InstructorTwo') RETURNING id")).rows[0].id as string;
  await reject(agent, "INSERT INTO app.teachers (first_name, last_name) VALUES ('SYNTHETIC', 'instructorone')", '23505');
  for (const [first, last] of [['', 'Synthetic'], ['  ', 'Synthetic'], ['Synthetic', ''], [' Synthetic', 'Trim'], ['Synthetic', 'Trim ']]) {
    await reject(agent, 'INSERT INTO app.teachers (first_name, last_name) VALUES ($1, $2)', '23514', [first, last]);
  }

  for (const [weekday, min, max] of [[0, '09:00', '10:00'], [8, '09:00', '10:00'], [1, '10:01', '10:00'], [1, '09:00:01', '10:00'], [1, '09:00', '10:00:00.5'], [1, '24:00', '24:00'], [1, '09:00', '24:00']] as const) {
    await reject(agent, insertRule, '23514', [teacherId, 'Synthetic invalid interval', weekday, min, max]);
  }
  for (const text of ['', '  ', ' Synthetic untrimmed']) {
    await reject(agent, insertRule, '23514', [teacherId, text, 1, '09:00', '10:00']);
  }
  await reject(agent, insertRule, '23503', ['999999999', 'Synthetic missing teacher', 1, '09:00', '10:00']);
  for (const state of ["deactivated_at = clock_timestamp()", "deactivated_by_phone = 'forged'", "deactivated_by_name = 'forged'", "deactivation_reason = 'synthetic'"]) {
    const [column, value] = state.split(' = ');
    await reject(agent, `INSERT INTO app.teacher_rules (teacher_id, rule_text, ${column}) VALUES ($1, 'Synthetic invalid state', ${value})`, '23514', [teacherId]);
  }

  const firstRule = (await agent.query(insertRule, [teacherId, 'Synthetic Monday rule', 1, '09:00', '10:00'])).rows[0];
  assert.equal(firstRule.created_by_phone, '15555550102');
  assert.equal(firstRule.created_by_name, 'Synthetic Alpha');
  assert.ok((firstRule.created_at as Date).getTime() >= before.getTime());
  assert.equal((await agent.query('SELECT is_active FROM app.teacher_rule_intervals WHERE rule_id = $1', [firstRule.id])).rows[0].is_active, true);
  for (const targetTeacher of [teacherId, otherTeacherId]) {
    for (const [min, max] of [['08:59', '09:00'], ['09:30', '09:30'], ['10:00', '10:01'], ['08:00', '11:00']]) {
      await reject(agent, insertRule, '23P01', [targetTeacher, 'Synthetic overlap', 1, min, max]);
    }
  }
  // Adjacency, distinct weekdays, and both ends of the week are valid.
  await agent.query(insertRule, [teacherId, 'Synthetic adjacent minute', 1, '10:01', '10:01']);
  await agent.query(insertRule, [otherTeacherId, 'Synthetic Tuesday rule', 2, '09:00', '10:00']);
  await agent.query(insertRule, [teacherId, 'Synthetic week start', 1, '00:00', '00:00']);
  await agent.query(insertRule, [teacherId, 'Synthetic week end', 7, '23:59', '23:59']);
  const multipleIntervals = `WITH rule AS (
    INSERT INTO app.teacher_rules (teacher_id, rule_text) VALUES ($1, 'Synthetic multiple intervals') RETURNING id
  ) INSERT INTO app.teacher_rule_intervals (rule_id, weekday, start_time_min, start_time_max)
    SELECT rule.id, slots.weekday, slots.minimum, slots.maximum FROM rule CROSS JOIN
      (VALUES (3, time '09:00', time '09:00'), (3, time '10:00', time '11:00')) slots(weekday, minimum, maximum)`;
  await agent.query(multipleIntervals, [teacherId]);
  await reject(agent, multipleIntervals.replaceAll('(3,', '(5,').replace("time '10:00'", "time '09:00'"), '23P01', [teacherId]);
  await agent.query('SET CONSTRAINTS ALL IMMEDIATE');
  await reject(agent, "INSERT INTO app.teacher_rule_intervals (rule_id, weekday, start_time_min, start_time_max) VALUES ($1, 6, '09:00', '10:00')", '42501', [firstRule.id]);
  await agent.query('SET CONSTRAINTS ALL DEFERRED');

  const assignment = (await agent.query(insertAssignment, [teacherId, '2020-01-01', '09:00'])).rows[0];
  assert.equal(assignment.created_by_phone, '15555550102');
  assert.equal(assignment.created_by_name, 'Synthetic Alpha');
  assert.ok((assignment.created_at as Date).getTime() >= before.getTime());
  const future = (await agent.query(insertAssignment, [teacherId, '2099-01-01', '09:00'])).rows[0];
  await agent.query(insertAssignment, [teacherId, '2020-01-01', '09:01']);
  await agent.query(insertAssignment, [teacherId, '2020-10-25', '02:30']);
  const repeated = (await agent.query("SELECT extract(epoch FROM (timestamp '2020-10-25 02:30' AT TIME ZONE 'Europe/Rome'))::bigint AS instant")).rows[0];
  assert.equal(Number(repeated.instant), Date.parse('2020-10-25T01:30:00Z') / 1000);
  for (const targetTeacher of [teacherId, otherTeacherId]) {
    await reject(agent, insertAssignment, '23505', [targetTeacher, '2020-01-01', '09:00']);
    await reject(agent, insertAssignment, '23505', [targetTeacher, '2099-01-01', '09:00']);
  }
  for (const [date, time] of [['2020-01-01', '09:00:01'], ['2020-01-01', '09:00:00.1'], ['2020-01-01', '24:00'], ['2020-03-29', '02:30'], ['2099-03-29', '02:30'], ['infinity', '09:00'], ['-infinity', '09:00']]) {
    await reject(agent, insertAssignment, '23514', [teacherId, date, time]);
  }
  await reject(agent, insertAssignment, '23503', ['999999999', '2020-01-01', '10:00']);
  for (const state of ["cancelled_at = clock_timestamp()", "cancelled_by_phone = 'forged'", "cancelled_by_name = 'forged'", "cancellation_reason = 'synthetic'"]) {
    const [column, value] = state.split(' = ');
    await reject(agent, `INSERT INTO app.teacher_assignments (teacher_id, lesson_date, start_time, ${column}) VALUES ($1, '2020-01-01', '10:00', ${value})`, '23514', [teacherId]);
  }
  for (const [table, id, timestamp, reason] of [
    ['teacher_rules', firstRule.id, 'deactivated_at', 'deactivation_reason'],
    ['teacher_assignments', assignment.id, 'cancelled_at', 'cancellation_reason'],
  ]) {
    await reject(agent, `UPDATE app.${table} SET ${timestamp} = clock_timestamp() WHERE id = $1`, '23514', [id]);
    await reject(agent, `UPDATE app.${table} SET ${timestamp} = clock_timestamp(), ${reason} = '  ' WHERE id = $1`, '23514', [id]);
    await reject(agent, `UPDATE app.${table} SET ${reason} = 'synthetic' WHERE id = $1`, '23514', [id]);
  }
  await agent.query('COMMIT');
  assert.equal((await migrator.query('SELECT count(*)::int AS n FROM studio_private.teacher_rule_builds')).rows[0].n, 0);

  // Incomplete rules fail at commit, not only when the application remembers to check.
  await bind(agent);
  const incomplete = (await agent.query("INSERT INTO app.teacher_rules (teacher_id, rule_text) VALUES ($1, 'Synthetic incomplete') RETURNING id", [teacherId])).rows[0].id;
  await assert.rejects(agent.query('COMMIT'), { code: '23514' });
  assert.equal((await agent.query('SELECT count(*)::int AS n FROM app.teacher_rules WHERE id = $1', [incomplete])).rows[0].n, 0);
  assert.equal((await migrator.query('SELECT count(*)::int AS n FROM studio_private.teacher_rule_builds')).rows[0].n, 0);

  await bind(agent);
  // A skipped INSERT must not open a build window for a committed rule.
  await reject(agent, `WITH skipped AS (
    INSERT INTO app.teacher_rules (id, teacher_id, rule_text) OVERRIDING SYSTEM VALUE
    VALUES ($1, $2, 'Synthetic skipped conflict') ON CONFLICT (id) DO NOTHING
  ) INSERT INTO app.teacher_rule_intervals (rule_id, weekday, start_time_min, start_time_max)
    VALUES ($1, 6, '09:00', '10:00')`, '42501', [firstRule.id, teacherId]);
  await reject(agent, "INSERT INTO app.teacher_rule_intervals (rule_id, weekday, start_time_min, start_time_max) VALUES ($1, 6, '09:00', '10:00')", '42501', [firstRule.id]);
  await reject(agent, 'UPDATE app.teacher_rule_intervals SET is_active = false WHERE rule_id = $1', '42501', [firstRule.id]);
  await reject(agent, "UPDATE app.teachers SET first_name = 'Rewritten' WHERE id = $1", '42501', [teacherId]);
  await reject(agent, "UPDATE app.teachers SET created_by_phone = 'forged' WHERE id = $1", '42501', [teacherId]);
  await reject(agent, "UPDATE app.teacher_rules SET rule_text = 'Rewritten', deactivated_at = clock_timestamp(), deactivation_reason = 'synthetic' WHERE id = $1", '42501', [firstRule.id]);
  await reject(agent, 'UPDATE app.teacher_rules SET teacher_id = $1 WHERE id = $2', '42501', [otherTeacherId, firstRule.id]);
  await reject(agent, "UPDATE app.teacher_assignments SET lesson_date = '2020-01-02' WHERE id = $1", '42501', [assignment.id]);
  await agent.query('COMMIT');
  await bind(migrator);
  await reject(migrator, "UPDATE app.teachers SET created_by_phone = 'forged' WHERE id = $1", '42501', [teacherId]);
  await reject(migrator, "UPDATE app.teachers SET first_name = 'Rewritten' WHERE id = $1", '42501', [teacherId]);
  await reject(migrator, "UPDATE app.teacher_rules SET rule_text = 'Rewritten', deactivated_at = clock_timestamp(), deactivation_reason = 'synthetic' WHERE id = $1", '42501', [firstRule.id]);
  await reject(migrator, 'UPDATE app.teacher_rule_intervals SET is_active = false WHERE rule_id = $1', '42501', [firstRule.id]);
  await reject(migrator, "UPDATE app.teacher_rule_intervals SET start_time_max = '10:01' WHERE rule_id = $1", '42501', [firstRule.id]);
  await reject(migrator, "INSERT INTO app.teacher_rule_intervals (rule_id, weekday, start_time_min, start_time_max) VALUES ($1, 6, '09:00', '10:00')", '42501', [firstRule.id]);
  await reject(migrator, "UPDATE app.teacher_assignments SET teacher_id = $1, cancelled_at = clock_timestamp(), cancellation_reason = 'synthetic' WHERE id = $2", '42501', [otherTeacherId, assignment.id]);
  await migrator.query('ROLLBACK');

  await assert.rejects(agent.query("UPDATE app.teacher_rules SET deactivated_at = clock_timestamp(), deactivation_reason = 'untrusted' WHERE id = $1", [firstRule.id]), { code: '42501' });
  await assert.rejects(agent.query("UPDATE app.teacher_assignments SET cancelled_at = clock_timestamp(), cancellation_reason = 'untrusted' WHERE id = $1", [assignment.id]), { code: '42501' });
  const originalState = await readTeacherState(agent);
  await checkTeacherHistoryProtection(agent, migrator);
  assert.deepEqual(await readTeacherState(agent), originalState);

  await bind(agent, '15555550103', null);
  const deactivated = (await agent.query("UPDATE app.teacher_rules SET deactivated_at = '1900-01-01', deactivated_by_phone = 'forged', deactivated_by_name = 'forged', deactivation_reason = 'synthetic replacement' WHERE id = $1 RETURNING *", [firstRule.id])).rows[0];
  assert.equal(deactivated.deactivated_by_phone, '15555550103');
  assert.equal(deactivated.deactivated_by_name, null);
  assert.ok((deactivated.deactivated_at as Date).getTime() >= (deactivated.created_at as Date).getTime());
  assert.deepEqual((await agent.query('SELECT is_active FROM app.teacher_rule_intervals WHERE rule_id = $1', [firstRule.id])).rows, [{ is_active: false }]);
  await reject(agent, "UPDATE app.teacher_rules SET deactivated_at = clock_timestamp(), deactivation_reason = 'again' WHERE id = $1", '23514', [firstRule.id]);
  await reject(agent, 'UPDATE app.teacher_rules SET deactivated_at = NULL WHERE id = $1', '23514', [firstRule.id]);
  await reject(agent, "UPDATE app.teacher_rules SET deactivation_reason = 'rewritten' WHERE id = $1", '23514', [firstRule.id]);
  await reject(agent, "INSERT INTO app.teacher_rule_intervals (rule_id, weekday, start_time_min, start_time_max) VALUES ($1, 6, '09:00', '10:00')", '23514', [firstRule.id]);
  const replacement = (await agent.query(insertRule, [otherTeacherId, 'Synthetic replacement rule', 1, '09:00', '10:00'])).rows[0];
  assert.equal(replacement.created_by_phone, '15555550103');
  assert.equal(replacement.created_by_name, null);
  const cancelled = (await agent.query("UPDATE app.teacher_assignments SET cancelled_at = '1900-01-01', cancelled_by_phone = 'forged', cancelled_by_name = 'forged', cancellation_reason = 'synthetic correction' WHERE id = $1 RETURNING *", [assignment.id])).rows[0];
  assert.equal(cancelled.cancelled_by_phone, '15555550103');
  assert.equal(cancelled.cancelled_by_name, null);
  assert.ok((cancelled.cancelled_at as Date).getTime() >= (cancelled.created_at as Date).getTime());
  assert.equal(cancelled.created_by_phone, assignment.created_by_phone);
  await reject(agent, "UPDATE app.teacher_assignments SET cancellation_reason = 'rewritten' WHERE id = $1", '23514', [assignment.id]);
  await reject(agent, 'UPDATE app.teacher_assignments SET cancelled_at = NULL WHERE id = $1', '23514', [assignment.id]);
  await agent.query(insertAssignment, [otherTeacherId, '2020-01-01', '09:00']);
  // Future assignments can also be cancelled before the lesson.
  await agent.query("UPDATE app.teacher_assignments SET cancelled_at = clock_timestamp(), cancellation_reason = 'synthetic future correction' WHERE id = $1", [future.id]);
  await reject(agent, "UPDATE app.teacher_assignments SET cancelled_at = clock_timestamp(), cancellation_reason = 'again' WHERE id = $1", '23514', [future.id]);
  await agent.query(insertAssignment, [otherTeacherId, '2099-01-01', '09:00']);
  const unnamed = (await agent.query("INSERT INTO app.teachers (first_name, last_name, created_by_name) VALUES ('Unnamed', 'Synthetic', 'forged') RETURNING created_by_name")).rows[0];
  assert.equal(unnamed.created_by_name, null);
  await agent.query('COMMIT');
  await bind(migrator);
  await reject(migrator, 'UPDATE app.teacher_rule_intervals SET is_active = true WHERE rule_id = $1', '42501', [firstRule.id]);
  await reject(migrator, "UPDATE app.teacher_rules SET deactivation_reason = 'rewritten' WHERE id = $1", '23514', [firstRule.id]);
  await reject(migrator, "UPDATE app.teacher_assignments SET cancellation_reason = 'rewritten' WHERE id = $1", '23514', [assignment.id]);
  await migrator.query('ROLLBACK');

  // Real concurrent transactions must wait on the native exclusion constraint,
  // then reject an overlap or accept a replacement after deactivation commits.
  const concurrent = new Client(agentConfig);
  await concurrent.connect();
  const waitForBlock = async (pid: number) => {
    for (let i = 0; i < 100; i++) {
      if ((await migrator.query('SELECT cardinality(pg_blocking_pids($1)) AS n', [pid])).rows[0].n > 0) return;
      await delay(25);
    }
    assert.fail('Expected the concurrent teacher interval insert to block');
  };
  try {
    await bind(agent);
    // This connection cannot borrow the first backend's trusted author window.
    await concurrent.query('BEGIN');
    await assert.rejects(concurrent.query("INSERT INTO app.teachers (first_name, last_name) VALUES ('OtherBackend', 'Synthetic')"), { code: '42501' });
    await concurrent.query('ROLLBACK');
    const secondPid = await bind(concurrent, '15555550103', 'Synthetic Beta');
    await concurrent.query("SET LOCAL statement_timeout = '10s'");
    const raceRule = (await agent.query(insertRule, [teacherId, 'Synthetic concurrent first', 4, '12:00', '13:00'])).rows[0];
    const overlap = concurrent.query(insertRule, [otherTeacherId, 'Synthetic concurrent conflict', 4, '13:00', '14:00']).then(
      () => 'unexpected success', (error: { code?: string }) => error.code,
    );
    await waitForBlock(secondPid);
    await agent.query('COMMIT');
    assert.equal(await overlap, '23P01');
    await concurrent.query('ROLLBACK');

    await bind(agent);
    const replacementPid = await bind(concurrent, '15555550103', 'Synthetic Beta');
    await concurrent.query("SET LOCAL statement_timeout = '10s'");
    await agent.query("UPDATE app.teacher_rules SET deactivated_at = clock_timestamp(), deactivation_reason = 'synthetic concurrent replacement' WHERE id = $1", [raceRule.id]);
    const pending = concurrent.query(insertRule, [otherTeacherId, 'Synthetic concurrent replacement', 4, '12:00', '13:00']).then(
      (result) => ({ result, code: null }), (error: { code?: string }) => ({ result: null, code: error.code }),
    );
    await waitForBlock(replacementPid);
    await agent.query('COMMIT');
    const accepted = await pending;
    assert.equal(accepted.code, null);
    assert.equal(accepted.result?.rows[0].created_by_phone, '15555550103');
    await concurrent.query('COMMIT');

    await bind(agent);
    const assignmentPid = await bind(concurrent, '15555550103', 'Synthetic Beta');
    await concurrent.query("SET LOCAL statement_timeout = '10s'");
    await agent.query(insertAssignment, [teacherId, '2099-01-02', '09:00']);
    const duplicate = concurrent.query(insertAssignment, [otherTeacherId, '2099-01-02', '09:00']).then(
      () => 'unexpected success', (error: { code?: string }) => error.code,
    );
    await waitForBlock(assignmentPid);
    await agent.query('COMMIT');
    assert.equal(await duplicate, '23505');
    await concurrent.query('ROLLBACK');
  } finally {
    await agent.query('ROLLBACK');
    await concurrent.query('ROLLBACK');
    await concurrent.end();
  }
  assert.equal((await migrator.query('SELECT count(*)::int AS n FROM studio_private.teacher_rule_builds')).rows[0].n, 0);
}
