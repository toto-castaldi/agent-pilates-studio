import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { Client } from 'pg';
import { parseSendFailureLine } from '../src/send-failure-log.js';
import { legacyContext, migrateAcrossTransition, seedIdentities } from './identity-seed.js';

test('database identities admit WhatsApp senders and bind authors through the isolated broker', { timeout: 420_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pilates-author-test-'));
  const project = `pilates-author-${randomBytes(8).toString('hex')}`;
  const secrets: Record<string, string> = {
    'db-admin': randomBytes(32).toString('hex'),
    'db-migrator': randomBytes(32).toString('hex'),
    'db-agent': randomBytes(32).toString('hex'),
    'db-broker': randomBytes(32).toString('hex'),
    'bridge-token': randomBytes(32).toString('hex'),
    'openrouter-key': 'synthetic-model-token',
    'whatsapp-access-token': 'synthetic-access-token',
    'whatsapp-app-secret': 'synthetic-app-secret',
    'whatsapp-verify-token': 'synthetic-verify-token',
    'whatsapp-manager-phone': '+15555550102',
    'whatsapp-phone-number-id': '123456789012345',
  };
  // Registered names differ from the WhatsApp profile names on purpose.
  const ALPHA = 'alpha SyntheticInstructor';
  const BETA = 'beta SyntheticInstructor';
  const REFUSAL = /Accesso non abilitato\. Per usare l.assistente dello studio rivolgiti al gestore\./u;
  const override = join(directory, 'override.yaml');
  const env = { ...process.env, COMPOSE_ENV_FILES: '/dev/null', SECRETS_DIR: directory, POSTGRES_PORT: '0', WHATSAPP_WEBHOOK_PORT: '0', PILATES_MODEL: 'synthetic/test-model' };
  const compose = (...args: string[]) => execFileSync('docker', ['compose', '-p', project, '-f', 'compose.yaml', '-f', override, ...args], { env, encoding: 'utf8', stdio: 'pipe', timeout: 180_000 });
  const clients: Client[] = [];
  try {
    await Promise.all(Object.entries(secrets).map(([name, value]) => writeFile(join(directory, name), value, { mode: 0o600 })));
    await writeFile(join(directory, 'config.yaml'), `${await readFile('hermes/config.yaml', 'utf8')}\nquick_commands:\n  synthetic-alias:\n    type: alias\n    target: /studio-presenze\n  synthetic-native:\n    type: alias\n    target: /help\n`);
    const soulPath = join(directory, 'SOUL.md');
    const soul = await readFile('hermes/SOUL.md', 'utf8');
    await writeFile(soulPath, `${soul}\nCONTEXT_VERSION_A\n`);
    await writeFile(override, `services:\n  model-stub:\n    image: ${project}-hermes\n    entrypoint: ["/opt/hermes/.venv/bin/python", "/model_stub.py"]\n    volumes:\n      - ${JSON.stringify(`${resolve('integration/model_stub.py')}:/model_stub.py:ro`)}\n    logging:\n      driver: none\n  meta-stub:\n    image: ${project}-hermes\n    entrypoint: ["/opt/hermes/.venv/bin/python", "/meta_stub.py"]\n    volumes:\n      - ${JSON.stringify(`${resolve('scenarios/meta_stub.py')}:/meta_stub.py:ro`)}\n    logging:\n      driver: none\n  hermes:\n    environment:\n      OPENROUTER_BASE_URL: http://model-stub:8088/v1\n    volumes:\n      - ${JSON.stringify(`${resolve('scenarios/gateway-launcher.sh')}:/opt/hermes/libexec/hermes:ro`)}\n      - ${JSON.stringify(`${join(directory, 'config.yaml')}:/opt/data/config.yaml:ro`)}\n      - ${JSON.stringify(`${soulPath}:/opt/data/SOUL.md:ro`)}\nnetworks:\n  default:\n    internal: true\n`);
    compose('build', 'hermes');
    compose('up', '-d', '--wait', 'postgres');
    compose('run', '--rm', 'db-bootstrap');
    const address = (service: string) => {
      const id = compose('ps', '-q', service).trim();
      const host = execFileSync('docker', ['inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', id], { encoding: 'utf8' }).trim();
      assert.ok(host);
      return host;
    };
    const databaseHost = address('postgres');
    const migrationUrl = new URL(`postgresql://${databaseHost}:5432/studio?schema=public`);
    migrationUrl.username = 'studio_migrator';
    migrationUrl.password = secrets['db-migrator'];
    const connect = async (user: string, password: string) => {
      const client = new Client({ host: databaseHost, port: 5432, database: 'studio', user, password });
      await client.connect();
      clients.push(client);
      return client;
    };
    const migrator = await connect('studio_migrator', secrets['db-migrator']);
    // Data of the previous runtime: an author number and a WhatsApp profile
    // snapshot, plus an incomplete teacher that still teaches lessons.
    await migrateAcrossTransition(env, migrationUrl, async () => {
      await migrator.query('BEGIN');
      await legacyContext(migrator, '15555550104', 'Legacy Snapshot Gamma');
      await migrator.query("INSERT INTO app.clients (first_name, last_name) VALUES ('legacy', 'synthetic')");
      await migrator.query("INSERT INTO app.teachers (first_name, last_name) VALUES ('legacy', 'SyntheticInstructor')");
      await migrator.query("INSERT INTO app.teacher_assignments (teacher_id, lesson_date, start_time) SELECT id, '2020-02-03', '09:00' FROM app.teachers");
      await migrator.query('COMMIT');
    });
    const legacyRows = (await migrator.query('SELECT created_by_phone, created_by_name FROM studio_private.clients')).rows;
    assert.deepEqual(legacyRows, [{ created_by_phone: '15555550104', created_by_name: 'Legacy Snapshot Gamma' }]);
    const ids = await seedIdentities({ host: databaseHost, password: secrets['db-broker'] },
      { first: 'alpha', last: 'SyntheticInstructor', phone: '15555550102' }, [
        { first: 'beta', last: 'SyntheticInstructor', phone: '15555550103' },
        { first: 'delta', last: 'SyntheticInstructor', phone: '15555550105', revoked: true },
      ]);
    const trusted = await connect('studio_broker', secrets['db-broker']);
    const manage = (operation: string, id: string | null, first: string | null, last: string | null, phone: string | null) =>
      trusted.query('SELECT * FROM studio_private.manage_teacher_identity($1,$2,$3,$4,$5,$6,$7)', ['15555550102', '+15555550102', operation, id, first, last, phone]);
    compose('up', '-d', '--wait', '--wait-timeout', '150', 'model-stub', 'meta-stub', 'hermes');
    const initialGatewayId = compose('ps', '-q', 'hermes').trim();
    execFileSync('docker', ['exec', initialGatewayId, '/opt/hermes/.venv/bin/python', '-c',
      "from pathlib import Path; p=Path('/opt/data/skill-bundles'); p.mkdir(exist_ok=True); (p/'synthetic-bundle.yaml').write_text('name: synthetic-bundle\\nskills: [studio-presenze, apple-reminders]\\n')"], { stdio: 'pipe' });
    let gateway = `http://${address('hermes')}:8090/whatsapp/webhook`;
    const observationsUrl = `http://${address('model-stub')}:8088/v1/observations`;
    type Observation = { user: string; system: string; last_role: string; has_studio_tool: boolean; has_sender_number: boolean; profile_name: boolean; history: string[]; tool_contents: string[]; tools: string[] };
    const metaUrl = `http://${address('meta-stub')}:8088/observations`;
    const replies = async () => await (await fetch(metaUrl)).json() as { to: string; text: string }[];
    const waitReply = async (before: number, to: string, pattern: RegExp) => {
      for (let i = 0; i < 60; i++) {
        const entries = (await replies()).slice(before);
        if (entries.some((entry) => entry.to === to && pattern.test(entry.text))) return entries;
        await delay(500);
      }
      assert.fail('Timed out waiting for a fixed reply');
    };
    const waitObservation = async (predicate: (entry: Observation) => boolean) => {
      for (let i = 0; i < 90; i++) {
        const entries = await (await fetch(observationsUrl)).json() as Observation[];
        const match = entries.find(predicate);
        if (match) return match;
        await delay(1000);
      }
      assert.fail('Timed out waiting for synthetic model request');
    };
    let broker = `http://${address('author-broker')}:8091`;
    const body = (sender: string, name: string, id: string, text: string, timestamp = Math.floor(Date.now() / 1000), phoneId = secrets['whatsapp-phone-number-id']) => JSON.stringify({
      object: 'whatsapp_business_account', entry: [{ id: '999', changes: [{ field: 'messages', value: {
        metadata: { phone_number_id: phoneId }, contacts: [{ wa_id: sender, profile: { name } }],
        messages: [{ from: sender, id, timestamp: String(timestamp), type: 'text', text: { body: text } }],
      } }] }],
    });
    const signed = (payload: string) => `sha256=${createHmac('sha256', secrets['whatsapp-app-secret']).update(payload).digest('hex')}`;
    const gatewayPost = (payload: string, signature = signed(payload)) => fetch(gateway, { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signature, Connection: 'close' } });
    const evidence = (payload: string, signature = signed(payload), token = secrets['bridge-token']) => fetch(`${broker}/v1/admission`, { method: 'POST', body: payload, headers: { 'X-Pilates-Bridge': token, 'X-Hub-Signature-256': signature } });
    const claim = (data: object, token = secrets['bridge-token']) => fetch(`${broker}/v1/context`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pilates-Bridge': token }, body: JSON.stringify(data) });
    // Skill commands must not create a session/model turn, including aliases,
    // bundled Hermes skills, underscore/Telegram variants and stacked commands.
    const skillCommands = ['/studio-presenze', '/studio_presenze@synthetic', '/studio-presenze /studio-regole-clienti',
      '/apple-reminders', '/synthetic-bundle', '/synthetic-alias'];
    for (const [index, command] of skillCommands.entries()) {
      assert.equal((await gatewayPost(body('15555550102', 'WhatsAppProfile Alpha', `skill-new-${index}`, command))).status, 200);
    }
    await delay(3000);
    assert.deepEqual(await (await fetch(observationsUrl)).json(), [], 'skill command reached a model on a new session');
    // A fresh install must not inject Hermes' opt-in profile-build directive,
    // regardless of the model following SOUL correctly in a particular run.
    const firstContact = body('15555550102', 'WhatsAppProfile Alpha', 'synthetic-first-contact', 'context-probe-first-contact +1 (555) 555-0102');
    assert.equal((await gatewayPost(firstContact)).status, 200);
    const firstContactRequest = await waitObservation((entry) => entry.has_studio_tool && entry.user.includes('context-probe-first-contact'));
    const firstContactText = `${firstContactRequest.system}\n${firstContactRequest.user}`;
    assert.ok(firstContactText.includes("This is the user's very first message ever."), 'missing native first-contact note');
    assert.equal(firstContactText.includes('build a short profile'), false, 'native profile-build directive must be disabled');
    assert.ok(firstContactRequest.system.includes(ALPHA), 'the registered name must reach the model');
    assert.equal(firstContactRequest.profile_name, false, 'a WhatsApp profile name reached the model');
    assert.equal(firstContactRequest.system.includes(BETA), false);
    await delay(2000);
    const initialRequests = await (await fetch(observationsUrl)).json() as Observation[];
    assert.ok(initialRequests.length > 0);
    assert.ok(initialRequests.every((entry) => !entry.has_sender_number), 'a sender number reached the main or an auxiliary model');
    assert.equal(Number((await migrator.query('SELECT count(*) FROM app.clients')).rows[0].count), 1);
    // Unregistered, revoked and incomplete senders get only the fixed refusal:
    // no model turn, no session, no studio data, no manager data.
    const modelCalls = (await (await fetch(observationsUrl)).json() as Observation[]).length;
    for (const [phone, marker] of [['15555550104', 'refused-unregistered'], ['15555550105', 'refused-revoked'], ['15555550104', '/anagrafica']] as const) {
      const before = (await replies()).length;
      assert.equal((await gatewayPost(body(phone, 'WhatsAppProfile Denied', `synthetic-${marker}`, `${marker} alpha`))).status, 200);
      const entries = await waitReply(before, phone, REFUSAL);
      assert.ok(entries.every((entry) => entry.to === phone && !/1555555|gestore .*\+|alpha|anagrafica/iu.test(entry.text.replace(REFUSAL, ''))));
    }
    // A Meta retry of the same refused message is not answered twice.
    const retryBefore = (await replies()).length;
    assert.equal((await gatewayPost(body('15555550104', 'WhatsAppProfile Denied', 'synthetic-refused-unregistered', 'refused-unregistered alpha'))).status, 200);
    await delay(1500);
    assert.equal((await replies()).length, retryBefore);
    const ordinaryManagement = (await replies()).length;
    assert.equal((await gatewayPost(body('15555550103', 'WhatsAppProfile Beta', 'synthetic-beta-management', '/anagrafica'))).status, 200);
    await waitReply(ordinaryManagement, '15555550103', /riservata al gestore/u);
    await delay(1500);
    assert.equal((await (await fetch(observationsUrl)).json() as Observation[]).length, modelCalls, 'a refused sender reached the model');
    assert.equal(Number((await migrator.query('SELECT count(*) FROM studio_private.chat_owners WHERE teacher_id = $1', [ids['15555550105']])).rows[0].count), 0);
    const sideProbe = async (label: string) => {
      const marker = `side-probe-${label}`;
      assert.equal((await gatewayPost(body('15555550102', 'WhatsAppProfile Alpha', `synthetic-${marker}`, `/btw ${marker} +1 (555) 555-0103`))).status, 200);
      const observation = await waitObservation((entry) => entry.user.includes(marker));
      assert.equal(observation.has_sender_number, false, 'a sender number reached the side-question model');
      await delay(2000);
    };
    await sideProbe('warm');
    for (const command of skillCommands) {
      assert.equal((await gatewayPost(body('15555550102', 'WhatsAppProfile Alpha', `skill-existing-${command}`, command))).status, 200);
    }
    await delay(2000);
    let skillObservations = await (await fetch(observationsUrl)).json() as Observation[];
    assert.ok(skillObservations.every((entry) => !skillCommands.some((command) => entry.user.includes(command))), 'skill command reached existing session model');
    assert.equal((await gatewayPost(body('15555550102', 'WhatsAppProfile Alpha', 'skill-internal', 'skill-probe-busy'))).status, 200);
    const skillRequest = await waitObservation((entry) => entry.has_studio_tool && entry.user.includes('skill-probe-busy'));
    assert.deepEqual(skillRequest.tools.sort(), ['skill_view', 'studio_sql_query']);
    assert.equal(skillRequest.system.includes("fix it with skill_manage"), false);
    assert.equal(skillRequest.system.includes('offer to save as a skill'), false);
    assert.ok(skillRequest.system.includes('studio-presenze'));
    for (const [index, command] of skillCommands.entries()) {
      assert.equal((await gatewayPost(body('15555550102', 'WhatsAppProfile Alpha', `skill-busy-${index}`, command))).status, 200);
    }
    const loaded = await waitObservation((entry) => entry.user.includes('skill-probe-busy') && entry.last_role === 'tool');
    assert.ok(loaded.tool_contents.some((text) => text.includes('Quando comunicano chi era presente')),
      'internal skill_view did not load the versioned skill');
    assert.ok(loaded.tool_contents.some((text) => text.includes('"existing"') && text.includes('"teachers"') && !text.includes('"error"')),
      'lesson functions failed through the real SQL tool with text parameters');
    assert.ok(loaded.tool_contents.filter((text) => /not permitted|does not exist/i.test(text)).length >= 6,
      JSON.stringify(loaded.tool_contents.map((text) => text.includes('Quando comunicano chi era presente') ? '[loaded skill]' : text)));
    await delay(2000);
    skillObservations = await (await fetch(observationsUrl)).json() as Observation[];
    assert.ok(skillObservations.every((entry) => !skillCommands.some((command) => entry.user.includes(command))), 'skill command reached busy session model');
    const alpha = body('15555550102', 'WhatsAppProfile Alpha', 'synthetic-wamid-alpha', 'alpha');
    const beta = body('15555550103', 'WhatsAppProfile Beta', 'synthetic-wamid-beta', 'beta');
    assert.equal((await evidence(alpha, signed(alpha), 'wrong-token')).status, 403);
    assert.equal((await evidence(alpha, `sha256=${'0'.repeat(64)}`)).status, 401);
    assert.equal((await gatewayPost(alpha, `sha256=${'0'.repeat(64)}`)).status, 401);
    assert.deepEqual((await Promise.all([gatewayPost(alpha), gatewayPost(beta)])).map((response) => response.status), [200, 200]);
    const waitFor = async (query: string, expected: number) => {
      for (let i = 0; i < 120; i++) {
        if (Number((await migrator.query(query)).rows[0].count) === expected) return;
        await delay(1000);
      }
      assert.fail('Timed out waiting for synthetic gateway writes');
    };
    await waitFor("SELECT count(*) FROM app.clients WHERE first_name <> 'legacy'", 2);
    await waitFor('SELECT count(*) FROM app.training_rules', 2);
    await waitFor('SELECT count(*) FROM studio_private.author_context', 0);
    const rows = (await migrator.query("SELECT first_name, created_by_phone, created_by_name FROM studio_private.clients WHERE first_name <> 'legacy' ORDER BY first_name")).rows;
    assert.deepEqual(rows, [
      { first_name: 'alpha', created_by_phone: '15555550102', created_by_name: ALPHA },
      { first_name: 'beta', created_by_phone: '15555550103', created_by_name: BETA },
    ]);
    const rules = (await migrator.query('SELECT rule_text, created_by_phone, created_by_name FROM studio_private.training_rules ORDER BY rule_text')).rows;
    assert.deepEqual(rules, [
      { rule_text: 'alpha rule', created_by_phone: '15555550102', created_by_name: ALPHA },
      { rule_text: 'beta rule', created_by_phone: '15555550103', created_by_name: BETA },
    ]);
    for (const [marker, ownName, otherName] of [['alpha', ALPHA, BETA], ['beta', BETA, ALPHA]]) {
      const request = await waitObservation((entry) => entry.has_studio_tool && entry.last_role === 'user' && entry.user.includes(marker));
      assert.ok(request.system.includes(ownName), 'missing registered name in the native session context');
      assert.equal(request.system.includes(otherName), false, 'another sender name reached the session context');
      assert.equal(request.profile_name, false, 'a WhatsApp profile name reached the model');
    }
    // Wait for the previous turns to finish model processing before sending another
    // message to the same WhatsApp session.
    await waitObservation((entry) => entry.user.includes('alpha') && entry.last_role === 'tool');
    await waitObservation((entry) => entry.user.includes('beta') && entry.last_role === 'tool');
    await delay(2000);
    const deactivate = body('15555550103', 'WhatsAppProfile Beta', 'synthetic-wamid-deactivate', 'deactivate-alpha');
    assert.equal((await gatewayPost(deactivate)).status, 200);
    await waitFor('SELECT count(*) FROM app.training_rules WHERE deactivated_at IS NOT NULL', 1);
    const deactivated = (await migrator.query("SELECT deactivated_by_phone, deactivated_by_name, deactivation_reason FROM studio_private.training_rules WHERE rule_text = 'alpha rule'")).rows[0];
    assert.deepEqual(deactivated, { deactivated_by_phone: '15555550103', deactivated_by_name: BETA, deactivation_reason: 'synthetic reason' });
    await waitObservation((entry) => entry.user.includes('deactivate-alpha') && entry.last_role === 'tool');
    await delay(2000);
    assert.equal((await gatewayPost(body('15555550102', 'WhatsAppProfile Alpha', 'synthetic-attendance-insert', 'attendance-insert'))).status, 200);
    await waitFor('SELECT count(*) FROM app.attendance', 1);
    assert.deepEqual((await migrator.query('SELECT created_by_phone, created_by_name FROM studio_private.attendance')).rows[0], { created_by_phone: '15555550102', created_by_name: ALPHA });
    await waitObservation((entry) => entry.user.includes('attendance-insert') && entry.last_role === 'tool');
    await delay(2000);
    assert.equal((await gatewayPost(body('15555550103', 'WhatsAppProfile Beta', 'synthetic-attendance-cancel', 'attendance-cancel'))).status, 200);
    await waitFor('SELECT count(*) FROM app.attendance WHERE cancelled_at IS NOT NULL', 1);
    assert.deepEqual((await migrator.query('SELECT cancelled_by_phone, cancelled_by_name, cancellation_reason FROM studio_private.attendance')).rows[0], { cancelled_by_phone: '15555550103', cancelled_by_name: BETA, cancellation_reason: 'synthetic reason' });
    await waitObservation((entry) => entry.user.includes('attendance-cancel') && entry.last_role === 'tool');
    await delay(2000);
    assert.equal((await gatewayPost(body('15555550102', 'WhatsAppProfile Alpha', 'synthetic-future-insert', 'future-absence-insert'))).status, 200);
    await waitFor('SELECT count(*) FROM app.attendance', 2);
    assert.deepEqual((await migrator.query("SELECT created_by_phone, created_by_name FROM studio_private.attendance WHERE lesson_date = '2099-01-01'")).rows[0], { created_by_phone: '15555550102', created_by_name: ALPHA });
    await waitObservation((entry) => entry.user.includes('future-absence-insert') && entry.last_role === 'tool');
    await delay(2000);
    assert.equal((await gatewayPost(body('15555550103', 'WhatsAppProfile Beta', 'synthetic-future-cancel', 'future-absence-cancel'))).status, 200);
    await waitFor('SELECT count(*) FROM app.attendance WHERE cancelled_at IS NOT NULL', 2);
    assert.deepEqual((await migrator.query("SELECT cancelled_by_phone, cancelled_by_name, cancellation_reason FROM studio_private.attendance WHERE lesson_date = '2099-01-01'")).rows[0], { cancelled_by_phone: '15555550103', cancelled_by_name: BETA, cancellation_reason: 'synthetic future cancellation' });
    await waitObservation((entry) => entry.user.includes('future-absence-cancel') && entry.last_role === 'tool');
    await delay(2000);
    // Planned participations (US-019): the trusted author and the system
    // cancellation instant replace the values declared by the model.
    assert.equal((await gatewayPost(body('15555550102', 'WhatsAppProfile Alpha', 'synthetic-planned-insert', 'planned-insert'))).status, 200);
    await waitFor('SELECT count(*) FROM app.planned_participations', 1);
    assert.deepEqual((await migrator.query('SELECT created_by_phone, created_by_name FROM studio_private.planned_participations')).rows[0], { created_by_phone: '15555550102', created_by_name: ALPHA });
    await waitObservation((entry) => entry.user.includes('planned-insert') && entry.last_role === 'tool');
    await delay(2000);
    assert.equal((await gatewayPost(body('15555550103', 'WhatsAppProfile Beta', 'synthetic-planned-cancel', 'planned-cancel'))).status, 200);
    await waitFor('SELECT count(*) FROM app.planned_participations WHERE cancelled_at IS NOT NULL', 1);
    assert.deepEqual((await migrator.query("SELECT cancelled_by_phone, cancelled_by_name, cancellation_reason, cancelled_at > created_at AS system_instant FROM studio_private.planned_participations")).rows[0],
      { cancelled_by_phone: '15555550103', cancelled_by_name: BETA, cancellation_reason: 'synthetic planned cancellation', system_instant: true });
    await waitObservation((entry) => entry.user.includes('planned-cancel') && entry.last_role === 'tool');
    await delay(2000);
    const teacherStart = (await migrator.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
    assert.deepEqual((await Promise.all([
      gatewayPost(body('15555550102', 'WhatsAppProfile Alpha', 'synthetic-teacher-alpha', 'teacher-create-alpha')),
      gatewayPost(body('15555550103', 'WhatsAppProfile Beta', 'synthetic-teacher-beta', 'teacher-create-beta')),
    ])).map((response) => response.status), [200, 200]);
    await waitFor('SELECT count(*) FROM app.teacher_rules', 2);
    await waitFor('SELECT count(*) FROM app.teacher_rule_intervals WHERE is_active', 2);
    await waitFor('SELECT count(*) FROM app.teacher_assignments', 3);
    const teacherAuthors = [
      { first_name: 'alpha', created_by_phone: '15555550102', created_by_name: ALPHA },
      { first_name: 'beta', created_by_phone: '15555550103', created_by_name: BETA },
    ];
    for (const table of ['teacher_rules', 'teacher_assignments']) {
      assert.deepEqual((await migrator.query(`SELECT t.first_name, r.created_by_phone, r.created_by_name FROM studio_private.${table} r JOIN app.teachers t ON t.id = r.teacher_id WHERE t.first_name <> 'legacy' ORDER BY t.first_name`)).rows, teacherAuthors);
    }
    assert.equal((await migrator.query('SELECT count(*) FROM app.teacher_rules WHERE created_at < $1', [teacherStart])).rows[0].count, '0');
    assert.equal((await migrator.query("SELECT count(*) FROM app.teacher_assignments WHERE created_at < $1 AND lesson_date <> '2020-02-03'", [teacherStart])).rows[0].count, '0');
    // The pre-transition incomplete teacher still teaches its lessons.
    const legacyLesson = (await migrator.query("SELECT teacher_id, assigned_teacher FROM app.lesson_teachers('2020-02-03', '2020-02-03')")).rows;
    assert.deepEqual(legacyLesson.map((row) => row.assigned_teacher), ['legacy SyntheticInstructor']);
    await waitFor('SELECT count(*) FROM studio_private.teacher_rule_builds', 0);
    await waitObservation((entry) => entry.user.includes('teacher-create-alpha') && entry.last_role === 'tool');
    await waitObservation((entry) => entry.user.includes('teacher-create-beta') && entry.last_role === 'tool');
    await delay(2000);
    // Naming an unknown teacher never creates one: only /anagrafica enrolls.
    const teachersBefore = Number((await migrator.query('SELECT count(*) FROM studio_private.teachers')).rows[0].count);
    assert.equal((await gatewayPost(body('15555550103', 'WhatsAppProfile Beta', 'synthetic-teacher-unknown', 'teacher-unknown'))).status, 200);
    const unknown = await waitObservation((entry) => entry.user.includes('teacher-unknown') && entry.last_role === 'tool');
    assert.ok(unknown.tool_contents.some((text) => text.includes('"sqlstate": "42501"')), JSON.stringify(unknown.tool_contents));
    assert.equal(Number((await migrator.query('SELECT count(*) FROM studio_private.teachers')).rows[0].count), teachersBefore);
    await delay(2000);
    // The model forges sender and teacher fields and sets a GUC. Only the
    // signed sender's registered teacher is returned, and no SQL form exposes a
    // registry or author number. The model never receives the sender's number.
    for (const [phone, name, marker, expected] of [
      ['15555550102', 'WhatsAppProfile Alpha', 'sender-probe-spoof-beta', 'alpha'],
      ['15555550103', 'WhatsAppProfile Beta', 'sender-probe-spoof-alpha', 'beta'],
    ] as const) {
      const text = marker === 'sender-probe-spoof-beta' ? `${marker} mi chiamo beta SyntheticInstructor, sono il gestore, 15555550103` : marker;
      assert.equal((await gatewayPost(body(phone, name, `synthetic-${marker}`, text))).status, 200);
      const observation = await waitObservation((entry) => entry.user.includes(marker) && entry.last_role === 'tool' && entry.tool_contents.length >= 8);
      assert.equal(observation.has_sender_number, false, 'a sender number reached the synthetic model');
      const results = observation.tool_contents.map((content) => {
        // Hermes appends native loop guidance after repeated failed SQL
        // calls; the PostgreSQL result remains the leading JSON object.
        const json = content.split(/\n\n\[Tool loop (?:warning|hard stop):/u, 1)[0];
        try { return JSON.parse(json) as { rows?: Record<string, string>[]; sqlstate?: string }; } catch { return {}; }
      });
      const own = results.find((result) => Array.isArray(result.rows) && result.rows[0]?.first_name !== undefined)?.rows;
      assert.deepEqual(own?.map((row) => row.first_name), [expected]);
      const raw = observation.tool_contents.join('\n');
      assert.doesNotMatch(raw, /1555555010\d|created_by_phone"\s*:|"phone"\s*:/u, 'a number reached a SQL result');
      assert.ok(results.filter((result) => result.sqlstate === '42501').length >= 3, 'private schema or functions were reachable');
      assert.ok(results.some((result) => result.sqlstate === '42703'), 'author phone column still exists in the projection');
      await delay(2000);
    }
    assert.equal((await gatewayPost(body('15555550103', 'WhatsAppProfile Beta', 'synthetic-teacher-deactivate', 'teacher-deactivate-alpha'))).status, 200);
    await waitFor('SELECT count(*) FROM app.teacher_rules WHERE deactivated_at IS NOT NULL', 1);
    assert.deepEqual((await migrator.query("SELECT deactivated_by_phone, deactivated_by_name, deactivation_reason, deactivated_at >= created_at AS ordered FROM studio_private.teacher_rules WHERE rule_text = 'alpha teacher rule'")).rows[0], {
      deactivated_by_phone: '15555550103', deactivated_by_name: BETA, deactivation_reason: 'synthetic teacher replacement', ordered: true,
    });
    assert.deepEqual((await migrator.query('SELECT t.first_name, i.is_active FROM app.teacher_rule_intervals i JOIN app.teacher_rules r ON r.id = i.rule_id JOIN app.teachers t ON t.id = r.teacher_id ORDER BY t.first_name')).rows, [
      { first_name: 'alpha', is_active: false }, { first_name: 'beta', is_active: true },
    ]);
    await waitObservation((entry) => entry.user.includes('teacher-deactivate-alpha') && entry.last_role === 'tool');
    await delay(2000);
    assert.equal((await gatewayPost(body('15555550103', 'WhatsAppProfile Beta', 'synthetic-teacher-cancel', 'teacher-cancel-alpha'))).status, 200);
    await waitFor('SELECT count(*) FROM app.teacher_assignments WHERE cancelled_at IS NOT NULL', 1);
    assert.deepEqual((await migrator.query("SELECT created_by_phone, cancelled_by_phone, cancelled_by_name, cancellation_reason, cancelled_at >= created_at AS ordered FROM studio_private.teacher_assignments WHERE lesson_date = '2020-01-01'")).rows[0], {
      created_by_phone: '15555550102', cancelled_by_phone: '15555550103', cancelled_by_name: BETA, cancellation_reason: 'synthetic teacher correction', ordered: true,
    });
    await waitObservation((entry) => entry.user.includes('teacher-cancel-alpha') && entry.last_role === 'tool');
    await delay(2000);
    assert.equal((await gatewayPost(body('15555550102', 'WhatsAppProfile Alpha', 'synthetic-teacher-cancel-future', 'teacher-cancel-future'))).status, 200);
    await waitFor('SELECT count(*) FROM app.teacher_assignments WHERE cancelled_at IS NOT NULL', 2);
    assert.deepEqual((await migrator.query("SELECT created_by_phone, cancelled_by_phone, cancelled_by_name, cancellation_reason FROM studio_private.teacher_assignments WHERE lesson_date = '2099-01-01'")).rows[0], {
      created_by_phone: '15555550103', cancelled_by_phone: '15555550102', cancelled_by_name: ALPHA, cancellation_reason: 'synthetic future teacher correction',
    });
    await waitObservation((entry) => entry.user.includes('teacher-cancel-future') && entry.last_role === 'tool');
    await delay(2000);
    let gatewayId = compose('ps', '-q', 'hermes').trim();
    execFileSync('docker', ['exec', gatewayId, 'sh', '-c', 'test ! -e /tmp/pilates-injection-marker'], { stdio: 'pipe' });
    assert.equal(execFileSync('docker', ['logs', gatewayId], { encoding: 'utf8', stdio: 'pipe' }).trim(), 'hermes_launch');
    const logCheck = [
      'from pathlib import Path',
      "logs = b''.join(p.read_bytes() for p in Path('/opt/data/logs').rglob('*') if p.is_file())",
      "assert not any(x in logs for x in [b'15555550102', b'15555550103', b'15555550104', b'15555550105', b'WhatsAppProfile', b'SyntheticInstructor', b'Legacy Snapshot', b'synthetic-app-secret'])",
    ].join('\n');
    execFileSync('docker', ['exec', gatewayId, '/opt/hermes/.venv/bin/python', '-c', logCheck], { stdio: 'pipe' });
    // Refused or undelivered sends, fixed and from the agent, leave only the
    // fixed event in the Docker log: no recipient, text, name or credential.
    const failureLine = (source: string, status: string, code: string) => `whatsapp_send_failed source=${source} status=${status} code=${code}`;
    const classifierCheck = [
      'from pilates_trusted import send_failure_line as line',
      "assert line('fixed', 400, {'error': {'code': 131030, 'message': 'Recipient 15555550104 alpha not allowed', 'fbtrace_id': 'synthetic-trace', 'error_data': {'details': 'synthetic'}}}) == 'whatsapp_send_failed source=fixed status=400 code=131030'",
      "assert line('agent') == 'whatsapp_send_failed source=agent status=network code=none'",
      "assert line('agent', 503, None) == 'whatsapp_send_failed source=agent status=503 code=none'",
      "assert line('agent', 500, 'raw 15555550104 synthetic-access-token') == 'whatsapp_send_failed source=agent status=500 code=none'",
      "assert line('fixed', 400, {'error': {'code': True}}) == 'whatsapp_send_failed source=fixed status=400 code=none'",
      "assert line('fixed', 400, {'error': {'code': 15555550104}}) == 'whatsapp_send_failed source=fixed status=400 code=none'",
      "assert line('fixed', 400, {'error': {'code': '131030'}}) == 'whatsapp_send_failed source=fixed status=400 code=none'",
      "assert line('fixed', 15555550104, {'error': {'code': 131030}}) == 'whatsapp_send_failed source=fixed status=invalid code=131030'",
      "assert line('fixed', True, None) == 'whatsapp_send_failed source=fixed status=network code=none'",
      'try:',
      "    line('15555550104', 400, None)",
      'except ValueError:',
      '    pass',
      'else:',
      '    raise AssertionError',
    ].join('\n');
    execFileSync('docker', ['exec', '--user', '10000', gatewayId, '/opt/hermes/.venv/bin/python', '-c', classifierCheck], { stdio: 'pipe', timeout: 60_000 });
    const metaReject = async (to: string, mode: 'refuse' | 'drop' | 'clear') => {
      assert.equal((await fetch(`http://${address('meta-stub')}:8088/synthetic-reject`, { method: 'POST', body: JSON.stringify({ to, mode }) })).status, 204);
    };
    const gatewayLog = () => execFileSync('docker', ['logs', gatewayId], { encoding: 'utf8', stdio: 'pipe' }).trim().split('\n');
    const waitFailure = async (expected: string) => {
      for (let i = 0; i < 90; i++) {
        if (gatewayLog().includes(expected)) return;
        await delay(500);
      }
      assert.fail(`Timed out waiting for ${expected}`);
    };
    await metaReject('15555550108', 'refuse');
    assert.equal((await gatewayPost(body('15555550108', 'WhatsAppProfile Denied', 'synthetic-send-refused', 'send-refused alpha'))).status, 200);
    await waitFailure(failureLine('fixed', '400', '131030'));
    await metaReject('15555550109', 'drop');
    assert.equal((await gatewayPost(body('15555550109', 'WhatsAppProfile Denied', 'synthetic-send-dropped', 'send-dropped alpha'))).status, 200);
    await waitFailure(failureLine('fixed', 'network', 'none'));
    await metaReject('15555550102', 'refuse');
    assert.equal((await gatewayPost(body('15555550102', 'WhatsAppProfile Alpha', 'synthetic-agent-refused', 'context-probe agent-send-refused'))).status, 200);
    await waitObservation((entry) => entry.user.includes('agent-send-refused'));
    await waitFailure(failureLine('agent', '400', '131030'));
    for (const number of ['15555550102', '15555550108', '15555550109']) await metaReject(number, 'clear');
    await delay(2000);
    // A refused send does not change the broker's decisions: the admitted
    // teacher is served again on the next message.
    const afterRefusal = (await replies()).length;
    assert.equal((await gatewayPost(body('15555550102', 'WhatsAppProfile Alpha', 'synthetic-agent-delivered', 'context-probe agent-send-delivered'))).status, 200);
    await waitReply(afterRefusal, '15555550102', /Completato/u);
    const failureLog = gatewayLog();
    assert.equal(failureLog[0], 'hermes_launch');
    assert.ok(failureLog.length > 1);
    for (const entry of failureLog.slice(1)) assert.ok(parseSendFailureLine(entry), `unexpected gateway log line: ${entry}`);
    assert.doesNotMatch(failureLog.join('\n'), /1555555|WhatsAppProfile|SyntheticInstructor|alpha|Recipient|synthetic-|Bearer|Completato|Accesso/iu);
    assert.equal(execFileSync('docker', ['inspect', '--format', '{{.HostConfig.LogConfig.Type}}', compose('ps', '-q', 'author-broker').trim()], { encoding: 'utf8' }).trim(), 'none');

    // Exercise the real session cache, prompt refresh and wire-only clock with
    // signed synthetic WhatsApp turns and the isolated model stub.
    const probe = async (number: number) => {
      const text = `context-probe-${number}`;
      const payload = body('15555550102', 'WhatsAppProfile Alpha', `synthetic-wamid-${text}`, text);
      assert.equal((await gatewayPost(payload)).status, 200);
      const result = await waitObservation((entry) => entry.user.includes(text));
      await delay(2000);
      return result.system;
    };
    const firstPrompt = await probe(1);
    assert.ok(firstPrompt.includes('CONTEXT_VERSION_A'));
    assert.ok(firstPrompt.includes('Assistente dello studio Pilates'));
    const clock = firstPrompt.match(/Data e ora correnti \(Europe\/Rome\): (\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d)/)?.[1];
    assert.ok(clock && Math.abs(Date.now() - Date.parse(clock)) < 120_000);
    assert.equal(execFileSync('docker', ['inspect', '--format', '{{range .Mounts}}{{if eq .Destination "/opt/data/SOUL.md"}}{{.RW}}{{end}}{{end}}', gatewayId], { encoding: 'utf8' }).trim(), 'false');
    const memoryCheck = [
      'from pathlib import Path',
      'from tempfile import TemporaryDirectory',
      'from hermes_cli.config import load_config',
      'from agent.onboarding import PLAIN_INTRO_NOTE, first_contact_turn_note, profile_build_directive, profile_build_mode',
      'config = load_config()',
      "memory = config.get('memory', {})",
      "assert memory.get('memory_enabled') is False and memory.get('user_profile_enabled') is False and not memory.get('provider')",
      "assert profile_build_mode(config) == 'off'",
      "assert first_contact_turn_note(config, Path('/opt/data/config.yaml'), session_history_empty=True, install_has_prior_sessions=False) == PLAIN_INTRO_NOTE",
      "assert first_contact_turn_note(config, Path('/opt/data/config.yaml'), session_history_empty=False, install_has_prior_sessions=False) is None",
      "assert first_contact_turn_note(config, Path('/opt/data/config.yaml'), session_history_empty=True, install_has_prior_sessions=True) is None",
      // Memory flags alone do not disable onboarding, and a YAML boolean is
      // not the string required by Hermes. These negative cases stay isolated.
      'with TemporaryDirectory() as directory:',
      "    for mode in [None, False, 'ask']:",
      "        negative = {**config, 'onboarding': {} if mode is None else {'profile_build': mode}}",
      "        assert profile_build_mode(negative) == 'ask'",
      "        assert first_contact_turn_note(negative, Path(directory) / 'config.yaml', session_history_empty=True, install_has_prior_sessions=False) == profile_build_directive().strip()",
    ].join('\n');
    execFileSync('docker', ['exec', '--user', '10000', gatewayId, '/opt/hermes/.venv/bin/python', '-c', memoryCheck], { stdio: 'pipe' });
    const clockCheck = [
      'from datetime import datetime, timezone',
      'import agent.turn_request_assembly as assembly',
      'import pilates_trusted',
      "assembly.build_api_messages = lambda agent, messages, **kwargs: ([{'role': 'system', 'content': 'base'}], 'base')",
      'pilates_trusted.install()',
      'class Clock:',
      '    instant = None',
      '    @classmethod',
      '    def now(cls, zone): return cls.instant.astimezone(zone)',
      'pilates_trusted.datetime = Clock',
      "for instant, expected in [('2026-03-28T22:59:59+00:00', '2026-03-28T23:59:59+01:00'), ('2026-03-28T23:00:00+00:00', '2026-03-29T00:00:00+01:00'), ('2026-03-29T00:59:59+00:00', '2026-03-29T01:59:59+01:00'), ('2026-03-29T01:00:00+00:00', '2026-03-29T03:00:00+02:00'), ('2026-10-25T01:00:00+00:00', '2026-10-25T02:00:00+01:00')]:",
      '    Clock.instant = datetime.fromisoformat(instant)',
      "    history = [{'role': 'user', 'content': 'synthetic'}]",
      '    wire, system = assembly.build_api_messages(None, history)',
      "    assert expected in system and wire[0]['content'] == system",
      "    assert history == [{'role': 'user', 'content': 'synthetic'}]",
    ].join('\n');
    execFileSync('docker', ['exec', '--user', '10000', gatewayId, '/opt/hermes/.venv/bin/python', '-c', clockCheck], { stdio: 'pipe', timeout: 60_000 });
    const redactionCheck = [
      'from pilates_trusted import redact_phones',
      "original = [{'content': '15555550102 and +1 (555) 555-0102', 'nested': ['15555550103', 'unrelated']}]",
      "result = redact_phones(original, ['15555550102', '15555550103'])",
      "assert result == [{'content': '[numero riservato] and +[numero riservato]', 'nested': ['[numero riservato]', 'unrelated']}]",
      "other = redact_phones('call 0039 333 123 4567 or +44 20 7946 0000 at 18:00 on 2026-11-16T10:00:00+01:00', [])",
      "assert other == 'call [numero riservato] or [numero riservato] at 18:00 on 2026-11-16T10:00:00+01:00', other",
      "assert original[0]['content'].startswith('15555550102')",
    ].join('\n');
    execFileSync('docker', ['exec', '--user', '10000', gatewayId, '/opt/hermes/.venv/bin/python', '-c', redactionCheck], { stdio: 'pipe', timeout: 60_000 });
    // An unusable session store must prevent this separate launcher from starting.
    assert.throws(() => execFileSync('docker', ['exec', '--user', '10000', '-e', 'HERMES_HOME=/dev/null', gatewayId, '/opt/hermes/libexec/hermes', 'gateway', 'run'], { stdio: 'pipe', timeout: 60_000 }));
    await writeFile(soulPath, `${soul}\nCONTEXT_VERSION_B\n`);
    assert.ok((await probe(2)).includes('CONTEXT_VERSION_A'));
    execFileSync('docker', ['exec', '--user', '10000', gatewayId, '/opt/hermes/libexec/hermes-upstream', 'sessions', 'refresh-prompts'], { stdio: 'pipe', timeout: 60_000 });
    const refreshed = await probe(3);
    assert.ok(refreshed.includes('CONTEXT_VERSION_B'));
    assert.ok(!refreshed.includes('CONTEXT_VERSION_A'));
    await writeFile(soulPath, `${soul}\nCONTEXT_VERSION_C\n`);
    compose('up', '-d', '--no-deps', '--force-recreate', '--wait', '--wait-timeout', '150', 'hermes');
    gatewayId = compose('ps', '-q', 'hermes').trim();
    gateway = `http://${address('hermes')}:8090/whatsapp/webhook`;
    // With no cached agent /btw takes the separate one-shot summary route.
    await sideProbe('cold');
    const afterRestart = await probe(4);
    assert.ok(afterRestart.includes('CONTEXT_VERSION_C'));
    assert.ok(!afterRestart.includes('CONTEXT_VERSION_B'));
    const noClockInState = [
      'from pathlib import Path',
      "state = b''.join(p.read_bytes() for p in Path('/opt/data').glob('state.db*') if p.is_file())",
      "assert b'Data e ora correnti (Europe/Rome):' not in state",
    ].join('\n');
    execFileSync('docker', ['exec', '--user', '10000', gatewayId, '/opt/hermes/.venv/bin/python', '-c', noClockInState], { stdio: 'pipe' });

    // A signed receipt can be claimed by one turn only, even across restart.
    compose('restart', 'author-broker');
    for (let i = 0; i < 30; i++) {
      broker = `http://${address('author-broker')}:8091`;
      try { if ((await fetch(`${broker}/health`)).status === 200) break; } catch { /* restarting */ }
      await delay(1000);
    }
    assert.equal((await evidence(alpha)).status, 200);
    const agent1 = await connect('studio_agent', secrets['db-agent']);
    const agent2 = await connect('studio_agent', secrets['db-agent']);
    const binding = async (client: Client) => {
      await client.query('BEGIN');
      const row = (await client.query('SELECT pg_backend_pid() AS pid, txid_current()::text AS txid')).rows[0];
      return { pid: row.pid as number, txid: row.txid as string };
    };
    const release = (target: object) => fetch(`${broker}/v1/release`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pilates-Bridge': secrets['bridge-token'] }, body: JSON.stringify(target) });
    const first = await binding(agent1);
    const base = { message_id: 'synthetic-wamid-alpha', sender: '15555550102', turn: randomBytes(32).toString('hex'), ...first };
    assert.equal((await claim(base)).status, 403);
    assert.equal((await claim({ ...base, author: 'forged' })).status, 400);
    assert.equal((await claim({ ...base, teacher: 'forged' })).status, 400);
    assert.equal((await claim(base, 'wrong-token')).status, 403);
    await agent1.query('ROLLBACK');

    // Wrong account, unregistered or revoked sender and stale signed messages
    // are never admitted and cannot establish a context.
    for (const [payload, sender, id] of [
      [body('15555550109', 'WhatsAppProfile Denied', 'synthetic-denied', 'x'), '15555550109', 'synthetic-denied'],
      [body('15555550105', 'WhatsAppProfile Delta', 'synthetic-revoked', 'x'), '15555550105', 'synthetic-revoked'],
      [body('15555550102', 'WhatsAppProfile Alpha', 'synthetic-other-account', 'x', Math.floor(Date.now() / 1000), '999'), '15555550102', 'synthetic-other-account'],
      [body('15555550102', 'WhatsAppProfile Alpha', 'synthetic-stale', 'x', Math.floor(Date.now() / 1000) - 600), '15555550102', 'synthetic-stale'],
    ]) {
      const decision = await (await evidence(payload)).json() as { admitted: unknown[]; payload: { entry: { changes: { value: { messages: unknown[] } }[] }[] } };
      assert.deepEqual(decision.admitted, []);
      assert.deepEqual(decision.payload.entry[0].changes[0].value.messages, []);
      const target = await binding(agent1);
      assert.equal((await claim({ ...base, ...target, message_id: id, sender })).status, 403);
      await agent1.query('ROLLBACK');
    }
    const race = body('15555550102', 'WhatsAppProfile Alpha', 'synthetic-race', 'race');
    const raced = await (await evidence(race)).json() as { admitted: { teacher: string }[]; redact: string[]; payload: { entry: { changes: { value: { contacts: { profile: { name: string } }[] } }[] }[] } };
    assert.deepEqual(raced.admitted.map((entry) => entry.teacher), [ids['15555550102']]);
    assert.deepEqual(raced.payload.entry[0].changes[0].value.contacts.map((contact) => contact.profile.name), [ALPHA]);
    assert.ok(['15555550102', '15555550103', '15555550104', '15555550105'].every((number) => raced.redact.includes(number)), 'registry and author numbers are redacted from wire copies');
    const one = await binding(agent1);
    const two = await binding(agent2);
    const attempts = await Promise.all([one, two].map((target) => claim({ ...target, message_id: 'synthetic-race', sender: '15555550102', turn: randomBytes(32).toString('hex') })));
    assert.deepEqual(attempts.map((response) => response.status).sort(), [204, 403]);
    const winner = attempts[0].status === 204 ? agent1 : agent2;
    const inserted = await winner.query("INSERT INTO app.clients (first_name, last_name, created_by_name) VALUES ('race', 'synthetic', 'forged') RETURNING *");
    assert.equal(inserted.rows[0].created_by_name, ALPHA);
    assert.equal('created_by_phone' in inserted.rows[0], false);
    await agent1.query('ROLLBACK');
    await agent2.query('ROLLBACK');
    for (const target of [one, two]) await release(target);
    await agent1.query('BEGIN');
    await assert.rejects(agent1.query("INSERT INTO app.clients (first_name, last_name) VALUES ('replay', 'synthetic')"), { code: '42501' });
    await agent1.query('ROLLBACK');
    await assert.rejects(agent1.query("INSERT INTO app.attendance (client_id, lesson_date, start_time, outcome) SELECT id, '2020-01-01', '10:00', 'present' FROM app.clients LIMIT 1"), { code: '42501' });
    await assert.rejects(agent1.query("UPDATE app.attendance SET cancelled_at = clock_timestamp(), cancellation_reason = 'forged' WHERE id = (SELECT id FROM app.attendance LIMIT 1)"), { code: '42501' });
    await assert.rejects(agent1.query("INSERT INTO app.planned_participations (client_id, lesson_date, start_time) SELECT id, '2099-03-03', '10:00' FROM app.clients LIMIT 1"), { code: '42501' });
    for (const sql of [
      "INSERT INTO app.teachers (first_name, last_name) VALUES ('Untrusted', 'Synthetic')",
      "INSERT INTO app.teacher_rules (teacher_id, rule_text) SELECT id, 'Synthetic untrusted' FROM app.teachers LIMIT 1",
      "INSERT INTO app.teacher_rule_intervals (rule_id, weekday, start_time_min, start_time_max) SELECT id, 6, '12:00', '13:00' FROM app.teacher_rules WHERE deactivated_at IS NULL LIMIT 1",
      "INSERT INTO app.teacher_assignments (teacher_id, lesson_date, start_time) SELECT id, '2020-01-01', '12:00' FROM app.teachers LIMIT 1",
      "UPDATE app.teacher_rules SET deactivated_at = clock_timestamp(), deactivation_reason = 'untrusted' WHERE deactivated_at IS NULL",
      "UPDATE app.teacher_assignments SET cancelled_at = clock_timestamp(), cancellation_reason = 'untrusted' WHERE id = (SELECT id FROM app.teacher_assignments LIMIT 1)",
      'SELECT * FROM studio_private.teacher_rule_builds',
    ]) await assert.rejects(agent1.query(sql), { code: '42501' });

    // Without a WhatsApp profile the registered name is still the author.
    const noNamePayload = JSON.parse(body('15555550102', 'WhatsAppProfile Alpha', 'synthetic-no-name', 'x')) as { entry: Array<{ changes: Array<{ value: { contacts?: unknown } }> }> };
    delete noNamePayload.entry[0].changes[0].value.contacts;
    assert.equal((await evidence(JSON.stringify(noNamePayload))).status, 200);
    const noName = await binding(agent1);
    assert.equal((await claim({ ...noName, message_id: 'synthetic-no-name', sender: '15555550102', turn: randomBytes(32).toString('hex') })).status, 204);
    const named = await agent1.query("INSERT INTO app.clients (first_name, last_name, created_by_name) VALUES ('missing', 'synthetic', 'forged') RETURNING created_by_name");
    assert.deepEqual(named.rows[0], { created_by_name: ALPHA });
    await assert.rejects(agent1.query("INSERT INTO app.teachers (first_name, last_name) VALUES ('Missing', 'Synthetic')"), { code: '42501' });
    await agent1.query('ROLLBACK');
    await release(noName);

    // Revocation, correction, number change and number reuse take effect
    // without restart. A receipt admitted before the confirmation cannot bind.
    const admitBeta = async (id: string) => {
      const decision = await (await evidence(body('15555550103', 'WhatsAppProfile Beta', id, 'x'))).json() as { admitted: unknown[] };
      assert.equal(decision.admitted.length, 1);
    };
    await admitBeta('synthetic-before-revoke');
    await manage('revoke', ids['15555550103'], null, null, null);
    let target = await binding(agent1);
    assert.equal((await claim({ ...target, message_id: 'synthetic-before-revoke', sender: '15555550103', turn: randomBytes(32).toString('hex') })).status, 400);
    await agent1.query('ROLLBACK');
    const calls = (await (await fetch(observationsUrl)).json() as Observation[]).length;
    let before = (await replies()).length;
    assert.equal((await gatewayPost(body('15555550103', 'WhatsAppProfile Beta', 'synthetic-after-revoke', 'context-probe hist-revoked'))).status, 200);
    await waitReply(before, '15555550103', REFUSAL);
    await manage('enable', ids['15555550103'], null, null, null);
    assert.equal((await gatewayPost(body('15555550103', 'WhatsAppProfile Beta', 'synthetic-after-enable', 'context-probe hist-enabled'))).status, 200);
    const enabled = await waitObservation((entry) => entry.has_studio_tool && entry.user.includes('hist-enabled'));
    assert.ok(enabled.history.includes('hist-enabled') && !enabled.history.includes('hist-revoked'));
    assert.ok(enabled.system.includes(BETA));
    await delay(2000);
    // A correction invalidates in-flight receipts; the new name is used at once.
    await admitBeta('synthetic-before-correct');
    await manage('correct', ids['15555550103'], 'beta', 'CorrectedInstructor', null);
    target = await binding(agent1);
    assert.equal((await claim({ ...target, message_id: 'synthetic-before-correct', sender: '15555550103', turn: randomBytes(32).toString('hex') })).status, 400);
    await agent1.query('ROLLBACK');
    assert.equal((await gatewayPost(body('15555550103', 'WhatsAppProfile Beta', 'synthetic-after-correct', 'context-probe hist-corrected'))).status, 200);
    const corrected = await waitObservation((entry) => entry.has_studio_tool && entry.user.includes('hist-corrected'));
    assert.ok(corrected.system.includes('beta CorrectedInstructor') && !corrected.system.includes(BETA));
    assert.ok(corrected.history.includes('hist-enabled'), 'a correction keeps the same chat');
    await delay(2000);
    // Give the old chat a deterministic title, so its archived session can
    // never be exposed to the next person who receives this phone number.
    before = (await replies()).length;
    assert.equal((await gatewayPost(body('15555550103', 'WhatsAppProfile Beta', 'synthetic-old-title', '/title hist-private-previous-owner'))).status, 200);
    await waitReply(before, '15555550103', /hist-private-previous-owner/u);
    await delay(2000);
    // The same person on a new number starts an empty chat; the old number is refused.
    await manage('change_phone', ids['15555550103'], null, null, '+15555550106');
    before = (await replies()).length;
    assert.equal((await gatewayPost(body('15555550103', 'WhatsAppProfile Beta', 'synthetic-old-number', 'context-probe hist-oldnumber'))).status, 200);
    await waitReply(before, '15555550103', REFUSAL);
    assert.equal((await gatewayPost(body('15555550106', 'WhatsAppProfile Beta', 'synthetic-new-number', 'context-probe hist-newnumber'))).status, 200);
    const moved = await waitObservation((entry) => entry.has_studio_tool && entry.user.includes('hist-newnumber'));
    assert.deepEqual(moved.history, ['hist-newnumber'], 'the new number inherited a conversation');
    assert.ok(moved.system.includes('beta CorrectedInstructor'));
    await delay(2000);
    // A number registered to another person does not inherit the previous chat.
    const epsilon = (await manage('enroll', null, 'epsilon', 'SyntheticInstructor', '+15555550103')).rows[0].id as string;
    assert.equal((await gatewayPost(body('15555550103', 'WhatsAppProfile Beta', 'synthetic-reused-number', 'context-probe hist-reused'))).status, 200);
    const reused = await waitObservation((entry) => entry.has_studio_tool && entry.user.includes('hist-reused'));
    assert.deepEqual(reused.history, ['hist-reused'], 'a reused number inherited the previous chat');
    assert.ok(reused.system.includes('epsilon SyntheticInstructor'), 'the reused chat has no current registered name');
    assert.ok(!reused.system.includes('beta '), 'the reused chat exposes the previous owner in its system prompt');
    assert.equal(String((await migrator.query('SELECT teacher_id FROM studio_private.chat_owners WHERE sender_hash = encode(sha256(convert_to($1, \'UTF8\')), \'hex\')', ['15555550103'])).rows[0].teacher_id), epsilon);
    await delay(2000);
    before = (await replies()).length;
    assert.equal((await gatewayPost(body('15555550103', 'WhatsAppProfile Beta', 'synthetic-reused-sessions', '/sessions'))).status, 200);
    const archived = await waitReply(before, '15555550103', /\S/u);
    assert.ok(archived.every((entry) => !entry.text.includes('hist-private-previous-owner')),
      'a reused number can enumerate the previous owner’s archived session');
    before = (await replies()).length;
    assert.equal((await gatewayPost(body('15555550103', 'WhatsAppProfile Beta', 'synthetic-reused-resume-denied', '/resume hist-private-previous-owner'))).status, 200);
    await waitReply(before, '15555550103', /\S/u);
    await delay(2000);
    assert.equal((await gatewayPost(body('15555550103', 'WhatsAppProfile Beta', 'synthetic-after-denied-resume', 'context-probe hist-deniedresume'))).status, 200);
    const deniedResume = await waitObservation((entry) => entry.has_studio_tool && entry.user.includes('hist-deniedresume'));
    assert.ok(!deniedResume.history.includes('hist-enabled') && !deniedResume.history.includes('hist-corrected'),
      'a reused number resumed the previous owner’s archived session');
    // The same commands still recover the current person's own archive.
    await delay(2000);
    before = (await replies()).length;
    assert.equal((await gatewayPost(body('15555550103', 'WhatsAppProfile Beta', 'synthetic-own-title', '/title hist-current-owner-private'))).status, 200);
    await waitReply(before, '15555550103', /hist-current-owner-private/u);
    assert.equal((await gatewayPost(body('15555550103', 'WhatsAppProfile Beta', 'synthetic-own-new', '/new'))).status, 200);
    // Native reset notices are deliberately not delivered to WhatsApp.
    await delay(2000);
    before = (await replies()).length;
    assert.equal((await gatewayPost(body('15555550103', 'WhatsAppProfile Beta', 'synthetic-own-sessions', '/sessions'))).status, 200);
    await waitReply(before, '15555550103', /hist-current-owner-private/u);
    before = (await replies()).length;
    assert.equal((await gatewayPost(body('15555550103', 'WhatsAppProfile Beta', 'synthetic-own-resume', '/resume hist-current-owner-private'))).status, 200);
    await waitReply(before, '15555550103', /hist-current-owner-private/u);
    await delay(2000);
    assert.equal((await gatewayPost(body('15555550103', 'WhatsAppProfile Beta', 'synthetic-own-resumed', 'context-probe hist-ownresumed'))).status, 200);
    const ownResumed = await waitObservation((entry) => entry.has_studio_tool && entry.user.includes('hist-ownresumed'));
    assert.ok(ownResumed.history.includes('hist-reused') && ownResumed.history.includes('hist-deniedresume'),
      'the same person could not resume their own session');
    assert.ok(!ownResumed.history.includes('hist-corrected'), 'resuming an own session exposed another person');
    await delay(2000);
    // History and author snapshots are untouched by every identity change.
    assert.deepEqual((await migrator.query("SELECT created_by_phone, created_by_name FROM studio_private.clients WHERE first_name = 'beta'")).rows, [{ created_by_phone: '15555550103', created_by_name: BETA }]);
    assert.equal(Number((await migrator.query("SELECT count(*) FROM app.teacher_rules WHERE deactivated_at IS NULL AND teacher_id = $1", [ids['15555550103']])).rows[0].count), 1, 'revocation must not deactivate rules');
    assert.ok((await (await fetch(observationsUrl)).json() as Observation[]).length > calls);
    assert.equal(Number((await migrator.query('SELECT count(*) FROM studio_private.author_context')).rows[0].count), 0);
    const allRequests = await (await fetch(observationsUrl)).json() as Observation[];
    assert.ok(allRequests.every((entry) => !entry.has_sender_number), 'a sender number reached a model request');
    execFileSync('docker', ['exec', gatewayId, '/opt/hermes/.venv/bin/python', '-c', logCheck], { stdio: 'pipe' });
    assert.equal(execFileSync('docker', ['logs', gatewayId], { encoding: 'utf8', stdio: 'pipe' }).trim(), 'hermes_launch');
  } finally {
    for (const client of clients) await client.end().catch(() => {});
    try { compose('down', '-v', '--remove-orphans'); } catch { /* best effort */ }
    try { execFileSync('docker', ['image', 'rm', `${project}-hermes`], { stdio: 'pipe' }); } catch { /* best effort */ }
    await rm(directory, { recursive: true, force: true });
  }
});

test('queued follow-ups do not keep a revoked or reassigned identity', { timeout: 300_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pilates-author-queue-'));
  const project = `pilates-q-${randomBytes(8).toString('hex')}`;
  const secrets: Record<string, string> = {
    'db-admin': randomBytes(32).toString('hex'),
    'db-migrator': randomBytes(32).toString('hex'),
    'db-agent': randomBytes(32).toString('hex'),
    'db-broker': randomBytes(32).toString('hex'),
    'bridge-token': randomBytes(32).toString('hex'),
    'openrouter-key': 'synthetic-model-token',
    'whatsapp-access-token': 'synthetic-access-token',
    'whatsapp-app-secret': 'synthetic-app-secret',
    'whatsapp-verify-token': 'synthetic-verify-token',
    'whatsapp-manager-phone': '+15555550102',
    'whatsapp-phone-number-id': '123456789012345',
  };
  const override = join(directory, 'override.yaml');
  const env = { ...process.env, COMPOSE_ENV_FILES: '/dev/null', SECRETS_DIR: directory, POSTGRES_PORT: '0', WHATSAPP_WEBHOOK_PORT: '0', PILATES_MODEL: 'synthetic/test-model' };
  const compose = (...args: string[]) => execFileSync('docker', ['compose', '-p', project, '-f', 'compose.yaml', '-f', override, ...args], { env, encoding: 'utf8', stdio: 'pipe', timeout: 180_000 });
  const clients: Client[] = [];
  try {
    await Promise.all(Object.entries(secrets).map(([name, value]) => writeFile(join(directory, name), value, { mode: 0o600 })));
    const config = (await readFile('hermes/config.yaml', 'utf8')).replace('display:\n', 'display:\n  busy_input_mode: queue\n  busy_text_mode: queue\n');
    await writeFile(join(directory, 'config.yaml'), config);
    await writeFile(override, `services:\n  model-stub:\n    image: ${project}-hermes\n    entrypoint: ["/opt/hermes/.venv/bin/python", "/model_stub.py"]\n    volumes:\n      - ${JSON.stringify(`${resolve('integration/model_stub.py')}:/model_stub.py:ro`)}\n    logging:\n      driver: none\n  meta-stub:\n    image: ${project}-hermes\n    entrypoint: ["/opt/hermes/.venv/bin/python", "/meta_stub.py"]\n    volumes:\n      - ${JSON.stringify(`${resolve('scenarios/meta_stub.py')}:/meta_stub.py:ro`)}\n    logging:\n      driver: none\n  hermes:\n    environment:\n      OPENROUTER_BASE_URL: http://model-stub:8088/v1\n    volumes:\n      - ${JSON.stringify(`${resolve('scenarios/gateway-launcher.sh')}:/opt/hermes/libexec/hermes:ro`)}\n      - ${JSON.stringify(`${join(directory, 'config.yaml')}:/opt/data/config.yaml:ro`)}\nnetworks:\n  default:\n    internal: true\n`);
    compose('build', 'hermes');
    compose('up', '-d', '--wait', 'postgres');
    compose('run', '--rm', 'db-bootstrap');
    const address = (service: string) => {
      const id = compose('ps', '-q', service).trim();
      const host = execFileSync('docker', ['inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', id], { encoding: 'utf8' }).trim();
      assert.ok(host);
      return host;
    };
    const databaseHost = address('postgres');
    const migrationUrl = new URL(`postgresql://${databaseHost}:5432/studio?schema=public`);
    migrationUrl.username = 'studio_migrator';
    migrationUrl.password = secrets['db-migrator'];
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
      { env: { ...env, DATABASE_URL: migrationUrl.toString() }, stdio: 'pipe', timeout: 90_000 });
    const ids = await seedIdentities({ host: databaseHost, password: secrets['db-broker'] },
      { first: 'alpha', last: 'SyntheticInstructor', phone: '15555550102' },
      [{ first: 'beta', last: 'SyntheticInstructor', phone: '15555550103' }]);
    const broker = await (async () => {
      const client = new Client({ host: address('postgres'), port: 5432, database: 'studio', user: 'studio_broker', password: secrets['db-broker'] });
      await client.connect();
      clients.push(client);
      return client;
    })();
    compose('up', '-d', '--wait', '--wait-timeout', '150', 'model-stub', 'meta-stub', 'hermes');
    execFileSync('docker', ['exec', compose('ps', '-q', 'hermes').trim(), '/opt/hermes/.venv/bin/python', '-c',
      "from pathlib import Path; assert 'busy_input_mode: queue' in Path('/opt/data/config.yaml').read_text()"], { stdio: 'pipe' });
    const gateway = `http://${address('hermes')}:8090/whatsapp/webhook`;
    const observationsUrl = `http://${address('model-stub')}:8088/v1/observations`;
    type Observation = { user: string; has_studio_tool: boolean };
    const body = (sender: string, id: string, text: string) => JSON.stringify({
      object: 'whatsapp_business_account', entry: [{ id: '999', changes: [{ field: 'messages', value: {
        metadata: { phone_number_id: secrets['whatsapp-phone-number-id'] }, contacts: [{ wa_id: sender, profile: { name: 'WhatsAppProfile' } }],
        messages: [{ from: sender, id, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }],
      } }] }],
    });
    const signed = (payload: string) => `sha256=${createHmac('sha256', secrets['whatsapp-app-secret']).update(payload).digest('hex')}`;
    const gatewayPost = (payload: string) => fetch(gateway, { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signed(payload), Connection: 'close' } });
    const waitObservation = async (predicate: (entry: Observation) => boolean) => {
      for (let i = 0; i < 90; i++) {
        const entries = await (await fetch(observationsUrl)).json() as Observation[];
        const match = entries.find(predicate);
        if (match) return match;
        await delay(1000);
      }
      assert.fail('Timed out waiting for synthetic model request');
    };
    const manage = (operation: string, id: string | null, phone: string | null) =>
      broker.query('SELECT * FROM studio_private.manage_teacher_identity($1,$2,$3,$4,$5,$6,$7)',
        ['15555550102', '+15555550102', operation, id, null, null, phone]);
    const noneReached = async (marker: string, reason: string) => {
      const entries = await (await fetch(observationsUrl)).json() as Observation[];
      assert.ok(entries.every((entry) => !entry.user.includes(marker)), reason);
    };

    assert.equal((await gatewayPost(body('15555550103', 'synthetic-queue-busy', 'skill-probe-busy hist-beforebusyrevocation'))).status, 200);
    await waitObservation((entry) => entry.has_studio_tool && entry.user.includes('hist-beforebusyrevocation'));
    assert.equal((await gatewayPost(body('15555550103', 'synthetic-queue-revoke', 'context-probe hist-stalequeued'))).status, 200);
    await manage('revoke', ids['15555550103'], null);
    await delay(20_000);
    await noneReached('hist-stalequeued', 'a queued message reached the model after revocation');

    await manage('enable', ids['15555550103'], null);
    assert.equal((await gatewayPost(body('15555550103', 'synthetic-queue-busy-2', 'skill-probe-busy hist-beforebusychange'))).status, 200);
    await waitObservation((entry) => entry.has_studio_tool && entry.user.includes('hist-beforebusychange'));
    assert.equal((await gatewayPost(body('15555550103', 'synthetic-queue-change', 'context-probe hist-stalechanged'))).status, 200);
    await manage('change_phone', ids['15555550103'], '+15555550106');
    await delay(20_000);
    await noneReached('hist-stalechanged', 'a queued message reached the model after a number change');
  } finally {
    for (const client of clients) await client.end().catch(() => {});
    try { compose('down', '-v', '--remove-orphans'); } catch { /* best effort */ }
    try { execFileSync('docker', ['image', 'rm', `${project}-hermes`], { stdio: 'pipe' }); } catch { /* best effort */ }
    await rm(directory, { recursive: true, force: true });
  }
});
