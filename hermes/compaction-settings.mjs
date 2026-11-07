// Prints only "<threshold-tokens> <idle-seconds>" for the entrypoint. Errors are
// deliberately silent: the caller emits a fixed preflight event.
import { resolveCompaction } from './compaction-policy.mjs';

try {
  const { threshold, idle } = await resolveCompaction({ env: process.env, fetch });
  process.stdout.write(`${threshold} ${idle}\n`);
} catch {
  process.exitCode = 1;
}
