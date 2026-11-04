import { randomBytes } from 'node:crypto';
import { lstat, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

try {
  process.loadEnvFile();
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const directory = resolve(process.env.SECRETS_DIR ?? '.local/secrets');
await mkdir(directory, { recursive: true, mode: 0o700 });
const info = await lstat(directory);
if (!info.isDirectory() || (info.mode & 0o077) !== 0) {
  throw new Error('The secrets directory must not be accessible to group or other users.');
}

for (const name of ['db-admin', 'db-migrator', 'db-agent', 'whatsapp-verify-token']) {
  try {
    await writeFile(resolve(directory, name), `${randomBytes(32).toString('hex')}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
    console.log(`Created ${name}.`);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = await lstat(resolve(directory, name));
    if (!existing.isFile() || (existing.mode & 0o077) !== 0) {
      throw new Error(`${name} must be a private regular file.`);
    }
    console.log(`Kept existing ${name}.`);
  }
}
