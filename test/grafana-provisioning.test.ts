import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parse } from 'yaml';
import { grafana } from '../src/grafana-provisioning.js';

type Target = { refId: string; rawSql: string; format: string; datasource: { uid: string } };
type Panel = { id: number; title: string; type: string; datasource: { uid: string }; targets: Target[] };
type Dashboard = { uid: string; editable: boolean; panels: Panel[]; templating: { list: { name: string; query: string; multi: boolean; includeAll: boolean; allValue: string }[] } };

const dashboard = JSON.parse(grafana.dashboard) as Dashboard;
const sql = [...dashboard.panels.flatMap((panel) => panel.targets.map((target) => target.rawSql)), ...dashboard.templating.list.map((item) => item.query)];

test('the dashboard has the REQ-OPS-012 panels, filtered by period and user', () => {
  assert.equal(dashboard.uid, 'pilates-usage');
  assert.equal(dashboard.editable, false);
  assert.deepEqual(dashboard.panels.map((panel) => panel.title), [
    'Messaggi per utilizzatore e giorno', 'Messaggi per utilizzatore e tipo di turno', 'Tempi di risposta per giorno',
    'Tempi di risposta nel periodo', 'Token per giorno', 'Contesto inviato e soglia di compattazione', 'Compattazioni per giorno',
    'Costi per giorno', 'Costi per utilizzatore', 'Costi per modello', 'Invii rifiutati',
  ]);
  assert.equal(new Set(dashboard.panels.map((panel) => panel.id)).size, dashboard.panels.length);
  const [teacher] = dashboard.templating.list;
  assert.deepEqual([dashboard.templating.list.length, teacher.name, teacher.multi, teacher.includeAll, teacher.allValue], [1, 'teacher', true, true, '-1']);
  for (const panel of dashboard.panels) {
    assert.equal(panel.datasource.uid, 'pilates-metrics', panel.title);
    assert.equal(panel.targets.length, 1, panel.title);
    const [target] = panel.targets;
    assert.equal(target.datasource.uid, 'pilates-metrics');
    assert.ok(['time_series', 'table'].includes(target.format));
    // Every panel honours both filters.
    assert.match(target.rawSql, /\$__timeFilter\(received_at\)/, panel.title);
    assert.match(target.rawSql, /\(-1 IN \(\$teacher\) OR teacher_id IN \(\$teacher\)\)/, panel.title);
  }
  const all = sql.join('\n');
  assert.match(all, /percentile_cont\(0\.5\)[^\n]*total_ms/);
  assert.match(all, /percentile_cont\(0\.95\)[^\n]*model_ms/);
  assert.match(all, /context_percent/);
  assert.match(all, /compaction_threshold_tokens \* 100\.0 \/ context_window/);
  assert.match(all, /sum\(compactions\)/);
  assert.match(all, /send_outcome IN \('refused', 'network'\)/);
  assert.match(all, /coalesce\(model, 'Non riportato'\)/);
});

test('dashboard queries read only the studio_metrics views and never phones', () => {
  for (const query of sql) {
    const relations = [...query.matchAll(/\b(?:FROM|JOIN)\s+([a-z_."]+)/gi)].map((match) => match[1]);
    assert.ok(relations.length > 0, query);
    for (const relation of relations) assert.match(relation, /^studio_metrics\.(usage_events|teachers)$/, query);
    assert.doesNotMatch(query, /phone|studio_private|\bapp\./i);
    // Read-only: no statement other than a single SELECT.
    assert.match(query.trimStart(), /^SELECT\b/);
    assert.doesNotMatch(query, /;|\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|GRANT|SET)\b/);
  }
});

test('provisioning is versioned and not editable, credentials come from files', () => {
  const datasource = parse(grafana.datasource) as { prune: boolean; datasources: Record<string, unknown>[] };
  assert.equal(datasource.prune, true);
  assert.equal(datasource.datasources.length, 1);
  const [source] = datasource.datasources;
  assert.equal(source.uid, 'pilates-metrics');
  assert.equal(source.user, 'studio_grafana');
  assert.equal(source.editable, false);
  assert.deepEqual(source.secureJsonData, { password: '$__file{/run/pilates-grafana/db-password}' });
  assert.equal((source.jsonData as { database: string }).database, 'studio');
  const provider = (parse(grafana.provider) as { providers: Record<string, unknown>[] }).providers;
  assert.equal(provider.length, 1);
  assert.equal(provider[0].allowUiUpdates, false);
  assert.equal(provider[0].disableDeletion, true);
  // The provisioned usage dashboard is the home page, from the image.
  assert.match(grafana.ini, /^\[users\]\n(?:.*\n)*?home_page = \/d\/pilates-usage$/m);
  assert.doesNotMatch(grafana.ini, /^default_home_dashboard_path/m);
  assert.match(grafana.ini, /^admin_password = \$__file\{\/run\/pilates-grafana\/admin-password\}$/m);
  for (const line of ['[auth.anonymous]\nenabled = false', 'allow_sign_up = false', 'reporting_enabled = false', 'check_for_updates = false',
    'check_for_plugin_updates = false', 'news_feed_enabled = false', 'preinstall_disabled = true', '[public_dashboards]\nenabled = false']) {
    assert.ok(grafana.ini.includes(line), line);
  }
  assert.match(grafana.dockerfile, /^FROM grafana\/grafana:13\.3\.1@sha256:[0-9a-f]{64}$/m);
  // Grafana output never reaches the Docker log; privileges drop before it starts.
  assert.match(grafana.entrypoint, /^exec 3>&1 >\/dev\/null 2>&1$/m);
  assert.match(grafana.entrypoint, /^exec su -p -s \/bin\/sh grafana -c 'exec \/run\.sh' 3>&-$/m);
});

test('Grafana is published on loopback only, without a volume, with its private secrets', () => {
  const compose = parse(grafana.compose) as { services: Record<string, { ports?: string[]; volumes?: unknown; secrets?: string[]; cap_drop?: string[]; security_opt?: string[] }> };
  const service = compose.services.grafana;
  assert.equal(service.ports?.length, 1);
  assert.match(service.ports?.[0] ?? '', /^127\.0\.0\.1:\$\{GRAFANA_PORT:-13000\}:3000$/);
  assert.equal(service.volumes, undefined);
  assert.deepEqual(service.secrets, ['grafana_admin_password', 'db_grafana']);
  assert.deepEqual(service.cap_drop, ['ALL']);
  assert.deepEqual(service.security_opt, ['no-new-privileges:true']);
  assert.ok(compose.services['db-bootstrap'].secrets?.includes('db_grafana'));
  // No other service receives the Grafana credentials.
  for (const [name, other] of Object.entries(compose.services)) {
    if (name === 'grafana' || name === 'db-bootstrap') continue;
    assert.ok(!other.secrets?.some((secret) => secret.includes('grafana')), name);
  }
});
