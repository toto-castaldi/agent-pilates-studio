import { dirname, resolve } from 'node:path';

type Entry = { directory: boolean; mode: number; content: string; target?: string };

export function memorySystem() {
  const entries = new Map<string, Entry>();
  const key = (path: string) => resolve(path);
  const fail = (code: string): never => { throw Object.assign(new Error(code), { code }); };
  let random = 0;
  const logs: string[] = [];
  const errors: string[] = [];
  const calls: { command: string; args: string[]; env: Record<string, string>; stdio: string | string[] }[] = [];
  let failedCommand = '';
  return {
    entries, logs, errors, calls,
    put(path: string, content: string, mode = 0o600) { entries.set(key(path), { directory: false, mode, content }); },
    link(path: string, target: string) { entries.set(key(path), { directory: false, mode: 0o777, content: '', target }); },
    mode(path: string, mode: number) { const entry = entries.get(key(path)); if (!entry) fail('ENOENT'); else entry.mode = mode; },
    content(path: string) { return entries.get(key(path))?.content; },
    failCommand(command: string) { failedCommand = command; },
    async mkdir(path: string, options: { mode: number }) { if (!entries.has(key(path))) entries.set(key(path), { directory: true, mode: options.mode, content: '' }); },
    async lstat(path: string) { const entry = entries.get(key(path)); if (!entry) return fail('ENOENT'); return { mode: entry.mode, isFile: () => !entry.directory && !entry.target, isDirectory: () => entry.directory && !entry.target }; },
    async open(path: string) {
      let current = key(path);
      let entry = entries.get(current);
      for (let links = 0; entry?.target; links++) {
        if (links >= 40) return fail('ELOOP');
        current = resolve(dirname(current), entry.target);
        entry = entries.get(current);
      }
      if (!entry) return fail('ENOENT');
      const opened = entry;
      return {
        async stat() { return { mode: opened.mode, isFile: () => !opened.directory }; },
        async readFile() { return opened.content; },
        async close() {},
      };
    },
    async readFile(path: string) { const entry = entries.get(key(path)); if (!entry) return fail('ENOENT'); return entry.content; },
    async writeFile(path: string, content: string, options: { mode: number; flag: string }) { if (options.flag === 'wx' && entries.has(key(path))) return fail('EEXIST'); entries.set(key(path), { directory: false, mode: options.mode, content }); },
    async rename(from: string, to: string) { const entry = entries.get(key(from)); if (!entry) return fail('ENOENT'); entries.set(key(to), entry); entries.delete(key(from)); },
    async unlink(path: string) { if (!entries.delete(key(path))) return fail('ENOENT'); },
    randomBytes() { random += 1; return Buffer.from(random.toString(16).padStart(64, '0'), 'hex'); },
    spawnSync(command: string, args: string[], options: { env: Record<string, string>; stdio: string | string[] }) {
      calls.push({ command, args, ...options });
      return { status: command === failedCommand || args.includes(failedCommand) ? 1 : 0,
        stdout: args.includes('config') ? JSON.stringify({ volumes: { postgres_data: { name: 'synthetic_postgres_data' } } }) : args.includes('ps') || args.includes('--use-aliases') ? 'synthetic-container\n' : '' };
    },
    processEnv: { PATH: '/synthetic', DB_ADMIN_PASSWORD: 'must-remove' }, execPath: 'node',
    log(message: string) { logs.push(message); }, errorLog(message: string) { errors.push(message); },
  };
}
