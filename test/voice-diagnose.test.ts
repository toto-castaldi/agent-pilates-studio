import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

type Facts = Record<string, unknown>;
type Step = { id: string; status: 'ok' | 'missing' | 'skipped'; detail: string; remedy?: string };
type Result = { ok: boolean; steps: Step[] };
type SpawnCall = { command: string; args: string[]; options: { env: Record<string, string | undefined>; timeout: number } };
type Core = {
  UNWRITABLE_CONFIG_HOME: string;
  evaluateVoiceSetup(facts: Facts): Result;
  formatReport(result: Result): string[];
  parsePulseServer(value: string | undefined): { path?: string; error?: string };
  alsaDefaultFrom(contents: string[]): string;
  countCaptureSources(output: string): number;
  collectVoiceFacts(system: unknown): Promise<Facts>;
  diagnoseVoice(system: unknown): Promise<number>;
};

const core = createRequire(import.meta.url)('../../scripts/voice-diagnose-core.mjs') as Core;

const SOCKET = '/run/user/4242/pulse-remote.socket';
const satisfied: Facts = {
  alsaPulsePlugin: true,
  pactlAvailable: true,
  alsaDefault: 'pulse',
  pulseServer: `unix:${SOCKET}`,
  socket: 'private',
  serverReachable: true,
  captureSources: 1,
};

const statusOf = (result: Result) => Object.fromEntries(result.steps.map((step) => [step.id, step.status]));

test('reports success when every step is satisfied', () => {
  const result = core.evaluateVoiceSetup(satisfied);
  assert.equal(result.ok, true);
  assert.deepEqual(result.steps.map((step) => step.id), ['alsa-plugin', 'pactl', 'alsa-default', 'pulse-server', 'socket', 'reachable', 'source']);
  assert.ok(result.steps.every((step) => step.status === 'ok' && step.remedy === undefined));
  assert.equal(core.formatReport(result).at(-1), 'Esito: tutti i passi sono soddisfatti.');
});

const missingCases: [string, Facts, string, RegExp][] = [
  ['ALSA plugin', { alsaPulsePlugin: false }, 'alsa-plugin', /amministrativo.*sudo apt install libasound2-plugins/],
  ['pactl', { pactlAvailable: false, serverReachable: undefined, captureSources: undefined }, 'pactl', /amministrativo.*sudo apt install pulseaudio-utils/],
  ['ALSA default', { alsaDefault: 'unset' }, 'alsa-default', /Creare ~\/\.asoundrc.*type pulse/],
  ['non-Pulse ALSA default', { alsaDefault: 'other' }, 'alsa-default', /Sostituire in ~\/\.asoundrc/],
  ['PULSE_SERVER', { pulseServer: undefined, socket: undefined }, 'pulse-server', /export PULSE_SERVER=unix:\/run\/user\/\$\(id -u\)\/pulse-remote\.socket/],
  ['PULSE_SERVER format', { pulseServer: 'tcp:localhost:4713', socket: undefined }, 'pulse-server', /export PULSE_SERVER=unix:/],
  ['socket', { socket: 'missing' }, 'socket', /RemoteForward.*StreamLocalBindUnlink yes/],
  ['socket path', { socket: 'not-socket' }, 'socket', /ricollegarsi/],
  ['socket owner', { socket: 'foreign' }, 'socket', /directory runtime/],
  ['socket permissions', { socket: 'shared' }, 'socket', /StreamLocalBindMask/],
  ['unreadable socket', { socket: 'unknown' }, 'socket', /leggibile/],
  ['client server', { serverReachable: false, captureSources: undefined }, 'reachable', /pipewire-pulse/],
  ['capture source', { captureSources: 0 }, 'source', /microfono sul client/],
];

for (const [name, override, id, remedy] of missingCases) {
  test(`reports the missing ${name} step with its remedy`, () => {
    const result = core.evaluateVoiceSetup({ ...satisfied, ...override });
    const step = result.steps.find((candidate) => candidate.id === id);
    assert.equal(result.ok, false);
    assert.equal(step?.status, 'missing');
    assert.match(step?.remedy ?? '', remedy);
    const others = result.steps.filter((candidate) => candidate.id !== id && candidate.status === 'missing');
    assert.deepEqual(others, []);
  });
}

test('skips the checks that depend on missing steps', () => {
  const unset = core.evaluateVoiceSetup({ ...satisfied, pulseServer: undefined, socket: undefined, serverReachable: undefined, captureSources: undefined });
  assert.deepEqual(statusOf(unset), { 'alsa-plugin': 'ok', pactl: 'ok', 'alsa-default': 'ok', 'pulse-server': 'missing', socket: 'skipped', reachable: 'skipped', source: 'skipped' });
  const withoutPactl = core.evaluateVoiceSetup({ ...satisfied, pactlAvailable: false, serverReachable: undefined, captureSources: undefined });
  assert.deepEqual(statusOf(withoutPactl), { 'alsa-plugin': 'ok', pactl: 'missing', 'alsa-default': 'ok', 'pulse-server': 'ok', socket: 'ok', reachable: 'skipped', source: 'skipped' });
  assert.match(withoutPactl.steps[5].detail, /Strumento pactl/);
});

test('formats the report without the socket path or device names', () => {
  const lines = core.formatReport(core.evaluateVoiceSetup({ ...satisfied, captureSources: 2, alsaPulsePlugin: false }));
  const text = lines.join('\n');
  assert.equal(lines[0], 'Diagnosi del dettato vocale Pi su server remoto (sola lettura)');
  assert.match(text, /\[MANCA\] Plugin ALSA per PulseAudio/);
  assert.match(text, /\[OK\] Sorgente audio di acquisizione: 2 disponibili/);
  assert.match(lines.at(-1) ?? '', /^Esito: 1 passo da completare\. Procedura: docs\/operations\/TEC-020-dettato-vocale-remoto\.md$/);
  assert.doesNotMatch(text, /4242|pulse-remote\.socket/);
});

test('accepts only PULSE_SERVER values with an absolute Unix socket', () => {
  assert.deepEqual(core.parsePulseServer(`unix:${SOCKET}`), { path: SOCKET });
  assert.deepEqual(core.parsePulseServer(undefined), { error: 'unset' });
  assert.deepEqual(core.parsePulseServer('  '), { error: 'unset' });
  for (const value of [SOCKET, 'unix:relative/native', 'tcp:127.0.0.1', `unix:${SOCKET} tcp:host`]) {
    assert.deepEqual(core.parsePulseServer(value), { error: 'format' }, value);
  }
});

test('reads the ALSA default device from configuration text', () => {
  assert.equal(core.alsaDefaultFrom(['pcm.!default {\n  type pulse\n}\nctl.!default {\n  type pulse\n}\n']), 'pulse');
  assert.equal(core.alsaDefaultFrom(['pcm.!default pulse']), 'pulse');
  assert.equal(core.alsaDefaultFrom(['pcm.default "pulse"']), 'pulse');
  assert.equal(core.alsaDefaultFrom(['pcm.!default { type pulse hint { description "synthetic" } }']), 'pulse');
  assert.equal(core.alsaDefaultFrom(['pcm.!default { type hw card 0 }']), 'other');
  assert.equal(core.alsaDefaultFrom(['# pcm.!default { type pulse }', '']), 'unset');
  assert.equal(core.alsaDefaultFrom(['pcm.!default { type pulse }', 'pcm.!default { type hw card 0 }']), 'other');
  assert.equal(core.alsaDefaultFrom(['pcm.!default { type hw card 0 }', 'pcm.!default { type pulse }']), 'pulse');
  assert.equal(core.alsaDefaultFrom(['pcm.pulse { type pulse }']), 'unset');
});

test('counts capture sources excluding monitors', () => {
  const output = '0\tsynthetic_sink.monitor\tmodule-null-sink.c\ts16le 2ch 44100Hz\tIDLE\n1\tsynthetic_mic\tmodule-null-source.c\ts16le 1ch 16000Hz\tSUSPENDED\n';
  assert.equal(core.countCaptureSources(output), 1);
  assert.equal(core.countCaptureSources(''), 0);
});

type Entry = { socket?: boolean; uid?: number; mode?: number; content?: string; error?: string };

function fakeSystem(options: {
  env?: Record<string, string>;
  files?: Record<string, Entry>;
  pactl?: 'missing' | { info: number; sources: string };
}) {
  const files = options.files ?? {};
  const calls: SpawnCall[] = [];
  const logs: string[] = [];
  const fail = (code: string): never => { throw Object.assign(new Error(code), { code }); };
  return {
    calls, logs,
    uid: 4242,
    env: options.env ?? { HOME: '/home/synthetic' },
    log: (line: string) => logs.push(line),
    async lstat(path: string) {
      const entry = files[path];
      if (!entry) return fail('ENOENT');
      if (entry.error) return fail(entry.error);
      return { isSocket: () => entry.socket === true, uid: entry.uid ?? 4242, mode: entry.mode ?? 0o100600 };
    },
    async readFile(path: string) {
      const entry = files[path];
      if (!entry || entry.content === undefined) return fail('ENOENT');
      return entry.content;
    },
    spawnSync(command: string, args: string[], spawnOptions: SpawnCall['options']) {
      calls.push({ command, args, options: spawnOptions });
      const pactl = options.pactl ?? { info: 0, sources: '' };
      if (pactl === 'missing') return { error: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }), status: null, stdout: '' };
      if (args[0] === 'info') return { status: pactl.info, stdout: '' };
      if (args[0] === 'list') return { status: 0, stdout: pactl.sources };
      return { status: 0, stdout: 'pactl 17.0\n' };
    },
  };
}

const configured = {
  env: { HOME: '/home/synthetic', PULSE_SERVER: `unix:${SOCKET}` },
  files: {
    '/usr/lib/x86_64-linux-gnu/alsa-lib/libasound_module_pcm_pulse.so': {},
    '/home/synthetic/.asoundrc': { content: 'pcm.!default { type pulse }\nctl.!default { type pulse }\n' },
    [SOCKET]: { socket: true, mode: 0o140600 },
  } as Record<string, Entry>,
  pactl: { info: 0, sources: '1\tsynthetic_mic\tmodule-null-source.c\ts16le 1ch 16000Hz\tIDLE\n' },
};

test('collects all facts from a configured server and passes the diagnosis', async () => {
  const system = fakeSystem(configured);
  assert.deepEqual(await core.collectVoiceFacts(system), satisfied);
  const exit = await core.diagnoseVoice(fakeSystem(configured));
  assert.equal(exit, 0);
  assert.deepEqual(system.calls.map((call) => call.args.join(' ')), ['--version', 'info', 'list short sources']);
  for (const call of system.calls) {
    assert.equal(call.command, 'pactl');
    assert.equal(call.options.env.XDG_CONFIG_HOME, core.UNWRITABLE_CONFIG_HOME);
    assert.equal(call.options.env.LC_ALL, 'C');
    assert.ok(call.options.timeout > 0);
  }
});

test('keeps the user pulse cookie and client configuration visible to pactl', async () => {
  const files = { ...configured.files, '/home/synthetic/.config/pulse/cookie': {}, '/home/synthetic/.config/pulse/client.conf': {} };
  const system = fakeSystem({ ...configured, files });
  await core.collectVoiceFacts(system);
  assert.equal(system.calls[1].options.env.PULSE_COOKIE, '/home/synthetic/.config/pulse/cookie');
  assert.equal(system.calls[1].options.env.PULSE_CLIENTCONFIG, '/home/synthetic/.config/pulse/client.conf');
  const explicit = fakeSystem({ ...configured, files, env: { ...configured.env, PULSE_COOKIE: '/synthetic/cookie' } });
  await core.collectVoiceFacts(explicit);
  assert.equal(explicit.calls[1].options.env.PULSE_COOKIE, '/synthetic/cookie');
});

test('does not contact a Pulse server without a valid forwarded socket', async () => {
  const unset = fakeSystem({ ...configured, env: { HOME: '/home/synthetic' } });
  const facts = await core.collectVoiceFacts(unset);
  assert.equal(facts.socket, undefined);
  assert.deepEqual(unset.calls.map((call) => call.args[0]), ['--version']);

  const absent = fakeSystem({ ...configured, files: { ...configured.files, [SOCKET]: undefined as unknown as Entry } });
  assert.equal((await core.collectVoiceFacts(absent)).socket, 'missing');
  assert.deepEqual(absent.calls.map((call) => call.args[0]), ['--version']);
});

test('classifies the forwarded socket state', async () => {
  const states: [Entry, string][] = [
    [{ socket: false }, 'not-socket'],
    [{ socket: true, uid: 1 }, 'foreign'],
    [{ socket: true, mode: 0o140666 }, 'shared'],
    [{ error: 'EACCES' }, 'unknown'],
  ];
  for (const [entry, expected] of states) {
    const system = fakeSystem({ ...configured, files: { ...configured.files, [SOCKET]: entry } });
    assert.equal((await core.collectVoiceFacts(system)).socket, expected);
    assert.deepEqual(system.calls.map((call) => call.args[0]), ['--version']);
  }
});

test('reports a missing pactl, an unreachable server and no sources', async () => {
  const noPactl = await core.collectVoiceFacts(fakeSystem({ ...configured, pactl: 'missing' }));
  assert.equal(noPactl.pactlAvailable, false);
  assert.equal(noPactl.serverReachable, undefined);

  const unreachable = fakeSystem({ ...configured, pactl: { info: 1, sources: '' } });
  assert.equal((await core.collectVoiceFacts(unreachable)).serverReachable, false);
  assert.deepEqual(unreachable.calls.map((call) => call.args[0]), ['--version', 'info']);

  const silent = await core.collectVoiceFacts(fakeSystem({ ...configured, pactl: { info: 0, sources: '0\tsynthetic.monitor\tm\tf\tIDLE\n' } }));
  assert.equal(silent.captureSources, 0);
});

test('reads ALSA defaults from the user XDG configuration and exits with failure when steps are missing', async () => {
  const system = fakeSystem({
    env: { HOME: '/home/synthetic', XDG_CONFIG_HOME: '/home/synthetic/xdg' },
    files: { '/home/synthetic/xdg/alsa/asoundrc': { content: 'pcm.!default pulse' } },
  });
  const exit = await core.diagnoseVoice(system);
  assert.equal(exit, 1);
  assert.match(system.logs.join('\n'), /\[OK\] Dispositivo ALSA predefinito/);
  assert.match(system.logs.join('\n'), /\[MANCA\] Plugin ALSA per PulseAudio/);
  assert.match(system.logs.at(-1) ?? '', /^Esito: 5 passi da completare/);
});
