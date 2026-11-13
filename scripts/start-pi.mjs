#!/usr/bin/env node
import { constants, lstatSync, openSync, closeSync, readFileSync, writeFileSync, fsyncSync, renameSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { synchronizeWorkflow } from '../src/pi-workflow.ts';

// Run from the project root. Never inspect the agent directory or print raw errors.
const directory = join(process.cwd(), '.pi');
const target = join(directory, 'settings.json');
let temporary;
try {
  const parent = lstatSync(directory);
  if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o022)) throw new Error();
  let previous;
  try { previous = lstatSync(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (previous && (!previous.isFile() || previous.isSymbolicLink() || previous.nlink !== 1)) throw new Error();
  let settings = {};
  if (previous) {
    const fd = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try { settings = JSON.parse(readFileSync(fd, 'utf8')); } finally { closeSync(fd); }
  }
  const manifest = JSON.parse(readFileSync(join(directory, 'workflow.json'), 'utf8'));
  const merged = synchronizeWorkflow(manifest, settings);
  if (!previous || merged.changed) {
    temporary = join(directory, `.settings-${randomUUID()}.tmp`);
    const fd = openSync(temporary, 'wx', 0o600);
    try { writeFileSync(fd, `${JSON.stringify(merged.settings, null, 2)}\n`); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temporary, target);
    temporary = undefined;
  }
} catch {
  if (temporary) { try { unlinkSync(temporary); } catch { /* Best effort, no personal diagnostics. */ } }
  console.error('Preparazione Pi impossibile: verificare manifest, settings e percorsi locali.');
  process.exit(1);
}
const child = spawn('pi', process.argv.slice(2), { stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => child.kill(signal));
child.on('error', () => { console.error('Avvio Pi impossibile. Verificare Pi nel PATH.'); process.exitCode = 1; });
child.on('exit', (code, signal) => {
  if (signal) {
    process.removeAllListeners(signal);
    process.kill(process.pid, signal);
  }
  else process.exitCode = code ?? 1;
});
