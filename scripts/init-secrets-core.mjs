import { resolve } from 'node:path';

export async function initSecrets({ directory: configuredDirectory, lstat, mkdir, writeFile, randomBytes, log }) {
  const directory = resolve(configuredDirectory ?? '.local/secrets');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (!info.isDirectory() || (info.mode & 0o077) !== 0) {
    throw new Error('The secrets directory must not be accessible to group or other users.');
  }

  for (const name of ['db-admin', 'db-migrator', 'db-agent', 'db-broker', 'bridge-token', 'whatsapp-verify-token']) {
    try {
      await writeFile(resolve(directory, name), `${randomBytes(32).toString('hex')}\n`, {
        flag: 'wx',
        mode: 0o600,
      });
      log(`Created ${name}.`);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const existing = await lstat(resolve(directory, name));
      if (!existing.isFile() || (existing.mode & 0o077) !== 0) {
        throw new Error(`${name} must be a private regular file.`);
      }
      log(`Kept existing ${name}.`);
    }
  }
}
