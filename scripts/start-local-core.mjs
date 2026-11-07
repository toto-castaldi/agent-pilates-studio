import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { idleSeconds } from './compaction-policy.mjs';

class SafeError extends Error {}

export async function startLocal({ lstat, mkdir, open, readFile, rename, unlink, writeFile, randomBytes, spawnSync, processEnv, execPath, log, errorLog }) {
  let cleanupEnv;
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
    // Check and read the same opened file, even when .env is a symlink.
    // Nonblocking open prevents a FIFO target from hanging the startup.
    const file = await open('.env', constants.O_RDONLY | constants.O_NONBLOCK);
    let contents;
    try {
      const info = await file.stat();
      if (!info.isFile() || (info.mode & 0o077) !== 0) throw new SafeError('Un file di configurazione o segreto non è privato.');
      contents = await file.readFile('utf8');
    } finally {
      await file.close();
    }
    const config = parseEnv(contents);
    const required = {
      DB_ADMIN_PASSWORD: 'db-admin',
      DB_MIGRATOR_PASSWORD: 'db-migrator',
      DB_AGENT_PASSWORD: 'db-agent',
      OPENROUTER_API_KEY: 'openrouter-key',
      WHATSAPP_ACCESS_TOKEN: 'whatsapp-access-token',
      WHATSAPP_APP_SECRET: 'whatsapp-app-secret',
      WHATSAPP_VERIFY_TOKEN: 'whatsapp-verify-token',
      WHATSAPP_ALLOWED_USERS: 'whatsapp-allowed-users',
      WHATSAPP_HOME_CHANNEL: 'whatsapp-home-channel',
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
    if (!/^\d+$/.test(config.WHATSAPP_HOME_CHANNEL) || !config.WHATSAPP_ALLOWED_USERS.split(',').includes(config.WHATSAPP_HOME_CHANNEL)) {
      throw new SafeError('Canale home WhatsApp mancante o non autorizzato.');
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
    let idle;
    try {
      idle = idleSeconds(config.PILATES_IDLE_COMPACT_SECONDS);
    } catch {
      throw new SafeError('PILATES_IDLE_COMPACT_SECONDS non valido: indicare secondi interi positivi.');
    }
    const directory = resolve(config.SECRETS_DIR || '.local/secrets');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const info = await lstat(directory);
    if (!info.isDirectory() || (info.mode & 0o077) !== 0) throw new SafeError('La directory dei segreti deve essere privata.');
    // Validate every existing file before touching services or configuration.
    // Database passwords cannot be changed by this command.
    const databaseKeys = new Set(['DB_ADMIN_PASSWORD', 'DB_MIGRATOR_PASSWORD', 'DB_AGENT_PASSWORD']);
    let missingDatabaseFile = false;
    for (const [key, name] of Object.entries(required)) {
      const path = resolve(directory, name);
      try {
        await privateFile(path);
        if (databaseKeys.has(key) && (await readFile(path, 'utf8')).trim() !== config[key]) {
          throw new SafeError(`Il segreto esistente ${name} non corrisponde a .env.`);
        }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        if (databaseKeys.has(key)) missingDatabaseFile = true;
      }
    }
    const env = { ...processEnv, SECRETS_DIR: directory, POSTGRES_PORT: postgresPort, WHATSAPP_WEBHOOK_PORT: webhookPort, WHATSAPP_WEBHOOK_PATH: webhookPath, PILATES_MODEL: model, PILATES_IDLE_COMPACT_SECONDS: String(idle) };
    for (const key of Object.keys(required)) delete env[key];
    const compose = (...args) => ['compose', '--env-file', '/dev/null', ...args];
    // Never reconstruct missing internal credentials over an existing volume.
    for (const name of ['db-broker', 'bridge-token']) {
      try { await privateFile(resolve(directory, name)); } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        missingDatabaseFile = true;
      }
    }
    const resolved = spawnSync('docker', compose('config', '--format', 'json'), { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (resolved.error || resolved.status !== 0) throw new SafeError('Impossibile verificare il volume PostgreSQL.');
    let volume;
    try { volume = JSON.parse(resolved.stdout).volumes.postgres_data.name; } catch { throw new SafeError('Impossibile verificare il volume PostgreSQL.'); }
    if (typeof volume !== 'string' || !volume) throw new SafeError('Impossibile verificare il volume PostgreSQL.');
    const volumes = spawnSync('docker', ['volume', 'ls', '--quiet'], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (volumes.error || volumes.status !== 0 || typeof volumes.stdout !== 'string') throw new SafeError('Impossibile verificare il volume PostgreSQL.');
    const existingVolume = volumes.stdout.split(/\r?\n/).includes(volume);
    if (existingVolume && missingDatabaseFile) throw new SafeError('Segreto database mancante con volume PostgreSQL esistente: ripristinare le credenziali.');
    if (existingVolume) {
      // Do not apply new port or mount settings before verifying database passwords.
      // If Compose has no PostgreSQL container, use a temporary one without host ports.
      const existing = spawnSync('docker', compose('ps', '--all', '--quiet', 'postgres'), { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      if (existing.error || existing.status !== 0 || typeof existing.stdout !== 'string') throw new SafeError('Impossibile verificare PostgreSQL.');
      let container = existing.stdout.trim();
      let temporary = false;
      if (container) {
        run('docker', compose('start', 'postgres'), env, 'Verifica PostgreSQL');
      } else {
        const started = spawnSync('docker', compose('run', '-d', '--no-deps', '--use-aliases', 'postgres'), { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        if (started.error || started.status !== 0 || typeof started.stdout !== 'string' || !started.stdout.trim()) throw new SafeError('Impossibile verificare PostgreSQL.');
        container = started.stdout.trim();
        temporary = true;
      }
      let failure;
      try {
        let ready = false;
        for (let attempt = 0; attempt < 120; attempt++) {
          const result = spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'studio_admin', '-d', 'studio'], { env, stdio: 'ignore' });
          if (!result.error && result.status === 0) { ready = true; break; }
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000));
        }
        if (!ready) throw new SafeError('Verifica PostgreSQL: servizio non disponibile.');
        // Bootstrap resets role passwords. Authenticate all roles first.
        const probe = 'set -eu; export PGHOST=postgres PGPORT=5432 PGDATABASE=studio PGCONNECT_TIMEOUT=5; for pair in studio_admin:db_admin studio_migrator:db_migrator studio_agent:db_agent studio_broker:db_broker; do PGUSER=$(echo "$pair" | cut -d: -f1); file=$(echo "$pair" | cut -d: -f2); PGPASSWORD=$(cat "/run/secrets/$file"); export PGUSER PGPASSWORD; psql -X --no-psqlrc -Atqc "SELECT 1" >/dev/null; done';
        run('docker', compose('run', '--rm', '--no-deps', '--entrypoint', '/bin/sh', 'db-bootstrap', '-c', probe), env, 'Verifica credenziali PostgreSQL');
      } catch (error) { failure = error; }
      if (temporary) {
        const stopped = spawnSync('docker', ['stop', '--time', '30', container], { env, stdio: 'ignore' });
        const removed = spawnSync('docker', ['rm', '-f', container], { env, stdio: 'ignore' });
        if (stopped.error || stopped.status !== 0 || removed.error || removed.status !== 0) throw new SafeError('Impossibile rimuovere il PostgreSQL temporaneo; verificare Docker.');
      }
      if (failure) throw failure;
    }
    // SIGKILL avoids Hermes sending a shutdown notice to the old home channel.
    // Only after both services are stopped may credentials change.
    run('docker', compose('kill', '-s', 'SIGKILL', 'hermes'), env, 'Arresto Hermes');
    run('docker', compose('stop', 'author-broker'), env, 'Arresto broker');
    cleanupEnv = env;
    for (const [key, name] of Object.entries(required)) {
      const path = resolve(directory, name);
      if (databaseKeys.has(key)) {
        try {
          await writeFile(path, `${config[key]}\n`, { mode: 0o600, flag: 'wx' });
        } catch (error) {
          if (error.code !== 'EEXIST') throw error;
          await privateFile(path);
          if ((await readFile(path, 'utf8')).trim() !== config[key]) throw new SafeError('Un segreto database è cambiato durante l’avvio.');
        }
      } else {
        // Bind mounts retain old inodes after rename: both consumers are recreated below.
        const temporary = resolve(directory, `.start-${randomBytes(16).toString('hex')}`);
        await writeFile(temporary, `${config[key]}\n`, { mode: 0o600, flag: 'wx' });
        try {
          await rename(temporary, path);
        } catch (error) {
          try { await unlink(temporary); } catch { /* The temporary file remains private. */ }
          throw error;
        }
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
    run('npm', ['ci'], env, 'Installazione dipendenze');
    run('docker', compose('up', '-d', '--wait', '--wait-timeout', '120', 'postgres'), env, 'Avvio PostgreSQL');
    run('docker', compose('run', '--rm', 'db-bootstrap'), env, 'Inizializzazione ruoli');
    const url = new URL(`postgresql://127.0.0.1:${postgresPort}/studio?schema=public`);
    url.username = 'studio_migrator';
    url.password = config.DB_MIGRATOR_PASSWORD;
    run(execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { ...env, DATABASE_URL: url.toString() }, 'Migrazioni');
    run('docker', compose('up', '-d', '--build', '--no-deps', '--force-recreate', '--wait', '--wait-timeout', '180', 'author-broker'), env, 'Avvio broker');
    // Recreate only the gateway: atomic checkout may replace the bind-mounted
    // SOUL inode, and persisted sessions must adopt the new prompt on startup.
    run('docker', compose('up', '-d', '--build', '--no-deps', '--force-recreate', '--wait', '--wait-timeout', '180', 'hermes'), env, 'Avvio Hermes');
    log('PostgreSQL e Hermes sono sani. La raggiungibilità pubblica non è verificata.');
    return 0;
  } catch (error) {
    if (cleanupEnv) {
      // A failed start may have launched a service. Stop the gateway before the broker.
      for (const args of [['kill', '-s', 'SIGKILL', 'hermes'], ['stop', 'author-broker']]) {
        const result = spawnSync('docker', ['compose', '--env-file', '/dev/null', ...args], { env: cleanupEnv, stdio: 'ignore' });
        if (result.error || result.status !== 0) errorLog('Arresto di sicurezza non riuscito: verificare e arrestare i servizi manualmente.');
      }
    }
    // Only our fixed validation messages are safe; system errors may contain sensitive paths.
    const safe = error instanceof SafeError ? error.message : 'Impossibile leggere o preparare la configurazione privata.';
    errorLog(`Avvio non riuscito: ${safe}`);
    return 1;
  }
}
