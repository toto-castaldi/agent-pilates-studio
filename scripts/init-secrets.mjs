import { randomBytes } from 'node:crypto';
import { lstat, mkdir, writeFile } from 'node:fs/promises';
import { initSecrets } from './init-secrets-core.mjs';

try {
  process.loadEnvFile();
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

await initSecrets({ directory: process.env.SECRETS_DIR, lstat, mkdir, writeFile, randomBytes, log: console.log });
