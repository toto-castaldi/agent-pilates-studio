#!/usr/bin/env node
// Launcher of the repeatable proxy privacy audit (TEC-008). Procedure, limits
// and authorizations: docs/operations/TEC-008-audit-proxy.md.
//
//   node scripts/proxy-audit.mjs [run] [--host jarvis] [--no-dev] [--no-origin]
//                                [--cloudflare-config /private/file] [--wait-minutes 10]
//   node scripts/proxy-audit.mjs privileged [--host jarvis]        (operator: sudo password)
//   node scripts/proxy-audit.mjs cloudflare --run <state.json> --cloudflare-config /private/file
//
// It never prints log lines, secrets, messages, telephone numbers, tokens or
// raw responses: only fixed texts, counts and enumerations.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_ORIGIN, assertAllowedRequest, collectCloudflare, evaluateCloudflare, parseCloudflareConfig } from '../src/proxy-audit-cloudflare.ts';
import { DEV_ORIGIN_PORT, evaluateLocal, formatFindings, parseSummary, releaseFinding, runAudit, verdict } from '../src/proxy-audit.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COLLECTOR = join(ROOT, 'scripts/proxy-audit-remote.py');
const ORIGIN = join(ROOT, 'scripts/proxy-audit-origin.py');
const HOST = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const RUN_FILE = /^run-[0-9a-f]{8}\.json$/;
const USAGE = 'Uso: node scripts/proxy-audit.mjs [run|privileged|cloudflare] [--host <ssh>] [--no-dev] [--no-origin] [--cloudflare-config <file>] [--run <state.json>] [--wait-minutes <n>] [--dev-token-rotated <AAAA-MM-GGTHH:MMZ>]';

class UsageError extends Error {}
// Fixed messages that may be shown; any other error becomes a generic message.
const SHOWN = new Set([
  'Riepilogo remoto non valido.', 'Configurazione Cloudflare non valida.', 'Richiesta Cloudflare non consentita.',
  'Il percorso della configurazione Cloudflare deve essere assoluto.', 'Configurazione Cloudflare non trovata.',
  'La configurazione Cloudflare deve essere un file regolare, non un collegamento.',
  'La configurazione Cloudflare deve appartenere all\'utente e avere permessi 0600.',
  'La configurazione Cloudflare deve stare fuori dal repository.', 'Configurazione Cloudflare non leggibile o non privata.',
  'Directory locale dei risultati non privata.', 'Comando non disponibile.', 'Comando remoto non riuscito.',
  'Origine temporanea non avviata.', 'File di esecuzione non valido.', 'File di esecuzione non privato o non leggibile.',
  'Directory temporanea remota non valida.', 'Raccolta privilegiata non riuscita.',
]);

function parseArgs(argv) {
  const options = { command: 'run', host: 'jarvis', dev: true, origin: true, cloudflareConfig: null, run: null, waitMinutes: 10, devRotated: null };
  const args = [...argv];
  if (args[0] && !args[0].startsWith('-')) options.command = args.shift();
  if (!['run', 'privileged', 'cloudflare'].includes(options.command)) throw new UsageError();
  while (args.length) {
    const arg = args.shift();
    const value = () => {
      const next = args.shift();
      if (next === undefined || next.startsWith('--')) throw new UsageError();
      return next;
    };
    if (arg === '--host') options.host = value();
    else if (arg === '--no-dev') options.dev = false;
    else if (arg === '--no-origin') options.origin = false;
    else if (arg === '--cloudflare-config') options.cloudflareConfig = value();
    else if (arg === '--run') options.run = value();
    else if (arg === '--dev-token-rotated') {
      // Date declared by the operator: the development configuration is not read.
      options.devRotated = value();
      if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}Z$/.test(options.devRotated) || Number.isNaN(Date.parse(options.devRotated))) throw new UsageError();
    }
    else if (arg === '--wait-minutes') {
      options.waitMinutes = Number(value());
      if (!Number.isInteger(options.waitMinutes) || options.waitMinutes < 0 || options.waitMinutes > 60) throw new UsageError();
    } else throw new UsageError();
  }
  if (!HOST.test(options.host)) throw new UsageError();
  if (options.command === 'cloudflare' && (!options.run || !options.cloudflareConfig)) throw new UsageError();
  if (options.command !== 'cloudflare' && options.run) throw new UsageError();
  return options;
}

const STATE_DIR = join(ROOT, '.local', 'proxy-audit');

function privateDirectory() {
  mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  const stat = lstatSync(STATE_DIR);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) throw new Error('Directory locale dei risultati non privata.');
  return STATE_DIR;
}

function writePrivate(name, content) {
  const target = join(privateDirectory(), name);
  const temporary = join(STATE_DIR, `.${name}.${randomBytes(4).toString('hex')}.tmp`);
  const fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    writeFileSync(fd, content);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, target);
  return target;
}

function readPrivateFile(file, maximum) {
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > maximum || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid()) return null;
    return readFileSync(fd, 'utf8');
  } finally {
    closeSync(fd);
  }
}

// The private Cloudflare file is never printed: only fixed errors.
function readCloudflareConfig(file) {
  const invalid = (text) => {
    throw new Error(text);
  };
  if (!isAbsolute(file)) invalid('Il percorso della configurazione Cloudflare deve essere assoluto.');
  let stat;
  try {
    stat = lstatSync(file);
  } catch {
    invalid('Configurazione Cloudflare non trovata.');
  }
  if (!stat.isFile() || stat.isSymbolicLink()) invalid('La configurazione Cloudflare deve essere un file regolare, non un collegamento.');
  if ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid()) invalid('La configurazione Cloudflare deve appartenere all\'utente e avere permessi 0600.');
  const inside = relative(ROOT, realpathSync(file));
  if (!inside.startsWith('..') && !isAbsolute(inside)) invalid('La configurazione Cloudflare deve stare fuori dal repository.');
  const content = readPrivateFile(file, 4096);
  if (content === null) invalid('Configurazione Cloudflare non leggibile o non privata.');
  return parseCloudflareConfig(content);
}

function runProcess(command, args, input, timeoutMs) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'ignore'] });
    let output = '';
    let overflow = false;
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      if (output.length + chunk.length > 1_000_000) overflow = true;
      else output += chunk;
    });
    child.on('error', () => {
      clearTimeout(timer);
      reject(new Error('Comando non disponibile.'));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && !overflow) resolvePromise(output);
      else reject(new Error('Comando remoto non riuscito.'));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

const ssh = (host, extra = []) => ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', ...extra, '-T', host];

function collect(host, input) {
  const header = `INPUT = __import__('json').loads(__import__('base64').b64decode('${Buffer.from(JSON.stringify(input)).toString('base64')}'))\n`;
  return runProcess('ssh', [...ssh(host), 'python3', '-'], header + readFileSync(COLLECTOR, 'utf8'), 600_000);
}

function startOrigin(host) {
  const code = readFileSync(ORIGIN).toString('base64');
  const child = spawn('ssh', [...ssh(host, ['-o', 'ServerAliveInterval=15']), `python3 -c "import base64,sys;exec(base64.b64decode(sys.argv[1]))" ${code} ${DEV_ORIGIN_PORT}`], { stdio: ['pipe', 'pipe', 'ignore'] });
  let buffer = '';
  let closed = false;
  let exited = false;
  const listeners = [];
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    if (buffer.includes('origin=closed')) closed = true;
    for (const listener of listeners.splice(0)) listener();
  });
  child.on('close', () => {
    exited = true;
    for (const listener of listeners.splice(0)) listener();
  });
  child.on('error', () => {
    exited = true;
  });
  child.stdin.on('error', () => {});
  const waitFor = (predicate, timeoutMs) => new Promise((resolveWait) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      if (predicate() || Date.now() >= deadline) resolveWait(predicate());
      else {
        listeners.push(check);
        setTimeout(check, 250);
      }
    };
    check();
  });
  const close = async () => {
    child.stdin.end();
    await waitFor(() => exited, 15_000);
    if (!exited) {
      child.kill('SIGTERM');
      await waitFor(() => exited, 5_000);
    }
    return closed;
  };
  return waitFor(() => /origin=(listening|busy|failed)/.test(buffer) || exited, 30_000).then(async () => {
    if (buffer.includes('origin=listening')) return { close };
    await close();
    if (buffer.includes('origin=busy')) return 'busy';
    throw new Error('Origine temporanea non avviata.');
  });
}

async function request(probe) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), probe.abortAfterMs ?? 30_000);
  try {
    const response = await fetch(probe.url, { method: probe.method, headers: probe.headers, body: probe.body, redirect: 'manual', signal: controller.signal });
    const type = response.headers.get('content-type') ?? '';
    const ray = response.headers.get('cf-ray');
    const mitigated = response.headers.has('cf-mitigated');
    let snippet = '';
    try {
      snippet = (await response.text()).slice(0, 4096);
    } catch {
      snippet = '';
    }
    const edgeBlocked = mitigated || (response.status === 403 && /text\/html/i.test(type) && /cloudflare/i.test(snippet));
    return { id: probe.id, status: response.status, ray: ray && /^[0-9a-f]{16}-[A-Z]{3}$/.test(ray) ? ray : null, edgeBlocked };
  } catch {
    return { id: probe.id, status: controller.signal.aborted && probe.abortAfterMs ? 'aborted' : 'error', ray: null, edgeBlocked: false };
  } finally {
    clearTimeout(timer);
  }
}

// Public, unauthenticated release notes: only the checksum lines are used.
async function releaseNotes(version) {
  if (!/^[0-9]{4}\.[0-9]{1,2}\.[0-9]{1,3}$/.test(version ?? '')) return null;
  try {
    const response = await fetch(`https://api.github.com/repos/cloudflare/cloudflared/releases/tags/${version}`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'agent-pilates-studio-proxy-audit' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    const body = (await response.json())?.body;
    return typeof body === 'string' && body.length < 500_000 ? body : null;
  } catch {
    return null;
  }
}

function loadPrivileged() {
  try {
    const file = join(STATE_DIR, 'privileged.txt');
    const stat = lstatSync(file);
    if (Date.now() - stat.mtimeMs > 24 * 3_600_000) return null;
    const content = readPrivateFile(file, 200_000);
    return content === null ? null : parseSummary(content, 'privileged');
  } catch {
    return null;
  }
}

function cloudflareSystem(config) {
  return {
    async request(method, path, body) {
      assertAllowedRequest(method, path);
      const response = await fetch(`${API_ORIGIN}${path}`, {
        method,
        headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' },
        body,
        signal: AbortSignal.timeout(30_000),
      });
      const text = await response.text();
      if (text.length > 5_000_000) throw new Error('Risposta troppo grande.');
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      return { status: response.status, json };
    },
    sleep: (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)),
    now: () => Date.now(),
  };
}

function loadState(file) {
  const base = file.split('/').pop() ?? '';
  if (!RUN_FILE.test(base)) throw new Error('File di esecuzione non valido.');
  let content = null;
  try {
    content = readPrivateFile(resolve(file), 2_000_000);
  } catch {
    content = null;
  }
  if (content === null) throw new Error('File di esecuzione non privato o non leggibile.');
  let state;
  try {
    state = JSON.parse(content);
  } catch {
    throw new Error('File di esecuzione non valido.');
  }
  if (state?.schema !== 'pilates-proxy-audit-run-v1' || typeof state.runId !== 'string' || !Array.isArray(state.probes)) throw new Error('File di esecuzione non valido.');
  return state;
}

function rotations(state, devRotated) {
  const mtime = state.pre?.['prod.verify_token_mtime'];
  return {
    prod: typeof mtime === 'string' && /^[0-9]{9,11}$/.test(mtime) ? new Date(Number(mtime) * 1000).toISOString() : null,
    dev: devRotated ? new Date(Date.parse(devRotated)).toISOString() : null,
  };
}

async function cloudflareFindings(state, configFile, waitMinutes, devRotated) {
  const config = readCloudflareConfig(configFile);
  const evidence = await collectCloudflare(cloudflareSystem(config), config, state, { waitMs: waitMinutes * 60_000, pollMs: 30_000 });
  writePrivate(`run-${state.runId}.cloudflare.json`, `${JSON.stringify({ checkedAt: new Date().toISOString(), evidence }, null, 2)}\n`);
  return evaluateCloudflare(evidence, rotations(state, devRotated));
}

async function commandRun(options) {
  const privileged = loadPrivileged();
  const startedAt = new Date().toISOString();
  const result = await runAudit({
    randomBytes: (size) => new Uint8Array(randomBytes(size)),
    collect: (input) => collect(options.host, input),
    startOrigin: () => startOrigin(options.host),
    request,
    sleep: (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)),
  }, { dev: options.dev, origin: options.origin, settleMs: 5000, privileged });
  const finishedAt = new Date().toISOString();
  const state = {
    schema: 'pilates-proxy-audit-run-v1', runId: result.run.runId, startedAt, finishedAt, since: result.since,
    markers: result.run.markers, control: result.run.control, probes: result.probes, origin: result.origin,
    pre: result.pre, post: result.post, privileged: privileged ? 'fresh' : 'missing',
  };
  const stateFile = writePrivate(`run-${result.run.runId}.json`, `${JSON.stringify(state, null, 2)}\n`);
  let findings = evaluateLocal(result);
  findings.push(releaseFinding(result.pre['cloudflared.version'], result.pre['cloudflared.sha256'], await releaseNotes(result.pre['cloudflared.version'])));
  if (!privileged) findings.push({ section: 'cloudflared', level: 'unverified', text: 'Raccolta privilegiata assente o più vecchia di 24 ore: eseguire il comando privileged.' });
  if (options.cloudflareConfig) findings = [...findings, ...await cloudflareFindings(state, options.cloudflareConfig, options.waitMinutes, options.devRotated)];
  else findings.push(...evaluateCloudflareMissing());
  const lines = formatFindings(`Audit privacy del proxy (TEC-008), esecuzione ${result.run.runId}, ${startedAt} - ${finishedAt}`, findings);
  writePrivate(`run-${result.run.runId}.report.txt`, `${lines.join('\n')}\n`);
  console.log(lines.join('\n'));
  console.log(`Stato privato: ${relative(ROOT, stateFile)}`);
  return verdict(findings).code;
}

function evaluateCloudflareMissing() {
  return evaluateCloudflare({ configured: false, zone: 'missing', account: 'missing', zoneDatasets: null, accountDatasets: null, http: null, firewall: null, verification: null, retentionFlag: 'unavailable', logExplorer: { zone: 'missing', account: 'missing' }, logSearch: { http_requests: 'skipped', firewall_events: 'skipped' } });
}

async function commandCloudflare(options) {
  const state = loadState(options.run);
  const findings = await cloudflareFindings(state, options.cloudflareConfig, options.waitMinutes, options.devRotated);
  const lines = formatFindings(`Audit privacy del proxy (TEC-008), controllo Cloudflare dell'esecuzione ${state.runId}`, findings);
  writePrivate(`run-${state.runId}.cloudflare.txt`, `${lines.join('\n')}\n`);
  console.log(lines.join('\n'));
  return verdict(findings).code;
}

function interactive(command, args) {
  return new Promise((resolveStatus) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', () => resolveStatus(127));
    child.on('close', (code) => resolveStatus(code ?? 1));
  });
}

async function commandPrivileged(options) {
  const directory = (await runProcess('ssh', [...ssh(options.host), 'umask 077 && mktemp -d /tmp/pilates-proxy-audit.XXXXXXXX'], '', 30_000)).trim();
  if (!/^\/tmp\/pilates-proxy-audit\.[A-Za-z0-9]{8}$/.test(directory)) throw new Error('Directory temporanea remota non valida.');
  try {
    await runProcess('ssh', [...ssh(options.host), `cat > ${directory}/collector.py`], readFileSync(COLLECTOR, 'utf8'), 30_000);
    console.log('Raccolta privilegiata in sola lettura: inserire la password sudo dell\'operatore se richiesta.');
    const status = await interactive('ssh', ['-o', 'ConnectTimeout=15', '-t', options.host, `sudo /usr/bin/python3 ${directory}/collector.py privileged ${directory}/privileged.out`]);
    if (status !== 0) throw new Error('Raccolta privilegiata non riuscita.');
    const summary = parseSummary(await runProcess('ssh', [...ssh(options.host), `cat ${directory}/privileged.out`], '', 30_000), 'privileged');
    writePrivate('privileged.txt', `${Object.entries(summary).map(([key, value]) => `${key}=${value}`).join('\n')}\n`);
    for (const [key, value] of Object.entries(summary)) console.log(`${key}=${value}`);
    return 0;
  } finally {
    await runProcess('ssh', [...ssh(options.host), `rm -rf -- ${directory}`], '', 30_000)
      .catch(() => console.error('Rimozione della directory temporanea remota non confermata.'));
  }
}

let options;
try {
  options = parseArgs(process.argv.slice(2));
} catch {
  console.error(USAGE);
  process.exit(2);
}
try {
  const commands = { run: commandRun, privileged: commandPrivileged, cloudflare: commandCloudflare };
  process.exitCode = await commands[options.command](options);
} catch (error) {
  // Only fixed messages of this launcher and of the pure modules are printed.
  console.error(error instanceof Error && SHOWN.has(error.message) ? error.message : 'Audit non riuscito.');
  process.exitCode = 2;
}
