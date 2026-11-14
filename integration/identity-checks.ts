import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { Client, type ClientConfig } from 'pg';
import { invalidPhones, phoneCases } from '../test/identity-cases.js';
import { readTeacherState } from './teacher-fixtures.js';

const mutationSql = 'SELECT * FROM studio_private.manage_teacher_identity($1, $2, $3, $4, $5, $6, $7)';
const managerSender = '15555550120';
const managerPhone = '+15555550120';

type Binding = { pid: number; txid: string };

// Real PostgreSQL only. The broker login stands for the trusted component;
// webhook authentication and the future guided UI are intentionally not mocked
// as proof of the database privileges tested here.
export async function checkTeacherIdentities(
  agent: Client, migrator: Client, broker: Client, configs: { agent: ClientConfig; broker: ClientConfig },
): Promise<void> {
  const mutate = (connection: Client, operation: string, id: string | null = null,
    first: string | null = null, last: string | null = null, phone: string | null = null,
    sender = managerSender, configuredManager = managerPhone) => connection.query(mutationSql,
    [sender, configuredManager, operation, id, first, last, phone]);
  const snapshot = async () => ({
    people: (await migrator.query('SELECT * FROM studio_private.teachers ORDER BY id')).rows,
    changes: (await migrator.query('SELECT * FROM studio_private.teacher_identity_changes ORDER BY id')).rows,
  });
  const assertClosed = async () => assert.equal((await migrator.query('SELECT count(*)::int AS n FROM studio_private.teacher_identity_writes')).rows[0].n, 0);
  const rejectUnchanged = async (query: () => Promise<unknown>, code: string) => {
    const before = await snapshot();
    await assert.rejects(query(), { code });
    assert.deepEqual(await snapshot(), before, 'Rejected identity operation must be atomic');
    await assertClosed();
  };
  const list = (sender = managerSender, configuredManager = managerPhone) => broker.query(
    'SELECT * FROM studio_private.list_teacher_identities($1, $2)', [sender, configuredManager]);
  const resolve = (sender: string) => broker.query('SELECT * FROM studio_private.resolve_teacher_identity($1)', [sender]);
  const bind = async (connection: Client, sender: string): Promise<Binding> => {
    await connection.query('BEGIN');
    const binding = (await connection.query<Binding>('SELECT pg_backend_pid() AS pid, txid_current() AS txid')).rows[0];
    await broker.query('SELECT studio_private.bind_teacher_identity($1, $2, $3)', [binding.pid, binding.txid, sender]);
    return binding;
  };
  const release = async (connection: Client, binding: Binding, commit = false) => {
    await connection.query(commit ? 'COMMIT' : 'ROLLBACK');
    await broker.query('DELETE FROM studio_private.author_context WHERE backend_pid = $1 AND transaction_id = $2', [binding.pid, binding.txid]);
  };
  const waitForBlock = async (pid: number) => {
    for (let i = 0; i < 200; i++) {
      if ((await migrator.query('SELECT cardinality(pg_blocking_pids($1)) AS n', [pid])).rows[0].n > 0) return;
      await delay(25);
    }
    assert.fail('Expected a concurrent identity write to block');
  };

  // Input policy equivalence and database constraints, not a fake privilege test.
  for (const [raw, canonical] of phoneCases) {
    assert.equal((await migrator.query('SELECT studio_private.normalize_identity_phone($1) AS phone', [raw])).rows[0].phone, canonical);
  }
  for (const raw of invalidPhones) {
    await assert.rejects(migrator.query('SELECT studio_private.normalize_identity_phone($1)', [raw]), { code: '23514' });
  }
  for (const raw of [null, '', '  ', 'X'.repeat(201), 'Synthetic\nName', 'Synthetic\tName', 'Synthetic\u0085Name']) {
    await assert.rejects(migrator.query('SELECT studio_private.normalize_identity_name($1)', [raw]), { code: '23514' });
  }
  assert.equal((await migrator.query("SELECT studio_private.normalize_identity_name('  Synthetic  Name  ') AS name")).rows[0].name, 'Synthetic Name');

  // Owner-only helpers and no grants inherited from app's broad defaults.
  for (const signature of [
    'studio_private.manage_teacher_identity(text,text,text,bigint,text,text,text)',
    'studio_private.list_teacher_identities(text,text)',
    'studio_private.preview_manager_bootstrap(text,text,text,text)',
    'studio_private.resolve_teacher_identity(text)',
    'studio_private.bind_teacher_identity(integer,bigint,text)',
  ]) {
    const privileges = (await migrator.query("SELECT has_function_privilege('studio_agent', $1, 'EXECUTE') AS agent, has_function_privilege('studio_broker', $1, 'EXECUTE') AS broker", [signature])).rows[0];
    assert.deepEqual(privileges, { agent: false, broker: true });
    const definition = (await migrator.query('SELECT prosecdef, proconfig, pg_get_userbyid(proowner) AS owner FROM pg_proc WHERE oid = $1::regprocedure', [signature])).rows[0];
    assert.deepEqual(definition, { prosecdef: true, proconfig: ['search_path=pg_catalog'], owner: 'studio_migrator' });
  }
  for (const signature of [
    'studio_private.identity_state(studio_private.teachers)', 'studio_private.require_identity_manager(text,text)',
    'studio_private.normalize_identity_phone(text)', 'studio_private.insert_legacy_teacher()',
    'studio_private.protect_teacher_identity()',
  ]) {
    assert.equal((await migrator.query("SELECT has_function_privilege('studio_broker', $1, 'EXECUTE') AS allowed", [signature])).rows[0].allowed, false);
  }
  const oldView = await readTeacherState(agent);
  const studioBefore: Record<string, unknown[]> = {};
  for (const table of ['clients', 'training_rules', 'rule_slots', 'rule_clients', 'attendance']) {
    studioBefore[table] = (await migrator.query(`SELECT * FROM app.${table} ORDER BY 1, 2`)).rows;
  }
  // Even a trusted-owner fixture cannot accidentally persist the capability.
  await migrator.query('BEGIN');
  await migrator.query("INSERT INTO studio_private.teacher_identity_writes VALUES (pg_backend_pid(), txid_current(), 'enroll', NULL, NULL, '15555550120', 'Synthetic Guard')");
  await assert.rejects(migrator.query('COMMIT'), { code: '42501' });
  await assertClosed();
  for (const relation of ['teachers', 'teacher_identity_changes', 'teacher_identity_writes']) {
    for (const role of [agent, broker]) {
      await assert.rejects(role.query(`SELECT * FROM studio_private.${relation}`), { code: '42501' });
      await assert.rejects(role.query(`INSERT INTO studio_private.${relation} DEFAULT VALUES`), { code: '42501' });
      await assert.rejects(role.query(`DELETE FROM studio_private.${relation}`), { code: '42501' });
    }
  }
  for (const sql of ['SET ROLE studio_broker', 'SET SESSION AUTHORIZATION studio_broker', 'SELECT studio_private.resolve_teacher_identity(\'15555550120\')']) {
    await assert.rejects(agent.query(sql), { code: '42501' });
  }
  await agent.query("SELECT set_config('studio.is_manager', 'true', false), set_config('studio.manager_phone', '15555550120', false)");
  await rejectUnchanged(() => mutate(agent, 'bootstrap', null, 'Forged', 'Manager', managerPhone), '42501');
  await rejectUnchanged(() => mutate(migrator, 'bootstrap', null, 'Forged', 'Manager', managerPhone), '42501');
  await rejectUnchanged(() => list(), '42501');
  assert.equal((await resolve(managerSender)).rowCount, 0);

  // A new installation can bootstrap a complete manager; a user cancellation
  // (transaction rollback) leaves no partial person, audit or trusted capability.
  const beforeBootstrap = await snapshot();
  await broker.query('BEGIN');
  const newManager = (await mutate(broker, 'bootstrap', null, 'New', 'SyntheticManager', managerPhone)).rows[0];
  const newManagerRow = (await list()).rows.find((row) => row.id === newManager.id);
  assert.deepEqual(newManagerRow, { id: newManager.id, first_name: 'New', last_name: 'SyntheticManager', phone: managerPhone, access_enabled: true, legacy_identity: false, identity_revision: '1' });
  await broker.query('ROLLBACK');
  assert.deepEqual(await snapshot(), beforeBootstrap);
  await assertClosed();

  // The other bootstrap path completes an existing person, never duplicates or
  // rewrites their original profile-name snapshot or domain relationships.
  await migrator.query('BEGIN');
  const legacyBinding = (await migrator.query<Binding>('SELECT pg_backend_pid() AS pid, txid_current() AS txid')).rows[0];
  await migrator.query("INSERT INTO studio_private.author_context (backend_pid, transaction_id, sender, profile_name, expires_at) VALUES ($1, $2, '15555550102', 'Old Synthetic Profile', clock_timestamp() + interval '1 minute')", [legacyBinding.pid, legacyBinding.txid]);
  const manager = (await migrator.query("INSERT INTO app.teachers (first_name, last_name, created_by_phone, created_by_name) VALUES ('Legacy', 'ManagerSynthetic', 'forged', 'forged') RETURNING *")).rows[0];
  await migrator.query('COMMIT');
  await migrator.query('DELETE FROM studio_private.author_context WHERE backend_pid = $1 AND transaction_id = $2', [legacyBinding.pid, legacyBinding.txid]);
  const legacyPerson = (await migrator.query('SELECT * FROM studio_private.teachers WHERE id = $1', [manager.id])).rows[0];
  assert.equal(legacyPerson.phone, null);
  const previewSql = 'SELECT * FROM studio_private.preview_manager_bootstrap($1,$2,$3,$4)';
  const previewParams = [managerSender, managerPhone, 'legacy', 'managersynthetic'];
  assert.equal((await broker.query(previewSql, previewParams)).rows[0].id, manager.id);
  await assert.rejects(agent.query(previewSql, previewParams), { code: '42501' });
  await assert.rejects(broker.query(previewSql, ['15555550129', managerPhone, 'legacy', 'managersynthetic']), { code: '42501' });
  await assert.rejects(agent.query('SELECT * FROM studio_private.management_sessions'), { code: '42501' });
  assert.equal(legacyPerson.access_enabled, false);
  assert.equal(legacyPerson.legacy_identity, true);
  await rejectUnchanged(() => mutate(broker, 'bootstrap', null, 'Other', 'Synthetic', '+15555550129'), '42501');
  await rejectUnchanged(() => mutate(broker, 'bootstrap', manager.id, 'Wrong', 'Synthetic', managerPhone), '23514');
  await rejectUnchanged(() => mutate(broker, 'enroll', null, 'NotYet', 'Allowed', '+15555550129'), '42501');
  const completedManager = (await mutate(broker, 'bootstrap', manager.id, 'legacy', 'managersynthetic', '001 (555) 555-0120')).rows[0];
  assert.deepEqual(completedManager, { id: manager.id, identity_revision: '2' });
  assert.deepEqual((await agent.query('SELECT * FROM app.teachers WHERE id = $1', [manager.id])).rows[0], manager);
  await rejectUnchanged(() => mutate(broker, 'bootstrap', null, 'Other', 'Manager', managerPhone), '42501');
  await rejectUnchanged(() => list('15555550121'), '42501');
  await rejectUnchanged(() => list(managerSender, '+15555550121'), '42501');
  assert.deepEqual((await resolve(managerSender)).rows, [{ id: manager.id, first_name: 'Legacy', last_name: 'ManagerSynthetic', access_enabled: true, identity_revision: '2' }]);

  const guidedBinding = await bind(agent, managerSender);
  await migrator.query('UPDATE studio_private.author_context SET management_only_enrollment=true WHERE backend_pid=$1 AND transaction_id=$2', [guidedBinding.pid, guidedBinding.txid]);
  // Even arbitrary SQL and a forged GUC cannot bypass the trusted context policy.
  await agent.query("SET LOCAL app.management_only_enrollment = 'false'");
  await assert.rejects(agent.query("INSERT INTO app.teachers(first_name,last_name) VALUES ('Forbidden','Synthetic')"), { code: '42501' });
  await release(agent, guidedBinding);

  const enrolled = (await mutate(broker, 'enroll', null, '  New  Synthetic ', ' Identity ', '+1 (555) 555-0123')).rows[0];
  const enrolledId = enrolled.id as string;
  const publicPerson = (await agent.query('SELECT * FROM app.teachers WHERE id = $1', [enrolledId])).rows[0];
  assert.deepEqual(Object.keys(publicPerson), ['id', 'first_name', 'last_name', 'created_at', 'created_by_phone', 'created_by_name']);
  assert.equal(publicPerson.first_name, 'New Synthetic');
  assert.equal(publicPerson.created_by_phone, null, 'New management author phones must not leak through the compatibility view');
  assert.equal(publicPerson.created_by_name, 'Legacy ManagerSynthetic');
  const created = (await migrator.query('SELECT * FROM studio_private.teachers WHERE id = $1', [enrolledId])).rows[0];
  assert.equal(created.phone, '+15555550123');
  assert.equal(created.created_by_phone, managerSender);
  assert.equal(created.legacy_identity, false);
  assert.ok((created.created_at as Date).getTime() > Date.parse('2020-01-01'));

  for (const [op, id, first, last, phone, code] of [
    ['enroll', null, 'new synthetic', 'IDENTITY', '+15555550124', '23505'],
    ['enroll', null, 'Duplicate', 'Phone', '001.555.555.0123', '23505'],
    ['enroll', null, null, 'Missing', '+15555550124', '23514'],
    ['enroll', null, 'Missing', null, '+15555550124', '23514'],
    ['enroll', null, 'Missing', 'Phone', null, '23514'],
    ['enroll', null, 'Local', 'Phone', '15555550124', '23514'],
    ['enroll', enrolledId, 'Unexpected', 'Target', '+15555550124', '23514'],
    ['correct', enrolledId, 'New Synthetic', 'Identity', null, '23514'],
    ['correct', enrolledId, 'Unexpected', 'Phone', '+15555550124', '23514'],
    ['change_phone', enrolledId, 'Unexpected', null, '+15555550124', '23514'],
    ['change_phone', enrolledId, null, null, '+15555550123', '23514'],
    ['complete', enrolledId, null, null, '+15555550124', '23514'],
    ['revoke', enrolledId, 'Unexpected', 'Name', null, '23514'],
    ['enable', enrolledId, null, null, null, '23514'],
    ['correct', '999999999', 'Missing', 'Identity', null, '23503'],
    ['correct', null, 'Missing', 'Identity', null, '23514'],
    ['bootstrap', '-1', 'Invalid', 'Target', managerPhone, '23514'],
    ['unknown', enrolledId, null, null, null, '23514'],
    ['revoke', manager.id, null, null, null, '42501'],
    ['change_phone', manager.id, null, null, '+15555550124', '42501'],
  ] as const) await rejectUnchanged(() => mutate(broker, op, id, first, last, phone), code);

  // Complete a teacher already referenced by rules and assignments. The public
  // legacy snapshot must remain byte-for-byte equal, despite identity changes.
  const legacyId = (await migrator.query("SELECT id FROM studio_private.teachers WHERE first_name = 'Synthetic' AND last_name = 'InstructorOne'")).rows[0].id as string;
  const originalLegacy = (await migrator.query('SELECT * FROM app.teachers WHERE id = $1', [legacyId])).rows[0];
  await mutate(broker, 'complete', legacyId, null, null, '+1\u00a0555\u202f555-0121');
  assert.deepEqual((await agent.query('SELECT * FROM app.teachers WHERE id = $1', [legacyId])).rows[0], originalLegacy);
  assert.equal((await resolve('15555550121')).rows[0].id, legacyId);
  await rejectUnchanged(() => mutate(broker, 'complete', legacyId, null, null, '+15555550124'), '23514');

  // Explicit SQL, composite rows, XML and catalogue statistics cannot expose
  // newly private identity columns. No filtering in the SQL tool is relied on.
  for (const sql of [
    'SELECT * FROM studio_private.teachers',
    'SELECT to_jsonb(t) FROM studio_private.teachers t',
    "SELECT pg_catalog.table_to_xml('studio_private.teachers', true, false, '')",
    'SELECT * FROM studio_private.teacher_identity_changes',
    'SELECT studio_private.require_identity_manager(\'15555550120\', \'+15555550120\')',
  ]) await assert.rejects(agent.query(sql), { code: '42501' });
  for (const column of ['phone', 'access_enabled', 'legacy_identity', 'identity_revision']) {
    await assert.rejects(agent.query(`SELECT ${column} FROM app.teachers`), { code: '42703' });
  }
  const jsonRows = JSON.stringify((await agent.query('SELECT to_jsonb(t), row_to_json(t), t::text FROM app.teachers t')).rows);
  for (const hidden of [managerSender, '15555550121', '15555550123']) assert.equal(jsonRows.includes(hidden), false);
  assert.equal((await agent.query("SELECT count(*)::int AS n FROM pg_catalog.pg_stats WHERE schemaname = 'studio_private' AND tablename = 'teachers'")).rows[0].n, 0);
  for (const sql of [
    "UPDATE app.teachers SET first_name = 'Forged' WHERE id = $1",
    'DELETE FROM app.teachers WHERE id = $1',
    "UPDATE studio_private.teachers SET phone = '+15555550129' WHERE id = $1",
    'SELECT studio_private.manage_teacher_identity(\'15555550120\', \'+15555550120\', \'revoke\', $1)',
  ]) await rejectUnchanged(() => agent.query(sql, [enrolledId]), '42501');
  for (const sql of [
    "UPDATE studio_private.teachers SET first_name = 'Forged' WHERE id = $1",
    "UPDATE studio_private.teachers SET phone = '+15555550129' WHERE id = $1",
    'UPDATE studio_private.teachers SET access_enabled = false WHERE id = $1',
    "UPDATE studio_private.teachers SET created_by_phone = 'forged' WHERE id = $1",
  ]) await rejectUnchanged(() => migrator.query(sql, [enrolledId]), '42501');
  for (const sql of ['UPDATE studio_private.teacher_identity_changes SET changed_at = clock_timestamp()', 'DELETE FROM studio_private.teacher_identity_changes', 'TRUNCATE studio_private.teacher_identity_changes']) {
    await rejectUnchanged(() => migrator.query(sql), '42501');
  }

  // A revision-bound system context supplies ID and author from one row. An
  // invented profile name, sender argument, GUC or another backend cannot do so.
  const otherAgent = new Client(configs.agent);
  const otherBroker = new Client(configs.broker);
  await otherAgent.connect();
  await otherBroker.connect();
  try {
    const binding = await bind(agent, '15555550121');
    await migrator.query("UPDATE studio_private.author_context SET profile_name = 'Forged Profile' WHERE backend_pid = $1 AND transaction_id = $2", [binding.pid, binding.txid]);
    await agent.query("SELECT set_config('studio.sender_teacher_id', '999999', true), set_config('studio.is_manager', 'true', true)");
    assert.equal((await agent.query('SELECT app.current_sender_teacher_id() AS id')).rows[0].id, legacyId);
    await assert.rejects(otherAgent.query('SELECT app.current_sender_teacher_id()'), { code: '42501' });
    await assert.rejects(otherAgent.query('SELECT app.current_sender_teacher_id($1)', [enrolledId]), { code: '42883' });
    const author = (await agent.query("INSERT INTO app.clients (first_name, last_name, created_by_phone, created_by_name) VALUES ('Identity', 'TemporaryClient', 'forged', 'forged') RETURNING id, created_by_phone, created_by_name")).rows[0];
    assert.equal(author.created_by_phone, '15555550121');
    assert.equal(author.created_by_name, 'Synthetic InstructorOne');
    const training = (await agent.query("INSERT INTO app.training_rules (rule_text, created_by_name) VALUES ('Synthetic identity temporary rule', 'forged') RETURNING created_by_name")).rows[0];
    assert.equal(training.created_by_name, author.created_by_name);
    const attendance = (await agent.query("INSERT INTO app.attendance (client_id, lesson_date, start_time, outcome, created_by_name) VALUES ($1, '2020-01-02', '13:00', 'present', 'forged') RETURNING created_by_name", [author.id])).rows[0];
    assert.equal(attendance.created_by_name, author.created_by_name);
    const assignment = (await agent.query("INSERT INTO app.teacher_assignments (teacher_id, lesson_date, start_time, created_by_name) VALUES (app.current_sender_teacher_id(), '2099-02-03', '13:00', 'forged') RETURNING teacher_id, created_by_name")).rows[0];
    assert.equal(assignment.teacher_id, legacyId);
    assert.equal(assignment.created_by_name, author.created_by_name);
    await release(agent, binding);
    await assert.rejects(agent.query('SELECT app.current_sender_teacher_id()'), { code: '42501' });

    // Absent, invalid, expired and mismatched bindings fail closed.
    const ownPid = (await broker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    for (const [pid, txid, sender] of [[ownPid, '1', managerSender], [0, '1', managerSender], [ownPid, '0', managerSender], [null, '1', managerSender]]) {
      await assert.rejects(broker.query('SELECT studio_private.bind_teacher_identity($1, $2, $3)', [pid, txid, sender]), { code: '42501' });
    }
    for (const sender of ['', managerPhone, '+1 555 555 0120', 'invalid']) {
      await assert.rejects(resolve(sender), { code: '42501' });
    }
    for (const invalidation of ["expires_at = clock_timestamp() - interval '1 second'", 'identity_revision = identity_revision + 1', `sender_teacher_id = ${enrolledId}`]) {
      const invalid = await bind(agent, '15555550121');
      await migrator.query(`UPDATE studio_private.author_context SET ${invalidation} WHERE backend_pid = $1 AND transaction_id = $2`, [invalid.pid, invalid.txid]);
      await assert.rejects(agent.query('SELECT app.current_sender_teacher_id()'), { code: '42501' });
      await release(agent, invalid);
    }

    // A receipt installed before a confirmed revoke, re-enable, correction or
    // renumbering cannot authorize even the next data operation.
    const stale = await bind(agent, '15555550121');
    await mutate(broker, 'revoke', legacyId);
    assert.equal((await resolve('15555550121')).rows[0].access_enabled, false);
    await agent.query('SAVEPOINT revoked_sender');
    await assert.rejects(agent.query("INSERT INTO app.clients (first_name, last_name) VALUES ('Denied', 'Revoked')"), { code: '42501' });
    await agent.query('ROLLBACK TO SAVEPOINT revoked_sender');
    await rejectUnchanged(() => mutate(broker, 'revoke', legacyId), '23514');
    await otherAgent.query('BEGIN');
    const deniedBinding = (await otherAgent.query<Binding>('SELECT pg_backend_pid() AS pid, txid_current() AS txid')).rows[0];
    await assert.rejects(broker.query('SELECT studio_private.bind_teacher_identity($1, $2, $3)', [deniedBinding.pid, deniedBinding.txid, '15555550121']), { code: '42501' });
    await otherAgent.query('ROLLBACK');
    await mutate(broker, 'enable', legacyId);
    // Re-enabling the same phone must not revive the earlier authorization.
    await assert.rejects(agent.query('SELECT app.current_sender_teacher_id()'), { code: '42501' });
    await release(agent, stale);
    const staleName = await bind(agent, '15555550121');
    await mutate(broker, 'correct', legacyId, 'Corrected', 'InstructorSynthetic');
    await assert.rejects(agent.query('SELECT app.current_sender_teacher_id()'), { code: '42501' });
    await release(agent, staleName);
    const staleNumber = await bind(agent, '15555550121');
    await mutate(broker, 'change_phone', legacyId, null, null, '+15555550125');
    assert.equal((await resolve('15555550121')).rowCount, 0);
    assert.equal((await resolve('15555550125')).rows[0].id, legacyId);
    await assert.rejects(agent.query("INSERT INTO app.attendance (client_id, lesson_date, start_time, outcome) SELECT id, '2020-02-03', '13:00', 'present' FROM app.clients LIMIT 1"), { code: '42501' });
    await release(agent, staleNumber);
    const renamed = await bind(agent, '15555550125');
    const freshAuthor = (await agent.query("INSERT INTO app.clients (first_name, last_name) VALUES ('Identity', 'RenamedTemporary') RETURNING created_by_phone, created_by_name")).rows[0];
    assert.deepEqual(freshAuthor, { created_by_phone: '15555550125', created_by_name: 'Corrected InstructorSynthetic' });
    await release(agent, renamed);

    // Locks order the in-flight transaction before revoke confirmation. No
    // already completed operation is retroactively undone.
    const inFlight = await bind(agent, '15555550125');
    await agent.query('SELECT app.current_sender_teacher_id()');
    await otherBroker.query('BEGIN');
    await otherBroker.query("SET LOCAL statement_timeout = '10s'");
    const blockingPid = (await otherBroker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number;
    const pendingRevoke = mutate(otherBroker, 'revoke', legacyId).then(
      () => null, (error: { code?: string }) => error.code,
    );
    await waitForBlock(blockingPid);
    await release(agent, inFlight);
    assert.equal(await pendingRevoke, null);
    await otherBroker.query('COMMIT');
    assert.equal((await resolve('15555550125')).rows[0].access_enabled, false);
    await mutate(broker, 'enable', legacyId);

    // Unique phone and case-insensitive name constraints arbitrate actual
    // concurrent transactions, including equivalent formatted input.
    for (const conflict of ['phone', 'name']) {
      await broker.query('BEGIN');
      const phone = conflict === 'phone' ? '+15555550127' : '+15555550128';
      const first = conflict === 'phone' ? 'ConcurrentPhone' : 'ConcurrentName';
      await mutate(broker, 'enroll', null, first, 'SyntheticRace', phone);
      await otherBroker.query('BEGIN');
      await otherBroker.query("SET LOCAL statement_timeout = '10s'");
      const pending = mutate(otherBroker, 'enroll', null, conflict === 'name' ? first.toLowerCase() : 'OtherConcurrent', 'SyntheticRace', conflict === 'phone' ? '001 (555) 555-0127' : '+15555550129').then(
        () => 'unexpected success', (error: { code?: string }) => error.code,
      );
      await waitForBlock(blockingPid);
      await broker.query('COMMIT');
      assert.equal(await pending, '23505');
      await otherBroker.query('ROLLBACK');
      await assertClosed();
    }
  } finally {
    await agent.query('ROLLBACK');
    await broker.query('ROLLBACK');
    await otherAgent.end();
    await otherBroker.query('ROLLBACK');
    await otherBroker.end();
  }

  // A manager can correct their own name, but cannot turn a fake sender or
  // configuration mismatch into authority. The audit uses the old, current name.
  const auditBeforeSelf = (await migrator.query('SELECT count(*)::int AS n FROM studio_private.teacher_identity_changes')).rows[0].n;
  await mutate(broker, 'correct', manager.id, 'Corrected', 'ManagerSynthetic');
  const audit = (await migrator.query('SELECT * FROM studio_private.teacher_identity_changes ORDER BY id DESC LIMIT 1')).rows[0];
  assert.equal(audit.actor_teacher_id, manager.id);
  assert.equal(audit.actor_phone, managerSender);
  assert.equal(audit.actor_name, 'Legacy ManagerSynthetic');
  assert.equal(audit.operation, 'correct');
  assert.equal(audit.before_state.first_name, 'Legacy');
  assert.equal(audit.after_state.first_name, 'Corrected');
  assert.ok((audit.changed_at as Date).getTime() >= (manager.created_at as Date).getTime());
  assert.equal((await migrator.query('SELECT count(*)::int AS n FROM studio_private.teacher_identity_changes')).rows[0].n, auditBeforeSelf + 1);
  await rejectUnchanged(() => mutate(broker, 'enroll', null, 'Forged', 'Caller', '+15555550129', '15555550125'), '42501');
  await rejectUnchanged(() => mutate(broker, 'enroll', null, 'Old', 'Configuration', '+15555550129', managerSender, '+15555550125'), '42501');

  // A synthetic change of the trusted configuration can revoke the old manager.
  // This is a DB fixture in a rolled-back transaction, not a chat transfer flow.
  // A previously read manager identity is not sufficient at the next save, and
  // bootstrap cannot bypass revocation of an already registered phone.
  const beforeRevokedManager = await snapshot();
  await broker.query('BEGIN');
  await mutate(broker, 'revoke', manager.id, null, null, null, '15555550125', '+15555550125');
  for (const query of [
    () => list(),
    () => mutate(broker, 'enroll', null, 'Stale', 'Manager', '+15555550129'),
    () => mutate(broker, 'bootstrap', null, 'Corrected', 'ManagerSynthetic', managerPhone),
  ]) {
    await broker.query('SAVEPOINT revoked_manager');
    await assert.rejects(query(), { code: '42501' });
    await broker.query('ROLLBACK TO SAVEPOINT revoked_manager');
  }
  await broker.query('ROLLBACK');
  assert.deepEqual(await snapshot(), beforeRevokedManager);

  for (const table of ['teachers', 'teacher_identity_changes']) {
    for (const action of ['DELETE FROM', 'TRUNCATE']) {
      await assert.rejects(migrator.query(`${action} studio_private.${table}${action === 'TRUNCATE' ? ' CASCADE' : ''}`), { code: '42501' });
    }
  }
  // Every preexisting entity, relation and snapshot is unchanged except the
  // explicitly corrected current name of the chosen teacher.
  const after = await readTeacherState(agent);
  for (const table of ['teacher_rules', 'teacher_rule_intervals', 'teacher_assignments']) assert.deepEqual(after[table], oldView[table]);
  for (const [table, rows] of Object.entries(studioBefore)) {
    assert.deepEqual((await migrator.query(`SELECT * FROM app.${table} ORDER BY 1, 2`)).rows, rows);
  }
  for (const person of oldView.teachers as Array<Record<string, unknown>>) {
    const current = (await migrator.query('SELECT id, created_at, created_by_phone, created_by_name FROM studio_private.teachers WHERE id = $1', [person.id])).rows[0];
    assert.deepEqual(current, { id: person.id, created_at: person.created_at, created_by_phone: person.created_by_phone, created_by_name: person.created_by_name });
  }
  const changes = (await migrator.query('SELECT * FROM studio_private.teacher_identity_changes ORDER BY id')).rows;
  const latest = new Map<string, Record<string, unknown>>();
  for (const change of changes) {
    assert.equal(change.actor_teacher_id, manager.id);
    assert.equal(change.actor_phone, managerSender);
    assert.equal(change.after_state.identity_revision, change.before_state ? change.before_state.identity_revision + 1 : 1);
    latest.set(change.teacher_id, change.after_state as Record<string, unknown>);
  }
  for (const [id, recorded] of latest) {
    const actual = (await migrator.query('SELECT studio_private.identity_state(t) AS state FROM studio_private.teachers t WHERE id = $1', [id])).rows[0].state;
    assert.deepEqual(actual, recorded, 'Every current managed state must match its immutable audit');
  }
  await assertClosed();
}
