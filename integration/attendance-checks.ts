import assert from 'node:assert/strict';
import type { Client } from 'pg';

// The fixture installs the protected context directly; the gateway path is
// verified separately in author.test.ts.
export async function checkAttendance(agent: Client, migrator: Client, clientId: string): Promise<void> {
  const bind = async (connection: Client, phone = '15555550102', name: string | null = 'Synthetic Profile') => {
    await connection.query('BEGIN');
    const row = (await connection.query('SELECT pg_backend_pid() AS pid, txid_current() AS txid')).rows[0];
    await migrator.query("INSERT INTO studio_private.author_context VALUES ($1, $2, $3, $4, clock_timestamp() + interval '1 minute')", [row.pid, row.txid, phone, name]);
  };
  const rejectInTransaction = async (sql: string, code: string, params: unknown[] = []) => {
    await agent.query('SAVEPOINT invalid_attendance');
    await assert.rejects(agent.query(sql, params), { code });
    await agent.query('ROLLBACK TO SAVEPOINT invalid_attendance');
  };
  const insert = "INSERT INTO app.attendance (client_id, lesson_date, start_time, outcome, created_by_phone, created_by_name) VALUES ($1, '2020-01-01', '09:00', 'present', 'forged', 'forged') RETURNING *";
  await assert.rejects(agent.query(insert, [clientId]), { code: '42501' });
  await agent.query('BEGIN');
  const expired = (await agent.query('SELECT pg_backend_pid() AS pid, txid_current() AS txid')).rows[0];
  await migrator.query("INSERT INTO studio_private.author_context VALUES ($1, $2, '15555550102', NULL, clock_timestamp() - interval '1 second')", [expired.pid, expired.txid]);
  await assert.rejects(agent.query(insert, [clientId]), { code: '42501' });
  await agent.query('ROLLBACK');
  await bind(agent);
  const first = (await agent.query(insert, [clientId])).rows[0];
  assert.equal(first.created_by_phone, '15555550102');
  assert.equal(first.created_by_name, 'Synthetic Profile');
  await rejectInTransaction(insert, '23505', [clientId]);
  await rejectInTransaction("INSERT INTO app.attendance (client_id, lesson_date, start_time, outcome) VALUES ($1, '2020-01-01', '10:00', 'invalid')", '23514', [clientId]);
  await rejectInTransaction("INSERT INTO app.attendance (client_id, lesson_date, start_time, outcome) VALUES ($1, '2020-01-01', '10:00:01', 'present')", '23514', [clientId]);
  await rejectInTransaction("INSERT INTO app.attendance (client_id, lesson_date, start_time, outcome) VALUES ($1, '2020-01-01', '24:00', 'present')", '23514', [clientId]);
  await rejectInTransaction("INSERT INTO app.attendance (client_id, lesson_date, start_time, outcome) VALUES ($1, '2020-03-29', '02:30', 'present')", '23514', [clientId]);
  const repeated = (await agent.query("SELECT extract(epoch FROM (timestamp '2020-10-25 02:30' AT TIME ZONE 'Europe/Rome'))::bigint AS instant")).rows[0];
  assert.equal(Number(repeated.instant), Date.parse('2020-10-25T01:30:00Z') / 1000);
  await agent.query("INSERT INTO app.attendance (client_id, lesson_date, start_time, outcome) VALUES ($1, '2020-10-25', '02:30', 'present')", [clientId]);
  await rejectInTransaction("INSERT INTO app.attendance (client_id, lesson_date, start_time, outcome, cancelled_at, cancellation_reason) VALUES ($1, '2020-01-01', '10:00', 'present', clock_timestamp(), 'synthetic')", '23514', [clientId]);
  await rejectInTransaction("INSERT INTO app.attendance (client_id, lesson_date, start_time, outcome) VALUES (999999999, '2020-01-01', '10:00', 'present')", '23503');
  await rejectInTransaction('UPDATE app.attendance SET cancelled_at = clock_timestamp() WHERE id = $1', '23514', [first.id]);
  await rejectInTransaction("UPDATE app.attendance SET cancelled_at = clock_timestamp(), cancellation_reason = '  ' WHERE id = $1", '23514', [first.id]);
  await rejectInTransaction("UPDATE app.attendance SET outcome = 'excused_absence' WHERE id = $1", '42501', [first.id]);
  // Use the database clock on both sides of the current local minute; this also
  // covers midnight without assuming the host timezone.
  const boundary = (offset: string) => `WITH t AS (SELECT date_trunc('minute', clock_timestamp() AT TIME ZONE 'Europe/Rome') ${offset} interval '1 minute' AS local_start) INSERT INTO app.attendance (client_id, lesson_date, start_time, outcome) SELECT $1, local_start::date, local_start::time, 'present' FROM t RETURNING id`;
  await agent.query(boundary('-'), [clientId]);
  await rejectInTransaction(boundary('+'), '23514', [clientId]);
  await agent.query('COMMIT');
  await assert.rejects(agent.query('UPDATE app.attendance SET cancelled_at = clock_timestamp(), cancellation_reason = $1 WHERE id = $2', ['synthetic', first.id]), { code: '42501' });
  for (const connection of [agent, migrator]) {
    await assert.rejects(connection.query('DELETE FROM app.attendance WHERE id = $1', [first.id]), { code: '42501' });
    await assert.rejects(connection.query('TRUNCATE app.attendance'), { code: '42501' });
  }
  await assert.rejects(agent.query('ALTER TABLE app.attendance ADD COLUMN forbidden text'), { code: '42501' });
  await bind(migrator);
  await assert.rejects(migrator.query("UPDATE app.attendance SET outcome = 'excused_absence', cancelled_at = clock_timestamp(), cancellation_reason = 'synthetic' WHERE id = $1", [first.id]), { code: '42501' });
  await migrator.query('ROLLBACK');
  await bind(agent, '15555550103', null);
  const cancelled = (await agent.query("UPDATE app.attendance SET cancelled_at = clock_timestamp(), cancellation_reason = 'synthetic', cancelled_by_phone = 'forged', cancelled_by_name = 'forged' WHERE id = $1 RETURNING *", [first.id])).rows[0];
  assert.equal(cancelled.cancelled_by_phone, '15555550103');
  assert.equal(cancelled.cancelled_by_name, null);
  await agent.query('COMMIT');
  await bind(agent);
  await rejectInTransaction("UPDATE app.attendance SET cancellation_reason = 'rewritten' WHERE id = $1", '23514', [first.id]);
  const replacement = (await agent.query("INSERT INTO app.attendance (client_id, lesson_date, start_time, outcome) VALUES ($1, '2020-01-01', '09:00', 'excused_absence') RETURNING id", [clientId])).rows[0];
  assert.notEqual(replacement.id, first.id);
  await rejectInTransaction("INSERT INTO app.attendance (client_id, lesson_date, start_time, outcome) VALUES ($1, '2020-01-01', '09:00', 'unexcused_absence')", '23505', [clientId]);
  await agent.query("INSERT INTO app.attendance (client_id, lesson_date, start_time, outcome) VALUES ($1, '2020-01-01', '09:01', 'unexcused_absence')", [clientId]);
  await agent.query('COMMIT');
}
