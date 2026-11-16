import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from 'pg';

// First migration of the unified sender identity (TEC-042). Earlier schemas
// still accept the previous runtime's incomplete teachers and contexts.
export const UNIFIED_IDENTITY_MIGRATION = '20261117000000_unified_sender_identity';

export interface SeedPerson { first: string; last: string; phone: string; revoked?: boolean }

// Identities are created only through the trusted broker login and the guided
// management functions, exactly as /anagrafica does: no trigger is disabled,
// no row is written directly and no operator CLI is introduced. Phones are
// international digits as received from the webhook (without '+').
export async function seedIdentities(connection: { host: string; port?: number; password: string },
  manager: SeedPerson, people: SeedPerson[] = []): Promise<Record<string, string>> {
  const broker = new Client({ host: connection.host, port: connection.port ?? 5432, database: 'studio', user: 'studio_broker', password: connection.password });
  await broker.connect();
  try {
    const mutate = async (operation: string, id: string | null, first: string | null, last: string | null, phone: string | null) =>
      String((await broker.query('SELECT * FROM studio_private.manage_teacher_identity($1, $2, $3, $4, $5, $6, $7)',
        [manager.phone, `+${manager.phone}`, operation, id, first, last, phone])).rows[0].id);
    const ids: Record<string, string> = {};
    const existing = (await broker.query('SELECT * FROM studio_private.resolve_teacher_identity($1)', [manager.phone])).rows[0];
    ids[manager.phone] = existing ? String(existing.id) : await mutate('bootstrap', null, manager.first, manager.last, `+${manager.phone}`);
    for (const person of people) {
      ids[person.phone] = await mutate('enroll', null, person.first, person.last, `+${person.phone}`);
      if (person.revoked) await mutate('revoke', ids[person.phone], null, null, null);
    }
    return ids;
  } finally {
    await broker.end();
  }
}

// Applies the migrations before the unified identity, lets the caller create
// pre-transition data with the previous runtime's contexts, then applies the
// rest. Used to prove the transition on data that existed before it.
export async function migrateAcrossTransition(env: NodeJS.ProcessEnv, url: URL,
  before: () => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'pilates-staged-migrations-'));
  try {
    const staged = join(directory, 'migrations');
    await cp('prisma/migrations/migration_lock.toml', join(staged, 'migration_lock.toml'));
    for (const name of (await readdir('prisma/migrations')).sort()) {
      if (/^\d{14}_/.test(name) && name < UNIFIED_IDENTITY_MIGRATION) {
        await cp(join('prisma/migrations', name), join(staged, name), { recursive: true });
      }
    }
    const config = join(directory, 'staged.config.mjs');
    await writeFile(config, `export default { schema: ${JSON.stringify(resolve('prisma/schema.prisma'))}, migrations: { path: ${JSON.stringify(staged)} }, datasource: { url: process.env.DATABASE_URL } };\n`);
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--config', config],
      { env: { ...env, DATABASE_URL: url.toString() }, stdio: 'pipe', timeout: 90_000 });
    await before();
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
      { env: { ...env, DATABASE_URL: url.toString() }, stdio: 'pipe', timeout: 90_000 });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

// A previous-runtime context: installed by the migration owner on a schema
// that still predates the unified identity, never after the transition.
export async function legacyContext(client: Client, sender: string, profile: string | null): Promise<void> {
  await client.query("INSERT INTO studio_private.author_context (backend_pid, transaction_id, sender, profile_name, expires_at) VALUES (pg_backend_pid(), txid_current(), $1, $2, clock_timestamp() + interval '60 seconds')", [sender, profile]);
}
