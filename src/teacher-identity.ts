// Pure input policies for the trusted management path. These functions
// confer no authority: PostgreSQL revalidates inputs and the manager proof.
export function normalizeInternationalPhone(value: unknown): string {
  if (typeof value !== 'string' || [...value].length > 80) throw new Error('Invalid international phone');
  let canonical = value.replace(/[ ().\u00a0\u202f-]/gu, '');
  if (canonical.startsWith('00')) canonical = `+${canonical.slice(2)}`;
  if (!/^\+[1-9][0-9]{7,14}$/u.test(canonical)) throw new Error('Invalid international phone');
  return canonical;
}

export function normalizeIdentityName(value: unknown): string {
  if (typeof value !== 'string' || [...value].length > 512 || /\p{Cc}/u.test(value)) throw new Error('Invalid identity name');
  const clean = value.replace(/[\u00a0\u202f]/gu, ' ').replace(/^ +| +$/gu, '').replace(/ +/gu, ' ');
  if (!clean || [...clean].length > 200) throw new Error('Invalid identity name');
  return clean;
}

export type IdentityOperation = 'bootstrap' | 'enroll' | 'complete' | 'correct' | 'change_phone' | 'revoke' | 'enable';
export interface IdentityDraft {
  operation: IdentityOperation;
  teacherId: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
}

export function normalizeIdentityDraft(value: unknown): IdentityDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid identity operation');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !['operation', 'teacherId', 'firstName', 'lastName', 'phone'].includes(key))) {
    throw new Error('Unexpected identity fields');
  }
  const operations: IdentityOperation[] = ['bootstrap', 'enroll', 'complete', 'correct', 'change_phone', 'revoke', 'enable'];
  if (!operations.includes(input.operation as IdentityOperation)) throw new Error('Invalid identity operation');
  const operation = input.operation as IdentityOperation;
  const teacherId = input.teacherId ?? null;
  if (teacherId !== null && (typeof teacherId !== 'string' || !/^[1-9][0-9]{0,18}$/u.test(teacherId)
    || BigInt(teacherId) > 9_223_372_036_854_775_807n)) throw new Error('Invalid identity target');
  if ((operation === 'enroll' && teacherId !== null)
    || (!['bootstrap', 'enroll'].includes(operation) && teacherId === null)) throw new Error('Invalid identity target');
  const needsNames = ['bootstrap', 'enroll', 'correct'].includes(operation);
  const needsPhone = ['bootstrap', 'enroll', 'complete', 'change_phone'].includes(operation);
  if ((!needsNames && (input.firstName != null || input.lastName != null))
    || (!needsPhone && input.phone != null)) throw new Error('Unexpected identity fields');
  return {
    operation, teacherId,
    firstName: needsNames ? normalizeIdentityName(input.firstName) : null,
    lastName: needsNames ? normalizeIdentityName(input.lastName) : null,
    phone: needsPhone ? normalizeInternationalPhone(input.phone) : null,
  };
}
