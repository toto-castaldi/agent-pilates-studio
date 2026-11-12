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
import { runProcess } from '../dist/src/conversation-process.js';
import { attendanceScenarioMatches, hasHomeChannelNotice, historyPreserved, responseMatches, scenarioRelativeDate, scenarioRelativeTimestamp, snapshotsMatch, stateMatches, teacherScenarioMatches } from '../dist/src/conversation.js';
import { parseTeacherLinks } from './teacher-links.mjs';

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
const selectedId = process.env.CONVERSATION_SCENARIO;
if (selectedId && !catalog.scenarios.some((scenario) => scenario.id === selectedId)) {
  console.error('Scenario richiesto non presente nel catalogo.');
  process.exit(1);
}
for (const scenario of catalog.scenarios.filter((entry) => !selectedId || entry.id === selectedId)) {
  if (interrupted) { failed = true; break; }
  if (!/^[a-z0-9-]{1,80}$/.test(scenario.id) || !/^1555555\d{4}$/.test(scenario.sender)
      || !Array.isArray(scenario.turns) || !scenario.turns.length
      || scenario.initial?.clients?.length !== 0 || scenario.initial?.rules?.length !== 0) {
    console.error('Catalogo non valido o stato iniziale non supportato.');
    failed = true;
    break;
  }
  try {
    parseTeacherLinks(JSON.stringify(scenario.teacherLinks ?? []), scenario.sender);
  } catch {
    console.error('Collegamenti sintetici del catalogo non validi.');
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
    'whatsapp-teacher-links': JSON.stringify(scenario.teacherLinks ?? []),
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
    await writeFile(join(directory, 'config.yaml'), (await readFile('hermes/config.yaml', 'utf8')).replace('\ndisplay:\n', '\ndisplay:\n  tool_progress: off\n'));
    const socketDirectory = join(directory, 'socket');
    await mkdir(socketDirectory, { mode: 0o700 });
    await writeFile(override, `services:\n  model-proxy:\n    image: ${project}-hermes\n    entrypoint: ["/opt/hermes/.venv/bin/python", "/model_proxy.py"]\n    volumes:\n      - ${JSON.stringify(`${resolve('scenarios/model_proxy.py')}:/model_proxy.py:ro`)}\n      - ${JSON.stringify(`${socketDirectory}:/run/host-proxy:ro`)}\n    logging:\n      driver: none\n  meta-stub:\n    image: ${project}-hermes\n    entrypoint: ["/opt/hermes/.venv/bin/python", "/meta_stub.py"]\n    volumes:\n      - ${JSON.stringify(`${resolve('scenarios/meta_stub.py')}:/meta_stub.py:ro`)}\n    logging:\n      driver: none\n  hermes:\n    environment:\n      OPENROUTER_BASE_URL: http://model-proxy:8089/api/v1\n      NO_PROXY: model-proxy,meta-stub,localhost,127.0.0.1\n    volumes:\n      - ${JSON.stringify(`${resolve('scenarios/gateway-launcher.sh')}:/opt/hermes/libexec/hermes:ro`)}\n      - ${JSON.stringify(`${join(directory, 'config.yaml')}:/opt/data/config.yaml:ro`)}\n`);
    composeReady = true;
    stage = 'costruzione immagine';
    compose('build', 'hermes');
    if (interrupted) throw new Error('interrupted');
    stage = 'avvio PostgreSQL';
    compose('up', '-d', '--wait', 'postgres');
    stage = 'bootstrap database';
    compose('run', '--rm', 'db-bootstrap');
    const address = (service) => {
      const id = compose('ps', '-q', service).trim();
      const ip = execFileSync('docker', ['inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', id], { env, encoding: 'utf8', stdio: 'pipe' }).trim();
      if (!ip) throw new Error('address');
      return ip;
    };
    stage = 'indirizzo PostgreSQL';
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
    stage = 'migrazioni';
    const url = new URL(`postgresql://${host}:5432/studio?schema=public`);
    url.username = 'studio_migrator';
    url.password = secrets['db-migrator'];
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: { ...env, DATABASE_URL: url.toString() }, stdio: 'pipe', timeout: 120_000 });
    client = new Client({ host, port: 5432, database: 'studio', user: 'studio_migrator', password: secrets['db-migrator'], connectionTimeoutMillis: 15_000, query_timeout: 30_000 });
    stage = 'connessione database';
    await client.connect();
    stage = 'avvio gateway e sostituti';
    await runProcess('docker', ['compose', '-p', project, '-f', 'compose.yaml', '-f', override, 'up', '-d', '--wait', '--wait-timeout', '150', 'model-proxy', 'meta-stub', 'hermes'], env, 240_000);
    stage = 'indirizzi gateway e sostituto Meta';
    const gateway = `http://${address('hermes')}:8090/whatsapp/webhook`;
    const observations = `http://${address('meta-stub')}:8088/observations`;
    const queryObservations = `http://${address('meta-stub')}:8088/synthetic-query-observations`;
    const aggregateCount = async () => {
      const data = await (await fetch(queryObservations, { signal: AbortSignal.timeout(15_000) })).json();
      if (!Number.isSafeInteger(data.aggregates) || data.aggregates < 0) throw new Error('invalid audit');
      return data.aggregates;
    };
    let count = 0;
    stage = 'stato iniziale';
    const snapshot = async () => {
      const clients = (await client.query('SELECT id::text AS id, first_name AS "firstName", last_name AS "lastName", created_by_phone AS "authorPhone", created_by_name AS "authorName", created_at::text AS "createdAt" FROM app.clients ORDER BY id')).rows;
      const rules = (await client.query(`SELECT r.id::text AS id, r.created_at::text AS "createdAt", r.rule_text AS text, r.created_by_phone AS "authorPhone", r.created_by_name AS "authorName", (r.deactivated_at IS NULL) AS active, (r.created_at IS NOT NULL) AS "hasCreatedAt",
        r.deactivated_at::text AS "deactivatedAt", r.deactivated_by_phone AS "deactivatedByPhone", r.deactivated_by_name AS "deactivatedByName", r.deactivation_reason AS "deactivationReason",
        COALESCE((SELECT json_agg(c.first_name || ' ' || c.last_name ORDER BY c.id) FROM app.rule_clients rc JOIN app.clients c ON c.id = rc.client_id WHERE rc.rule_id = r.id), '[]'::json) AS clients,
        COALESCE((SELECT json_agg(json_build_object('weekday', s.weekday, 'time', to_char(s.start_time, 'HH24:MI')) ORDER BY s.weekday, s.start_time) FROM app.rule_slots s WHERE s.rule_id = r.id), '[]'::json) AS slots
        FROM app.training_rules r ORDER BY r.id`)).rows;
      const attendance = (await client.query(`SELECT a.id::text AS id, c.first_name || ' ' || c.last_name AS client,
        to_char(a.lesson_date, 'YYYY-MM-DD') AS "lessonDate", to_char(a.start_time, 'HH24:MI') AS time,
        a.outcome, a.created_at::text AS "createdAt", a.created_by_phone AS "authorPhone", a.created_by_name AS "authorName",
        a.cancelled_at::text AS "cancelledAt", a.cancelled_by_phone AS "cancelledByPhone", a.cancelled_by_name AS "cancelledByName", a.cancellation_reason AS "cancellationReason"
        FROM app.attendance a JOIN app.clients c ON c.id = a.client_id ORDER BY a.id`)).rows;
      const teachers = (await client.query('SELECT id::text AS id, first_name AS "firstName", last_name AS "lastName", created_by_phone AS "authorPhone", created_by_name AS "authorName", created_at::text AS "createdAt" FROM app.teachers ORDER BY id')).rows;
      const teacherRules = (await client.query(`SELECT r.id::text AS id, t.first_name || ' ' || t.last_name AS teacher, r.rule_text AS text,
        r.created_at::text AS "createdAt", r.created_by_phone AS "authorPhone", r.created_by_name AS "authorName",
        r.deactivated_at::text AS "deactivatedAt", r.deactivated_by_phone AS "deactivatedByPhone", r.deactivated_by_name AS "deactivatedByName", r.deactivation_reason AS "deactivationReason",
        COALESCE((SELECT json_agg(json_build_object('weekday', i.weekday, 'min', to_char(i.start_time_min, 'HH24:MI'), 'max', to_char(i.start_time_max, 'HH24:MI'), 'isActive', i.is_active) ORDER BY i.weekday, i.start_time_min, i.start_time_max)
          FROM app.teacher_rule_intervals i WHERE i.rule_id = r.id), '[]'::json) AS intervals
        FROM app.teacher_rules r JOIN app.teachers t ON t.id = r.teacher_id ORDER BY r.id`)).rows;
      const teacherAssignments = (await client.query(`SELECT a.id::text AS id, a.teacher_id::text AS "teacherId", a.lesson_date::text AS date, a.start_time::text AS time,
        a.created_at::text AS "createdAt", a.created_by_phone AS "authorPhone", a.created_by_name AS "authorName", a.cancelled_at::text AS "cancelledAt",
        a.cancelled_by_phone AS "cancelledByPhone", a.cancelled_by_name AS "cancelledByName", a.cancellation_reason AS "cancellationReason"
        FROM app.teacher_assignments a ORDER BY a.id`)).rows;
      return { clients, rules, attendance, teachers, teacherRules, teacherAssignments };
    };
    let previous = await snapshot();
    if (!stateMatches(previous, scenario.initial)) throw new Error('initial state');
    const reference = new Date();
    const relativeDate = (value) => scenarioRelativeDate(reference, value);
    const relativeTimestamp = (value) => scenarioRelativeTimestamp(reference, value);
    let seededSnapshot;
    if (scenario.setup) {
      stage = 'preparazione dati sintetici';
      const setup = { ...scenario.setup, attendance: scenario.setup.attendance?.map((row) => ({ ...row,
        lessonDate: relativeDate(row.lessonDate), createdAt: relativeTimestamp(row.createdAt), cancelledAt: relativeTimestamp(row.cancelledAt) })) };
      if (!Array.isArray(setup.clients) || !Array.isArray(setup.rules) || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(setup.createdAt)) throw new Error('setup');
      await client.query('BEGIN');
      await client.query("INSERT INTO studio_private.author_context (backend_pid, transaction_id, sender, profile_name, expires_at) VALUES (pg_backend_pid(), txid_current(), $1, $2, clock_timestamp() + interval '10 minutes')", [scenario.sender, scenario.profile]);
      const ids = new Map();
      for (const person of setup.clients) {
        const result = await client.query('INSERT INTO app.clients (first_name, last_name, created_at) VALUES ($1, $2, $3) RETURNING id', [person.firstName, person.lastName, setup.createdAt]);
        ids.set(`${person.firstName} ${person.lastName}`, result.rows[0].id);
      }
      for (const rule of setup.rules) {
        const createdAt = rule.createdAt ?? setup.createdAt;
        if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(createdAt)
          || (rule.deactivatedAt && !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(rule.deactivatedAt))) throw new Error('setup dates');
        const result = await client.query('INSERT INTO app.training_rules (rule_text, created_at) VALUES ($1, $2) RETURNING id', [rule.text, createdAt]);
        const id = result.rows[0].id;
        for (const name of rule.clients) {
          if (!ids.has(name)) throw new Error('unknown client');
          await client.query('INSERT INTO app.rule_clients (rule_id, client_id) VALUES ($1, $2)', [id, ids.get(name)]);
        }
        for (const slot of rule.slots) await client.query('INSERT INTO app.rule_slots (rule_id, weekday, start_time) VALUES ($1, $2, $3)', [id, slot.weekday, slot.time]);
        if (rule.active === false) await client.query("UPDATE app.training_rules SET deactivated_at = $2, deactivation_reason = 'Fine abitudine sintetica' WHERE id = $1", [id, rule.deactivatedAt ?? setup.createdAt]);
      }
      // Seed synthetic historical rows with the migrator, restoring the author
      // trigger inside the same transaction before any conversational turn.
      if (setup.attendance?.length) {
        stage = 'preparazione fixture presenze: disabilitazione trigger';
        await client.query('ALTER TABLE app.attendance DISABLE TRIGGER attendance_author');
        stage = 'preparazione fixture presenze: inserimento';
        for (const row of setup.attendance) {
          if (!ids.has(row.client) || !/^\d{4}-\d\d-\d\d$/.test(row.lessonDate)
            || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(row.time)
            || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(row.createdAt)
            || !['present', 'excused_absence', 'unexcused_absence'].includes(row.outcome)
            || (row.cancelledAt && (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(row.cancelledAt)
              || Date.parse(row.cancelledAt) <= Date.parse(row.createdAt)))) throw new Error('attendance fixture');
          await client.query(`INSERT INTO app.attendance (client_id, lesson_date, start_time, outcome, created_at, created_by_phone, created_by_name,
            cancelled_at, cancelled_by_phone, cancelled_by_name, cancellation_reason) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [ids.get(row.client), row.lessonDate, row.time, row.outcome, row.createdAt, scenario.sender, scenario.profile,
            row.cancelledAt ?? null, row.cancelledAt ? scenario.sender : null, row.cancelledAt ? scenario.profile : null,
            row.cancelledAt ? 'Errore sintetico' : null]);
        }
        stage = 'preparazione fixture presenze: riabilitazione trigger';
        await client.query('ALTER TABLE app.attendance ENABLE TRIGGER attendance_author');
      }
      stage = 'preparazione fixture: verifica';
      await client.query('DELETE FROM studio_private.author_context WHERE backend_pid = pg_backend_pid() AND transaction_id = txid_current()');
      await client.query('COMMIT');
      seededSnapshot = await snapshot();
      const author = { authorPhone: scenario.sender, authorName: scenario.profile };
      const expected = {
        clients: setup.clients.map((person) => ({ ...person, ...author })),
        rules: setup.rules.map((rule) => ({ textContains: [rule.text], clients: rule.clients, slots: rule.slots, ...author,
          deactivation: rule.active === false ? { ...author, reasonAnyOf: ['Fine abitudine sintetica'] } : undefined })),
      };
      const setupRows = (setup.attendance ?? []).map((row) => ({ ...row, ...author,
        cancellation: row.cancelledAt ? { ...author, reasonAnyOf: ['Errore sintetico'] } : undefined }));
      const fixtureTimes = (await client.query("SELECT created_at::text AS created, cancelled_at::text AS cancelled, created_at < ((lesson_date + start_time) AT TIME ZONE 'Europe/Rome') AS anticipated, ((lesson_date + start_time) AT TIME ZONE 'Europe/Rome') <= clock_timestamp() AS started FROM app.attendance ORDER BY id")).rows;
      if (!stateMatches({ ...seededSnapshot, attendance: [] }, expected)
        || !attendanceScenarioMatches({ ...seededSnapshot, attendance: [] }, seededSnapshot, { addedClients: [], attendance: setupRows })
        || fixtureTimes.length !== setupRows.length || fixtureTimes.some((row, index) =>
          (row.anticipated && setupRows[index].outcome !== 'excused_absence') || (!row.started && setupRows[index].outcome !== 'excused_absence')
          || new Date(row.created).getTime() !== new Date(setupRows[index].createdAt).getTime()
          || (setupRows[index].cancelledAt && new Date(row.cancelled).getTime() !== new Date(setupRows[index].cancelledAt).getTime()))
        || seededSnapshot.rules.some((rule, index) =>
        new Date(rule.createdAt).getTime() !== new Date(setup.rules[index].createdAt ?? setup.createdAt).getTime()
        || (setup.rules[index].active === false && new Date(rule.deactivatedAt).getTime() !== new Date(setup.rules[index].deactivatedAt ?? setup.createdAt).getTime()))) throw new Error('setup state');
      previous = seededSnapshot;
    }
    for (const [index, turn] of scenario.turns.entries()) {
      if (interrupted) throw new Error('interrupted');
      stage = `turno ${index + 1}`;
      const attendanceExpected = turn.attendanceExpected && { ...turn.attendanceExpected,
        attendance: turn.attendanceExpected.attendance.map((entry) => ({ ...entry, lessonDate: relativeDate(entry.lessonDate) })) };
      const expectedResponse = { ...turn.response, dates: turn.response.dates?.map(relativeDate) };
      const aggregatesBefore = turn.sqlAggregate ? await aggregateCount() : 0;
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
      if (!responseMatches(text, expectedResponse)) {
        const normalized = text.toLocaleLowerCase('it-IT');
        const flags = [
          /errore|error|failed|fallit|impossibil|unable|sorry/.test(normalized) ? 'errore segnalato' : 'nessun errore riconosciuto',
          turn.response.contains.every((word) => normalized.includes(word.toLocaleLowerCase('it-IT'))) ? 'nomi presenti' : 'nomi mancanti',
          responseMatches(text, { contains: [], times: turn.response.times }) ? 'orari presenti' : 'orari mancanti',
          responseMatches(text, { contains: [], anyOf: turn.response.anyOf }) ? 'alternative presenti' : 'alternative mancanti',
          responseMatches(text, { contains: [], excludes: turn.response.excludes }) ? 'esclusioni rispettate' : `esclusioni violate ${turn.response.excludes.map((word, index) => normalized.includes(word.toLocaleLowerCase('it-IT')) ? index + 1 : 0).filter(Boolean).join('/')}`,
          responseMatches(text, { contains: [], question: turn.response.question }) ? 'requisito domanda rispettato' : 'requisito domanda non rispettato',
          responseMatches(text, { contains: [], groups: turn.response.groups }) ? 'raggruppamenti presenti' : 'raggruppamenti mancanti',
          responseMatches(text, { contains: [], dayGroups: turn.response.dayGroups }) ? 'giorni associati' : 'associazioni giorno mancanti',
          responseMatches(text, { contains: [], date: expectedResponse.date, dates: expectedResponse.dates }) ? 'date riconosciute' : 'date non riconosciute',
          ...(expectedResponse.dates ?? []).map((date, index) => {
            const [year, month, day] = date.split('-').map(Number);
            const months = ['', 'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
            const dayFound = new RegExp(`(?<!\\d)0?${day}(?!\\d)`).test(text);
            const monthFound = normalized.includes(months[month]) || new RegExp(`(?<!\\d)0?${month}(?!\\d)`).test(text);
            return `data ${index + 1}: giorno ${dayFound ? 'presente' : 'assente'}, mese ${monthFound ? 'presente' : 'assente'}, anno ${normalized.includes(String(year)) ? 'presente' : 'assente'}`;
          }),
          ...(turn.response.counts ?? []).map((item, index) => {
            const positions = item.labels.map((label) => normalized.indexOf(label.toLocaleLowerCase('it-IT'))).filter((position) => position >= 0);
            const numbers = [...text.matchAll(new RegExp(`(?<!\\d)${item.value}(?!\\d)`, 'g'))].map((match) => match.index);
            const distance = positions.length && numbers.length ? Math.min(...positions.flatMap((position) => numbers.map((number) => Math.abs(number - position)))) : -1;
            const bounded = new RegExp(`\\b${item.value}\\b`).test(text);
            return `conteggio ${index + 1} ${responseMatches(text, { contains: [], counts: [item] }) ? 'riconosciuto' : 'non riconosciuto'}, etichetta ${positions.length ? 'presente' : 'assente'}, cifra ${numbers.length ? 'presente' : 'assente'}, parola numerica ${bounded ? 'presente' : 'assente'}, distanza minima ${distance}`;
          }),
          /altro|altra|aiut|ulterior|aggiung|serv/i.test(text) ? 'possibile domanda accessoria' : 'nessuna domanda accessoria riconosciuta',
          /registr|salvat|inser|proced/i.test(text) ? 'menzione registrazione' : 'nessuna menzione registrazione',
          /fuori programma|fuori dalla pianificazione|nessuna regola|senza regola|non programm|non pianificat|non attes|non previst/i.test(text) ? 'possibile indicazione non atteso' : 'nessuna indicazione non atteso riconosciuta',
          /api|model|modello|provider|openrouter|credit|quota|limit/i.test(text) ? 'menzione servizio/modello' : 'nessuna menzione servizio/modello',
          /conferm|ambigu|manc|precis|chied|quale|qual è/i.test(text) ? 'possibile richiesta chiarimento' : 'nessun chiarimento riconosciuto',
          /prima|dopo|inizio|inizi|futur/i.test(text) ? 'riferimento temporale riconosciuto' : 'nessun riferimento temporale riconosciuto',
          /non posso|impossibil|non si può|non si possono|non è possibile/i.test(text) ? 'rifiuto riconosciuto' : 'nessun rifiuto riconosciuto',
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
      stage = `turno ${index + 1}: aggregazione SQL`;
      if (turn.sqlAggregate && await aggregateCount() <= aggregatesBefore) throw new Error('no aggregate query');
      stage = `turno ${index + 1}: stato database`;
      const current = await snapshot();
      const historyOk = historyPreserved(previous, current);
      const stateOk = turn.teacherExpected ? teacherScenarioMatches(current, turn.teacherExpected, scenario.sender, scenario.profile ?? null)
        : attendanceExpected ? !!seededSnapshot && attendanceScenarioMatches(seededSnapshot, current, attendanceExpected)
          : turn.unchanged ? !!seededSnapshot && snapshotsMatch(seededSnapshot, current) : stateMatches(current, turn.expected);
      if (!historyOk || !stateOk) {
        const rows = current.attendance ?? [];
        console.error(`Diagnostica sintetica database: storico ${historyOk ? 'conservato' : 'alterato'}, stato ${stateOk ? 'conforme' : 'difforme'}, clienti ${current.clients.length}, regole clienti ${current.rules.length}, registrazioni ${rows.length}, annullate ${rows.filter((row) => row.cancelledAt).length}, presenze ${rows.filter((row) => row.outcome === 'present').length}, insegnanti ${current.teachers.length}, regole insegnanti ${current.teacherRules.length}.`);
        console.error(`Indicatori sintetici risposta: domanda ${/[?？]/.test(text) ? 'sì' : 'no'}, conferma ${/conferm/i.test(text) ? 'sì' : 'no'}, errore ${/errore|fallit|impossibil/i.test(text) ? 'sì' : 'no'}.`);
        throw new Error('database mismatch');
      }
      previous = current;
    }
    console.log(`${scenario.id}: OK`);
  } catch (error) {
    failed = true;
    if (typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)) console.error(`Codice SQL sintetico: ${error.code}.`);
    if (stage === 'avvio gateway e sostituti') {
      try {
        for (const line of compose('ps', '--all', '--format', 'json').trim().split('\n').filter(Boolean)) {
          const row = JSON.parse(line);
          if (['postgres', 'author-broker', 'hermes', 'model-proxy', 'meta-stub'].includes(row.Service)) {
            const state = ['running', 'exited', 'created', 'restarting'].includes(row.State) ? row.State : 'other';
            const health = ['healthy', 'unhealthy', 'starting'].includes(row.Health) ? row.Health : 'none';
            console.error(`Servizio ${row.Service}: ${state}, ${health}.`);
          }
        }
      } catch { console.error('Stato sintetico dei servizi non disponibile.'); }
    }
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
