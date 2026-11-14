// Pure core of the proxy privacy audit (TEC-008). No I/O: the launcher
// (scripts/proxy-audit.mjs) injects SSH, HTTP, clock and randomness.
// Outputs contain only fixed texts, counts, enumerations and synthetic
// identifiers: never log lines, secrets, messages or real telephone numbers.

export const PROD_HOST = 'agent-pilates-studio.toto-castaldi.com';
export const DEV_HOST = 'pilates-dev.toto-castaldi.com';
export const PROD_PATH = '/whatsapp/webhook';
export const DEV_PATH = '/webhooks/whatsapp';
export const DEV_ORIGIN_PORT = 8300;
export const MARKER_PREFIX = 'pxaudit';
export const SCHEMA = 'pilates-proxy-audit-v1';
export const PROBE_AGENT = 'curl/8.5.0';
export const PYTHON_AGENT = 'Python-urllib/3.14';

export type Phase = 'pre' | 'post' | 'privileged';
export type Kind = 'query' | 'token' | 'challenge' | 'header' | 'agent' | 'referer' | 'path' | 'phone' | 'message' | 'signature';
export type Group = 'prod' | 'dev-down' | 'dev-origin';
export type OriginMode = 'ok' | 'error' | 'reset' | 'slow';
export type Expected = number | 'aborted';

export interface ProbeSpec {
  id: string;
  group: Group;
  method: 'GET' | 'POST';
  host: string;
  kinds: Kind[];
  expected: Expected;
  mode?: OriginMode;
  abortAfterMs?: number;
  python?: boolean;
}

// Main outcomes of the proxy: ingress 404, origin 401/403, edge decision,
// origin unreachable (502) and, through a temporary synthetic origin, 200,
// 500, abrupt reset and a request cancelled by the client.
export const PROBES: readonly ProbeSpec[] = [
  { id: 'prod-root', group: 'prod', method: 'GET', host: PROD_HOST, kinds: ['query', 'header', 'agent', 'referer'], expected: 404 },
  { id: 'prod-health', group: 'prod', method: 'GET', host: PROD_HOST, kinds: ['query', 'header'], expected: 404 },
  { id: 'prod-subpath', group: 'prod', method: 'GET', host: PROD_HOST, kinds: ['path', 'query', 'header'], expected: 404 },
  { id: 'prod-verify', group: 'prod', method: 'GET', host: PROD_HOST, kinds: ['token', 'challenge', 'header'], expected: 403 },
  { id: 'prod-unsigned', group: 'prod', method: 'POST', host: PROD_HOST, kinds: ['query', 'header', 'phone', 'message'], expected: 401 },
  { id: 'prod-badsig', group: 'prod', method: 'POST', host: PROD_HOST, kinds: ['header', 'signature', 'phone', 'message'], expected: 401 },
  { id: 'prod-python', group: 'prod', method: 'GET', host: PROD_HOST, kinds: ['token', 'challenge'], expected: 403, python: true },
  { id: 'dev-verify', group: 'dev-down', method: 'GET', host: DEV_HOST, kinds: ['token', 'challenge', 'header'], expected: 502 },
  { id: 'dev-post', group: 'dev-down', method: 'POST', host: DEV_HOST, kinds: ['header', 'signature', 'phone', 'message'], expected: 502 },
  { id: 'origin-ok', group: 'dev-origin', method: 'GET', host: DEV_HOST, kinds: ['token', 'challenge', 'header'], expected: 200, mode: 'ok' },
  { id: 'origin-error', group: 'dev-origin', method: 'POST', host: DEV_HOST, kinds: ['query', 'header', 'phone', 'message'], expected: 500, mode: 'error' },
  { id: 'origin-reset', group: 'dev-origin', method: 'GET', host: DEV_HOST, kinds: ['token', 'header'], expected: 502, mode: 'reset' },
  { id: 'origin-cancel', group: 'dev-origin', method: 'GET', host: DEV_HOST, kinds: ['token', 'header'], expected: 'aborted', mode: 'slow', abortAfterMs: 3000 },
];

export interface Run {
  runId: string;
  prefix: string;
  control: string;
  markers: Record<string, string>;
}

export interface ProbeRequest {
  id: string;
  group: Group;
  method: 'GET' | 'POST';
  url: string;
  headers: Record<string, string>;
  body?: string;
  expected: Expected;
  abortAfterMs?: number;
}

export interface ProbeResult {
  id: string;
  group: Group;
  status: number | 'aborted' | 'error' | 'skipped';
  ray: string | null;
  edgeBlocked: boolean;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Fictional NANP numbers: any area code with 555-0100..0199 is reserved for fiction.
export function syntheticPhone(bytes: Uint8Array): string {
  if (bytes.length < 3) throw new Error('Casualità insufficiente.');
  const area = 201 + (((bytes[0] << 8) | bytes[1]) % 788);
  const line = String(bytes[2] % 100).padStart(2, '0');
  return `1${area}55501${line}`;
}

export function isSyntheticPhone(value: string): boolean {
  return /^1[2-9][0-9]{2}55501[0-9]{2}$/.test(value);
}

export function createRun(randomBytes: (size: number) => Uint8Array): Run {
  const runId = hex(randomBytes(4));
  const prefix = `${MARKER_PREFIX}${runId}`;
  const markers: Record<string, string> = {};
  PROBES.forEach((probe, index) => {
    for (const kind of probe.kinds) {
      markers[`${probe.id}.${kind}`] = kind === 'phone'
        ? syntheticPhone(randomBytes(3))
        : `${prefix}${String(index).padStart(2, '0')}${kind.slice(0, 2)}${hex(randomBytes(4))}`;
    }
  });
  const values = Object.values(markers);
  if (new Set(values).size !== values.length) throw new Error('Marcatori sintetici non univoci.');
  return { runId, prefix, control: `${prefix}control${hex(randomBytes(4))}`, markers };
}

function webhookBody(phone: string, message: string): string {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{
      id: '0',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          contacts: [{ wa_id: phone, profile: { name: 'Sintetico' } }],
          messages: [{ from: phone, id: `wamid.${message}`, type: 'text', text: { body: `Messaggio sintetico ${message}` } }],
        },
      }],
    }],
  });
}

export function buildProbe(spec: ProbeSpec, run: Run): ProbeRequest {
  const marker = (kind: Kind) => {
    const value = run.markers[`${spec.id}.${kind}`];
    if (!value) throw new Error('Marcatore mancante.');
    return value;
  };
  const has = (kind: Kind) => spec.kinds.includes(kind);
  const base = spec.host === PROD_HOST ? PROD_PATH : DEV_PATH;
  let path = base;
  if (spec.id === 'prod-root') path = '/';
  if (spec.id === 'prod-health') path = '/health';
  if (has('path')) path = `${base}/${marker('path')}`;
  const query = new URLSearchParams();
  if (has('token')) {
    query.set('hub.mode', 'subscribe');
    query.set('hub.verify_token', marker('token'));
  }
  if (has('challenge')) query.set('hub.challenge', marker('challenge'));
  if (has('query')) query.set('audit', marker('query'));
  const headers: Record<string, string> = {
    accept: '*/*',
    'user-agent': spec.python ? PYTHON_AGENT : has('agent') ? `${PROBE_AGENT} ${marker('agent')}` : PROBE_AGENT,
  };
  if (has('header')) headers['x-pilates-audit'] = marker('header');
  if (has('referer')) headers.referer = `https://example.invalid/${marker('referer')}`;
  if (has('signature')) headers['x-hub-signature-256'] = `sha256=${marker('signature')}`;
  if (spec.mode) headers['x-pilates-audit-mode'] = spec.mode;
  let body: string | undefined;
  if (spec.method === 'POST') {
    headers['content-type'] = 'application/json';
    body = webhookBody(marker('phone'), marker('message'));
  }
  const search = query.toString();
  return {
    id: spec.id,
    group: spec.group,
    method: spec.method,
    url: `https://${spec.host}${path}${search ? `?${search}` : ''}`,
    headers,
    ...(body === undefined ? {} : { body }),
    expected: spec.expected,
    ...(spec.abortAfterMs ? { abortAfterMs: spec.abortAfterMs } : {}),
  };
}

// ---------------------------------------------------------------------------
// Remote summary: strict schema shared with scripts/proxy-audit-remote.py.

const COUNT = /^(0|[1-9][0-9]{0,11})$/;
const COUNT_U = /^(0|[1-9][0-9]{0,11}|unknown)$/;
const EPOCH_U = /^([0-9]{9,11}|unknown)$/;
const YES_NO_U = /^(yes|no|unknown)$/;
const SET_U = /^(set|unset|unknown)$/;
const LEVEL = /^(debug|info|warn|error|fatal|unset|other|unknown)$/;
const SERVICE = /^(active|inactive|failed|activating|deactivating|unknown|other)$/;
const SAFE = /^[A-Za-z0-9._:+-]{0,64}$/;

const RULES: ReadonlyArray<readonly [RegExp, RegExp]> = [
  [/^schema$/, /^pilates-proxy-audit-v1$/],
  [/^phase$/, /^(pre|post|privileged)$/],
  [/^user$/, /^(root|unprivileged)$/],
  [/^(time|since)\.epoch$/, /^[0-9]{9,11}$/],
  [/^systemd\.version$/, /^([0-9]{1,4}|unknown)$/],
  [/^journal\.readable$/, YES_NO_U],
  [/^journal\.oldest_epoch$/, EPOCH_U],
  [/^journal\.since_bytes$/, COUNT],
  [/^unit\.state$/, SERVICE],
  [/^unit\.substate$/, /^(running|dead|exited|failed|auto-restart|start|stop|unknown|other)$/],
  [/^unit\.user$/, /^(root|other)$/],
  [/^unit\.(stdout|stderr)$/, /^(journal|journal\+console|kmsg|kmsg\+console|null|tty|inherit|socket|file|append|truncate|unknown|other)$/],
  [/^unit\.need_daemon_reload$/, YES_NO_U],
  [/^unit\.log_level_max$/, /^(emerg|alert|crit|err|warning|notice|info|debug|unset|other)$/],
  [/^unit\.limit_core$/, /^(infinity|[0-9]{1,20}|unknown)$/],
  [/^unit\.filter\.(deny|allow)_patterns$/, COUNT],
  [/^unit\.filter\.(prod_lower|prod_upper|prod_mixed|prod_json|dev_lower|dev_upper|neutral)$/, /^(dropped|kept|unknown)$/],
  [/^cloudflared\.exec$/, /^(\/[A-Za-z0-9._/-]{1,128}|unknown|invalid)$/],
  [/^cloudflared\.(version|journal\.version)$/, /^([0-9]{4}\.[0-9]{1,2}\.[0-9]{1,3}|unknown)$/],
  [/^cloudflared\.sha256$/, /^([0-9a-f]{64}|unknown)$/],
  [/^cloudflared\.package_version$/, /^([0-9][A-Za-z0-9.+~-]{0,40}|none)$/],
  [/^cloudflared\.(args|process)\.(no_autoupdate|token)$/, YES_NO_U],
  [/^cloudflared\.(args|process)\.(config|logfile|log_directory|trace_output)$/, SET_U],
  [/^cloudflared\.(args|process|config)\.(loglevel|transport_loglevel)$/, LEVEL],
  [/^cloudflared\.(args|process|config)\.output$/, /^(default|json|unset|other|unknown)$/],
  [/^cloudflared\.(args|process|config)\.protocol$/, /^(quic|http2|auto|unset|other|unknown)$/],
  [/^cloudflared\.(unit_env|proc_env|env_file)\.tunnel_[a-z_]+$/, SET_U],
  [/^cloudflared\.env_files$/, COUNT],
  [/^cloudflared\.config\.readable$/, /^(yes|no|absent)$/],
  [/^cloudflared\.config\.(logfile|log_directory|trace_output|metrics|token)$/, /^(set|unset)$/],
  [/^cloudflared\.config\.no_autoupdate$/, /^(true|false|unset|other)$/],
  [/^cloudflared\.config\.metrics_scope$/, /^(loopback|any|other|unset)$/],
  [/^cloudflared\.config\.ingress_rules$/, COUNT],
  [/^cloudflared\.journal\.(oldest_epoch|prod_host_newest_epoch|dev_host_newest_epoch)$/, EPOCH_U],
  [/^cloudflared\.journal\.protocol$/, /^(quic|http2|unknown)$/],
  [/^cloudflared\.(journal|since)\.(entries|prod_host_lines|dev_host_lines|host_token_lines|host_query_lines|host_token_hex64|host_token_synthetic|host_token_other|debug_lines|json_lines)$/, COUNT],
  [/^cloudflared\.(journal|since)\.host_token_newest_epoch$/, EPOCH_U],
  [/^cloudflared\.(journal|since)\.format\.(request_failed|origin_unreachable|ended_abruptly|failed_to_serve)$/, COUNT],
  [/^journald\.[a-z_]+$/, SAFE],
  [/^syslog\.(rsyslog|syslog_ng)$/, SERVICE],
  [/^syslog\.(files|readable_files)$/, COUNT],
  [/^syslog\.(cloudflared_lines|prod_host_lines|dev_host_lines|host_cloudflared_lines|host_token_lines|host_query_lines|host_token_hex64|host_token_synthetic|host_token_other)$/, COUNT_U],
  [/^syslog\.host_token_newest_date$/, /^([0-9]{4}-[0-9]{2}-[0-9]{2}|unknown|none)$/],
  [/^logrotate\.rsyslog_rotate$/, COUNT_U],
  [/^logrotate\.rsyslog_frequency$/, /^(daily|weekly|monthly|yearly|unknown)$/],
  [/^core\.pattern$/, /^(apport|systemd-coredump|pipe-other|file|unknown)$/],
  [/^core\.apport_enabled$/, /^(yes|no|absent|unknown)$/],
  [/^core\.crash_files$/, COUNT_U],
  [/^audit\.auditd$/, SERVICE],
  [/^shippers\.active$/, COUNT],
  [/^shippers\.[a-z0-9-]+$/, /^active$/],
  [/^port\.(8300|18190)$/, /^(free|busy|unknown)$/],
  [/^prod\.verify_token_mtime$/, /^([0-9]{9,11}|unknown|absent)$/],
  [/^control\.written$/, /^(yes|no)$/],
  [/^control\.journal$/, COUNT],
  [/^marker\.[a-z0-9-]+\.[a-z]+\.(journal|syslog)$/, COUNT_U],
  [/^ingress\.(prod_webhook|prod_root|prod_health|prod_subpath|dev_webhook|dev_root)$/, /^(prod-origin|dev-origin|status-404|other|unknown)$/],
];

export type Summary = Readonly<Record<string, string>>;

export function parseSummary(source: string, phase: Phase): Summary {
  const fail = (): never => {
    throw new Error('Riepilogo remoto non valido.');
  };
  if (source.length > 200_000) fail();
  const lines = source.replace(/\r/g, '').split('\n').filter((line) => line.length > 0);
  const result: Record<string, string> = {};
  for (const line of lines) {
    const separator = line.indexOf('=');
    if (separator < 1) fail();
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (Object.hasOwn(result, key)) fail();
    const rule = RULES.find(([pattern]) => pattern.test(key));
    if (!rule?.[1].test(value)) fail();
    result[key] = value;
  }
  if (result.schema !== SCHEMA || result.phase !== phase) fail();
  return Object.freeze(result);
}

// ---------------------------------------------------------------------------
// journald LogFilterPatterns written for the tunnel (TEC-005/TEC-036).

export function hostFilterPattern(host: string): string {
  return `~${Array.from(host, (char) => {
    if (char === '.') return '[.]';
    if (/[a-z]/.test(char)) return `[${char}${char.toUpperCase()}]`;
    return char;
  }).join('')}`;
}

// Deny patterns first, then allow patterns, as journald v259 does.
export function journaldKeeps(patterns: readonly string[], message: string): boolean {
  const deny = patterns.filter((pattern) => pattern.startsWith('~')).map((pattern) => new RegExp(pattern.slice(1)));
  const allow = patterns.filter((pattern) => !pattern.startsWith('~')).map((pattern) => new RegExp(pattern));
  if (deny.some((regex) => regex.test(message))) return false;
  if (allow.some((regex) => regex.test(message))) return true;
  return allow.length === 0;
}

// Representative synthetic lines of the local formats of cloudflared
// 2026.10.x at the configured info level and of the debug level.
export function formatSamples(host: string, path: string, query: string): Record<string, string> {
  const url = `https://${host}${path}?${query}`;
  return {
    quicRequestFailed: `2026-11-14T10:00:00Z ERR Request failed error="Unable to reach the origin service. The service may be down or it may not be responding to traffic from cloudflared: dial tcp 127.0.0.1:8300: connect: connection refused" connIndex=0 dest=${url} event=0 ip=198.51.100.7 type=http`,
    quicRequestFailedJson: JSON.stringify({ level: 'error', error: 'Unable to reach the origin service', connIndex: 0, type: 'http', dest: url, time: '2026-11-14T10:00:00Z', message: 'Request failed' }),
    proxyError: '2026-11-14T10:00:00Z ERR  error="Unable to reach the origin service. The service may be down or it may not be responding to traffic from cloudflared: dial tcp 127.0.0.1:8300: connect: connection refused" cfRay=8f00000000000000-MXP connIndex=0 event=1 ingressRule=3 originService=http://127.0.0.1:8300',
    proxyCancelled: '2026-11-14T10:00:00Z ERR  error="Incoming request ended abruptly: context canceled" cfRay=8f00000000000000-MXP connIndex=0 event=1 ingressRule=3 originService=http://127.0.0.1:8300',
    http2Failed: '2026-11-14T10:00:00Z ERR failed to serve incoming request error="failed to proxy HTTP: Unable to reach the origin service. The service may be down or it may not be responding to traffic from cloudflared: dial tcp 127.0.0.1:8300: connect: connection refused"',
    debugRequest: `2026-11-14T10:00:00Z DBG GET ${url} HTTP/1.1 connIndex=0 content-length=0 event=1 headers={"X-Hub-Signature-256":["sha256=synthetic"]} host=${host} ingressRule=3 originService=http://127.0.0.1:8300 path=${path}`,
  };
}

// ---------------------------------------------------------------------------
// Evaluation.

export type Level = 'ok' | 'info' | 'exposure' | 'unverified';
export interface Finding {
  section: string;
  level: Level;
  text: string;
}

export interface AuditResult {
  run: Run;
  pre: Summary;
  post: Summary | null;
  privileged: Summary | null;
  probes: ProbeResult[];
  origin: 'not-requested' | 'busy' | 'closed' | 'close-failed' | 'start-failed';
  since: number;
}

const date = (epoch: string | undefined) => {
  if (!epoch || !/^[0-9]{9,11}$/.test(epoch)) return 'non disponibile';
  return new Date(Number(epoch) * 1000).toISOString().slice(0, 10);
};

function levels(values: Array<string | undefined>): { debug: boolean; unknown: boolean } {
  return { debug: values.includes('debug'), unknown: values.some((value) => value === undefined || value === 'unknown') };
}

export function evaluateLocal(result: AuditResult): Finding[] {
  const { pre, post, privileged } = result;
  const findings: Finding[] = [];
  const add = (section: string, level: Level, text: string) => findings.push({ section, level, text });

  add('cloudflared', pre['unit.state'] === 'active' ? 'ok' : 'unverified',
    pre['unit.state'] === 'active' ? 'Servizio cloudflared attivo.' : 'Servizio cloudflared non attivo: gli esiti non sono rappresentativi.');
  add('cloudflared', 'info', `Versione ${pre['cloudflared.version']} (pacchetto ${pre['cloudflared.package_version']}, ultima nel journal ${pre['cloudflared.journal.version']}); SHA-256 del binario ${pre['cloudflared.sha256']}.`);
  add('cloudflared', pre['cloudflared.args.no_autoupdate'] === 'yes' ? 'ok' : 'info',
    pre['cloudflared.args.no_autoupdate'] === 'yes' ? 'Aggiornamento automatico di cloudflared disabilitato negli argomenti.' : 'Aggiornamento automatico non disabilitato negli argomenti: i formati possono cambiare con la versione.');
  add('cloudflared', 'info', `Protocollo osservato nel journal: ${pre['cloudflared.journal.protocol']}; argomento ${pre['cloudflared.args.protocol']}${privileged ? `, configurazione ${privileged['cloudflared.config.protocol']}` : ''}.`);

  const outputs = [pre['unit.stdout'], pre['unit.stderr']];
  if (outputs.some((value) => value === 'file' || value === 'append' || value === 'truncate')) {
    add('journald', 'exposure', 'L\'output di cloudflared è scritto su file, fuori dal filtro del journal.');
  } else if (outputs.every((value) => ['journal', 'journal+console', 'inherit', 'null'].includes(value ?? ''))) {
    add('journald', 'ok', 'stdout e stderr di cloudflared vanno al journal, dove si applica il filtro.');
  } else {
    add('journald', 'unverified', 'Destinazione di stdout/stderr di cloudflared non riconosciuta.');
  }

  const hosts = ['prod_lower', 'prod_upper', 'prod_mixed', 'prod_json', 'dev_lower', 'dev_upper'].map((name) => pre[`unit.filter.${name}`]);
  if (hosts.includes('unknown') || pre['unit.filter.neutral'] === 'unknown') {
    add('journald', 'unverified', 'Il filtro LogFilterPatterns non è valutabile.');
  } else if (hosts.every((value) => value === 'dropped')) {
    add('journald', 'ok', `Filtro LogFilterPatterns attivo (${pre['unit.filter.deny_patterns']} pattern di esclusione): scarta le righe con gli hostname di produzione e sviluppo, anche in maiuscolo e in JSON.`);
  } else {
    add('journald', 'exposure', 'Il filtro LogFilterPatterns non scarta tutte le righe con gli hostname del webhook.');
  }
  if (pre['unit.filter.neutral'] === 'dropped') add('journald', 'info', 'Il filtro scarta anche righe senza hostname: diagnostica ridotta.');
  if (pre['unit.need_daemon_reload'] === 'yes') add('journald', 'unverified', 'Unità modificata ma non ricaricata: il filtro attivo può differire da quello configurato.');

  const levelValues = [pre['cloudflared.args.loglevel'], pre['cloudflared.process.loglevel'], privileged?.['cloudflared.config.loglevel']];
  const level = levels(levelValues);
  const env = (name: string) => [pre[`cloudflared.unit_env.${name}`], privileged?.[`cloudflared.proc_env.${name}`], privileged?.[`cloudflared.env_file.${name}`]];
  const envLevel = [...env('tunnel_loglevel')].includes('set');
  if (level.debug) add('cloudflared', 'exposure', 'Livello di log debug: cloudflared registra URL, query e header delle richieste.');
  else if (level.unknown || !privileged) add('cloudflared', 'unverified', 'Livello di log non verificabile in configurazione senza la raccolta privilegiata.');
  else if (envLevel) add('cloudflared', 'unverified', 'Livello di log impostato tramite variabile d\'ambiente: valore non verificato.');
  else add('cloudflared', 'ok', 'Livello di log non debug (predefinito info) in argomenti e configurazione.');

  const transport = levels([pre['cloudflared.args.transport_loglevel'], pre['cloudflared.process.transport_loglevel'], privileged?.['cloudflared.config.transport_loglevel']]);
  if (transport.debug) add('cloudflared', 'exposure', 'Livello di log del trasporto debug.');

  const fileFlags = ['logfile', 'log_directory', 'trace_output'].flatMap((name) => [pre[`cloudflared.args.${name}`], pre[`cloudflared.process.${name}`], privileged?.[`cloudflared.config.${name}`]]);
  const fileEnv = ['tunnel_logfile', 'tunnel_logdirectory', 'tunnel_trace_output'].flatMap(env);
  if ([...fileFlags, ...fileEnv].includes('set')) add('cloudflared', 'exposure', 'cloudflared scrive anche su file di log o trace, non coperti dal filtro del journal.');
  else if (!privileged || [...fileFlags, ...fileEnv].some((value) => value === undefined || value === 'unknown')) add('cloudflared', 'unverified', 'Assenza di logfile, log-directory e trace-output non verificabile senza la raccolta privilegiata.');
  else add('cloudflared', 'ok', 'Nessun logfile, log-directory o trace-output in argomenti, configurazione e ambiente.');

  const tokenArgs = [pre['cloudflared.args.token'], pre['cloudflared.process.token']];
  if (tokenArgs.includes('yes') || privileged?.['cloudflared.config.token'] === 'set') add('cloudflared', 'exposure', 'Token del tunnel negli argomenti o nella configurazione in chiaro del processo.');
  else if (tokenArgs.every((value) => value === 'no')) add('cloudflared', 'ok', 'Nessun token del tunnel negli argomenti del processo (riportati anche dal messaggio Started di systemd).');
  else add('cloudflared', 'unverified', 'Argomenti del processo non verificabili.');
  if ([...env('tunnel_log_output'), ...env('tunnel_management_output')].includes('set')) add('cloudflared', 'info', 'Formato di output impostato da variabile d\'ambiente.');

  if (privileged?.['cloudflared.config.metrics'] === 'set') {
    const scope = privileged['cloudflared.config.metrics_scope'];
    add('cloudflared', scope === 'loopback' ? 'ok' : scope === 'any' || scope === 'other' ? 'unverified' : 'info', scope === 'loopback'
      ? 'Endpoint metriche di cloudflared solo su loopback (contatori, configurazione di ingresso e profili, nessun log delle richieste).'
      : scope === 'any' || scope === 'other'
        ? 'Endpoint metriche di cloudflared non limitato a loopback: espone contatori, configurazione di ingresso e profili (non log delle richieste).'
        : 'Endpoint metriche di cloudflared configurato, indirizzo non classificato: espone contatori, configurazione di ingresso e profili, non log delle richieste.');
  }
  if (privileged) {
    const routes: Array<[string, string]> = [['prod_webhook', 'prod-origin'], ['prod_root', 'status-404'], ['prod_health', 'status-404'], ['prod_subpath', 'status-404'], ['dev_webhook', 'dev-origin']];
    const mismatched = routes.filter(([name, expected]) => privileged[`ingress.${name}`] !== expected).map(([name]) => name);
    add('cloudflared', mismatched.length ? 'unverified' : 'ok', mismatched.length
      ? `Regole di ingresso diverse dall'atteso: ${mismatched.join(', ')}.`
      : 'Regole di ingresso: solo il percorso del webhook raggiunge l\'origine, il resto dell\'hostname di produzione risponde 404.');
  }

  add('journald', 'info', `Journal: archiviazione ${pre['journald.storage']}, directory persistente ${pre['journald.persistent_dir']}, SystemMaxUse ${pre['journald.systemmaxuse']}, MaxRetentionSec ${pre['journald.maxretentionsec']}, uso ${pre['journald.disk_usage']}; voce più vecchia ${date(pre['journal.oldest_epoch'])}, di cloudflared ${date(pre['cloudflared.journal.oldest_epoch'])}.`);
  add('journald', 'info', `Inoltri del journal: syslog ${pre['journald.forwardtosyslog']}, kmsg ${pre['journald.forwardtokmsg']}, console ${pre['journald.forwardtoconsole']}, wall ${pre['journald.forwardtowall']}, socket ${pre['journald.forwardtosocket']}. Il filtro si applica prima degli inoltri (systemd v259).`);
  if (pre['journald.forwardtosocket'] && !['unset', 'no'].includes(pre['journald.forwardtosocket'])) add('journald', 'unverified', 'Inoltro del journal verso un socket: destinazione da valutare.');
  const historic = Number(pre['cloudflared.journal.prod_host_lines'] ?? 0) + Number(pre['cloudflared.journal.dev_host_lines'] ?? 0);
  const shapes = (prefix: string) => {
    const hex = Number(pre[`${prefix}.host_token_hex64`] ?? 0);
    const other = Number(pre[`${prefix}.host_token_other`] ?? 0);
    return { real: hex + other > 0, text: `generati ${hex}, sintetici ${pre[`${prefix}.host_token_synthetic`] ?? 0}, altri ${other}` };
  };
  const journalTokens = Number(pre['cloudflared.journal.host_token_lines'] ?? 0);
  const journalShape = shapes('cloudflared.journal');
  add('journald', historic ? (journalShape.real ? 'unverified' : 'info') : 'ok', historic
    ? `Righe storiche di cloudflared con hostname nel journal: produzione ${pre['cloudflared.journal.prod_host_lines']} (ultima ${date(pre['cloudflared.journal.prod_host_newest_epoch'])}), sviluppo ${pre['cloudflared.journal.dev_host_lines']} (ultima ${date(pre['cloudflared.journal.dev_host_newest_epoch'])}); con query ${pre['cloudflared.journal.host_query_lines']}, con parametro di verifica ${journalTokens} (formato dei token: ${journalShape.text}; ultima ${date(pre['cloudflared.journal.host_token_newest_epoch'])})${journalShape.real ? ': possibile verify token reale, da valutare' : ''}. Contenuto non mostrato.`
    : 'Nessuna riga di cloudflared con gli hostname nel journal conservato.');
  if (Number(pre['cloudflared.journal.debug_lines'] ?? 0) > 0) add('journald', 'exposure', `Righe di debug di cloudflared nel journal conservato: ${pre['cloudflared.journal.debug_lines']}.`);

  add('syslog', 'info', `rsyslog ${pre['syslog.rsyslog']}, syslog-ng ${pre['syslog.syslog_ng']}; file syslog ${pre['syslog.files']} (leggibili ${pre['syslog.readable_files']}); rotazione ${pre['logrotate.rsyslog_frequency']} con ${pre['logrotate.rsyslog_rotate']} copie.`);
  const syslogHosts = [pre['syslog.prod_host_lines'], pre['syslog.dev_host_lines']];
  if (syslogHosts.includes('unknown')) add('syslog', 'unverified', 'File syslog non leggibili: righe con hostname non verificate.');
  else if (syslogHosts.some((value) => Number(value) > 0)) {
    const tokens = Number(pre['syslog.host_token_lines'] ?? 0);
    const shape = shapes('syslog');
    add('syslog', shape.real ? 'unverified' : 'info', `Righe con hostname nei file syslog: produzione ${syslogHosts[0]}, sviluppo ${syslogHosts[1]} (di cloudflared ${pre['syslog.host_cloudflared_lines']}); con query ${pre['syslog.host_query_lines']}, con parametro di verifica ${tokens} (formato dei token: ${shape.text}; ultima ${pre['syslog.host_token_newest_date']})${shape.real ? ': possibile verify token reale, da valutare' : ''}. Contenuto non mostrato.`);
  }
  else add('syslog', 'ok', `Nessuna riga con gli hostname nei file syslog (righe di cloudflared: ${pre['syslog.cloudflared_lines']}).`);

  const crash = privileged?.['core.crash_files'] ?? pre['core.crash_files'];
  if (crash === 'unknown') add('core', 'unverified', 'Crash report di cloudflared non verificabili.');
  else if (Number(crash) > 0) add('core', 'unverified', `Crash report di cloudflared presenti: ${crash}; contenuto non esaminato.`);
  else add('core', 'ok', 'Nessun crash report di cloudflared in /var/crash.');
  if (pre['unit.limit_core'] !== '0' && pre['core.pattern'] !== 'unknown') add('core', 'info', `Dump di memoria possibili in caso di crash (core_pattern ${pre['core.pattern']}, apport ${pre['core.apport_enabled']}, LimitCORE ${pre['unit.limit_core']}): potrebbero contenere dati delle richieste.`);

  const shippers = Number(pre['shippers.active'] ?? 0);
  add('destinazioni', shippers ? 'unverified' : 'ok', shippers
    ? `Agenti di raccolta dei log attivi: ${Object.keys(pre).filter((key) => key.startsWith('shippers.') && key !== 'shippers.active').map((key) => key.slice(9)).join(', ')}.`
    : 'Nessun agente noto di raccolta o inoltro dei log attivo.');
  if (pre['audit.auditd'] === 'active') add('destinazioni', 'info', 'auditd attivo: eventuali regole execve registrano gli argomenti dei comandi (la prova non usa marcatori negli argomenti).');

  if (!post) {
    add('marcatori', 'unverified', 'Ricerca dei marcatori non eseguita.');
    return findings;
  }
  if (post['journal.readable'] !== 'yes' || Number(post['control.journal']) < 1) {
    add('marcatori', 'unverified', 'Controllo positivo assente: la ricerca nel journal non è valida.');
  } else {
    add('marcatori', 'ok', `Controllo positivo trovato nel journal (${post['journal.since_bytes']} byte esaminati dall'inizio della prova).`);
  }
  const markerKeys = Object.keys(post).filter((key) => key.startsWith('marker.'));
  const found = (suffix: string) => markerKeys.filter((key) => key.endsWith(suffix) && Number(post[key]) > 0).map((key) => key.slice(7, -suffix.length));
  const journalFound = found('.journal');
  const total = markerKeys.filter((key) => key.endsWith('.journal')).length;
  add('marcatori', journalFound.length ? 'exposure' : 'ok', journalFound.length
    ? `Marcatori sintetici trovati nel journal: ${journalFound.join(', ')}.`
    : `Nessuno dei ${total} marcatori sintetici (query, header, corpo, firma, telefono e messaggio) è nel journal, in nessun campo.`);
  const syslogUnknown = markerKeys.some((key) => key.endsWith('.syslog') && post[key] === 'unknown');
  const syslogFound = found('.syslog');
  if (syslogUnknown) add('marcatori', 'unverified', 'Ricerca dei marcatori nei file syslog non eseguita.');
  else add('marcatori', syslogFound.length ? 'exposure' : 'ok', syslogFound.length ? `Marcatori sintetici nei file syslog: ${syslogFound.join(', ')}.` : 'Nessun marcatore sintetico nei file syslog aggiornati durante la prova.');
  add('formati', 'info', `Righe di cloudflared durante la prova: ${post['cloudflared.since.entries']}; "Request failed" ${post['cloudflared.since.format.request_failed']}, "Unable to reach the origin service" ${post['cloudflared.since.format.origin_unreachable']}, "Incoming request ended abruptly" ${post['cloudflared.since.format.ended_abruptly']}, "failed to serve incoming request" ${post['cloudflared.since.format.failed_to_serve']}.`);
  const sinceHosts = Number(post['cloudflared.since.prod_host_lines']) + Number(post['cloudflared.since.dev_host_lines']);
  add('formati', sinceHosts ? 'exposure' : 'ok', sinceHosts
    ? `Righe con hostname registrate durante la prova: ${sinceHosts}.`
    : 'Nessuna riga con gli hostname registrata durante la prova: le righe con dest sono scartate, restano solo quelle senza URL.');
  if (Number(post['cloudflared.since.debug_lines']) > 0) add('formati', 'exposure', 'Righe di debug registrate durante la prova.');

  for (const probe of result.probes) {
    const spec = PROBES.find((item) => item.id === probe.id);
    if (!spec) continue;
    if (probe.status === 'skipped') {
      add('esiti', 'unverified', `${probe.id}: non eseguita.`);
      continue;
    }
    const ok = probe.status === spec.expected;
    const edge = probe.edgeBlocked ? ' (bloccata da Cloudflare)' : '';
    add('esiti', ok ? 'ok' : 'unverified', `${probe.id}: atteso ${spec.expected}, ottenuto ${probe.status}${edge}.`);
  }
  if (result.origin === 'busy') add('esiti', 'unverified', 'Origine temporanea non avviata: porta 8300 occupata.');
  if (result.origin === 'start-failed') add('esiti', 'unverified', 'Origine temporanea non avviata.');
  if (result.origin === 'close-failed') add('esiti', 'unverified', 'Chiusura dell\'origine temporanea non confermata.');
  if (result.origin === 'closed') {
    add('esiti', post['port.8300'] === 'free' ? 'ok' : 'unverified', post['port.8300'] === 'free'
      ? 'Origine temporanea chiusa: porta 8300 di nuovo libera.'
      : 'Origine temporanea chiusa, ma la porta 8300 risulta occupata.');
  }
  return findings;
}

// The release notes of cloudflared list the SHA-256 of every published asset.
export function releaseFinding(version: string | undefined, sha: string | undefined, notes: string | null): Finding {
  const unverified = (text: string): Finding => ({ section: 'cloudflared', level: 'unverified', text });
  if (!version || !sha || !/^[0-9]{4}\.[0-9]{1,2}\.[0-9]{1,3}$/.test(version) || !/^[0-9a-f]{64}$/.test(sha)) {
    return unverified('Corrispondenza del binario con la release ufficiale non verificabile: versione o checksum assenti.');
  }
  if (notes === null) return unverified(`Note della release ufficiale ${version} non raggiungibili: corrispondenza del binario non verificata.`);
  const asset = notes.split(/\r?\n/).map((line) => /^\s*([A-Za-z0-9._-]{1,80}):\s*([0-9a-f]{64})\s*$/.exec(line)).find((match) => match?.[2] === sha)?.[1];
  return asset
    ? { section: 'cloudflared', level: 'ok', text: `Binario identico all'asset ufficiale ${asset} della release ${version} (checksum pubblicato): il codice ispezionato è quello in esecuzione.` }
    : unverified(`Il checksum del binario non compare tra gli asset pubblicati della release ${version}.`);
}

export function verdict(findings: readonly Finding[]): { code: 0 | 1 | 3; text: string } {
  if (findings.some((finding) => finding.level === 'exposure')) return { code: 1, text: 'ESITO: esposizioni rilevate.' };
  if (findings.some((finding) => finding.level === 'unverified')) return { code: 3, text: 'ESITO: nessuna esposizione rilevata nelle parti verificate; alcune parti non sono verificate.' };
  return { code: 0, text: 'ESITO: nessuna esposizione rilevata.' };
}

const LABELS: Record<Level, string> = { ok: 'OK', info: 'INFO', exposure: 'ESPOSIZIONE', unverified: 'NON VERIFICATO' };

export function formatFindings(title: string, findings: readonly Finding[]): string[] {
  const lines = [title];
  for (const finding of findings) lines.push(`[${LABELS[finding.level]}] ${finding.section}: ${finding.text}`);
  lines.push(verdict(findings).text);
  return lines;
}

// ---------------------------------------------------------------------------
// Orchestration with injected effects.

export interface CollectorInput {
  phase: 'pre' | 'post';
  control: string;
  since?: number;
  markers?: Record<string, string>;
}

export interface OriginHandle {
  close(): Promise<boolean>;
}

export interface AuditSystem {
  randomBytes(size: number): Uint8Array;
  collect(input: CollectorInput): Promise<string>;
  startOrigin(): Promise<OriginHandle | 'busy'>;
  request(probe: ProbeRequest): Promise<Omit<ProbeResult, 'group'>>;
  sleep(ms: number): Promise<void>;
}

export interface AuditOptions {
  dev: boolean;
  origin: boolean;
  settleMs: number;
  privileged: Summary | null;
}

export async function runAudit(system: AuditSystem, options: AuditOptions): Promise<AuditResult> {
  const run = createRun((size) => system.randomBytes(size));
  const pre = parseSummary(await system.collect({ phase: 'pre', control: run.control }), 'pre');
  const since = Number(pre['time.epoch']) - 5;
  const probes: ProbeResult[] = [];
  const execute = async (spec: ProbeSpec) => {
    const outcome = await system.request(buildProbe(spec, run));
    probes.push({ ...outcome, id: spec.id, group: spec.group });
  };
  const skip = (group: Group) => {
    for (const spec of PROBES.filter((item) => item.group === group)) probes.push({ id: spec.id, group, status: 'skipped', ray: null, edgeBlocked: false });
  };
  for (const spec of PROBES.filter((item) => item.group === 'prod')) await execute(spec);
  let origin: AuditResult['origin'] = 'not-requested';
  if (options.dev && pre['port.8300'] === 'free') {
    for (const spec of PROBES.filter((item) => item.group === 'dev-down')) await execute(spec);
    if (options.origin) {
      let handle: OriginHandle | 'busy' | null = null;
      try {
        handle = await system.startOrigin();
      } catch {
        handle = null;
      }
      if (handle === 'busy' || handle === null) {
        origin = handle === 'busy' ? 'busy' : 'start-failed';
        skip('dev-origin');
      } else {
        try {
          for (const spec of PROBES.filter((item) => item.group === 'dev-origin')) await execute(spec);
        } finally {
          origin = await handle.close().then((closed) => (closed ? 'closed' : 'close-failed'), () => 'close-failed' as const);
        }
      }
    } else {
      skip('dev-origin');
    }
  } else {
    if (options.dev) origin = 'busy';
    skip('dev-down');
    skip('dev-origin');
  }
  await system.sleep(options.settleMs);
  const post = parseSummary(await system.collect({ phase: 'post', control: run.control, since, markers: run.markers }), 'post');
  return { run, pre, post, privileged: options.privileged, probes, origin, since };
}
