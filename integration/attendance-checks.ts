import assert from 'node:assert/strict';
import type { Client } from 'pg';
import { bindAgent, ownerContext } from './identity-seed.js';

// The broker login binds registered senders as for a turn; the gateway path is
// verified separately in author.test.ts. Authors are read from the private rows.
export async function checkAttendance(agent: Client, migrator: Client, broker: Client, clientId: string): Promise<void> {
  const bind = async (connection: Client, phone = '15555550102') => {
    if (connection === agent) return bindAgent(agent, broker, phone);
    await connection.query('BEGIN');
    await ownerContext(connection, broker, phone);
  };
  const author = async (id: string) => (await migrator.query('SELECT created_by_phone, created_by_name, cancelled_by_phone, cancelled_by_name FROM studio_private.attendance WHERE id = $1', [id])).rows[0];
  const rejectInTransaction = async (sql: string, code: string, params: unknown[] = []) => {
    await agent.query('SAVEPOINT invalid_attendance');
    await assert.rejects(agent.query(sql, params), { code });
    await agent.query('ROLLBACK TO SAVEPOINT invalid_attendance');
  };
  const insert = "INSERT INTO app.attendance (client_id, lesson_date, start_time, outcome, created_by_name) VALUES ($1, '2020-01-01', '09:00', 'present', 'forged') RETURNING *";
  await assert.rejects(agent.query("INSERT INTO app.attendance (client_id, lesson_date, start_time, outcome, created_by_phone) VALUES ($1, '2020-01-01', '09:00', 'present', 'forged')", [clientId]), { code: '42703' });
  await assert.rejects(agent.query(insert, [clientId]), { code: '42501' });
  await agent.query('BEGIN');
  const expired = (await agent.query('SELECT pg_backend_pid() AS pid, txid_current()::text AS txid')).rows[0];
  await ownerContext(migrator, broker, '15555550102', expired, '-1 second');
  await assert.rejects(agent.query(insert, [clientId]), { code: '42501' });
  await agent.query('ROLLBACK');
  await bind(agent);
  const first = (await agent.query(insert, [clientId])).rows[0];
  assert.equal('created_by_phone' in first, false);
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
  const boundary = (offset: string, minutes: number, outcome: string) => `WITH t AS (SELECT date_trunc('minute', clock_timestamp() AT TIME ZONE 'Europe/Rome') ${offset} interval '${minutes} minute' AS local_start) INSERT INTO app.attendance (client_id, lesson_date, start_time, outcome, created_by_name) SELECT $1, local_start::date, local_start::time, '${outcome}', 'forged' FROM t RETURNING *`;
  for (const [index, outcome] of ['present', 'unexcused_absence', 'excused_absence'].entries()) {
    await agent.query(boundary('-', index + 1, outcome), [clientId]);
  }
  await rejectInTransaction(boundary('+', 1, 'present'), '23514', [clientId]);
  await rejectInTransaction(boundary('+', 1, 'unexcused_absence'), '23514', [clientId]);
  const future = (await agent.query(boundary('+', 1, 'excused_absence'), [clientId])).rows[0];
  assert.equal(future.created_by_name, 'Synthetic Profile');
  await rejectInTransaction(boundary('+', 1, 'excused_absence'), '23505', [clientId]);
  await rejectInTransaction("INSERT INTO app.attendance (client_id, lesson_date, start_time, outcome) VALUES ($1, '2099-03-29', '02:30', 'excused_absence')", '23514', [clientId]);
  await rejectInTransaction("UPDATE app.attendance SET cancelled_at = clock_timestamp(), cancellation_reason = 'forged', cancelled_by_phone = 'forged' WHERE id = $1", '42703', [future.id]);
  await agent.query("UPDATE app.attendance SET cancelled_at = clock_timestamp(), cancellation_reason = 'synthetic future cancellation', cancelled_by_name = 'forged' WHERE id = $1", [future.id]);
  const cancelledFuture = (await agent.query('SELECT cancelled_by_name, cancellation_reason FROM app.attendance WHERE id = $1', [future.id])).rows[0];
  assert.deepEqual(cancelledFuture, { cancelled_by_name: 'Synthetic Profile', cancellation_reason: 'synthetic future cancellation' });
  await rejectInTransaction("UPDATE app.attendance SET cancelled_at = clock_timestamp(), cancellation_reason = 'again' WHERE id = $1", '23514', [future.id]);
  await agent.query("INSERT INTO app.attendance (client_id, lesson_date, start_time, outcome) VALUES ($1, '2099-01-01', '09:00', 'excused_absence')", [clientId]);
  await agent.query('COMMIT');
  assert.deepEqual(await author(future.id), { created_by_phone: '15555550102', created_by_name: 'Synthetic Profile', cancelled_by_phone: '15555550102', cancelled_by_name: 'Synthetic Profile' });
  await assert.rejects(agent.query('UPDATE app.attendance SET cancelled_at = clock_timestamp(), cancellation_reason = $1 WHERE id = $2', ['synthetic', first.id]), { code: '42501' });
  for (const connection of [agent, migrator]) {
    await assert.rejects(connection.query('DELETE FROM app.attendance WHERE id = $1', [first.id]), { code: '42501' });
  }
  await assert.rejects(agent.query('TRUNCATE app.attendance'), (error: unknown) => ['42501', '42809'].includes((error as { code?: string }).code ?? ''));
  await assert.rejects(migrator.query('TRUNCATE studio_private.attendance'), { code: '42501' });
  await assert.rejects(migrator.query('DELETE FROM studio_private.attendance WHERE id = $1', [first.id]), { code: '42501' });
  await assert.rejects(agent.query('ALTER TABLE app.attendance ADD COLUMN forbidden text'), (error: unknown) => ['42501', '42809'].includes((error as { code?: string }).code ?? ''));
  await bind(migrator);
  await assert.rejects(migrator.query("UPDATE studio_private.attendance SET outcome = 'excused_absence', cancelled_at = clock_timestamp(), cancellation_reason = 'synthetic' WHERE id = $1", [first.id]), { code: '42501' });
  await migrator.query('ROLLBACK');
  await bind(agent, '15555550103');
  const cancelled = (await agent.query("UPDATE app.attendance SET cancelled_at = clock_timestamp(), cancellation_reason = 'synthetic', cancelled_by_name = 'forged' WHERE id = $1 RETURNING *", [first.id])).rows[0];
  assert.equal(cancelled.cancelled_by_name, 'Synthetic Second');
  await agent.query('COMMIT');
  assert.deepEqual(await author(first.id), { created_by_phone: '15555550102', created_by_name: 'Synthetic Profile', cancelled_by_phone: '15555550103', cancelled_by_name: 'Synthetic Second' });
  await bind(agent);
  await rejectInTransaction("UPDATE app.attendance SET cancellation_reason = 'rewritten' WHERE id = $1", '23514', [first.id]);
  const replacement = (await agent.query("INSERT INTO app.attendance (client_id, lesson_date, start_time, outcome) VALUES ($1, '2020-01-01', '09:00', 'excused_absence') RETURNING id", [clientId])).rows[0];
  assert.notEqual(replacement.id, first.id);
  await rejectInTransaction("INSERT INTO app.attendance (client_id, lesson_date, start_time, outcome) VALUES ($1, '2020-01-01', '09:00', 'unexcused_absence')", '23505', [clientId]);
  await agent.query("INSERT INTO app.attendance (client_id, lesson_date, start_time, outcome) VALUES ($1, '2020-01-01', '09:01', 'unexcused_absence')", [clientId]);
  await agent.query('COMMIT');
}
