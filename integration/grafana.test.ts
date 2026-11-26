import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Client } from 'pg';
import { seedIdentities } from './identity-seed.js';

type Frame = { schema?: { fields: { name: string }[] }; data?: { values: unknown[][] } };
type QueryResponse = { results: Record<string, { status?: number; error?: string; frames?: Frame[] }> };
type Panel = { id: number; title: string; type: string; targets: { refId: string; rawSql: string; format: string }[] };
type Dashboard = { uid: string; title: string; editable: boolean; panels: Panel[]; templating: { list: { name: string; query: string }[] } };

const ALPHA = '15555550102';
const BETA = '15555550103';
const DAY_1 = Date.parse('2026-11-20T10:00:00.000Z');
const DAY_2 = Date.parse('2026-11-21T10:00:00.000Z');
const VIEW_COLUMNS = ['id', 'recorded_at', 'teacher_id', 'teacher_first_name', 'teacher_last_name', 'turn_kind', 'received_at', 'replied_at',
  'total_ms', 'model_ms', 'model', 'reasoning_effort', 'input_tokens', 'output_tokens', 'context_tokens', 'context_window', 'context_percent',
  'compaction_threshold_tokens', 'compactions', 'tool_calls', 'model_requests', 'cost_usd', 'send_outcome', 'send_http_status', 'send_error_code'];

// One synthetic event with the table's coherence rules: replied = received + total.
function event(received: number, fields: Record<string, unknown>) {
  const kind = (fields.turn_kind as string | undefined) ?? 'agent';
  const outcome = (fields.send_outcome as string | undefined) ?? 'sent';
  const total = outcome === 'none' ? null : (fields.total_ms as number);
  const agent = kind === 'agent';
  return {
    turn_kind: kind, received_at: new Date(received).toISOString(), replied_at: total === null ? null : new Date(received + total).toISOString(),
    total_ms: total, model_ms: agent ? fields.model_ms : null, model: agent ? fields.model : null, reasoning_effort: agent ? 'medium' : null,
    input_tokens: agent ? fields.input_tokens : null, output_tokens: agent ? fields.output_tokens : null,
    context_tokens: agent ? fields.context_tokens : null, context_window: agent ? 200_000 : null,
    context_percent: agent ? Math.round(((fields.context_tokens as number) / 200_000) * 10_000) / 100 : null,
    compaction_threshold_tokens: agent ? 80_000 : null, compactions: agent ? (fields.compactions ?? 0) : 0,
    tool_calls: agent ? 1 : 0, model_requests: agent ? 1 : 0, cost_usd: agent ? (fields.cost_usd ?? null) : null,
    send_outcome: outcome, send_http_status: fields.send_http_status ?? null, send_error_code: fields.send_error_code ?? null,
  };
}

// Rows of the first frame of a table query, keyed by column name.
function rows(response: QueryResponse): Record<string, unknown>[] {
  const frame = response.results.A.frames?.[0];
  const names = frame?.schema?.fields.map((field) => field.name) ?? [];
  const values = frame?.data?.values ?? [];
  const count = values[0]?.length ?? 0;
  return Array.from({ length: count }, (_, row) => Object.fromEntries(names.map((name, column) => [name, values[column][row]])));
}

test('grafana: loopback dashboard with versioned provisioning, private credentials and a read-only role', { timeout: 900_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pilates-grafana-test-'));
  const project = `pilates-grafana-${randomBytes(8).toString('hex')}`;
  const adminPassword = `Synthetic-${randomBytes(12).toString('hex')}`;
  const secrets: Record<string, string> = {
    'db-admin': randomBytes(32).toString('hex'), 'db-migrator': randomBytes(32).toString('hex'),
    'db-agent': randomBytes(32).toString('hex'), 'db-broker': randomBytes(32).toString('hex'),
    'db-grafana': randomBytes(32).toString('hex'), 'grafana-admin-password': adminPassword,
  };
  const env = { ...process.env, COMPOSE_ENV_FILES: '/dev/null', SECRETS_DIR: directory, POSTGRES_PORT: '0', GRAFANA_PORT: '0' };
  const compose = (...args: string[]) => execFileSync('docker', ['compose', '-p', project, '-f', 'compose.yaml', ...args], { env, encoding: 'utf8', stdio: 'pipe', timeout: 300_000 });
  const tryCompose = (...args: string[]) => spawnSync('docker', ['compose', '-p', project, '-f', 'compose.yaml', ...args], { env, encoding: 'utf8', stdio: 'pipe', timeout: 300_000 });
  const clients: Client[] = [];
  try {
    await Promise.all(Object.entries(secrets).map(([name, value]) => writeFile(join(directory, name), `${value}\n`, { mode: 0o600 })));
    compose('build', 'postgres', 'grafana');
    compose('up', '-d', '--wait', 'postgres');
    compose('run', '--rm', 'db-bootstrap');
    const postgresId = compose('ps', '-q', 'postgres').trim();
    const host = execFileSync('docker', ['inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', postgresId], { encoding: 'utf8' }).trim();
    assert.ok(host);
    const migrationUrl = new URL(`postgresql://${host}:5432/studio?schema=public`);
    migrationUrl.username = 'studio_migrator';
    migrationUrl.password = secrets['db-migrator'];
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: { ...env, DATABASE_URL: migrationUrl.toString() }, stdio: 'pipe', timeout: 90_000 });
    const connect = async (user: string, password: string, database = 'studio') => {
      const client = new Client({ host, port: 5432, database, user, password });
      await client.connect();
      clients.push(client);
      return client;
    };
    const migrator = await connect('studio_migrator', secrets['db-migrator']);
    const broker = await connect('studio_broker', secrets['db-broker']);
    const ids = await seedIdentities({ host, password: secrets['db-broker'] },
      { first: 'Alpha', last: 'Synthetic', phone: ALPHA }, [{ first: 'Beta', last: 'Synthetic', phone: BETA }]);
    const record = async (teacher: string | null, value: object) =>
      broker.query('SELECT studio_private.record_usage_event($1, $2::jsonb)', [teacher, JSON.stringify(value)]);
    await record(ids[ALPHA], event(DAY_1, { total_ms: 1000, model_ms: 800, model: 'openai/synthetic-a', input_tokens: 1000, output_tokens: 100, context_tokens: 20_000, cost_usd: 0.001 }));
    await record(ids[ALPHA], event(DAY_1 + 60_000, { total_ms: 3000, model_ms: 2500, model: 'openai/synthetic-a', input_tokens: 2000, output_tokens: 200, context_tokens: 40_000, compactions: 1, cost_usd: 0.002 }));
    await record(ids[BETA], event(DAY_2, { total_ms: 2000, model_ms: 1500, model: 'anthropic/synthetic-b', input_tokens: 500, output_tokens: 50, context_tokens: 10_000 }));
    await record(ids[BETA], event(DAY_2 + 60_000, { turn_kind: 'fixed', total_ms: 100, send_outcome: 'refused', send_http_status: 400, send_error_code: 131030 }));
    await record(null, event(DAY_2 + 120_000, { turn_kind: 'fixed', total_ms: 50 }));
    await record(ids[ALPHA], event(DAY_2 + 180_000, { turn_kind: 'management', total_ms: 200, send_outcome: 'network' }));

    // 1. Role: only the studio_metrics views, read-only, no phones, no other database.
    const grafanaRole = await connect('studio_grafana', secrets['db-grafana']);
    const viewColumns = (await migrator.query("SELECT table_name, array_agg(column_name::text ORDER BY ordinal_position) AS columns FROM information_schema.columns WHERE table_schema = 'studio_metrics' GROUP BY 1 ORDER BY 1")).rows;
    assert.deepEqual(viewColumns, [{ table_name: 'teachers', columns: ['id', 'first_name', 'last_name'] }, { table_name: 'usage_events', columns: VIEW_COLUMNS }]);
    const visible = (await grafanaRole.query('SELECT * FROM studio_metrics.usage_events ORDER BY id')).rows;
    assert.equal(visible.length, 6);
    assert.doesNotMatch(JSON.stringify(visible), /5555550/);
    assert.deepEqual((await grafanaRole.query('SELECT first_name, last_name FROM studio_metrics.teachers ORDER BY id')).rows,
      [{ first_name: 'Alpha', last_name: 'Synthetic' }, { first_name: 'Beta', last_name: 'Synthetic' }]);
    const relations = (await migrator.query(`SELECT format('%I.%I', n.nspname, c.relname) AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('app', 'studio_private', 'public') AND c.relkind IN ('r', 'v', 'm', 'p', 'S') ORDER BY 1`)).rows.map((row) => row.name as string);
    assert.ok(relations.includes('studio_private.teachers') && relations.includes('studio_private.usage_events') && relations.length > 10);
    for (const relation of relations) {
      await assert.rejects(grafanaRole.query(`SELECT * FROM ${relation} LIMIT 1`), (error: { code?: string }) => error.code === '42501', relation);
    }
    const privileges = (await migrator.query(`SELECT bool_or(has_table_privilege('studio_grafana', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS tables,
      bool_or(has_schema_privilege('studio_grafana', n.oid, 'USAGE')) AS schemas
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname IN ('app', 'studio_private', 'public')`)).rows[0];
    assert.deepEqual(privileges, { tables: false, schemas: false });
    const functions = (await migrator.query(`SELECT count(*)::int AS count FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname IN ('app', 'studio_private') AND has_function_privilege('studio_grafana', p.oid, 'EXECUTE')`)).rows[0].count;
    assert.equal(functions, 0, 'no studio function is executable by Grafana');
    for (const statement of ['SELECT studio_private.identity_phone_digits()', "SELECT studio_private.record_usage_event(NULL, '{}'::jsonb)"]) {
      await assert.rejects(grafanaRole.query(statement), (error: { code?: string }) => error.code === '42501', statement);
    }
    const writes = ['INSERT INTO studio_metrics.teachers (first_name, last_name) VALUES (\'Forged\', \'Synthetic\')',
      "UPDATE studio_metrics.teachers SET first_name = 'Forged'", 'DELETE FROM studio_metrics.teachers', 'DELETE FROM studio_metrics.usage_events',
      'TRUNCATE studio_private.usage_events', 'CREATE TABLE studio_metrics.forged (id int)', 'CREATE TEMP TABLE forged (id int)'];
    // Read-only by default, and still refused by privilege when the session turns it off.
    for (const statement of writes) {
      await assert.rejects(grafanaRole.query(statement), (error: { code?: string }) => ['25006', '42501', '55000'].includes(error.code ?? ''), statement);
    }
    await grafanaRole.query('SET default_transaction_read_only = off');
    for (const statement of writes) {
      // The events view joins two tables and is not updatable at all (55000).
      const codes = statement.includes('usage_events') ? ['42501', '55000'] : ['42501'];
      await assert.rejects(grafanaRole.query(statement), (error: { code?: string }) => codes.includes(error.code ?? ''), statement);
    }
    await assert.rejects(connect('studio_grafana', secrets['db-grafana'], 'postgres'), (error: { code?: string }) => error.code === '28000');
    await assert.rejects(connect('studio_grafana', 'wrong-synthetic-password'), (error: { code?: string }) => error.code === '28P01');

    // 2. Without valid credentials Grafana stops with a fixed event only.
    for (const value of ['', 'short']) {
      await writeFile(join(directory, 'grafana-admin-password'), value, { mode: 0o600 });
      const failed = tryCompose('up', '-d', '--no-build', '--no-deps', '--force-recreate', '--wait', '--wait-timeout', '60', 'grafana');
      assert.notEqual(failed.status, 0, `Grafana started with admin password ${JSON.stringify(value)}`);
      const id = compose('ps', '-aq', 'grafana').trim();
      const logs = execFileSync('docker', ['logs', id], { encoding: 'utf8', stdio: 'pipe' });
      // The restart policy repeats the attempt; each one leaves only the fixed event.
      assert.match(logs, /^(grafana_preflight_failed\n)+$/);
      assert.doesNotMatch(`${failed.stdout}${failed.stderr}`, new RegExp(secrets['db-grafana']));
    }
    await writeFile(join(directory, 'grafana-admin-password'), `${adminPassword}\n`, { mode: 0o600 });

    // 3. Loopback only, fixed log, authentication required.
    compose('up', '-d', '--no-build', '--no-deps', '--force-recreate', '--wait', '--wait-timeout', '180', 'grafana');
    const grafanaId = () => compose('ps', '-q', 'grafana').trim();
    const bindings = JSON.parse(execFileSync('docker', ['inspect', '--format', '{{json .HostConfig.PortBindings}}', grafanaId()], { encoding: 'utf8' })) as Record<string, { HostIp: string; HostPort: string }[]>;
    assert.deepEqual(Object.keys(bindings), ['3000/tcp']);
    assert.deepEqual(bindings['3000/tcp'].map((binding) => binding.HostIp), ['127.0.0.1']);
    const published = compose('port', 'grafana', '3000').trim();
    assert.match(published, /^127\.0\.0\.1:\d+$/);
    const base = `http://${published}`;
    const basic = (password: string) => ({ Authorization: `Basic ${Buffer.from(`admin:${password}`).toString('base64')}` });
    const auth = { ...basic(adminPassword), 'Content-Type': 'application/json' };
    const call = async (path: string, init: RequestInit = {}) => fetch(`${base}${path}`, { ...init, headers: { ...auth, ...(init.headers as Record<string, string> | undefined) } });
    assert.equal((await fetch(`${base}/api/dashboards/uid/pilates-usage`)).status, 401);
    assert.equal((await fetch(`${base}/api/search`, { headers: basic('wrong-synthetic-password') })).status, 401);
    assert.equal((await fetch(`${base}/api/user/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'x@example.invalid', password: 'synthetic-password' }) })).status >= 400, true);
    const settings = await (await call('/api/frontend/settings')).json() as { anonymousEnabled?: boolean; allowOrgCreate?: boolean };
    assert.equal(settings.anonymousEnabled, false);
    assert.equal((await call('/api/search')).status, 200);
    // The usage dashboard is the home page opened right after the login.
    const home = async (get: (path: string) => Promise<Response>) => {
      const response = await get('/api/dashboards/home');
      assert.equal(response.status, 200);
      // The home redirects to the provisioned, read-only dashboard: no saveable copy exists.
      assert.deepEqual(await response.json(), { redirectUri: '/d/pilates-usage' });
      const target = await (await get('/api/dashboards/uid/pilates-usage')).json() as { meta: { provisioned: boolean } };
      assert.equal(target.meta.provisioned, true);
      const dashboards = await (await get('/api/search?type=dash-db')).json() as { uid: string }[];
      assert.ok(!dashboards.some((item) => item.uid === 'default-home-dashboard'), 'home dashboard copy created');
    };
    await home(call);
    assert.equal((await fetch(`${base}/api/dashboards/home`)).status, 401);

    // 4. Provisioning: fixed datasource and dashboard, not changeable from the interface.
    const datasource = await (await call('/api/datasources/uid/pilates-metrics')).json() as { readOnly: boolean; user: string; jsonData: { database: string }; secureJsonFields: { password?: boolean }; type: string };
    assert.equal(datasource.readOnly, true);
    assert.equal(datasource.user, 'studio_grafana');
    assert.equal(datasource.jsonData.database, 'studio');
    assert.equal(datasource.secureJsonFields.password, true);
    assert.doesNotMatch(JSON.stringify(datasource), new RegExp(secrets['db-grafana']));
    assert.equal((await call('/api/datasources/uid/pilates-metrics/health')).status, 200);
    const loaded = await (await call('/api/dashboards/uid/pilates-usage')).json() as { dashboard: Dashboard; meta: { provisioned: boolean } };
    assert.equal(loaded.meta.provisioned, true);
    const dashboard = loaded.dashboard;
    assert.equal(dashboard.title, "Metriche d'uso dell'agente");
    assert.equal(dashboard.panels.length, 11);
    const changed = { ...dashboard, title: 'Modifica sintetica' };
    assert.ok((await call('/api/dashboards/db', { method: 'POST', body: JSON.stringify({ dashboard: changed, overwrite: true }) })).status >= 400, 'provisioned dashboard saved');
    assert.ok((await call('/api/dashboards/uid/pilates-usage', { method: 'DELETE' })).status >= 400, 'provisioned dashboard deleted');
    assert.ok((await call('/api/datasources/uid/pilates-metrics', { method: 'DELETE' })).status >= 400, 'provisioned datasource deleted');
    // Changes the interface allows are lost when the service is recreated.
    assert.equal((await call('/api/dashboards/db', { method: 'POST', body: JSON.stringify({ dashboard: { uid: 'synthetic-ui', title: 'Sintetica dall interfaccia', panels: [] } }) })).status, 200);
    assert.equal((await call('/api/admin/users', { method: 'POST', body: JSON.stringify({ name: 'Synthetic', login: 'synthetic-viewer', password: `Synthetic-${randomBytes(8).toString('hex')}` }) })).status, 200);
    compose('up', '-d', '--no-build', '--no-deps', '--force-recreate', '--wait', '--wait-timeout', '180', 'grafana');
    const recreatedBase = `http://${compose('port', 'grafana', '3000').trim()}`;
    const recreated = async (path: string) => fetch(`${recreatedBase}${path}`, { headers: auth });
    assert.equal((await recreated('/api/dashboards/uid/synthetic-ui')).status, 404);
    assert.equal((await recreated('/api/users/lookup?loginOrEmail=synthetic-viewer')).status, 404);
    assert.equal(((await (await recreated('/api/dashboards/uid/pilates-usage')).json()) as { dashboard: Dashboard }).dashboard.title, "Metriche d'uso dell'agente");
    await home(recreated);
    const logs = execFileSync('docker', ['logs', grafanaId()], { encoding: 'utf8', stdio: 'pipe' });
    assert.equal(logs, 'grafana_launch\n');

    // 5. Every panel query answers through the datasource with the expected values.
    const query = async (rawSql: string, format: string, teacher: string[]) => {
      const sql = rawSql.replaceAll('$teacher', teacher.join(','));
      const response = await fetch(`${recreatedBase}/api/ds/query`, { method: 'POST', headers: auth, body: JSON.stringify({
        from: String(Date.parse('2026-11-19T00:00:00Z')), to: String(Date.parse('2026-11-23T00:00:00Z')),
        queries: [{ refId: 'A', datasource: { uid: 'pilates-metrics' }, rawSql: sql, format }],
      }) });
      const body = await response.json() as QueryResponse;
      assert.equal(response.status, 200, JSON.stringify(body));
      assert.equal(body.results.A.error, undefined);
      assert.doesNotMatch(JSON.stringify(body), /5555550/);
      return body;
    };
    const variable = dashboard.templating.list.find((item) => item.name === 'teacher');
    assert.ok(variable);
    const options = rows(await query(variable.query, 'table', ['-1']));
    assert.deepEqual(options.map((row) => [row.__text, String(row.__value)]), [['Alpha Synthetic', ids[ALPHA]], ['Beta Synthetic', ids[BETA]]]);
    const results: Record<string, QueryResponse> = {};
    for (const panel of dashboard.panels) {
      assert.equal(panel.targets.length, 1);
      results[panel.title] = await query(panel.targets[0].rawSql, panel.targets[0].format, ['-1']);
      assert.ok((results[panel.title].results.A.frames ?? []).length > 0, panel.title);
    }
    const messages = JSON.stringify(results['Messaggi per utilizzatore e giorno']);
    for (const name of ['Alpha Synthetic', 'Beta Synthetic', 'Non censito']) assert.ok(messages.includes(name), name);
    assert.deepEqual(rows(results['Messaggi per utilizzatore e tipo di turno']).map((row) => Object.values(row)),
      [['Alpha Synthetic', 3, 2, 1, 0, 0], ['Beta Synthetic', 2, 1, 0, 1, 0], ['Non censito', 1, 0, 0, 1, 0]]);
    assert.deepEqual(rows(results['Tempi di risposta nel periodo']), [{
      'Complessivo, mediana': 600, 'Complessivo, 95° percentile': 2750, 'Modello, mediana': 1500, 'Modello, 95° percentile': 2400 }]);
    assert.deepEqual(rows(results['Costi per utilizzatore']).map((row) => Object.values(row)), [['Alpha Synthetic', 0.003, 2, 0], ['Beta Synthetic', null, 1, 1]]);
    assert.deepEqual(rows(results['Costi per modello']).map((row) => Object.values(row)), [['openai/synthetic-a', 0.003, 2, 0], ['anthropic/synthetic-b', null, 1, 1]]);
    assert.deepEqual(rows(results['Invii rifiutati']).map((row) => [row.Utilizzatore, row.Esito, row['Stato HTTP'], row['Codice Meta'], row.Messaggi]),
      [['Alpha Synthetic', 'network', null, null, 1], ['Beta Synthetic', 'refused', 400, 131030, 1]]);
    const context = JSON.stringify(results['Contesto inviato e soglia di compattazione']);
    for (const value of ['10', '20', '5', '40']) assert.match(context, new RegExp(`[\\[,]${value}[\\],]`), value);
    assert.match(JSON.stringify(results['Compattazioni per giorno']), /Alpha Synthetic/);
    assert.match(JSON.stringify(results['Token per giorno']), /3000/);
    // The teacher filter limits every panel to the chosen people.
    const filtered = rows(await query(dashboard.panels.find((panel) => panel.title === 'Messaggi per utilizzatore e tipo di turno')?.targets[0].rawSql ?? '', 'table', [ids[BETA]]));
    assert.deepEqual(filtered.map((row) => row.Utilizzatore), ['Beta Synthetic']);
  } finally {
    await Promise.all(clients.map((client) => client.end().catch(() => undefined)));
    spawnSync('docker', ['compose', '-p', project, '-f', 'compose.yaml', 'down', '-v', '--remove-orphans'], { env, stdio: 'ignore', timeout: 180_000 });
    await rm(directory, { recursive: true, force: true });
  }
});
