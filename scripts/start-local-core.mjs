import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

class SafeError extends Error {}

export async function startLocal({ lstat, mkdir, readFile, writeFile, randomBytes, spawnSync, processEnv, execPath, log, errorLog }) {
  // Never print subprocess output: Compose, Prisma and npm may include sensitive data.
  function run(command, args, env, stage) {
    log(stage);
    const result = spawnSync(command, args, { env, stdio: 'ignore' });
    if (result.error || result.status !== 0) throw new SafeError(`${stage}: operazione fallita.`);
  }

  async function privateFile(path) {
    const info = await lstat(path);
    if (!info.isFile() || (info.mode & 0o077) !== 0) throw new SafeError('Un file di configurazione o segreto non è privato.');
  }

  try {
    await privateFile('.env');
    const config = parseEnv(await readFile('.env', 'utf8'));
    const required = {
      DB_ADMIN_PASSWORD: 'db-admin',
      DB_MIGRATOR_PASSWORD: 'db-migrator',
      DB_AGENT_PASSWORD: 'db-agent',
      OPENROUTER_API_KEY: 'openrouter-key',
      WHATSAPP_ACCESS_TOKEN: 'whatsapp-access-token',
      WHATSAPP_APP_SECRET: 'whatsapp-app-secret',
      WHATSAPP_VERIFY_TOKEN: 'whatsapp-verify-token',
      WHATSAPP_ALLOWED_USERS: 'whatsapp-allowed-users',
      WHATSAPP_PHONE_NUMBER_ID: 'whatsapp-phone-number-id',
    };
    for (const key of Object.keys(required)) {
      const value = config[key];
      if (!value || value !== value.trim() || /[\r\n\0]/.test(value) || value === 'DA_COMPILARE') {
        throw new SafeError(`Configurazione mancante o non valida: ${key}.`);
      }
    }
    const passwords = [config.DB_ADMIN_PASSWORD, config.DB_MIGRATOR_PASSWORD, config.DB_AGENT_PASSWORD];
    if (passwords.some((password) => password.length < 16) || new Set(passwords).size !== 3) {
      throw new SafeError('Le tre password database devono essere distinte e lunghe almeno 16 caratteri.');
    }
    if (!/^\d+(,\d+)*$/.test(config.WHATSAPP_ALLOWED_USERS) || !/^\d+$/.test(config.WHATSAPP_PHONE_NUMBER_ID)) {
      throw new SafeError('Allowlist o Phone Number ID non validi.');
    }
    const port = (name, fallback) => {
      const value = config[name] || fallback;
      if (!/^\d{1,5}$/.test(value) || Number(value) < 1 || Number(value) > 65535) throw new SafeError(`${name} non valida.`);
      return value;
    };
    const postgresPort = port('POSTGRES_PORT', '55432');
    const webhookPort = port('WHATSAPP_WEBHOOK_PORT', '18090');
    const webhookPath = config.WHATSAPP_WEBHOOK_PATH || '/whatsapp/webhook';
    const model = config.PILATES_MODEL || 'openai/gpt-6.1-terra';
    if (!/^\/[A-Za-z0-9/_-]+$/.test(webhookPath) || webhookPath === '/health' || !/^[A-Za-z0-9._/-]+$/.test(model)) {
      throw new SafeError('Percorso webhook o modello non valido.');
    }
    const directory = resolve(config.SECRETS_DIR || '.local/secrets');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const info = await lstat(directory);
    if (!info.isDirectory() || (info.mode & 0o077) !== 0) throw new SafeError('La directory dei segreti deve essere privata.');
    // Check all existing files before creating any: never silently rotate credentials.
    for (const [key, name] of Object.entries(required)) {
      const path = resolve(directory, name);
      try {
        await privateFile(path);
        if ((await readFile(path, 'utf8')).trim() !== config[key]) throw new SafeError(`Il segreto esistente ${name} non corrisponde a .env.`);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    for (const [key, name] of Object.entries(required)) {
      try {
        await writeFile(resolve(directory, name), `${config[key]}\n`, { mode: 0o600, flag: 'wx' });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        await privateFile(resolve(directory, name));
        if ((await readFile(resolve(directory, name), 'utf8')).trim() !== config[key]) throw new SafeError('Un segreto è cambiato durante l’avvio.');
      }
    }
    // Additional service credentials are generated once and never silently rotated.
    for (const name of ['db-broker', 'bridge-token']) {
      const path = resolve(directory, name);
      try {
        await writeFile(path, `${randomBytes(32).toString('hex')}\n`, { mode: 0o600, flag: 'wx' });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
      await privateFile(path);
      const value = (await readFile(path, 'utf8')).trim();
      if (!/^[a-f0-9]{64}$/.test(value) || passwords.includes(value)) throw new SafeError(`Segreto non valido: ${name}.`);
      passwords.push(value);
    }
    // Compose receives only non-secret configuration; .env is not interpolated by Compose.
    const env = { ...processEnv, SECRETS_DIR: directory, POSTGRES_PORT: postgresPort, WHATSAPP_WEBHOOK_PORT: webhookPort, WHATSAPP_WEBHOOK_PATH: webhookPath, PILATES_MODEL: model };
    for (const key of Object.keys(required)) delete env[key];
    const compose = (...args) => ['compose', '--env-file', '/dev/null', ...args];
    run('npm', ['ci'], env, 'Installazione dipendenze');
    run('docker', compose('up', '-d', '--wait', '--wait-timeout', '120', 'postgres'), env, 'Avvio PostgreSQL');
    run('docker', compose('run', '--rm', 'db-bootstrap'), env, 'Inizializzazione ruoli');
    const url = new URL(`postgresql://127.0.0.1:${postgresPort}/studio?schema=public`);
    url.username = 'studio_migrator';
    url.password = config.DB_MIGRATOR_PASSWORD;
    run(execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { ...env, DATABASE_URL: url.toString() }, 'Migrazioni');
    run('docker', compose('up', '-d', '--build', '--wait', '--wait-timeout', '180', 'hermes'), env, 'Avvio Hermes');
    log('PostgreSQL e Hermes sono sani. La raggiungibilità pubblica non è verificata.');
    return 0;
  } catch (error) {
    // Only our fixed validation messages are safe; system errors may contain sensitive paths.
    const safe = error instanceof SafeError ? error.message : 'Impossibile leggere o preparare la configurazione privata.';
    errorLog(`Avvio non riuscito: ${safe}`);
    return 1;
  }
}
