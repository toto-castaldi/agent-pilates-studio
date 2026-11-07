// Read-only diagnosis of Pi Voice dictation on a remote server (TEC-020).
// Evaluation is pure; collection receives every system effect as a dependency.

export const SOCKET_HINT = '/run/user/$(id -u)/pulse-remote.socket';

export const ALSA_PULSE_PLUGIN_PATHS = [
  '/usr/lib/x86_64-linux-gnu/alsa-lib/libasound_module_pcm_pulse.so',
  '/usr/lib/aarch64-linux-gnu/alsa-lib/libasound_module_pcm_pulse.so',
  '/usr/lib64/alsa-lib/libasound_module_pcm_pulse.so',
  '/usr/lib/alsa-lib/libasound_module_pcm_pulse.so',
];

// pactl creates a cookie under the configuration directory when none exists:
// pointing it to an unwritable location keeps the diagnosis read-only.
export const UNWRITABLE_CONFIG_HOME = '/proc/self/voice-diagnose-no-config';
export const PACTL_TIMEOUT_MS = 5000;

const ASOUNDRC_EXAMPLE = 'pcm.!default { type pulse }  e  ctl.!default { type pulse }';

const STEPS = [
  {
    id: 'alsa-plugin',
    title: 'Plugin ALSA per PulseAudio',
    check: (facts) => (facts.alsaPulsePlugin ? ok('installato') : missing(
      'plugin non trovato',
      'Comando amministrativo, a cura dell\'operatore: sudo apt install libasound2-plugins',
    )),
  },
  {
    id: 'pactl',
    title: 'Strumento pactl',
    check: (facts) => (facts.pactlAvailable ? ok('disponibile') : missing(
      'pactl non trovato',
      'Comando amministrativo, a cura dell\'operatore: sudo apt install pulseaudio-utils',
    )),
  },
  {
    id: 'alsa-default',
    title: 'Dispositivo ALSA predefinito',
    check: (facts) => {
      if (facts.alsaDefault === 'pulse') return ok('instradato verso Pulse');
      if (facts.alsaDefault === 'other') {
        return missing(
          'il dispositivo predefinito non è Pulse',
          `Sostituire in ~/.asoundrc la definizione predefinita con ${ASOUNDRC_EXAMPLE}.`,
        );
      }
      return missing('nessun dispositivo predefinito configurato', `Creare ~/.asoundrc con ${ASOUNDRC_EXAMPLE}.`);
    },
  },
  {
    id: 'pulse-server',
    title: 'Variabile PULSE_SERVER',
    check: (facts) => {
      const server = parsePulseServer(facts.pulseServer);
      if (server.path) return ok('impostata su un socket Unix');
      const remedy = `Aggiungere a ~/.bashrc la riga export PULSE_SERVER=unix:${SOCKET_HINT}, aprire una nuova shell e riavviare Pi.`;
      if (server.error === 'unset') return missing('non impostata', remedy);
      return missing('formato non valido: serve unix: seguito da un percorso assoluto', remedy);
    },
  },
  {
    id: 'socket',
    title: 'Socket Pulse inoltrato',
    requires: ['pulse-server'],
    check: (facts) => {
      switch (facts.socket) {
        case 'private': return ok('presente e accessibile solo all\'utente');
        case 'missing': return missing(
          'socket assente',
          'Collegarsi dal client con ssh usando RemoteForward verso il percorso di PULSE_SERVER. Se ssh segnala "remote port forwarding failed", verificare StreamLocalBindUnlink yes in sshd.',
        );
        case 'not-socket': return missing('il percorso esiste ma non è un socket', 'Rimuovere o spostare il file che occupa il percorso, poi ricollegarsi con ssh.');
        case 'foreign': return missing('socket di un altro utente', 'Usare un percorso nella directory runtime dell\'utente, come quello indicato nella procedura, e ricollegarsi.');
        case 'shared': return missing('socket accessibile ad altri utenti', 'Non modificare StreamLocalBindMask di sshd (predefinito 0177), poi ricollegarsi con ssh.');
        default: return missing('socket non verificabile', 'Verificare che il percorso di PULSE_SERVER sia leggibile dall\'utente.');
      }
    },
  },
  {
    id: 'reachable',
    title: 'Server audio del client raggiungibile',
    requires: ['pactl', 'socket'],
    check: (facts) => (facts.serverReachable ? ok('pactl info riuscito') : missing(
      'il socket non risponde',
      'Verificare sul client che pipewire-pulse sia attivo (systemctl --user status pipewire-pulse.socket) e che la sessione ssh con RemoteForward sia aperta; se il client non ha avvisato errori, ricollegarsi.',
    )),
  },
  {
    id: 'source',
    title: 'Sorgente audio di acquisizione',
    requires: ['reachable'],
    check: (facts) => (facts.captureSources > 0 ? ok(facts.captureSources === 1 ? '1 disponibile' : `${facts.captureSources} disponibili`) : missing(
      'nessuna sorgente di acquisizione',
      'Collegare o abilitare un microfono sul client e verificarlo nelle impostazioni audio del client.',
    )),
  },
];

function ok(detail) { return { status: 'ok', detail }; }
function missing(detail, remedy) { return { status: 'missing', detail, remedy }; }

export function parsePulseServer(value) {
  if (value === undefined || value.trim() === '') return { error: 'unset' };
  const match = /^unix:(\/\S*)$/.exec(value.trim());
  return match ? { path: match[1] } : { error: 'format' };
}

export function evaluateVoiceSetup(facts) {
  const results = new Map();
  const steps = STEPS.map(({ id, title, requires = [], check }) => {
    const blocking = requires.filter((dependency) => results.get(dependency) !== 'ok');
    const outcome = blocking.length > 0
      ? { status: 'skipped', detail: `non verificabile finché mancano: ${blocking.map((dependency) => titleOf(dependency)).join(', ')}` }
      : check(facts);
    results.set(id, outcome.status);
    return { id, title, ...outcome };
  });
  return { ok: steps.every((step) => step.status === 'ok'), steps };
}

function titleOf(id) { return STEPS.find((step) => step.id === id)?.title ?? id; }

const LABELS = { ok: 'OK', missing: 'MANCA', skipped: 'SALTATO' };

export function formatReport(result) {
  const lines = ['Diagnosi del dettato vocale Pi su server remoto (sola lettura)'];
  for (const step of result.steps) {
    lines.push(`[${LABELS[step.status]}] ${step.title}: ${step.detail}`);
    if (step.remedy) lines.push(`        Rimedio: ${step.remedy}`);
  }
  const pending = result.steps.filter((step) => step.status !== 'ok').length;
  lines.push(result.ok
    ? 'Esito: tutti i passi sono soddisfatti.'
    : `Esito: ${pending === 1 ? '1 passo' : `${pending} passi`} da completare. Procedura: docs/operations/TEC-020-dettato-vocale-remoto.md`);
  return lines;
}

// Returns the default device type declared by the last `pcm.default` definition.
export function alsaDefaultFrom(contents) {
  let found = 'unset';
  for (const content of contents) {
    const text = content.replace(/#.*$/gm, '');
    const pattern = /pcm\.!?default\b\s*=?\s*/g;
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      const rest = text.slice(pattern.lastIndex);
      if (rest.startsWith('{')) {
        const body = balancedBody(rest);
        found = /(^|[\s;,{])type\s*=?\s*"?pulse"?(?=[\s;,}]|$)/.test(body) ? 'pulse' : 'other';
      } else {
        const name = /^"?([A-Za-z0-9_.-]+)"?/.exec(rest)?.[1];
        if (name) found = name === 'pulse' ? 'pulse' : 'other';
      }
    }
  }
  return found;
}

function balancedBody(text) {
  let depth = 0;
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '{') depth++;
    if (text[index] === '}' && --depth === 0) return text.slice(1, index);
  }
  return text.slice(1);
}

export function countCaptureSources(output) {
  return output.split('\n')
    .map((line) => line.split('\t')[1])
    .filter((name) => name && !name.endsWith('.monitor'))
    .length;
}

function errorCode(error) { return error && typeof error === 'object' ? error.code : undefined; }

async function exists(system, path) {
  try { await system.lstat(path); return true; } catch { return false; }
}

async function readOptional(system, path) {
  try { return await system.readFile(path, 'utf8'); } catch { return ''; }
}

async function socketState(system, path) {
  let stat;
  try { stat = await system.lstat(path); } catch (error) { return errorCode(error) === 'ENOENT' ? 'missing' : 'unknown'; }
  if (!stat.isSocket()) return 'not-socket';
  if (stat.uid !== system.uid) return 'foreign';
  return (stat.mode & 0o077) === 0 ? 'private' : 'shared';
}

async function firstExisting(system, candidates) {
  for (const candidate of candidates.filter(Boolean)) {
    if (await exists(system, candidate)) return candidate;
  }
  return undefined;
}

// Keeps the user's cookie and client.conf, which the overridden configuration
// directory would otherwise hide from pactl.
async function pactlEnvironment(system) {
  const { env } = system;
  const environment = { ...env, LC_ALL: 'C', XDG_CONFIG_HOME: UNWRITABLE_CONFIG_HOME };
  const configHome = env.XDG_CONFIG_HOME || (env.HOME ? `${env.HOME}/.config` : undefined);
  const home = env.HOME;
  if (!env.PULSE_COOKIE) {
    const cookie = await firstExisting(system, [configHome && `${configHome}/pulse/cookie`, home && `${home}/.pulse-cookie`]);
    if (cookie) environment.PULSE_COOKIE = cookie;
  }
  if (!env.PULSE_CLIENTCONFIG) {
    const clientConfig = await firstExisting(system, [configHome && `${configHome}/pulse/client.conf`, home && `${home}/.pulse/client.conf`]);
    if (clientConfig) environment.PULSE_CLIENTCONFIG = clientConfig;
  }
  return environment;
}

function runPactl(system, args, env) {
  const result = system.spawnSync('pactl', args, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: PACTL_TIMEOUT_MS });
  return { ok: !result.error && result.status === 0, missingCommand: errorCode(result.error) === 'ENOENT', stdout: result.stdout ?? '' };
}

export async function collectVoiceFacts(system) {
  const { env } = system;
  const facts = {};
  facts.alsaPulsePlugin = false;
  for (const path of ALSA_PULSE_PLUGIN_PATHS) {
    if (await exists(system, path)) { facts.alsaPulsePlugin = true; break; }
  }

  const pactlEnv = await pactlEnvironment(system);
  facts.pactlAvailable = !runPactl(system, ['--version'], pactlEnv).missingCommand;

  const home = env.HOME;
  const userConfig = env.XDG_CONFIG_HOME || (home ? `${home}/.config` : undefined);
  const alsaFiles = ['/etc/asound.conf', home && `${home}/.asoundrc`, userConfig && `${userConfig}/alsa/asoundrc`].filter(Boolean);
  const contents = [];
  for (const path of alsaFiles) contents.push(await readOptional(system, path));
  facts.alsaDefault = alsaDefaultFrom(contents);

  facts.pulseServer = env.PULSE_SERVER;
  const server = parsePulseServer(env.PULSE_SERVER);
  if (!server.path) return facts;
  facts.socket = await socketState(system, server.path);
  if (facts.socket !== 'private' || !facts.pactlAvailable) return facts;

  facts.serverReachable = runPactl(system, ['info'], pactlEnv).ok;
  if (!facts.serverReachable) return facts;
  const sources = runPactl(system, ['list', 'short', 'sources'], pactlEnv);
  facts.captureSources = sources.ok ? countCaptureSources(sources.stdout) : 0;
  return facts;
}

export async function diagnoseVoice(system) {
  const result = evaluateVoiceSetup(await collectVoiceFacts(system));
  for (const line of formatReport(result)) system.log(line);
  return result.ok ? 0 : 1;
}
