import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { startLocal } from './start-local-core.mjs';

process.exitCode = await startLocal({
  lstat, mkdir, open, readFile, rename, unlink, writeFile, randomBytes, spawnSync,
  processEnv: process.env, execPath: process.execPath,
  log: console.log, errorLog: console.error,
});
