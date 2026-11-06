import { execFileSync, spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from 'pg';
import { proxyHeaders } from '../dist/src/conversation-proxy.js';
import { hasHomeChannelNotice, responseMatches, stateMatches } from '../dist/src/conversation.js';

const apiKey = process.env.OPENROUTER_API_KEY?.trim();
if (!apiKey) {
  console.error('OPENROUTER_API_KEY mancante: configurare la credenziale esterna prima della prova.');
  process.exit(1);
}
let catalog;
try {
  catalog = JSON.parse(await readFile('scenarios/basic.json', 'utf8'));
} catch {
  console.error('Catalogo scenari non leggibile.');
  process.exit(1);
}
if (catalog?.version !== 1 || !Array.isArray(catalog.scenarios) || !catalog.scenarios.length) {
  console.error('Catalogo scenari non valido.');
  process.exit(1);
}
const model = process.env.CONVERSATION_MODEL || 'openai/gpt-6.1-terra';
if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/.test(model)) {
  console.error('Identificativo del modello non valido.');
  process.exit(1);
}
let interrupted = false;
process.on('SIGINT', () => { interrupted = true; });
process.on('SIGTERM', () => { interrupted = true; });
const safeEnv = Object.fromEntries(['PATH', 'HOME', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG', 'XDG_RUNTIME_DIR', 'TMPDIR', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NO_PROXY', 'HTTPS_PROXY', 'HTTP_PROXY'].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
let failed = false;
for (const scenario of catalog.scenarios) {
  if (interrupted) { failed = true; break; }
  if (!/^[a-z0-9-]{1,80}$/.test(scenario.id) || !/^1555555\d{4}$/.test(scenario.sender)
      || !Array.isArray(scenario.turns) || !scenario.turns.length
      || scenario.initial?.clients?.length !== 0 || scenario.initial?.rules?.length !== 0) {
    console.error('Catalogo non valido o stato iniziale non supportato.');
    failed = true;
    break;
  }
  const directory = await mkdtemp(join(tmpdir(), 'pilates-conversation-'));
  const project = `pilates-conv-${randomBytes(8).toString('hex')}`;
  const secrets = {
    'db-admin': randomBytes(32).toString('hex'),
    'db-migrator': randomBytes(32).toString('hex'),
    'db-agent': randomBytes(32).toString('hex'),
    'db-broker': randomBytes(32).toString('hex'),
    'bridge-token': randomBytes(32).toString('hex'),
    'openrouter-key': randomBytes(32).toString('hex'),
    'whatsapp-access-token': randomBytes(32).toString('hex'),
    'whatsapp-app-secret': randomBytes(32).toString('hex'),
    'whatsapp-verify-token': randomBytes(32).toString('hex'),
    'whatsapp-allowed-users': scenario.sender,
    'whatsapp-home-channel': scenario.sender,
    'whatsapp-phone-number-id': '123456789012345',
  };
  const override = join(directory, 'override.yaml');
  const env = { ...safeEnv, COMPOSE_ENV_FILES: '/dev/null', SECRETS_DIR: directory, POSTGRES_PORT: '0', WHATSAPP_WEBHOOK_PORT: '0', WHATSAPP_WEBHOOK_PATH: '/whatsapp/webhook', PILATES_MODEL: model };
  const compose = (...args) => execFileSync('docker', ['compose', '-p', project, '-f', 'compose.yaml', '-f', override, ...args], { env, encoding: 'utf8', stdio: 'pipe', timeout: 240_000 });
  let client;
  let proxy;
  const proxyStats = { requests: 0, denied: 0, completed: 0, failures: 0, status: 0 };
  let stage = 'preparazione';
  let cleanupFailed = false;
  let composeReady = false;
  try {
    await Promise.all(Object.entries(secrets).map(([name, value]) => writeFile(join(directory, name), value, { mode: 0o600 })));
    await writeFile(join(directory, 'config.yaml'), `${await readFile('hermes/config.yaml', 'utf8')}\ndisplay:\n  tool_progress: off\n`);
    const socketDirectory = join(directory, 'socket');
    await mkdir(socketDirectory, { mode: 0o700 });
    await writeFile(override, `services:\n  model-proxy:\n    image: ${project}-hermes\n    entrypoint: ["/opt/hermes/.venv/bin/python", "/model_proxy.py"]\n    volumes:\n      - ${JSON.stringify(`${resolve('scenarios/model_proxy.py')}:/model_proxy.py:ro`)}\n      - ${JSON.stringify(`${socketDirectory}:/run/host-proxy:ro`)}\n    logging:\n      driver: none\n  meta-stub:\n    image: ${project}-hermes\n    entrypoint: ["/opt/hermes/.venv/bin/python", "/meta_stub.py"]\n    volumes:\n      - ${JSON.stringify(`${resolve('scenarios/meta_stub.py')}:/meta_stub.py:ro`)}\n    logging:\n      driver: none\n  hermes:\n    environment:\n      OPENROUTER_BASE_URL: http://model-proxy:8089/api/v1\n      NO_PROXY: model-proxy,meta-stub,localhost,127.0.0.1\n    volumes:\n      - ${JSON.stringify(`${resolve('scenarios/gateway-launcher.sh')}:/opt/hermes/libexec/hermes:ro`)}\n      - ${JSON.stringify(`${join(directory, 'config.yaml')}:/opt/data/config.yaml:ro`)}\n`);
    composeReady = true;
    compose('build', 'hermes');
    if (interrupted) throw new Error('interrupted');
    compose('up', '-d', '--wait', 'postgres');
    compose('run', '--rm', 'db-bootstrap');
    const address = (service) => {
      const id = compose('ps', '-q', service).trim();
      const ip = execFileSync('docker', ['inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', id], { env, encoding: 'utf8', stdio: 'pipe' }).trim();
      if (!ip) throw new Error('address');
      return ip;
    };
    const host = address('postgres');
    // Keep the real key only in this process. A relay uses a private Unix
    // socket and a random synthetic token; only this proxy attaches the real
    // key to HTTPS requests. Neither Docker nor a secret file sees it.
    proxy = createServer((incoming, outgoing) => {
      proxyStats.requests++;
      const headers = proxyHeaders(incoming.method, incoming.url, incoming.headers, secrets['openrouter-key'], apiKey);
      if (!headers) {
        proxyStats.denied++;
        outgoing.writeHead(403).end();
        return;
      }
      const upstream = httpsRequest({ hostname: 'openrouter.ai', port: 443, path: incoming.url, method: incoming.method, headers, timeout: 120_000 }, (response) => {
        proxyStats.completed++;
        proxyStats.status = response.statusCode || 0;
        const responseHeaders = { ...response.headers };
        delete responseHeaders.connection;
        delete responseHeaders['transfer-encoding'];
        outgoing.writeHead(response.statusCode || 502, responseHeaders);
        response.pipe(outgoing);
      });
      upstream.on('timeout', () => upstream.destroy());
      upstream.on('error', () => { proxyStats.failures++; if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end(); });
      incoming.on('error', () => upstream.destroy());
      incoming.pipe(upstream);
    });
    await new Promise((resolveListen, reject) => {
      proxy.once('error', reject);
      proxy.listen(join(socketDirectory, 'socket'), resolveListen);
    });
    await chmod(join(socketDirectory, 'socket'), 0o600);
    const url = new URL(`postgresql://${host}:5432/studio?schema=public`);
    url.username = 'studio_migrator';
    url.password = secrets['db-migrator'];
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: { ...env, DATABASE_URL: url.toString() }, stdio: 'pipe', timeout: 120_000 });
    client = new Client({ host, port: 5432, database: 'studio', user: 'studio_migrator', password: secrets['db-migrator'], connectionTimeoutMillis: 15_000, query_timeout: 30_000 });
    await client.connect();
    compose('up', '-d', '--wait', '--wait-timeout', '150', 'model-proxy', 'meta-stub', 'hermes');
    const gateway = `http://${address('hermes')}:8090/whatsapp/webhook`;
    const observations = `http://${address('meta-stub')}:8088/observations`;
    let count = 0;
    stage = 'stato iniziale';
    const snapshot = async () => {
      const clients = (await client.query('SELECT first_name AS "firstName", last_name AS "lastName", created_by_phone AS "authorPhone", created_by_name AS "authorName" FROM app.clients ORDER BY id')).rows;
      const rules = (await client.query(`SELECT r.rule_text AS text, r.created_by_phone AS "authorPhone", r.created_by_name AS "authorName", (r.deactivated_at IS NULL) AS active,
        COALESCE((SELECT json_agg(c.first_name || ' ' || c.last_name ORDER BY c.id) FROM app.rule_clients rc JOIN app.clients c ON c.id = rc.client_id WHERE rc.rule_id = r.id), '[]'::json) AS clients,
        COALESCE((SELECT json_agg(json_build_object('weekday', s.weekday, 'time', to_char(s.start_time, 'HH24:MI')) ORDER BY s.weekday, s.start_time) FROM app.rule_slots s WHERE s.rule_id = r.id), '[]'::json) AS slots
        FROM app.training_rules r ORDER BY r.id`)).rows;
      return { clients, rules };
    };
    if (!stateMatches(await snapshot(), scenario.initial)) throw new Error('initial state');
    for (const [index, turn] of scenario.turns.entries()) {
      if (interrupted) throw new Error('interrupted');
      stage = `turno ${index + 1}`;
      const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: '999', changes: [{ field: 'messages', value: {
        metadata: { phone_number_id: secrets['whatsapp-phone-number-id'] },
        contacts: [{ wa_id: scenario.sender, profile: { name: scenario.profile } }],
        messages: [{ from: scenario.sender, id: `wamid.synthetic.${randomBytes(16).toString('hex')}`, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: turn.message } }],
      } }] }] });
      const signature = `sha256=${createHmac('sha256', secrets['whatsapp-app-secret']).update(payload).digest('hex')}`;
      stage = `turno ${index + 1}: webhook`;
      const response = await fetch(gateway, { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signature }, signal: AbortSignal.timeout(15_000) });
      if (response.status !== 200) throw new Error('webhook');
      stage = `turno ${index + 1}: attesa risposta`;
      let incoming;
      for (let i = 0; i < 180 && !interrupted; i++) {
        const entries = await (await fetch(observations, { signal: AbortSignal.timeout(15_000) })).json();
        if (entries.some((item) => hasHomeChannelNotice(item.text))) throw new Error('home channel notice');
        if (entries.length > count) {
          const newEntries = entries.slice(count);
          count = entries.length;
          if (newEntries.some((item) => item.to !== scenario.sender)) throw new Error('unexpected recipient');
          incoming = newEntries.filter((item) => item.text.trim());
          if (incoming.length) break;
        }
        await delay(1000);
      }
      if (!incoming?.length || incoming.some((item) => item.to !== scenario.sender)) throw new Error('response timeout');
      await delay(2000);
      const allEntries = await (await fetch(observations, { signal: AbortSignal.timeout(15_000) })).json();
      if (allEntries.some((item) => hasHomeChannelNotice(item.text))) throw new Error('home channel notice');
      const laterEntries = allEntries.slice(count);
      if (laterEntries.some((item) => item.to !== scenario.sender)) throw new Error('unexpected recipient');
      incoming.push(...laterEntries.filter((item) => item.text.trim()));
      count = allEntries.length;
      stage = `turno ${index + 1}: contenuto risposta`;
      const text = incoming.map((item) => item.text).join(' ');
      if (!responseMatches(text, turn.response)) {
        const normalized = text.toLocaleLowerCase('it-IT');
        const flags = [
          /errore|error|failed|fallit|impossibil|unable|sorry/.test(normalized) ? 'errore segnalato' : 'nessun errore riconosciuto',
          turn.response.contains.every((word) => normalized.includes(word.toLocaleLowerCase('it-IT'))) ? 'nomi presenti' : 'nomi mancanti',
          responseMatches(text, { ...turn.response, contains: [] }) ? 'orario presente' : 'orario mancante',
          /api|model|modello|provider|openrouter|credit|quota|limit/i.test(text) ? 'menzione servizio/modello' : 'nessuna menzione servizio/modello',
          /conferm|ambigu|manc|precis|chied|quale|qual è/i.test(text) ? 'possibile richiesta chiarimento' : 'nessun chiarimento riconosciuto',
          /database|sql|strument|tool|dati/i.test(text) ? 'menzione dati/tool' : 'nessuna menzione dati/tool',
          ...[['sessione', /session/i], ['accesso', /access|auth|permiss/i], ['canale', /whatsapp|gateway|hermes/i], ['avviso', /warn|attenz|⚠/i], ['token', /token|chiave|key/i], ['configurazione', /configur|setup|install/i]].filter(([, pattern]) => pattern.test(text)).map(([label]) => `categoria ${label}`),
          /^(?:ciao|salve|buongiorno|hello|hi)\b/i.test(text.trim()) ? 'saluto iniziale' : 'senza saluto iniziale',
          `lunghezza ${text.length}`,
          `clienti ${Number((await client.query('SELECT count(*) FROM app.clients')).rows[0].count)}`,
          `regole ${Number((await client.query('SELECT count(*) FROM app.training_rules')).rows[0].count)}`,
        ];
        console.error(`Diagnostica sintetica: ${flags.join(', ')}.`);
        throw new Error('response mismatch');
      }
      stage = `turno ${index + 1}: stato database`;
      if (!stateMatches(await snapshot(), turn.expected)) throw new Error('database mismatch');
    }
    console.log(`${scenario.id}: OK`);
  } catch {
    failed = true;
    console.error(`${scenario.id}: ERRORE (${stage}); nessun dettaglio sensibile viene stampato.`);
    console.error(`Proxy OpenRouter: richieste ${proxyStats.requests}, rifiutate ${proxyStats.denied}, risposte ${proxyStats.completed}, errori ${proxyStats.failures}, ultimo HTTP ${proxyStats.status}.`);
  } finally {
    if (client) await client.end().catch(() => { cleanupFailed = true; });
    if (proxy?.listening) await new Promise((resolveClose) => proxy.close((error) => { if (error) cleanupFailed = true; resolveClose(); }));
    if (composeReady) {
      try { compose('down', '--volumes', '--remove-orphans'); } catch { cleanupFailed = true; }
    }
    const existing = spawnSync('docker', ['image', 'inspect', `${project}-hermes`], { env, stdio: 'ignore', timeout: 60_000 });
    if (existing.error) cleanupFailed = true;
    if (existing.status === 0) {
      const image = spawnSync('docker', ['image', 'rm', `${project}-hermes`], { env, stdio: 'ignore', timeout: 60_000 });
      if (image.error || image.status !== 0) cleanupFailed = true;
    }
    await rm(directory, { recursive: true, force: true }).catch(() => { cleanupFailed = true; });
    if (cleanupFailed) {
      failed = true;
      console.error(`${scenario.id}: pulizia incompleta; controllare le risorse Docker del progetto ${project}.`);
    }
  }
}
if (interrupted) {
  failed = true;
  console.error('Prova interrotta.');
}
if (failed) process.exitCode = 1;
