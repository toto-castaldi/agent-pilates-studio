import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { hasHomeChannelNotice } from '../src/conversation.js';
import { seedIdentities } from './identity-seed.js';

test('home derived from the manager is immutable through signed WhatsApp turns and cron stays disabled', { timeout: 420_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pilates-home-test-'));
  const project = `pilates-home-${randomBytes(8).toString('hex')}`;
  const secrets: Record<string, string> = {
    'db-admin': randomBytes(32).toString('hex'), 'db-migrator': randomBytes(32).toString('hex'),
    'db-agent': randomBytes(32).toString('hex'), 'db-broker': randomBytes(32).toString('hex'), 'db-grafana': randomBytes(32).toString('hex'),
    'bridge-token': randomBytes(32).toString('hex'), 'openrouter-key': 'synthetic-model-token',
    'whatsapp-access-token': 'synthetic-access-token', 'whatsapp-app-secret': 'synthetic-app-secret',
    'whatsapp-verify-token': 'synthetic-verify-token', 'whatsapp-manager-phone': '+15555550102\n',
    'whatsapp-phone-number-id': '123456789012345',
  };
  const override = join(directory, 'override.yaml');
  const env = { ...process.env, COMPOSE_ENV_FILES: '/dev/null', SECRETS_DIR: directory, POSTGRES_PORT: '0', WHATSAPP_WEBHOOK_PORT: '0', PILATES_MODEL: 'openai/synthetic-reasoning-model' };
  const compose = (...args: string[]) => execFileSync('docker', ['compose', '-p', project, '-f', 'compose.yaml', '-f', override, ...args], { env, encoding: 'utf8', stdio: 'pipe', timeout: 180_000 });
  try {
    await Promise.all(Object.entries(secrets).map(([name, value]) => writeFile(join(directory, name), value, { mode: 0o600 })));
    await writeFile(join(directory, 'config.yaml'), (await readFile('hermes/config.yaml', 'utf8')).replace('\ndisplay:\n', '\ndisplay:\n  tool_progress: off\n'));
    await writeFile(override, `services:\n  model-stub:\n    image: ${project}-hermes\n    entrypoint: ["/opt/hermes/.venv/bin/python", "/model_stub.py"]\n    volumes:\n      - ${JSON.stringify(`${resolve('integration/model_stub.py')}:/model_stub.py:ro`)}\n    networks:\n      default:\n        aliases: [openrouter.ai]\n    logging:\n      driver: none\n  meta-stub:\n    image: ${project}-hermes\n    entrypoint: ["/opt/hermes/.venv/bin/python", "/meta_stub.py"]\n    volumes:\n      - ${JSON.stringify(`${resolve('scenarios/meta_stub.py')}:/meta_stub.py:ro`)}\n    logging:\n      driver: none\n  hermes:\n    environment:\n      OPENROUTER_BASE_URL: http://openrouter.ai:8088/v1\n      NO_PROXY: openrouter.ai,model-stub,meta-stub,localhost,127.0.0.1\n    volumes:\n      - ${JSON.stringify(`${resolve('scenarios/gateway-launcher.sh')}:/opt/hermes/libexec/hermes:ro`)}\n      - ${JSON.stringify(`${join(directory, 'config.yaml')}:/opt/data/config.yaml:ro`)}\nnetworks:\n  default:\n    internal: true\n`);
    compose('build', 'hermes');
    compose('up', '-d', '--wait', 'postgres');
    compose('run', '--rm', 'db-bootstrap');
    const address = (service: string) => {
      const id = compose('ps', '-q', service).trim();
      const ip = execFileSync('docker', ['inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', id], { encoding: 'utf8' }).trim();
      assert.ok(ip);
      return ip;
    };
    const migrationUrl = new URL(`postgresql://${address('postgres')}:5432/studio?schema=public`);
    migrationUrl.username = 'studio_migrator';
    migrationUrl.password = secrets['db-migrator'];
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: { ...env, DATABASE_URL: migrationUrl.toString() }, stdio: 'pipe', timeout: 90_000 });
    await seedIdentities({ host: address('postgres'), password: secrets['db-broker'] },
      { first: 'Synthetic', last: 'Manager', phone: '15555550102' }, [{ first: 'Synthetic', last: 'Teacher', phone: '15555550103' }]);
    compose('up', '-d', '--wait', '--wait-timeout', '150', 'model-stub', 'meta-stub', 'hermes');
    // The home channel is derived from the single manager number.
    const homes = execFileSync('docker', ['exec', compose('ps', '-q', 'hermes').trim(), 'sh', '-c', 'for f in /proc/[0-9]*/environ; do tr "\\0" "\\n" < "$f" 2>/dev/null; done | grep "^WHATSAPP_CLOUD_HOME_CHANNEL=" | sort -u'], { encoding: 'utf8' }).trim();
    assert.equal(homes, 'WHATSAPP_CLOUD_HOME_CHANNEL=15555550102');
    let gateway = `http://${address('hermes')}:8090/whatsapp/webhook`;
    const meta = `http://${address('meta-stub')}:8088/observations`;
    type Message = { to: string; text: string };
    const observations = async () => await (await fetch(meta)).json() as Message[];
    const send = async (sender: string, text: string) => {
      const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: '999', changes: [{ field: 'messages', value: {
        metadata: { phone_number_id: secrets['whatsapp-phone-number-id'] }, contacts: [{ wa_id: sender, profile: { name: 'Synthetic' } }],
        messages: [{ from: sender, id: `wamid.synthetic.${randomBytes(16).toString('hex')}`, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }],
      } }] }] });
      const signature = `sha256=${createHmac('sha256', secrets['whatsapp-app-secret']).update(payload).digest('hex')}`;
      assert.equal((await fetch(gateway, { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signature } })).status, 200);
    };
    const expectReply = async (sender: string, text: string, expected: RegExp) => {
      const before = (await observations()).length;
      await send(sender, text);
      for (let i = 0; i < 90; i++) {
        const entries = (await observations()).slice(before);
        assert.ok(entries.every((item) => !hasHomeChannelNotice(item.text)));
        if (entries.some((item) => item.to === sender && expected.test(item.text))) {
          await delay(1500);
          const complete = (await observations()).slice(before);
          assert.ok(complete.every((item) => item.to === sender && !hasHomeChannelNotice(item.text)));
          return;
        }
        await delay(1000);
      }
      assert.fail('Timed out waiting for synthetic reply');
    };
    type ModelCall = { user: string; model: string; tools: string[]; reasoning?: { effort?: string; enabled?: boolean } | null; reasoning_effort?: string | null };
    const modelUrl = () => `http://${address('model-stub')}:8088/v1/observations`;
    const modelCalls = async () => await (await fetch(modelUrl())).json() as ModelCall[];
    const effortOf = (call: ModelCall) => call.reasoning?.effort ?? call.reasoning_effort;
    const expectModel = async (marker: string, model: string, effort: string) => {
      // Agent turns carry the tools; auxiliary calls such as titles disable reasoning by design.
      const calls = (await modelCalls()).filter((call) => call.user.includes(marker) && call.tools.length > 0);
      assert.ok(calls.length > 0, `no model request for ${marker}`);
      for (const call of calls) {
        assert.equal(call.model, model);
        assert.equal(effortOf(call), effort, `reasoning effort for ${marker}: ${JSON.stringify(call.reasoning ?? call.reasoning_effort)}`);
      }
    };
    const threshold = () => execFileSync('docker', ['exec', compose('ps', '-q', 'hermes').trim(), 'sh', '-c', 'for f in /proc/[0-9]*/environ; do tr "\\0" "\\n" < "$f" 2>/dev/null; done | grep "^PILATES_COMPACTION_THRESHOLD_TOKENS=" | sort -u'], { encoding: 'utf8' }).trim();
    // Model, reasoning effort, fast mode and runtime are operator-owned: no
    // spelling or alias changes them or reaches the model, manager included.
    const settingCommands = ['/model openai/synthetic-reasoning-updated', '/model openai/synthetic-reasoning-updated --global', '/MODEL', '/Model reset',
      '/model openai/synthetic-reasoning-updated --reasoning high', '/reasoning high', '/reasoning none --global', '/Reasoning', '/reasoning hide',
      '/fast', '/fast on --global', '/FAST status', '/codex-runtime codex_app_server', '/codex_runtime auto', '/Codex-Runtime'];
    const expectSettingsRefused = async () => {
      const before = (await modelCalls()).length;
      for (const sender of ['15555550102', '15555550103']) {
        for (const command of settingCommands) await expectReply(sender, command, /gestiti dall.operatore/i);
      }
      const after = (await modelCalls()).slice(before);
      assert.deepEqual(after.filter((call) => /\/(model|reasoning|fast|codex)/iu.test(call.user)), []);
    };
    await expectReply('15555550102', 'context-probe-first', /Completato/);
    await expectReply('15555550103', 'context-probe-second', /Completato/);
    await expectModel('context-probe-first', 'openai/synthetic-reasoning-model', 'medium');
    assert.equal(threshold(), 'PILATES_COMPACTION_THRESHOLD_TOKENS=26214');
    await expectReply('15555550103', '/sethome', /gestito dall.operatore/i);
    await expectSettingsRefused();
    // Other slash commands keep their behavior.
    await expectReply('15555550103', '/sethome', /gestito dall.operatore/i);
    await expectReply('15555550102', 'context-probe-after-commands', /Completato/);
    await expectModel('context-probe-after-commands', 'openai/synthetic-reasoning-model', 'medium');
    const gatewayId = () => compose('ps', '-q', 'hermes').trim();
    const python = (script: string) => execFileSync('docker', ['exec', '--user', '10000', '-e', 'HERMES_HOME=/opt/data', gatewayId(), '/opt/hermes/.venv/bin/python', '-c', script], { stdio: 'pipe', timeout: 60_000 });
    python([
      'from cron.jobs import create_job, load_jobs, save_jobs, get_due_jobs',
      'from datetime import datetime, timedelta, timezone',
      "create_job(prompt='synthetic cron must not run', schedule='every 1m', name='synthetic-probe')",
      'jobs = load_jobs()',
      "jobs[-1]['next_run_at'] = (datetime.now(timezone.utc) - timedelta(seconds=20)).isoformat()",
      'save_jobs(jobs)',
      "assert any(j.get('name') == 'synthetic-probe' for j in get_due_jobs())",
    ].join('\n'));
    compose('restart', 'hermes');
    for (let i = 0; i < 60; i++) {
      gateway = `http://${address('hermes')}:8090/whatsapp/webhook`;
      try { if ((await fetch(gateway.replace('/whatsapp/webhook', '/health'))).ok) break; } catch { /* restarting */ }
      await delay(1000);
    }
    await expectReply('15555550103', 'context-probe-restart', /Completato/);
    await delay(7000);
    python("from cron.jobs import get_due_jobs\nassert any(j.get('name') == 'synthetic-probe' for j in get_due_jobs())");
    await expectModel('context-probe-restart', 'openai/synthetic-reasoning-model', 'medium');
    // The operator's new values apply on recreation, from the same image and volumes.
    const image = execFileSync('docker', ['inspect', '--format', '{{.Image}}', gatewayId()], { encoding: 'utf8' }).trim();
    Object.assign(env, { PILATES_MODEL: 'openai/synthetic-reasoning-updated', PILATES_REASONING_EFFORT: 'high' });
    compose('up', '-d', '--no-deps', '--no-build', '--force-recreate', '--wait', '--wait-timeout', '150', 'hermes');
    assert.equal(execFileSync('docker', ['inspect', '--format', '{{.Image}}', gatewayId()], { encoding: 'utf8' }).trim(), image);
    gateway = `http://${address('hermes')}:8090/whatsapp/webhook`;
    await expectReply('15555550102', 'context-probe-recreated', /Completato/);
    await expectModel('context-probe-recreated', 'openai/synthetic-reasoning-updated', 'high');
    assert.equal(threshold(), 'PILATES_COMPACTION_THRESHOLD_TOKENS=52428');
    // The conversation history survives the change of model and level.
    python("from pathlib import Path\nstate = b''.join(p.read_bytes() for p in Path('/opt/data').glob('state.db*') if p.is_file())\nassert b'context-probe-first' in state");
    await expectReply('15555550103', '/sethome', /gestito dall.operatore/i);
    await expectSettingsRefused();
    await expectReply('15555550102', 'context-probe-final', /Completato/);
    await expectModel('context-probe-final', 'openai/synthetic-reasoning-updated', 'high');
    // An unknown level stops the gateway with the fixed preflight event only.
    Object.assign(env, { PILATES_REASONING_EFFORT: 'synthetic-invalid-level' });
    assert.throws(() => compose('up', '-d', '--no-deps', '--no-build', '--force-recreate', '--wait', '--wait-timeout', '60', 'hermes'));
    // The container may have been restarted by its policy: every line is the fixed event.
    assert.deepEqual([...new Set(execFileSync('docker', ['logs', gatewayId()], { encoding: 'utf8' }).trim().split('\n'))], ['hermes_preflight_failed']);
    Object.assign(env, { PILATES_REASONING_EFFORT: 'high' });
    compose('up', '-d', '--no-deps', '--no-build', '--force-recreate', '--wait', '--wait-timeout', '150', 'hermes');
    gateway = `http://${address('hermes')}:8090/whatsapp/webhook`;
    python("from cron.jobs import get_due_jobs\nassert any(j.get('name') == 'synthetic-probe' for j in get_due_jobs())");
    assert.ok((await observations()).every((item) => !hasHomeChannelNotice(item.text)));
    assert.equal(execFileSync('docker', ['logs', gatewayId()], { encoding: 'utf8' }).trim(), 'hermes_launch');
  } finally {
    try { compose('down', '--volumes', '--remove-orphans'); } catch { /* best effort */ }
    spawnSync('docker', ['image', 'rm', `${project}-hermes`], { stdio: 'ignore', timeout: 90_000 });
    await rm(directory, { recursive: true, force: true });
  }
});
