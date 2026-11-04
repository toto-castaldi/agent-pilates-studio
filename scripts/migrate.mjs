import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

try {
  process.loadEnvFile();
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const secretsDir = resolve(process.env.SECRETS_DIR ?? '.local/secrets');
const password = (await readFile(resolve(secretsDir, 'db-migrator'), 'utf8')).trim();
if (!password) throw new Error('The migration password file is empty.');
const port = process.env.POSTGRES_PORT ?? '55432';
if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
  throw new Error('POSTGRES_PORT must be a valid TCP port.');
}
const url = new URL(`postgresql://127.0.0.1:${port}/studio?schema=public`);
url.username = 'studio_migrator';
url.password = password;

const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
  env: { ...process.env, DATABASE_URL: url.toString() },
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
