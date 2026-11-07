import { spawnSync } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import { diagnoseVoice } from './voice-diagnose-core.mjs';

process.exitCode = await diagnoseVoice({
  lstat, readFile, spawnSync,
  env: process.env, uid: process.getuid(),
  log: console.log,
});
