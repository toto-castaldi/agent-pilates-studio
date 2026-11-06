import { resolve } from 'node:path';

type Entry = { directory: boolean; mode: number; content: string };

export function memorySystem() {
  const entries = new Map<string, Entry>();
  const key = (path: string) => resolve(path);
  const fail = (code: string): never => { throw Object.assign(new Error(code), { code }); };
  let random = 0;
  const logs: string[] = [];
  const errors: string[] = [];
  const calls: { command: string; args: string[]; env: Record<string, string>; stdio: string }[] = [];
  let failedCommand = '';
  return {
    entries, logs, errors, calls,
    put(path: string, content: string, mode = 0o600) { entries.set(key(path), { directory: false, mode, content }); },
    mode(path: string, mode: number) { const entry = entries.get(key(path)); if (!entry) fail('ENOENT'); else entry.mode = mode; },
    content(path: string) { return entries.get(key(path))?.content; },
    failCommand(command: string) { failedCommand = command; },
    async mkdir(path: string, options: { mode: number }) { if (!entries.has(key(path))) entries.set(key(path), { directory: true, mode: options.mode, content: '' }); },
    async lstat(path: string) { const entry = entries.get(key(path)); if (!entry) return fail('ENOENT'); return { mode: entry.mode, isFile: () => !entry.directory, isDirectory: () => entry.directory }; },
    async readFile(path: string) { const entry = entries.get(key(path)); if (!entry) return fail('ENOENT'); return entry.content; },
    async writeFile(path: string, content: string, options: { mode: number; flag: string }) { if (options.flag === 'wx' && entries.has(key(path))) return fail('EEXIST'); entries.set(key(path), { directory: false, mode: options.mode, content }); },
    randomBytes() { random += 1; return Buffer.from(random.toString(16).padStart(64, '0'), 'hex'); },
    spawnSync(command: string, args: string[], options: { env: Record<string, string>; stdio: string }) { calls.push({ command, args, ...options }); return { status: command === failedCommand || args.includes(failedCommand) ? 1 : 0 }; },
    processEnv: { PATH: '/synthetic', DB_ADMIN_PASSWORD: 'must-remove' }, execPath: 'node',
    log(message: string) { logs.push(message); }, errorLog(message: string) { errors.push(message); },
  };
}
