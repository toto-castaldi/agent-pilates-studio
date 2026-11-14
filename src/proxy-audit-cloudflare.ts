// Read-only Cloudflare part of the proxy privacy audit (TEC-008). Pure logic:
// the launcher injects the authenticated HTTP request. Only the endpoints in
// ALLOWED_REQUESTS may be called: no Logpush (it needs write permissions), no
// Logpull data, no Instant Logs, no tunnel log streaming (REQ-NFR-004).
// Results are counts, dataset names, retention and booleans on synthetic
// markers; raw responses, tokens and error messages are never returned.

import { DEV_HOST, type Finding, type Level, MARKER_PREFIX, PROD_HOST } from './proxy-audit.ts';

export const ZONE_NAME = 'toto-castaldi.com';
export const API_ORIGIN = 'https://api.cloudflare.com';
const ID = /^[0-9a-f]{32}$/;
const TOKEN = /^[A-Za-z0-9._~+/=-]{20,512}$/;

export interface CloudflareConfig {
  token: string;
  zoneId?: string;
  accountId?: string;
}

const configError = (): never => {
  throw new Error('Configurazione Cloudflare non valida.');
};

// Either a file with only the token, or KEY=value lines.
export function parseCloudflareConfig(source: string): CloudflareConfig {
  if (source.length > 4096) configError();
  const lines = source.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  if (lines.length === 1 && !lines[0].includes('=')) {
    if (!TOKEN.test(lines[0])) configError();
    return { token: lines[0] };
  }
  const values: Record<string, string> = {};
  for (const line of lines) {
    const separator = line.indexOf('=');
    if (separator < 1) configError();
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    if (!['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ZONE_ID', 'CLOUDFLARE_ACCOUNT_ID'].includes(key) || Object.hasOwn(values, key)) configError();
    values[key] = value;
  }
  const token = values.CLOUDFLARE_API_TOKEN;
  if (!token || !TOKEN.test(token)) configError();
  for (const key of ['CLOUDFLARE_ZONE_ID', 'CLOUDFLARE_ACCOUNT_ID']) {
    if (values[key] !== undefined && !ID.test(values[key])) configError();
  }
  return {
    token,
    ...(values.CLOUDFLARE_ZONE_ID ? { zoneId: values.CLOUDFLARE_ZONE_ID } : {}),
    ...(values.CLOUDFLARE_ACCOUNT_ID ? { accountId: values.CLOUDFLARE_ACCOUNT_ID } : {}),
  };
}

export const ALLOWED_REQUESTS: ReadonlyArray<{ method: 'GET' | 'POST'; path: RegExp }> = [
  { method: 'POST', path: /^\/client\/v4\/graphql$/ },
  { method: 'GET', path: /^\/client\/v4\/zones\?name=toto-castaldi\.com$/ },
  { method: 'GET', path: /^\/client\/v4\/zones\/[0-9a-f]{32}\/logs\/control\/retention\/flag$/ },
  { method: 'GET', path: /^\/client\/v4\/(zones|accounts)\/[0-9a-f]{32}\/logs\/explorer\/datasets$/ },
  // Log Search: only COUNT(*) over the synthetic Ray IDs of an audit run.
  { method: 'GET', path: /^\/client\/v4\/zones\/[0-9a-f]{32}\/logs\/explorer\/query\/sql\?query=SELECT%20COUNT\(\*\)%20AS%20count%20FROM%20(http_requests|firewall_events)%20WHERE%20Date%20%3E%3D%20'[0-9]{4}-[0-9]{2}-[0-9]{2}'%20AND%20RayID%20IN%20\('[0-9a-f]{16}'(%2C'[0-9a-f]{16}'){0,49}\)$/ },
];

export function assertAllowedRequest(method: string, path: string): void {
  if (!ALLOWED_REQUESTS.some((entry) => entry.method === method && entry.path.test(path))) {
    throw new Error('Richiesta Cloudflare non consentita.');
  }
}

export interface ApiResponse {
  status: number;
  json: unknown;
}

export interface CloudflareSystem {
  request(method: 'GET' | 'POST', path: string, body?: string): Promise<ApiResponse>;
  sleep(ms: number): Promise<void>;
  now(): number;
}

export interface RunState {
  runId: string;
  startedAt: string;
  finishedAt: string;
  markers: Record<string, string>;
  probes: Array<{ id: string; status: number | string; ray: string | null; edgeBlocked: boolean }>;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function path(value: unknown, keys: Array<string | number>): unknown {
  let current = value;
  for (const key of keys) {
    if (typeof key === 'number') {
      if (!Array.isArray(current)) return undefined;
      current = current[key];
    } else {
      if (!object(current)) return undefined;
      current = current[key];
    }
  }
  return current;
}

export type QueryOutcome = { ok: true; data: unknown } | { ok: false; reason: 'denied' | 'invalid' | 'error' };

// GraphQL error texts are classified, never returned.
export function classifyGraphql(response: ApiResponse): QueryOutcome {
  const errors = path(response.json, ['errors']);
  const data = path(response.json, ['data']);
  if (response.status === 200 && (!Array.isArray(errors) || errors.length === 0) && object(data)) return { ok: true, data };
  const messages = Array.isArray(errors) ? errors.map((error) => String(path(error, ['message']) ?? '')).join(' ').toLowerCase() : '';
  if (response.status === 401 || response.status === 403 || /not authori[sz]ed|does not have access|permission|forbidden|authentication/.test(messages)) {
    return { ok: false, reason: 'denied' };
  }
  if (response.status === 400 || /unknown|cannot query|parse|syntax|not defined|argument/.test(messages)) return { ok: false, reason: 'invalid' };
  return { ok: false, reason: 'error' };
}

export async function graphql(system: CloudflareSystem, query: string): Promise<QueryOutcome> {
  assertAllowedRequest('POST', '/client/v4/graphql');
  try {
    return classifyGraphql(await system.request('POST', '/client/v4/graphql', JSON.stringify({ query })));
  } catch {
    return { ok: false, reason: 'error' };
  }
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]{0,99}$/;
const quote = (value: string) => JSON.stringify(value);

export function namedType(type: unknown): string | null {
  let current = type;
  for (let depth = 0; depth < 6 && object(current); depth += 1) {
    if (typeof current.name === 'string' && current.name) return NAME.test(current.name) ? current.name : null;
    current = current.ofType;
  }
  return null;
}

const TYPE_REF = 'type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }';

export function typeFieldsQuery(typeName: string): string {
  if (!NAME.test(typeName)) throw new Error('Tipo GraphQL non valido.');
  return `{ __type(name: ${quote(typeName)}) { fields { name ${TYPE_REF} } } }`;
}

export function fieldsOf(data: unknown): Array<{ name: string; type: string | null }> {
  const fields = path(data, ['__type', 'fields']);
  if (!Array.isArray(fields)) return [];
  return fields.flatMap((field) => {
    const name = path(field, ['name']);
    return typeof name === 'string' && NAME.test(name) ? [{ name, type: namedType(path(field, ['type'])) }] : [];
  });
}

async function fieldType(system: CloudflareSystem, typeName: string, field: string): Promise<string | null> {
  const outcome = await graphql(system, typeFieldsQuery(typeName));
  if (!outcome.ok) return null;
  return fieldsOf(outcome.data).find((entry) => entry.name === field)?.type ?? null;
}

// viewer -> zones/accounts -> settings -> dataset names, by introspection.
export async function datasetNames(system: CloudflareSystem, scope: 'zones' | 'accounts'): Promise<string[] | null> {
  const scopeType = await fieldType(system, 'viewer', scope);
  if (!scopeType) return null;
  const settingsType = await fieldType(system, scopeType, 'settings');
  if (!settingsType) return null;
  const outcome = await graphql(system, typeFieldsQuery(settingsType));
  if (!outcome.ok) return null;
  return fieldsOf(outcome.data).map((field) => field.name).sort();
}

export interface DatasetSettings {
  name: string;
  enabled: boolean;
  notOlderThan: number | null;
  maxDuration: number | null;
  fields: string[];
}

export function settingsQuery(scope: 'zones' | 'accounts', tag: string, names: readonly string[]): string {
  if (!ID.test(tag) || names.some((name) => !NAME.test(name))) throw new Error('Richiesta GraphQL non valida.');
  const filter = scope === 'zones' ? `zoneTag: ${quote(tag)}` : `accountTag: ${quote(tag)}`;
  const body = names.map((name, index) => `d${index}: ${name} { enabled notOlderThan maxDuration availableFields }`).join(' ');
  return `{ viewer { ${scope}(filter: { ${filter} }) { settings { ${body} } } } }`;
}

export function parseSettings(data: unknown, scope: 'zones' | 'accounts', names: readonly string[]): DatasetSettings[] {
  const settings = path(data, ['viewer', scope, 0, 'settings']);
  if (!object(settings)) return [];
  return names.flatMap((name, index) => {
    const entry = settings[`d${index}`];
    if (!object(entry)) return [];
    const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
    const fields = Array.isArray(entry.availableFields) ? entry.availableFields.filter((field): field is string => typeof field === 'string' && NAME.test(field)) : [];
    return [{ name, enabled: entry.enabled === true, notOlderThan: number(entry.notOlderThan), maxDuration: number(entry.maxDuration), fields }];
  });
}

export async function datasetSettings(system: CloudflareSystem, scope: 'zones' | 'accounts', tag: string, names: readonly string[]): Promise<DatasetSettings[]> {
  const result: DatasetSettings[] = [];
  for (let start = 0; start < names.length; start += 15) {
    const batch = names.slice(start, start + 15);
    const outcome = await graphql(system, settingsQuery(scope, tag, batch));
    if (outcome.ok) {
      result.push(...parseSettings(outcome.data, scope, batch));
      continue;
    }
    for (const name of batch) {
      const single = await graphql(system, settingsQuery(scope, tag, [name]));
      if (single.ok) result.push(...parseSettings(single.data, scope, [name]));
    }
  }
  return result;
}

// Request fields relevant to the webhook traffic. Query strings can carry the
// Meta verify token; the others identify requests without secrets.
export const QUERY_FIELD = /(^|_)(clientRequestQuery|clientRefererQuery)$/;
export const REQUEST_FIELD = /(^|_)(clientRequestQuery|clientRequestPath|clientRefererQuery|clientRefererPath|clientRefererHost|userAgent|clientIP)$/;

export function requestFields(dataset: DatasetSettings): string[] {
  return dataset.fields.filter((field) => REQUEST_FIELD.test(field)).sort();
}

export function hasQueryField(dataset: DatasetSettings): boolean {
  return dataset.fields.some((field) => QUERY_FIELD.test(field));
}

const RAY = /^[0-9a-f]{16}$/;
export function rayName(header: string | null): string | null {
  if (!header) return null;
  const value = header.split('-')[0];
  return RAY.test(value) ? value : null;
}

const EVENT_FIELDS = ['datetime', 'rayName', 'clientRequestHTTPHost', 'clientRequestHTTPMethodName', 'clientRequestPath', 'clientRequestQuery', 'clientRequestReferer', 'userAgent', 'edgeResponseStatus', 'originResponseStatus', 'sampleInterval', 'action', 'source'];

export function eventFields(dataset: DatasetSettings): string[] {
  const available = new Set(dataset.fields);
  const extra = dataset.fields.filter((field) => /header|body|cookie/i.test(field) && !field.includes('_'));
  return [...EVENT_FIELDS.filter((field) => available.has(field)), ...extra];
}

const ISO = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/;
export function iso(ms: number): string {
  return new Date(Math.floor(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z');
}

export function eventsQuery(dataset: string, zoneTag: string, fields: readonly string[], from: string, to: string, rays: readonly string[]): string {
  if (!NAME.test(dataset) || !ID.test(zoneTag) || !ISO.test(from) || !ISO.test(to) || rays.some((ray) => !RAY.test(ray)) || fields.some((field) => !NAME.test(field))) {
    throw new Error('Richiesta GraphQL non valida.');
  }
  return `{ viewer { zones(filter: { zoneTag: ${quote(zoneTag)} }) { events: ${dataset}(limit: 200, filter: { datetime_geq: ${quote(from)}, datetime_leq: ${quote(to)}, rayName_in: [${rays.map(quote).join(', ')}] }) { ${fields.join(' ')} } } } }`;
}

export function parseEvents(data: unknown): Array<Record<string, unknown>> {
  const events = path(data, ['viewer', 'zones', 0, 'events']);
  return Array.isArray(events) ? events.filter(object) : [];
}

// Retained verification requests outside the audits, selecting only date, host
// and response status: the query strings themselves are never requested. Only
// the correct verify token obtains 200, so a 200 proves a real token is retained.
export function verificationQuery(dataset: string, zoneTag: string, from: string, to: string): string {
  if (!NAME.test(dataset) || !ID.test(zoneTag) || !ISO.test(from) || !ISO.test(to)) throw new Error('Richiesta GraphQL non valida.');
  return `{ viewer { zones(filter: { zoneTag: ${quote(zoneTag)} }) { events: ${dataset}(limit: 1000, filter: { datetime_geq: ${quote(from)}, datetime_lt: ${quote(to)}, clientRequestHTTPHost_in: [${quote(PROD_HOST)}, ${quote(DEV_HOST)}], clientRequestQuery_like: "%verify_token%", clientRequestQuery_notlike: ${quote(`%${MARKER_PREFIX}%`)} }) { datetime clientRequestHTTPHost edgeResponseStatus } } } }`;
}

export type StatusClass = '200' | '403' | '5xx' | 'other';
export interface VerificationCounts {
  hosts: Record<'prod' | 'dev', Record<StatusClass, number>>;
  accepted: Record<'prod' | 'dev', { first: string | null; last: string | null; lastAt: string | null }>;
  first: string | null;
  last: string | null;
  truncated: boolean;
  retentionDays: number;
}

export function emptyVerification(retentionDays: number): VerificationCounts {
  const zero = (): Record<StatusClass, number> => ({ '200': 0, '403': 0, '5xx': 0, other: 0 });
  return { hosts: { prod: zero(), dev: zero() }, accepted: { prod: { first: null, last: null, lastAt: null }, dev: { first: null, last: null, lastAt: null } }, first: null, last: null, truncated: false, retentionDays };
}

export function addVerifications(counts: VerificationCounts, events: ReadonlyArray<Record<string, unknown>>): void {
  if (events.length >= 1000) counts.truncated = true;
  for (const event of events) {
    const host = event.clientRequestHTTPHost === PROD_HOST ? 'prod' : event.clientRequestHTTPHost === DEV_HOST ? 'dev' : null;
    if (!host) continue;
    const status = typeof event.edgeResponseStatus === 'number' ? event.edgeResponseStatus : 0;
    const kind: StatusClass = status === 200 ? '200' : status === 403 ? '403' : status >= 500 && status < 600 ? '5xx' : 'other';
    counts.hosts[host][kind] += 1;
    const day = typeof event.datetime === 'string' && ISO.test(event.datetime) ? event.datetime.slice(0, 10) : null;
    if (!day) continue;
    if (!counts.first || day < counts.first) counts.first = day;
    if (!counts.last || day > counts.last) counts.last = day;
    if (kind === '200') {
      const accepted = counts.accepted[host];
      if (!accepted.first || day < accepted.first) accepted.first = day;
      if (!accepted.last || day > accepted.last) accepted.last = day;
      const at = event.datetime as string;
      if (!accepted.lastAt || at > accepted.lastAt) accepted.lastAt = at;
    }
  }
}

export function addDays(day: string, count: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + count * 86_400_000).toISOString().slice(0, 10);
}

export interface MarkerPresence {
  probe: string;
  found: boolean;
  sampled: boolean;
  fields: Record<string, string[]>; // marker kind -> event fields containing it
}

export function markerPresence(state: RunState, events: ReadonlyArray<Record<string, unknown>>): MarkerPresence[] {
  return state.probes.filter((probe) => probe.ray).map((probe) => {
    const ray = rayName(probe.ray);
    const event = events.find((item) => item.rayName === ray);
    const fields: Record<string, string[]> = {};
    if (event) {
      for (const [id, value] of Object.entries(state.markers)) {
        const [probeId, kind] = id.split('.');
        if (probeId !== probe.id) continue;
        fields[kind] = Object.entries(event).filter(([, content]) => typeof content === 'string' && content.includes(value)).map(([field]) => field).sort();
      }
    }
    const interval = event?.sampleInterval;
    return { probe: probe.id, found: Boolean(event), sampled: typeof interval === 'number' && interval > 1, fields };
  });
}

const days = (seconds: number | null) => (seconds === null ? 'n.d.' : `${Math.floor(seconds / 86400)} giorni`);

export interface CloudflareEvidence {
  configured: boolean;
  zone: 'provided' | 'discovered' | 'missing';
  account: 'provided' | 'discovered' | 'missing';
  zoneDatasets: DatasetSettings[] | null;
  accountDatasets: DatasetSettings[] | null;
  http: MarkerPresence[] | null;
  httpReason?: string;
  firewall: MarkerPresence[] | null;
  firewallReason?: string;
  verification: VerificationCounts | null;
  retentionFlag: boolean | 'unavailable';
  retentionStatus?: string;
  logExplorer: Record<'zone' | 'account', string[] | 'unavailable' | 'missing'>;
  logExplorerStatus?: Partial<Record<'zone' | 'account', string>>;
  logSearch: Record<'http_requests' | 'firewall_events', SearchOutcome | 'skipped'>;
}

export interface Rotations {
  // ISO instants after which the server no longer accepts the retained token.
  prod?: string | null;
  dev?: string | null;
}

export function evaluateCloudflare(evidence: CloudflareEvidence, rotations: Rotations = {}): Finding[] {
  const findings: Finding[] = [];
  const add = (level: Level, text: string) => findings.push({ section: 'cloudflare', level, text });
  add('info', 'Live logs, Instant Logs, cloudflared tail e Logpull dei dati non sono usati (REQ-NFR-004); solo GraphQL e metadati in lettura.');
  add('unverified', 'Job Logpush non elencabili con un token di sola lettura (richiedono Logs Write): resta la dichiarazione dell\'operatore e il controllo dal dashboard.');
  if (!evidence.configured) {
    add('unverified', 'Configurazione Cloudflare assente: campi, retention e marcatori lato Cloudflare non verificati.');
    return findings;
  }
  if (evidence.zone === 'missing') {
    add('unverified', 'ID della zona non disponibile: aggiungere CLOUDFLARE_ZONE_ID alla configurazione privata.');
    return findings;
  }
  const inventory = (label: string, datasets: DatasetSettings[] | null) => {
    if (!datasets) {
      add('unverified', `Dataset GraphQL ${label} non elencabili con il token fornito.`);
      return;
    }
    const enabled = datasets.filter((dataset) => dataset.enabled);
    const query = enabled.filter(hasQueryField);
    const request = enabled.filter((dataset) => !hasQueryField(dataset) && requestFields(dataset).length > 0);
    const list = (items: DatasetSettings[]) => (items.length ? items.map((dataset) => `${dataset.name} (${days(dataset.notOlderThan)})`).join(', ') : 'nessuno');
    add('info', `Dataset GraphQL ${label}: ${enabled.length} abilitati su ${datasets.length}. Con query string della richiesta: ${list(query)}. Con percorso, user-agent o IP ma senza query: ${list(request)}.`);
  };
  inventory('della zona', evidence.zoneDatasets);
  if (evidence.account === 'missing') add('unverified', 'ID dell\'account non disponibile: dataset dell\'account non verificati.');
  else inventory('dell\'account', evidence.accountDatasets);

  const presence = (label: string, entries: MarkerPresence[] | null, reason?: string) => {
    if (!entries) {
      add('unverified', `${label}: ricerca dei marcatori non eseguita (${reason ?? 'non disponibile'}).`);
      return;
    }
    const found = entries.filter((entry) => entry.found);
    add(found.length ? 'ok' : 'unverified', `${label}: eventi delle prove ritrovati ${found.length} su ${entries.length}${found.some((entry) => entry.sampled) ? ' (alcuni campionati)' : ''}.`);
    const where = (kinds: string[]) => found.filter((entry) => kinds.some((kind) => (entry.fields[kind] ?? []).length > 0)).map((entry) => entry.probe);
    const query = where(['token', 'challenge', 'query']);
    if (query.length) add('exposure', `${label}: la query string è conservata con i marcatori sintetici (${query.join(', ')}): un hub.verify_token inviato da Meta resta leggibile per tutta la retention.`);
    else if (found.length) add('ok', `${label}: nessun marcatore di query nei campi conservati.`);
    const path = where(['path', 'agent', 'referer']);
    if (path.length) add('info', `${label}: percorso, user-agent o referer conservati (${path.join(', ')}); il percorso del webhook non contiene segreti.`);
    const body = where(['header', 'signature', 'phone', 'message']);
    add(body.length ? 'exposure' : (found.length ? 'ok' : 'unverified'), body.length
      ? `${label}: header o corpo sintetici presenti nei campi (${body.join(', ')}).`
      : `${label}: header, firma, telefono e messaggio sintetici assenti dai campi disponibili.`);
  };
  presence('httpRequestsAdaptive', evidence.http, evidence.httpReason);
  presence('firewallEventsAdaptive', evidence.firewall, evidence.firewallReason);

  if (!evidence.verification) add('unverified', 'Conteggio delle richieste di verifica conservate non eseguito.');
  else {
    const counts = evidence.verification;
    const describe = (host: 'prod' | 'dev') => {
      const value = counts.hosts[host];
      return `200 ${value['200']}, 403 ${value['403']}, 5xx ${value['5xx']}, altri ${value.other}`;
    };
    add('info', `Richieste con verify_token non sintetico conservate negli ultimi ${counts.retentionDays} giorni${counts.first ? ` (dal ${counts.first} al ${counts.last})` : ''}: produzione ${describe('prod')}; sviluppo ${describe('dev')}${counts.truncated ? '; conteggio troncato' : ''}. Valori non letti.`);
    for (const [host, label] of [['prod', 'produzione'], ['dev', 'sviluppo']] as const) {
      const accepted = counts.accepted[host];
      const rotated = rotations[host];
      if (counts.hosts[host]['200'] > 0 && accepted.last && accepted.lastAt && rotated && rotated > accepted.lastAt) {
        add('ok', `Verify token di ${label} conservato in httpRequestsAdaptive fino a circa il ${addDays(accepted.last, counts.retentionDays)}, ma ruotato il ${rotated.slice(0, 10)} dopo l'ultima verifica accettata (${accepted.last}): il valore conservato non è più valido.`);
      } else if (counts.hosts[host]['200'] > 0 && accepted.last) {
        add('exposure', `Verify token reale di ${label} conservato in httpRequestsAdaptive: ${counts.hosts[host]['200']} verifiche accettate (200), l'ultima il ${accepted.last}, leggibili fino a circa il ${addDays(accepted.last, counts.retentionDays)}.`);
      } else if (counts.hosts[host]['5xx'] + counts.hosts[host].other > 0) {
        add('unverified', `Richieste di verifica di ${label} con esito 5xx o diverso: non è possibile stabilire se il token fosse reale.`);
      } else {
        add('ok', `Nessuna verifica accettata (200) di ${label} conservata: nessun verify token reale di ${label} provato nella retention.`);
      }
    }
  }
  if (evidence.retentionFlag === true) add('exposure', 'Retention Logpull attiva: i log completi delle richieste sono conservati.');
  else if (evidence.retentionFlag === false) add('ok', 'Retention Logpull disattivata.');
  else add('info', `Retention Logpull non disponibile per la zona (funzione Enterprise) o non leggibile (${evidence.retentionStatus ?? 'n.d.'}).`);
  for (const dataset of ['http_requests', 'firewall_events'] as const) {
    const outcome = evidence.logSearch[dataset];
    if (outcome === 'skipped') continue;
    if ('denied' in outcome) add('unverified', `Log Search ${dataset}: conteggio negato con il token di sola lettura (${outcome.denied}).`);
    else if ('unavailable' in outcome) add('info', `Log Search ${dataset}: dataset Log Explorer non interrogabile per la zona (${outcome.unavailable}): nessun log non campionato verificato.`);
    else add(outcome.count > 0 ? 'exposure' : 'info', outcome.count > 0
      ? `Log Search ${dataset}: ${outcome.count} richieste sintetiche conservate anche nei log non campionati di Log Explorer.`
      : `Log Search ${dataset}: dataset interrogabile ma nessuna richiesta sintetica conservata.`);
  }
  for (const scope of ['zone', 'account'] as const) {
    const value = evidence.logExplorer[scope];
    if (value === 'missing') continue;
    if (value === 'unavailable') add('unverified', `Dataset Log Explorer (${scope === 'zone' ? 'zona' : 'account'}) non elencabili con il token fornito (${evidence.logExplorerStatus?.[scope] ?? 'n.d.'}).`);
    else add(value.length ? 'exposure' : 'ok', value.length ? `Log Explorer conserva dataset non campionati (${value.join(', ')}).` : `Nessun dataset Log Explorer abilitato (${scope === 'zone' ? 'zona' : 'account'}).`);
  }
  return findings;
}

async function rest(system: CloudflareSystem, path: string): Promise<ApiResponse | null> {
  assertAllowedRequest('GET', path);
  try {
    return await system.request('GET', path);
  } catch {
    return null;
  }
}

export function datasetList(json: unknown): string[] | null {
  const result = path(json, ['result']);
  if (!Array.isArray(result)) return null;
  return result.flatMap((entry) => {
    const name = path(entry, ['dataset']);
    const enabled = path(entry, ['enabled']);
    return typeof name === 'string' && NAME.test(name) && enabled !== false ? [name] : [];
  }).sort();
}

export function logSearchPath(zoneId: string, dataset: 'http_requests' | 'firewall_events', day: string, rays: readonly string[]): string {
  if (!ID.test(zoneId) || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(day) || rays.length === 0 || rays.length > 50 || rays.some((ray) => !RAY.test(ray))) {
    throw new Error('Richiesta Cloudflare non consentita.');
  }
  const query = `SELECT COUNT(*) AS count FROM ${dataset} WHERE Date >= '${day}' AND RayID IN (${rays.map((ray) => `'${ray}'`).join(',')})`;
  return `/client/v4/zones/${zoneId}/logs/explorer/query/sql?query=${encodeURIComponent(query)}`;
}

// HTTP status and Cloudflare numeric error codes: metadata, never messages.
export function apiStatus(response: ApiResponse | null): string {
  if (!response) return 'nessuna risposta';
  const errors = path(response.json, ['errors']);
  const codes = Array.isArray(errors)
    ? errors.map((error) => path(error, ['code'])).filter((code): code is number => typeof code === 'number' && Number.isInteger(code) && code >= 0 && code < 10_000_000)
    : [];
  return `HTTP ${Number.isInteger(response.status) ? response.status : 0}${codes.length ? `, codice ${codes.slice(0, 3).join('/')}` : ''}`;
}

export type SearchOutcome = { count: number } | { denied: string } | { unavailable: string };

// The count is the only value read from a Log Search response.
export function searchCount(response: ApiResponse | null): SearchOutcome {
  if (!response) return { unavailable: apiStatus(response) };
  if (response.status === 401 || response.status === 403) return { denied: apiStatus(response) };
  if (response.status !== 200) return { unavailable: apiStatus(response) };
  const row = path(response.json, ['result', 0]) ?? path(response.json, ['result', 'rows', 0]) ?? path(response.json, ['data', 0]);
  if (!object(row)) return { unavailable: apiStatus(response) };
  const value = Object.values(row).find((item) => typeof item === 'number' || (typeof item === 'string' && /^[0-9]{1,9}$/.test(item)));
  return value === undefined ? { unavailable: apiStatus(response) } : { count: Number(value) };
}

export interface CheckOptions {
  waitMs: number;
  pollMs: number;
}

export async function collectCloudflare(system: CloudflareSystem, config: CloudflareConfig | null, state: RunState, options: CheckOptions): Promise<CloudflareEvidence> {
  const evidence: CloudflareEvidence = {
    configured: Boolean(config), zone: 'missing', account: 'missing', zoneDatasets: null, accountDatasets: null,
    http: null, firewall: null, verification: null, retentionFlag: 'unavailable', logExplorer: { zone: 'missing', account: 'missing' },
    logSearch: { http_requests: 'skipped', firewall_events: 'skipped' },
  };
  if (!config) return evidence;
  let zoneId = config.zoneId;
  let accountId = config.accountId;
  evidence.zone = zoneId ? 'provided' : 'missing';
  evidence.account = accountId ? 'provided' : 'missing';
  if (!zoneId || !accountId) {
    const response = await rest(system, `/client/v4/zones?name=${ZONE_NAME}`);
    const zone = response?.status === 200 ? path(response.json, ['result', 0, 'id']) : undefined;
    const account = response?.status === 200 ? path(response.json, ['result', 0, 'account', 'id']) : undefined;
    if (!zoneId && typeof zone === 'string' && ID.test(zone)) {
      zoneId = zone;
      evidence.zone = 'discovered';
    }
    if (!accountId && typeof account === 'string' && ID.test(account)) {
      accountId = account;
      evidence.account = 'discovered';
    }
  }
  if (!zoneId) return evidence;

  const zoneNames = await datasetNames(system, 'zones');
  evidence.zoneDatasets = zoneNames ? await datasetSettings(system, 'zones', zoneId, zoneNames) : null;
  if (accountId) {
    const accountNames = await datasetNames(system, 'accounts');
    evidence.accountDatasets = accountNames ? await datasetSettings(system, 'accounts', accountId, accountNames) : null;
  }

  const rays = state.probes.map((probe) => rayName(probe.ray)).filter((ray): ray is string => Boolean(ray));
  const from = iso(Date.parse(state.startedAt) - 120_000);
  const to = iso(Date.parse(state.finishedAt) + 15 * 60_000);
  const lookup = async (name: string): Promise<{ entries: MarkerPresence[] | null; reason?: string }> => {
    const dataset = evidence.zoneDatasets?.find((item) => item.name === name);
    if (!dataset?.enabled) return { entries: null, reason: 'dataset non abilitato o non leggibile' };
    const fields = eventFields(dataset);
    if (!fields.includes('rayName') || rays.length === 0) return { entries: null, reason: 'Ray ID non disponibili' };
    const deadline = system.now() + options.waitMs;
    let entries: MarkerPresence[] = [];
    for (;;) {
      const outcome = await graphql(system, eventsQuery(name, zoneId, fields, from, to, rays));
      if (!outcome.ok) return { entries: null, reason: outcome.reason === 'denied' ? 'accesso negato' : 'richiesta non riuscita' };
      entries = markerPresence(state, parseEvents(outcome.data));
      const expected = name === 'firewallEventsAdaptive' ? state.probes.filter((probe) => probe.edgeBlocked).length : entries.length;
      if (entries.filter((entry) => entry.found).length >= expected || system.now() >= deadline) break;
      await system.sleep(options.pollMs);
    }
    return { entries: name === 'firewallEventsAdaptive' ? entries.filter((entry) => entry.found || state.probes.find((probe) => probe.id === entry.probe)?.edgeBlocked) : entries };
  };
  const http = await lookup('httpRequestsAdaptive');
  evidence.http = http.entries;
  if (http.reason) evidence.httpReason = http.reason;
  const firewall = await lookup('firewallEventsAdaptive');
  evidence.firewall = firewall.entries;
  if (firewall.reason) evidence.firewallReason = firewall.reason;

  const httpDataset = evidence.zoneDatasets?.find((item) => item.name === 'httpRequestsAdaptive');
  if (httpDataset?.enabled && httpDataset.notOlderThan && httpDataset.fields.includes('clientRequestQuery') && httpDataset.fields.includes('edgeResponseStatus')) {
    const end = system.now();
    const start = end - httpDataset.notOlderThan * 1000 + 3_600_000;
    const step = Math.max(3_600_000, Math.min((httpDataset.maxDuration ?? 86_400) * 1000, 7 * 86_400_000));
    const counts = emptyVerification(Math.floor(httpDataset.notOlderThan / 86_400));
    let failed = false;
    for (let cursor = start; cursor < end; cursor += step) {
      const outcome = await graphql(system, verificationQuery('httpRequestsAdaptive', zoneId, iso(cursor), iso(Math.min(cursor + step, end))));
      if (!outcome.ok) {
        failed = true;
        break;
      }
      addVerifications(counts, parseEvents(outcome.data));
    }
    if (!failed) evidence.verification = counts;
  }

  const flag = await rest(system, `/client/v4/zones/${zoneId}/logs/control/retention/flag`);
  const flagValue = flag?.status === 200 ? path(flag.json, ['result', 'flag']) : undefined;
  evidence.retentionFlag = typeof flagValue === 'boolean' ? flagValue : 'unavailable';
  evidence.retentionStatus = apiStatus(flag);
  if (rays.length) {
    const day = state.startedAt.slice(0, 10);
    evidence.logSearch.http_requests = searchCount(await rest(system, logSearchPath(zoneId, 'http_requests', day, rays.slice(0, 50))));
    const blocked = state.probes.filter((probe) => probe.edgeBlocked).map((probe) => rayName(probe.ray)).filter((ray): ray is string => Boolean(ray));
    if (blocked.length) evidence.logSearch.firewall_events = searchCount(await rest(system, logSearchPath(zoneId, 'firewall_events', day, blocked)));
  }
  for (const [scope, id] of [['zone', zoneId], ['account', accountId]] as const) {
    if (!id) continue;
    const response = await rest(system, `/client/v4/${scope === 'zone' ? 'zones' : 'accounts'}/${id}/logs/explorer/datasets`);
    const list = response?.status === 200 ? datasetList(response.json) : null;
    evidence.logExplorer[scope] = list ?? 'unavailable';
    evidence.logExplorerStatus = { ...evidence.logExplorerStatus, [scope]: apiStatus(response) };
  }
  return evidence;
}
