import type { Client } from 'pg';

export async function readIdentityState(connection: Client): Promise<Record<string, unknown[]>> {
  const state: Record<string, unknown[]> = {};
  for (const table of ['teachers', 'teacher_identity_changes', 'teacher_identity_writes']) {
    const order = table === 'teacher_identity_writes' ? 'backend_pid, transaction_id' : 'id';
    state[table] = (await connection.query(`SELECT * FROM studio_private.${table} ORDER BY ${order}`)).rows;
  }
  return state;
}

// The trusted DB login is exercised directly, with synthetic configuration, not
// via a new runtime path or an operator enrollment CLI. No fixture bypasses the
// management functions, author triggers or identity constraints.
export async function seedIdentityDirectory(broker: Client, legacyId: string): Promise<{ managerId: string; enrolledId: string }> {
  const mutate = (operation: string, id: string | null = null, first: string | null = null,
    last: string | null = null, phone: string | null = null) => broker.query(
    'SELECT * FROM studio_private.manage_teacher_identity($1, $2, $3, $4, $5, $6, $7)',
    ['15555550120', '+15555550120', operation, id, first, last, phone],
  );
  const managerId = (await mutate('bootstrap', null, 'Identity', 'SyntheticManager', '+15555550120')).rows[0].id as string;
  await mutate('complete', legacyId, null, null, '+15555550121');
  const enrolledId = (await mutate('enroll', null, 'Identity', 'SyntheticTeacher', '+15555550123')).rows[0].id as string;
  await mutate('revoke', enrolledId);
  await mutate('change_phone', enrolledId, null, null, '+15555550124');
  return { managerId, enrolledId };
}
