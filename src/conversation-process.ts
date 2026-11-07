import { execFile } from 'node:child_process';

// The host relay must keep servicing requests while Compose waits for health.
// Child output is captured and never printed by this helper.
export function runProcess(command: string, args: string[], env: NodeJS.ProcessEnv, timeout: number): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { env, timeout }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
