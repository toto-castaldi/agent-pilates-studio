import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addDays, addVerifications, type ApiResponse, apiStatus, assertAllowedRequest, type CloudflareEvidence, type CloudflareSystem,
  classifyGraphql, collectCloudflare, type DatasetSettings, emptyVerification, evaluateCloudflare, eventFields, eventsQuery,
  fieldsOf, hasQueryField, logSearchPath, markerPresence, namedType, parseCloudflareConfig, parseSettings, rayName, requestFields,
  type RunState, searchCount, settingsQuery, typeFieldsQuery, verificationQuery,
} from '../src/proxy-audit-cloudflare.js';
import { DEV_HOST, PROD_HOST } from '../src/proxy-audit.js';

const ZONE = 'a'.repeat(32);
const ACCOUNT = 'b'.repeat(32);
const TOKEN = 'synthetic_token_0123456789abcdefghijkl';

test('the private Cloudflare file accepts only a token or the three known keys, without echoing values', () => {
  assert.deepEqual(parseCloudflareConfig(`${TOKEN}\n`), { token: TOKEN });
  assert.deepEqual(parseCloudflareConfig(`# privato\nCLOUDFLARE_API_TOKEN="${TOKEN}"\nCLOUDFLARE_ZONE_ID=${ZONE}\nCLOUDFLARE_ACCOUNT_ID=${ACCOUNT}\n`), { token: TOKEN, zoneId: ZONE, accountId: ACCOUNT });
  for (const source of ['', 'short', `${TOKEN} extra`, `CLOUDFLARE_API_TOKEN=${TOKEN}\nOTHER=1`, `CLOUDFLARE_API_TOKEN=${TOKEN}\nCLOUDFLARE_API_TOKEN=${TOKEN}`, `CLOUDFLARE_API_TOKEN=${TOKEN}\nCLOUDFLARE_ZONE_ID=xyz`, `CLOUDFLARE_ZONE_ID=${ZONE}`, 'x'.repeat(5000)]) {
    assert.throws(() => parseCloudflareConfig(source), (error: Error) => error.message === 'Configurazione Cloudflare non valida.' && !error.message.includes(TOKEN));
  }
});

test('only read-only metadata endpoints are allowed: no Logpush, Logpull data, Instant Logs or tunnel streams', () => {
  for (const path of ['/client/v4/graphql']) assertAllowedRequest('POST', path);
  for (const path of [`/client/v4/zones?name=toto-castaldi.com`, `/client/v4/zones/${ZONE}/logs/control/retention/flag`, `/client/v4/zones/${ZONE}/logs/explorer/datasets`, `/client/v4/accounts/${ACCOUNT}/logs/explorer/datasets`, logSearchPath(ZONE, 'http_requests', '2026-11-14', ['0123456789abcdef'])]) {
    assertAllowedRequest('GET', path);
  }
  const forbidden: Array<[string, string]> = [
    ['GET', `/client/v4/zones/${ZONE}/logpush/jobs`], ['GET', `/client/v4/accounts/${ACCOUNT}/logpush/jobs`], ['GET', `/client/v4/zones/${ZONE}/logs/received`],
    ['POST', `/client/v4/zones/${ZONE}/logpush/edge/jobs`], ['GET', `/client/v4/zones/${ZONE}/logpush/edge/jobs`], ['GET', `/client/v4/accounts/${ACCOUNT}/cfd_tunnel`],
    ['POST', `/client/v4/zones/${ZONE}/logs/control/retention/flag`], ['GET', '/client/v4/graphql'], ['GET', `/client/v4/zones?name=other.example`],
    ['GET', `/client/v4/zones/${ZONE}/logs/explorer/query/sql?query=${encodeURIComponent('SELECT clientRequestURI FROM http_requests')}`],
    ['GET', `/client/v4/zones/${ZONE}/logs/control/retention/flag/../../logs/received`],
  ];
  for (const [method, path] of forbidden) assert.throws(() => assertAllowedRequest(method, path), /non consentita/, `${method} ${path}`);
  assert.throws(() => logSearchPath(ZONE, 'http_requests', '2026-11-14', ["0123456789abcdef') OR (1=1"]));
  assert.throws(() => logSearchPath(ZONE, 'http_requests', '2026-11-14', []));
});

test('GraphQL outcomes are classified without returning error messages', () => {
  assert.deepEqual(classifyGraphql({ status: 200, json: { data: { viewer: {} }, errors: null } }), { ok: true, data: { viewer: {} } });
  assert.deepEqual(classifyGraphql({ status: 200, json: { data: null, errors: [{ message: 'zone does not have access to the path' }] } }), { ok: false, reason: 'denied' });
  assert.deepEqual(classifyGraphql({ status: 403, json: null }), { ok: false, reason: 'denied' });
  assert.deepEqual(classifyGraphql({ status: 200, json: { data: null, errors: [{ message: 'unknown field secretValue' }] } }), { ok: false, reason: 'invalid' });
  assert.deepEqual(classifyGraphql({ status: 500, json: 'raw' }), { ok: false, reason: 'error' });
  assert.equal(apiStatus({ status: 403, json: { errors: [{ code: 10004, message: 'secret detail' }] } }), 'HTTP 403, codice 10004');
  assert.equal(apiStatus(null), 'nessuna risposta');
  assert.deepEqual(searchCount({ status: 200, json: { result: [{ count: 3 }] } }), { count: 3 });
  assert.deepEqual(searchCount({ status: 403, json: { errors: [{ code: 10004 }] } }), { denied: 'HTTP 403, codice 10004' });
  assert.deepEqual(searchCount({ status: 404, json: {} }), { unavailable: 'HTTP 404' });
});

test('queries are built only from validated names, tags, instants and Ray IDs', () => {
  assert.match(typeFieldsQuery('viewer'), /__type\(name: "viewer"\)/);
  assert.throws(() => typeFieldsQuery('viewer"){x}'));
  assert.equal(namedType({ kind: 'NON_NULL', name: null, ofType: { kind: 'LIST', name: null, ofType: { kind: 'OBJECT', name: 'zone' } } }), 'zone');
  assert.deepEqual(fieldsOf({ __type: { fields: [{ name: 'settings', type: { name: 'ZoneSettings' } }, { name: 'bad name' }] } }), [{ name: 'settings', type: 'ZoneSettings' }]);
  const settings = settingsQuery('zones', ZONE, ['httpRequestsAdaptive', 'firewallEventsAdaptive']);
  assert.match(settings, /zoneTag: "a{32}"/);
  assert.match(settings, /d1: firewallEventsAdaptive \{ enabled notOlderThan maxDuration availableFields \}/);
  assert.throws(() => settingsQuery('zones', 'not-a-tag', ['x']));
  assert.throws(() => settingsQuery('accounts', ACCOUNT, ['x y']));
  const events = eventsQuery('httpRequestsAdaptive', ZONE, ['datetime', 'rayName'], '2026-11-14T10:00:00Z', '2026-11-14T11:00:00Z', ['0123456789abcdef']);
  assert.match(events, /rayName_in: \["0123456789abcdef"\]/);
  assert.throws(() => eventsQuery('httpRequestsAdaptive', ZONE, ['datetime'], '2026-11-14', '2026-11-14T11:00:00Z', []));
  const verification = verificationQuery('httpRequestsAdaptive', ZONE, '2026-11-01T00:00:00Z', '2026-11-08T00:00:00Z');
  assert.match(verification, /clientRequestQuery_notlike: "%pxaudit%"/);
  assert.match(verification, /\{ datetime clientRequestHTTPHost edgeResponseStatus \}/, 'query strings are never selected');
  assert.ok(!/\{[^}]*clientRequestQuery[^_]/.test(verification));
  assert.equal(rayName('0123456789abcdef-MXP'), '0123456789abcdef');
  assert.equal(rayName('bogus'), null);
});

const dataset = (name: string, fields: string[], enabled = true, notOlderThan = 2_678_400): DatasetSettings => ({ name, enabled, notOlderThan, maxDuration: 86_400, fields });

test('dataset settings are parsed and request fields are recognised', () => {
  const parsed = parseSettings({ viewer: { zones: [{ settings: { d0: { enabled: true, notOlderThan: 2_678_400, maxDuration: 259_200, availableFields: ['clientRequestQuery', 'rayName', 'bad field'] }, d1: null } }] } }, 'zones', ['httpRequestsAdaptive', 'other']);
  assert.deepEqual(parsed, [{ name: 'httpRequestsAdaptive', enabled: true, notOlderThan: 2_678_400, maxDuration: 259_200, fields: ['clientRequestQuery', 'rayName'] }]);
  const http = dataset('httpRequestsAdaptive', ['datetime', 'rayName', 'clientRequestQuery', 'clientRequestPath', 'userAgent', 'clientIP', 'dimensions_jurisdiction', 'requestHeaderSize']);
  assert.ok(hasQueryField(http));
  assert.deepEqual(requestFields(http), ['clientIP', 'clientRequestPath', 'clientRequestQuery', 'userAgent']);
  assert.ok(!hasQueryField(dataset('groups', ['dimensions_clientRequestPath'])));
  assert.deepEqual(eventFields(http), ['datetime', 'rayName', 'clientRequestPath', 'clientRequestQuery', 'userAgent', 'requestHeaderSize']);
});

function state(): RunState {
  return {
    runId: '0123abcd',
    startedAt: '2026-11-14T10:00:00.000Z',
    finishedAt: '2026-11-14T10:01:00.000Z',
    markers: { 'prod-verify.token': 'pxaudit0123abcd03to11111111', 'prod-verify.header': 'pxaudit0123abcd03he22222222', 'prod-python.token': 'pxaudit0123abcd06to33333333' },
    probes: [
      { id: 'prod-verify', status: 403, ray: '0123456789abcdef-MXP', edgeBlocked: false },
      { id: 'prod-python', status: 403, ray: 'fedcba9876543210-MXP', edgeBlocked: true },
      { id: 'origin-cancel', status: 'aborted', ray: null, edgeBlocked: false },
    ],
  };
}

test('marker presence tells which conserved fields contain which synthetic markers', () => {
  const presence = markerPresence(state(), [{ rayName: '0123456789abcdef', clientRequestQuery: 'hub.verify_token=pxaudit0123abcd03to11111111', userAgent: 'curl/8.5.0', sampleInterval: 1 }]);
  assert.deepEqual(presence, [
    { probe: 'prod-verify', found: true, sampled: false, fields: { token: ['clientRequestQuery'], header: [] } },
    { probe: 'prod-python', found: false, sampled: false, fields: {} },
  ]);
});

function evidence(overrides: Partial<CloudflareEvidence> = {}): CloudflareEvidence {
  const verification = emptyVerification(31);
  return {
    configured: true, zone: 'provided', account: 'provided',
    zoneDatasets: [dataset('httpRequestsAdaptive', ['clientRequestQuery', 'rayName'])], accountDatasets: [],
    http: [{ probe: 'prod-verify', found: true, sampled: false, fields: { token: [], header: [] } }],
    firewall: [], verification, retentionFlag: 'unavailable', retentionStatus: 'HTTP 401, codice 10000',
    logExplorer: { zone: [], account: [] }, logSearch: { http_requests: { unavailable: 'HTTP 404' }, firewall_events: 'skipped' },
    ...overrides,
  };
}

test('Cloudflare findings distinguish conserved query strings, real verify tokens and unverifiable products', () => {
  const missing = evaluateCloudflare({ ...evidence(), configured: false });
  assert.ok(missing.some((finding) => finding.level === 'unverified' && /Configurazione Cloudflare assente/.test(finding.text)));
  assert.ok(missing.some((finding) => /Logpush/.test(finding.text) && finding.level === 'unverified'));

  const clean = evaluateCloudflare(evidence());
  assert.ok(!clean.some((finding) => finding.level === 'exposure'));
  assert.ok(clean.some((finding) => /nessun marcatore di query/.test(finding.text)));

  const query = evaluateCloudflare(evidence({ http: [{ probe: 'prod-verify', found: true, sampled: true, fields: { token: ['clientRequestQuery'], header: [] } }] }));
  assert.ok(query.some((finding) => finding.level === 'exposure' && /query string è conservata/.test(finding.text)));
  assert.ok(query.some((finding) => /campionati/.test(finding.text)));

  const counts = emptyVerification(31);
  addVerifications(counts, [
    { datetime: '2026-11-10T09:00:00Z', clientRequestHTTPHost: PROD_HOST, edgeResponseStatus: 200 },
    { datetime: '2026-11-04T09:00:00Z', clientRequestHTTPHost: DEV_HOST, edgeResponseStatus: 502 },
    { datetime: '2026-11-05T09:00:00Z', clientRequestHTTPHost: DEV_HOST, edgeResponseStatus: 403 },
    { datetime: '2026-11-05T09:00:00Z', clientRequestHTTPHost: 'other.example', edgeResponseStatus: 200 },
  ]);
  assert.equal(counts.hosts.prod['200'], 1);
  assert.equal(counts.hosts.dev['5xx'], 1);
  assert.equal(counts.accepted.prod.lastAt, '2026-11-10T09:00:00Z');
  const real = evaluateCloudflare(evidence({ verification: counts }));
  assert.ok(real.some((finding) => finding.level === 'exposure' && /produzione conservato/.test(finding.text) && /2026-12-11/.test(finding.text)));
  assert.ok(real.some((finding) => finding.level === 'unverified' && /sviluppo con esito 5xx/.test(finding.text)));
  const rotated = evaluateCloudflare(evidence({ verification: counts }), { prod: '2026-11-15T08:00:00.000Z' });
  assert.ok(rotated.some((finding) => finding.level === 'ok' && /ruotato il 2026-11-15/.test(finding.text)));
  assert.ok(!rotated.some((finding) => finding.level === 'exposure' && /produzione/.test(finding.text)));
  const early = evaluateCloudflare(evidence({ verification: counts }), { prod: '2026-11-09T08:00:00.000Z' });
  assert.ok(early.some((finding) => finding.level === 'exposure' && /produzione conservato/.test(finding.text)));
  assert.equal(addDays('2026-11-10', 31), '2026-12-11');

  const products = evaluateCloudflare(evidence({ retentionFlag: true, logExplorer: { zone: 'unavailable', account: ['http_requests'] }, logExplorerStatus: { zone: 'HTTP 403' }, logSearch: { http_requests: { count: 2 }, firewall_events: { denied: 'HTTP 403, codice 10004' } } }));
  assert.ok(products.some((finding) => finding.level === 'exposure' && /Logpull attiva/.test(finding.text)));
  assert.ok(products.some((finding) => finding.level === 'exposure' && /Log Explorer conserva/.test(finding.text)));
  assert.ok(products.some((finding) => finding.level === 'exposure' && /non campionati/.test(finding.text)));
  assert.ok(products.some((finding) => finding.level === 'unverified' && /codice 10004/.test(finding.text)));
  for (const finding of [...missing, ...clean, ...query, ...real, ...products]) assert.ok(!finding.text.includes('pxaudit0123') && !finding.text.includes(TOKEN));
});

function fakeApi(options: { discover?: boolean; lateEvents?: boolean } = {}) {
  const requests: string[] = [];
  let polls = 0;
  const types: Record<string, Array<{ name: string; type: { name: string } }>> = {
    viewer: [{ name: 'zones', type: { name: 'zone' } }, { name: 'accounts', type: { name: 'account' } }],
    zone: [{ name: 'settings', type: { name: 'ZoneSettings' } }],
    account: [{ name: 'settings', type: { name: 'AccountSettings' } }],
    ZoneSettings: [{ name: 'httpRequestsAdaptive', type: { name: 'x' } }, { name: 'firewallEventsAdaptive', type: { name: 'x' } }],
    AccountSettings: [{ name: 'httpRequestsAdaptive', type: { name: 'x' } }],
  };
  const fields = ['datetime', 'rayName', 'clientRequestHTTPHost', 'clientRequestPath', 'clientRequestQuery', 'userAgent', 'edgeResponseStatus', 'sampleInterval'];
  const system: CloudflareSystem = {
    async request(method, path, body): Promise<ApiResponse> {
      assertAllowedRequest(method, path);
      requests.push(`${method} ${path.split('?')[0]}`);
      if (path.startsWith('/client/v4/zones?name=')) {
        return options.discover ? { status: 200, json: { result: [{ id: ZONE, account: { id: ACCOUNT }, owner: { email: 'private@example.invalid' } }] } } : { status: 403, json: { errors: [{ code: 10000 }] } };
      }
      if (path.endsWith('/retention/flag')) return { status: 200, json: { result: { flag: false } } };
      if (path.includes('/logs/explorer/datasets')) return { status: 200, json: { result: [] } };
      if (path.includes('/logs/explorer/query/sql')) return { status: 403, json: { errors: [{ code: 10004 }] } };
      const query = String(JSON.parse(body ?? '{}').query);
      const type = /__type\(name: "([A-Za-z_]+)"\)/.exec(query)?.[1];
      if (type) return { status: 200, json: { data: { __type: { fields: types[type] ?? [] } } } };
      if (query.includes('settings {')) {
        const scope = query.includes('zones(') ? 'zones' : 'accounts';
        const names = [...query.matchAll(/d(\d+): ([A-Za-z]+) \{/g)];
        const settings = Object.fromEntries(names.map((match) => [`d${match[1]}`, { enabled: true, notOlderThan: 2_678_400, maxDuration: 604_800, availableFields: fields }]));
        return { status: 200, json: { data: { viewer: { [scope]: [{ settings }] } } } };
      }
      if (query.includes('rayName_in')) {
        polls += 1;
        if (options.lateEvents && polls === 1) return { status: 200, json: { data: { viewer: { zones: [{ events: [] }] } } } };
        const events = query.includes('firewallEventsAdaptive')
          ? [{ rayName: 'fedcba9876543210', clientRequestQuery: 'hub.verify_token=pxaudit0123abcd06to33333333' }]
          : [{ rayName: '0123456789abcdef', clientRequestQuery: 'hub.verify_token=pxaudit0123abcd03to11111111', sampleInterval: 1 }, { rayName: 'fedcba9876543210', clientRequestQuery: 'hub.verify_token=pxaudit0123abcd06to33333333' }];
        return { status: 200, json: { data: { viewer: { zones: [{ events }] } } } };
      }
      if (query.includes('verify_token')) {
        return { status: 200, json: { data: { viewer: { zones: [{ events: [{ datetime: '2026-11-10T09:00:00Z', clientRequestHTTPHost: PROD_HOST, edgeResponseStatus: 200 }] }] } } } };
      }
      return { status: 400, json: { errors: [{ message: 'unexpected' }] } };
    },
    async sleep() {},
    now: () => Date.parse('2026-11-14T10:30:00Z'),
  };
  return { system, requests, polls: () => polls };
}

test('collectCloudflare discovers datasets, polls for the probes and counts retained verifications', async () => {
  const api = fakeApi({ discover: true, lateEvents: true });
  const collected = await collectCloudflare(api.system, { token: TOKEN }, state(), { waitMs: 60_000, pollMs: 10 });
  assert.equal(collected.zone, 'discovered');
  assert.equal(collected.account, 'discovered');
  assert.deepEqual(collected.zoneDatasets?.map((item) => item.name), ['firewallEventsAdaptive', 'httpRequestsAdaptive']);
  assert.ok(api.polls() >= 3, 'retries until the probe events are ingested');
  assert.deepEqual(collected.http?.map((entry) => [entry.probe, entry.found]), [['prod-verify', true], ['prod-python', true]]);
  assert.deepEqual(collected.firewall?.map((entry) => entry.probe), ['prod-python']);
  assert.ok(collected.verification && collected.verification.hosts.prod['200'] >= 1);
  assert.equal(collected.retentionFlag, false);
  assert.deepEqual(collected.logExplorer, { zone: [], account: [] });
  assert.deepEqual(collected.logSearch.http_requests, { denied: 'HTTP 403, codice 10004' });
  const serialized = JSON.stringify(collected);
  assert.ok(!serialized.includes('hub.verify_token') && !serialized.includes('private@example.invalid') && !serialized.includes(TOKEN), 'evidence holds no raw values');
  assert.ok(api.requests.every((request) => !/logpush|received|cfd_tunnel/.test(request)));

  const undiscovered = await collectCloudflare(fakeApi().system, { token: TOKEN }, state(), { waitMs: 0, pollMs: 0 });
  assert.equal(undiscovered.zone, 'missing');
  assert.equal(undiscovered.zoneDatasets, null);
  assert.ok(evaluateCloudflare(undiscovered).some((finding) => /CLOUDFLARE_ZONE_ID/.test(finding.text)));
  const none = await collectCloudflare(fakeApi().system, null, state(), { waitMs: 0, pollMs: 0 });
  assert.equal(none.configured, false);
});
