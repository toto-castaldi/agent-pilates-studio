import { managementTransition } from './identity-flow.ts';
let input = '';
for await (const chunk of process.stdin) input += chunk;
try {
  process.stdout.write(JSON.stringify(managementTransition(JSON.parse(input))));
} catch { process.exitCode = 1; }
