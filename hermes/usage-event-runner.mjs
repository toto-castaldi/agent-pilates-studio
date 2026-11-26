import { buildUsageEvent } from './usage-event.ts';
let input = '';
for await (const chunk of process.stdin) input += chunk;
try {
  process.stdout.write(JSON.stringify(buildUsageEvent(JSON.parse(input))));
} catch { process.exitCode = 1; }
