import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { Client } from 'pg';

test('a new empty database completes the manager and another teacher only through chat', { timeout: 420_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pilates-fresh-'));
  const project = `pilates-fresh-${randomBytes(6).toString('hex')}`;
  const manager = '15555550102';
  const other = '15555550103';
  const secrets: Record<string, string> = {
    'db-admin': randomBytes(32).toString('hex'), 'db-migrator': randomBytes(32).toString('hex'),
    'db-agent': randomBytes(32).toString('hex'), 'db-broker': randomBytes(32).toString('hex'), 'db-grafana': randomBytes(32).toString('hex'),
    'bridge-token': randomBytes(32).toString('hex'), 'openrouter-key': 'synthetic-key',
    'whatsapp-access-token': 'synthetic-access', 'whatsapp-app-secret': 'synthetic-secret',
    'whatsapp-verify-token': 'synthetic-verify', 'whatsapp-manager-phone': `+${manager}`,
    'whatsapp-phone-number-id': '123456789012345',
  };
  const override = join(directory, 'override.yaml');
  const env = {
    ...process.env, COMPOSE_ENV_FILES: '/dev/null', COMPOSE_PROJECT_NAME: project, PILATES_VOLUME_PREFIX: project,
    PILATES_HERMES_IMAGE: `${project}-hermes`, PILATES_POSTGRES_IMAGE: `${project}-postgres`,
    SECRETS_DIR: directory, POSTGRES_PORT: '0', WHATSAPP_WEBHOOK_PORT: '0', WHATSAPP_WEBHOOK_PATH: '/whatsapp/webhook',
    PILATES_MODEL: 'synthetic/compaction-model', PILATES_IDLE_COMPACT_SECONDS: '1',
  };
  const compose = (...args: string[]) => execFileSync('docker', ['compose', '-p', project, '-f', 'compose.yaml', '-f', override, ...args], { env, encoding: 'utf8', stdio: 'pipe', timeout: 240_000 });
  let db: Client | undefined;
  try {
    await Promise.all(Object.entries(secrets).map(([key, value]) => writeFile(join(directory, key), value, { mode: 0o600 })));
    await writeFile(join(directory, 'config.yaml'), (await readFile('hermes/config.yaml', 'utf8')).replace('\ndisplay:\n', '\ndisplay:\n  tool_progress: off\n'));
    await writeFile(override, `services:
  model-stub:
    image: ${project}-hermes
    entrypoint: ["/opt/hermes/.venv/bin/python", "/stub.py"]
    volumes:
      - ${JSON.stringify(`${resolve('integration/compaction_stub.py')}:/stub.py:ro`)}
    logging: {driver: none}
  meta-stub:
    image: ${project}-hermes
    entrypoint: ["/opt/hermes/.venv/bin/python", "/stub.py"]
    volumes:
      - ${JSON.stringify(`${resolve('scenarios/meta_stub.py')}:/stub.py:ro`)}
    logging: {driver: none}
  hermes:
    environment:
      OPENROUTER_BASE_URL: http://model-stub:8088/v1
    volumes:
      - ${JSON.stringify(`${resolve('scenarios/gateway-launcher.sh')}:/opt/hermes/libexec/hermes:ro`)}
      - ${JSON.stringify(`${join(directory, 'config.yaml')}:/opt/data/config.yaml:ro`)}
  author-broker:
    logging: {driver: none}
networks:
  default:
    internal: true
`);
    compose('build', 'hermes', 'postgres');
    compose('up', '-d', '--wait', 'postgres');
    compose('run', '--rm', 'db-bootstrap');
    const id = (service: string) => compose('ps', '-q', service).trim();
    const host = execFileSync('docker', ['inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', id('postgres')], { encoding: 'utf8' }).trim();
    const url = new URL(`postgresql://${host}:5432/studio?schema=public`);
    url.username = 'studio_migrator';
    url.password = secrets['db-migrator'];
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: { ...env, DATABASE_URL: url.toString() }, stdio: 'pipe', timeout: 120_000 });
    db = new Client({ host, database: 'studio', user: 'studio_migrator', password: secrets['db-migrator'] });
    await db.connect();
    assert.equal((await db.query('SELECT count(*)::int AS n FROM studio_private.teachers')).rows[0].n, 0);
    compose('up', '-d', '--wait', '--wait-timeout', '150', 'model-stub', 'meta-stub', 'hermes');
    const gateway = `http://${execFileSync('docker', ['inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', id('hermes')], { encoding: 'utf8' }).trim()}:8090/whatsapp/webhook`;
    const meta = `http://${execFileSync('docker', ['inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', id('meta-stub')], { encoding: 'utf8' }).trim()}:8088/observations`;
    const models = `http://${execFileSync('docker', ['inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', id('model-stub')], { encoding: 'utf8' }).trim()}:8088/v1/observations`;
    let seq = 0;
    const post = async (text: string, sender = manager) => {
      const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: secrets['whatsapp-phone-number-id'] }, contacts: [{ wa_id: sender, profile: { name: 'WhatsApp Profile Synthetic' } }], messages: [{ from: sender, id: `fresh-${++seq}`, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }] } }] }] });
      const before = (await (await fetch(meta)).json() as { to: string; text: string }[]).length;
      const beforeModels = (await (await fetch(models)).json() as unknown[]).length;
      assert.equal((await fetch(gateway, { method: 'POST', body, headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': `sha256=${createHmac('sha256', secrets['whatsapp-app-secret']).update(body).digest('hex')}` } })).status, 200);
      let entries: { to: string; text: string }[] = [];
      for (let wait = 0; wait < 80 && entries.length === 0; wait++) {
        await delay(250);
        entries = (await (await fetch(meta)).json() as { to: string; text: string }[]).slice(before);
      }
      assert.ok(entries.length, 'missing chat response');
      assert.equal((await (await fetch(models)).json() as unknown[]).length, beforeModels, 'empty-install management called the model');
      return entries.map((entry) => entry.text).join('\n');
    };
    const confirm = async (preview: string) => {
      const code = /\/conferma ([a-f0-9]{16})/u.exec(preview)?.[1];
      assert.ok(code);
      return post(`/conferma ${code}`);
    };
    assert.match(await post('ciao'), /Censimento iniziale obbligatorio/u);
    await post('/anagrafica');
    await post('Synthetic');
    assert.match(await confirm(await post('Manager')), /salvata/u);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM studio_private.teachers')).rows[0].n, 1);
    await post('/anagrafica');
    await post('nuovo');
    await post('Other');
    await post('Synthetic');
    assert.match(await post('555'), /non valido/iu);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM studio_private.teachers WHERE first_name = 'Other'")).rows[0].n, 0);
    await post('/annulla');
    await post('/anagrafica');
    await post('nuovo');
    await post('Other');
    await post('Synthetic');
    assert.match(await confirm(await post(`+${other}`)), /salvata/u);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM studio_private.teachers WHERE phone IS NOT NULL AND access_enabled AND NOT legacy_identity')).rows[0].n, 2);
    assert.match(await post('/anagrafica', other), /riservata/u);
    assert.match(await post('/sethome'), /operatore/iu);
    const homes = execFileSync('docker', ['exec', id('hermes'), 'sh', '-c', 'for f in /proc/[0-9]*/environ; do tr "\\0" "\\n" < "$f" 2>/dev/null; done | grep "^WHATSAPP_CLOUD_HOME_CHANNEL=" | sort -u'], { encoding: 'utf8' }).trim();
    assert.equal(homes, `WHATSAPP_CLOUD_HOME_CHANNEL=${manager}`);
  } finally {
    await db?.end().catch(() => undefined);
    try { compose('down', '-v', '--remove-orphans'); } catch { /* isolated project only */ }
    try { execFileSync('docker', ['image', 'rm', '-f', `${project}-hermes`, `${project}-postgres`], { stdio: 'ignore' }); } catch { /* only this test's tags */ }
    await rm(directory, { recursive: true, force: true });
  }
});
