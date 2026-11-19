import assert from 'node:assert/strict';
import type { Client } from 'pg';
import { bindAgent, ownerContext } from './identity-seed.js';

// Planned participations (US-019) on real PostgreSQL: trusted author, valid
// insertion only, single cancellation with a system instant, uniqueness among
// valid rows, no delete, rewrite or DDL, and their effect on the lesson
// functions. The broker login binds registered senders as for a turn.
export async function checkPlannedParticipations(agent: Client, migrator: Client, broker: Client, clientId: string): Promise<void> {
  const reject = async (sql: string, code: string, params: unknown[] = []) => {
    await agent.query('SAVEPOINT invalid_planned');
    await assert.rejects(agent.query(sql, params), { code });
    await agent.query('ROLLBACK TO SAVEPOINT invalid_planned');
  };
  const author = async (id: string) => (await migrator.query(`SELECT created_by_phone, created_by_name, cancelled_by_phone, cancelled_by_name
    FROM studio_private.planned_participations WHERE id = $1`, [id])).rows[0];
  const insert = "INSERT INTO app.planned_participations (client_id, lesson_date, start_time, created_at, created_by_name) VALUES ($1, '2099-02-02', '18:00', '1900-01-01', 'forged') RETURNING *";
  await assert.rejects(agent.query("INSERT INTO app.planned_participations (client_id, lesson_date, start_time, created_by_phone) VALUES ($1, '2099-02-02', '18:00', 'forged')", [clientId]), { code: '42703' });
  await assert.rejects(agent.query(insert, [clientId]), { code: '42501' });
  await agent.query('BEGIN');
  const expired = (await agent.query('SELECT pg_backend_pid() AS pid, txid_current()::text AS txid')).rows[0];
  await ownerContext(migrator, broker, '15555550102', expired, '-1 second');
  await assert.rejects(agent.query(insert, [clientId]), { code: '42501' });
  await agent.query('ROLLBACK');

  await bindAgent(agent, broker, '15555550102');
  const future = (await agent.query(insert, [clientId])).rows[0];
  assert.equal('created_by_phone' in future, false);
  assert.equal(future.created_by_name, 'Synthetic Profile');
  assert.ok(new Date(future.created_at).getFullYear() > 2000, 'creation instant comes from the database clock');
  // Past lessons and lessons later today are allowed, with no advance limit.
  const past = (await agent.query("INSERT INTO app.planned_participations (client_id, lesson_date, start_time) VALUES ($1, '2020-01-06', '18:00') RETURNING id", [clientId])).rows[0];
  await agent.query(`WITH t AS (SELECT date_trunc('minute', clock_timestamp() AT TIME ZONE 'Europe/Rome') + interval '1 minute' AS local_start)
    INSERT INTO app.planned_participations (client_id, lesson_date, start_time) SELECT $1, local_start::date, local_start::time FROM t`, [clientId]);
  await reject(insert, '23505', [clientId]);
  await reject("INSERT INTO app.planned_participations (client_id, lesson_date, start_time) VALUES ($1, '2099-02-02', '18:00:01')", '23514', [clientId]);
  await reject("INSERT INTO app.planned_participations (client_id, lesson_date, start_time) VALUES ($1, '2099-02-02', '24:00')", '23514', [clientId]);
  await reject("INSERT INTO app.planned_participations (client_id, lesson_date, start_time) VALUES ($1, 'infinity', '18:00')", '23514', [clientId]);
  await reject("INSERT INTO app.planned_participations (client_id, lesson_date, start_time) VALUES ($1, '2099-03-29', '02:30')", '23514', [clientId]);
  await reject("INSERT INTO app.planned_participations (client_id, lesson_date, start_time) VALUES (999999999, '2099-02-02', '18:00')", '23503');
  await reject("INSERT INTO app.planned_participations (client_id, lesson_date, start_time, cancelled_at, cancellation_reason) VALUES ($1, '2099-02-03', '18:00', clock_timestamp(), 'synthetic')", '23514', [clientId]);
  await reject('UPDATE app.planned_participations SET cancelled_at = clock_timestamp() WHERE id = $1', '23514', [future.id]);
  await reject("UPDATE app.planned_participations SET cancelled_at = clock_timestamp(), cancellation_reason = '  ' WHERE id = $1", '23514', [future.id]);
  await reject("UPDATE app.planned_participations SET start_time = '19:00' WHERE id = $1", '42501', [future.id]);
  await reject("UPDATE app.planned_participations SET cancelled_at = clock_timestamp(), cancellation_reason = 'synthetic', cancelled_by_phone = 'forged' WHERE id = $1", '42703', [future.id]);
  // A planned participation is not attendance: the future presence is still refused.
  await reject("INSERT INTO app.attendance (client_id, lesson_date, start_time, outcome) VALUES ($1, '2099-02-02', '18:00', 'present')", '23514', [clientId]);
  await agent.query('COMMIT');
  assert.deepEqual(await author(future.id), { created_by_phone: '15555550102', created_by_name: 'Synthetic Profile', cancelled_by_phone: null, cancelled_by_name: null });

  // The planned lesson exists and the client is expected only there, as 'planned'.
  await bindAgent(agent, broker, '15555550102');
  const expected = async (day: string) => (await agent.query(
    'SELECT start_time::text AS time, source FROM app.expected_clients($1::text::date, $1::text::date) WHERE client_id = $2 ORDER BY 1, 2', [day, clientId])).rows;
  assert.deepEqual(await expected('2099-02-02'), [{ time: '18:00:00', source: 'planned' }]);
  assert.deepEqual(await expected('2099-02-09'), []);
  assert.equal((await agent.query("SELECT count(*)::int AS n FROM app.existing_lessons('2099-02-02', '2099-02-02') WHERE start_time = '18:00'")).rows[0].n, 1);
  assert.equal((await agent.query("SELECT count(*)::int AS n FROM app.lesson_teachers('2099-02-02', '2099-02-02') WHERE start_time = '18:00' AND teacher_id IS NULL")).rows[0].n, 1);
  await agent.query('ROLLBACK');

  // Cancellation by another registered sender: once, with a system instant.
  await bindAgent(agent, broker, '15555550103');
  const cancelled = (await agent.query("UPDATE app.planned_participations SET cancelled_at = '1900-01-01', cancellation_reason = 'synthetic not coming', cancelled_by_name = 'forged' WHERE id = $1 RETURNING *", [future.id])).rows[0];
  assert.equal(cancelled.cancelled_by_name, 'Synthetic Second');
  assert.ok(new Date(cancelled.cancelled_at) >= new Date(cancelled.created_at), 'cancellation instant comes from the database clock');
  await reject("UPDATE app.planned_participations SET cancelled_at = clock_timestamp(), cancellation_reason = 'again' WHERE id = $1", '23514', [future.id]);
  await agent.query('COMMIT');
  assert.deepEqual(await author(future.id), { created_by_phone: '15555550102', created_by_name: 'Synthetic Profile', cancelled_by_phone: '15555550103', cancelled_by_name: 'Synthetic Second' });
  await bindAgent(agent, broker, '15555550102');
  assert.deepEqual(await expected('2099-02-02'), [], 'a cancelled planned participation is not expected');
  assert.equal((await agent.query("SELECT count(*)::int AS n FROM app.existing_lessons('2099-02-02', '2099-02-02')")).rows[0].n, 0);
  // History stays readable; a new valid row may follow the cancelled one.
  assert.equal((await agent.query('SELECT cancellation_reason FROM app.planned_participations WHERE id = $1', [future.id])).rows[0].cancellation_reason, 'synthetic not coming');
  const replacement = (await agent.query("INSERT INTO app.planned_participations (client_id, lesson_date, start_time) VALUES ($1, '2099-02-02', '18:00') RETURNING id", [clientId])).rows[0];
  assert.notEqual(replacement.id, future.id);
  await agent.query('COMMIT');

  await assert.rejects(agent.query("UPDATE app.planned_participations SET cancelled_at = clock_timestamp(), cancellation_reason = 'no context' WHERE id = $1", [past.id]), { code: '42501' });
  for (const connection of [agent, migrator]) {
    await assert.rejects(connection.query('DELETE FROM app.planned_participations WHERE id = $1', [past.id]), { code: '42501' });
  }
  await assert.rejects(migrator.query('DELETE FROM studio_private.planned_participations WHERE id = $1', [past.id]), { code: '42501' });
  await assert.rejects(migrator.query('TRUNCATE studio_private.planned_participations'), { code: '42501' });
  await assert.rejects(agent.query('TRUNCATE app.planned_participations'), (error: unknown) => ['42501', '42809'].includes((error as { code?: string }).code ?? ''));
  for (const sql of ['ALTER TABLE app.planned_participations ADD COLUMN forbidden text', 'DROP VIEW app.planned_participations',
    'CREATE INDEX forbidden ON app.planned_participations (client_id)', 'SELECT * FROM studio_private.planned_participations',
    'SELECT created_by_phone FROM studio_private.planned_participations']) {
    await assert.rejects(agent.query(sql), (error: unknown) => ['42501', '42809'].includes((error as { code?: string }).code ?? ''), sql);
  }
  await assert.rejects(agent.query('SELECT created_by_phone FROM app.planned_participations'), { code: '42703' });
  await assert.rejects(broker.query('SELECT * FROM studio_private.planned_participations'), { code: '42501' });
  await assert.rejects(broker.query('SELECT * FROM app.planned_participations'), { code: '42501' });
  // The migrator's ordinary DML cannot rewrite a row either.
  await migrator.query('BEGIN');
  await ownerContext(migrator, broker, '15555550102');
  await assert.rejects(migrator.query("UPDATE studio_private.planned_participations SET lesson_date = '2099-02-03', cancelled_at = clock_timestamp(), cancellation_reason = 'synthetic' WHERE id = $1", [past.id]), { code: '42501' });
  await migrator.query('ROLLBACK');
  // Author numbers of planned participations are part of the gateway redaction set.
  assert.ok((await broker.query('SELECT digits FROM studio_private.identity_phone_digits() AS digits')).rows.some((row) => row.digits === '15555550103'));
  await assert.rejects(agent.query('SELECT studio_private.identity_phone_digits()'), { code: '42501' });
}
