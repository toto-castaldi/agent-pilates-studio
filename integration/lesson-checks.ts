import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { Client } from 'pg';

export async function checkLessonFunctions(migrator: Client): Promise<void> {
  const reference = await readFile('integration/lesson-reference.sql', 'utf8');
  await migrator.query('BEGIN');
  try {
    await migrator.query(`INSERT INTO studio_private.author_context
      (backend_pid, transaction_id, sender, profile_name, expires_at)
      VALUES (pg_backend_pid(), txid_current(), '15555550199', 'Synthetic Seed', clock_timestamp() + interval '10 minutes')`);
    const client = (await migrator.query("INSERT INTO app.clients (first_name,last_name) VALUES ('Lesson','Synthetic') RETURNING id")).rows[0].id;
    const teacher = (await migrator.query("INSERT INTO app.teachers (first_name,last_name) VALUES ('Lesson','Synthetic') RETURNING id")).rows[0].id;
    const substitute = (await migrator.query("INSERT INTO app.teachers (first_name,last_name) VALUES ('Substitute','Synthetic') RETURNING id")).rows[0].id;
    for (const [weekday, time, created, deactivated] of [
      [1, '09:00', '2026-01-01T08:00Z', null], [1, '09:00', '2026-01-01T08:00Z', null],
      [2, '10:00', '2026-03-10T09:00Z', null], // created exactly at start: not valid
      [5, '10:00', '2026-01-01T08:00Z', '2026-03-13T09:00Z'], // deactivated exactly at start
      [7, '02:30', '2026-01-01T08:00Z', null],
    ]) {
      const rule = (await migrator.query("INSERT INTO app.training_rules (rule_text,created_at) VALUES ('Synthetic lesson fixture',$1) RETURNING id", [created])).rows[0].id;
      await migrator.query('INSERT INTO app.rule_clients VALUES ($1,$2)', [rule, client]);
      await migrator.query('INSERT INTO app.rule_slots VALUES ($1,$2,$3)', [rule, weekday, time]);
      if (deactivated) await migrator.query("UPDATE app.training_rules SET deactivated_at=$2, deactivation_reason='Synthetic end' WHERE id=$1", [rule, deactivated]);
    }
    await migrator.query('ALTER TABLE app.teacher_rules DISABLE TRIGGER teacher_rules_author');
    await migrator.query('ALTER TABLE app.teacher_assignments DISABLE TRIGGER teacher_assignments_author');
    await migrator.query('ALTER TABLE app.attendance DISABLE TRIGGER attendance_author');
    const rule = (await migrator.query(`INSERT INTO app.teacher_rules (teacher_id,rule_text,created_at,created_by_phone)
      VALUES ($1,'Synthetic teacher fixture','2026-01-01','15555550199') RETURNING id`, [teacher])).rows[0].id;
    await migrator.query("INSERT INTO app.teacher_rule_intervals (rule_id,weekday,start_time_min,start_time_max) VALUES ($1,1,'09:00','09:00')", [rule]);
    await migrator.query("UPDATE app.teacher_rules SET deactivated_at='2026-04-01', deactivated_by_phone='15555550199', deactivation_reason='Synthetic end' WHERE id=$1", [rule]);
    for (const [day, time, cancelled] of [['2026-03-02', '09:00', false], ['2026-03-03', '11:00', false], ['2026-03-09', '09:00', true]]) {
      await migrator.query(`INSERT INTO app.teacher_assignments
        (teacher_id,lesson_date,start_time,created_at,created_by_phone,cancelled_at,cancelled_by_phone,cancellation_reason)
        VALUES ($1,$2,$3,'2026-02-01','15555550199', CASE WHEN $4 THEN '2026-02-02'::timestamptz END,
          CASE WHEN $4 THEN '15555550199' END,CASE WHEN $4 THEN 'Synthetic cancel' END)`, [substitute, day, time, cancelled]);
    }
    for (const [day, cancelled] of [['2026-03-05', false], ['2026-03-06', true]]) {
      await migrator.query(`INSERT INTO app.attendance
        (client_id,lesson_date,start_time,outcome,created_at,created_by_phone,cancelled_at,cancelled_by_phone,cancellation_reason)
        VALUES ($1,$2,'17:00','present','2026-03-20','15555550199', CASE WHEN $3 THEN '2026-03-21'::timestamptz END,
          CASE WHEN $3 THEN '15555550199' END,CASE WHEN $3 THEN 'Synthetic cancel' END)`, [client, day, cancelled]);
    }
    await migrator.query('SET CONSTRAINTS app.teacher_rules_complete IMMEDIATE');
    await migrator.query('SET LOCAL ROLE studio_agent');
    assert.equal((await migrator.query('SELECT current_user AS role')).rows[0].role, 'studio_agent');
    for (const bounds of [['2026-03-01', '2026-03-31'], ['2026-10-19', '2026-10-31'], ['2026-01-01', '2026-12-31']]) {
      const expected = (await migrator.query(reference, bounds)).rows;
      const actual = (await migrator.query(`SELECT lesson_date,start_time,expected_id,assigned_id,expected_teacher,assigned_teacher
        FROM app.lesson_teachers($1,$2) ORDER BY lesson_date,start_time`, bounds)).rows;
      assert.deepEqual(actual, expected);
      assert.ok(actual.length > 0);
    }
    const expected = async (day: string, time: string) => (await migrator.query(
      'SELECT count(*)::int AS n FROM app.expected_clients($1,$1) WHERE client_id=$2 AND start_time=$3', [day, client, time])).rows[0].n;
    assert.equal(await expected('2026-03-02', '09:00'), 1, 'overlapping client rules must deduplicate');
    assert.equal(await expected('2026-03-10', '10:00'), 0, 'creation boundary is strict');
    assert.equal(await expected('2026-03-13', '10:00'), 0, 'deactivation boundary is strict');
    assert.equal(await expected('2026-03-29', '02:30'), 0, 'spring gap must be excluded');
    assert.equal(await expected('2026-10-25', '02:30'), 1, 'autumn repeated hour counts once');
    const march = (await migrator.query("SELECT * FROM app.lesson_teachers('2026-03-01','2026-03-31')")).rows;
    assert.ok(march.some((row) => row.expected_id === teacher && row.assigned_id === substitute && row.teacher_id === substitute));
    assert.ok(march.some((row) => row.expected_id === teacher && !row.assigned_id && row.teacher_id === teacher));
    assert.ok(march.some((row) => !row.expected_id && row.assigned_id === substitute));
    assert.ok(march.some((row) => !row.teacher_id));
    for (const name of ['existing_lessons', 'expected_clients', 'lesson_teachers']) {
      const signature = `app.${name}(date,date)`;
      // psycopg transmits model strings as text, unlike node-postgres' unknown
      // parameter type. Guard the documented explicit-cast calling convention.
      await migrator.query('SAVEPOINT text_parameter_probe');
      await assert.rejects(migrator.query(`SELECT * FROM app.${name}($1::text,$2::text)`, ['2026-03-01', '2026-03-31']), { code: '42883' });
      await migrator.query('ROLLBACK TO SAVEPOINT text_parameter_probe');
      assert.ok((await migrator.query(`SELECT * FROM app.${name}($1::text::date,$2::text::date)`, ['2026-03-01', '2026-03-31'])).rowCount);
      const meta = (await migrator.query(`SELECT prosecdef,provolatile,proconfig,
        NOT EXISTS (SELECT FROM aclexplode(proacl) WHERE grantee=0 AND privilege_type='EXECUTE') AS restricted
        FROM pg_proc WHERE oid=$1::regprocedure`, [signature])).rows[0];
      assert.deepEqual(meta, { prosecdef: false, provolatile: 's', proconfig: null, restricted: true });
      const rows = (await migrator.query(`SELECT row_to_json(f)::text AS row FROM app.${name}('2026-01-01','2026-12-31') f`)).rows;
      assert.ok(rows.every((row) => !row.row.includes('phone') && !row.row.includes('15555550199')));
      for (const sql of [`ALTER FUNCTION ${signature} RENAME TO forbidden`, `DROP FUNCTION ${signature}`,
        `CREATE OR REPLACE FUNCTION app.${name}(date,date) RETURNS int LANGUAGE sql AS $$ SELECT 1 $$`]) {
        await migrator.query('SAVEPOINT privilege_probe');
        await assert.rejects(migrator.query(sql), { code: '42501' });
        await migrator.query('ROLLBACK TO SAVEPOINT privilege_probe');
      }
    }
    await migrator.query('SAVEPOINT private_probe');
    await assert.rejects(migrator.query('SELECT phone FROM studio_private.teachers'), { code: '42501' });
    await migrator.query('ROLLBACK TO SAVEPOINT private_probe');
  } finally {
    await migrator.query('ROLLBACK');
  }
}
