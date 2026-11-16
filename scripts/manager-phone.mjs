// The single manager number of the private configuration (ADR-003). Same
// policy as normalizeInternationalPhone and the SQL constraint: an explicit
// international prefix (+ or 00), common separators, 8-15 digits, no country
// assumed. Callers must never include the rejected value in errors or logs.
export function normalizeManagerPhone(value) {
  if (typeof value !== 'string' || [...value].length > 80) throw new Error('Invalid manager phone');
  let canonical = value.replace(/[ ().\u00a0\u202f-]/gu, '');
  if (canonical.startsWith('00')) canonical = `+${canonical.slice(2)}`;
  if (!/^\+[1-9][0-9]{7,14}$/u.test(canonical)) throw new Error('Invalid manager phone');
  return canonical;
}

// Former identity sources: they authorize nobody and must not linger in .env.
export const OBSOLETE_IDENTITY_KEYS = ['WHATSAPP_ALLOWED_USERS', 'WHATSAPP_HOME_CHANNEL', 'WHATSAPP_TEACHER_LINKS'];
// Former private files generated from those keys; no longer mounted anywhere.
export const OBSOLETE_IDENTITY_FILES = ['whatsapp-allowed-users', 'whatsapp-home-channel', 'whatsapp-teacher-links'];
