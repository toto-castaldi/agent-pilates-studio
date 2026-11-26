import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildUsageEvent, classifyTurn, contextPercent, type UsageMeasurement, type UsageRequest } from '../src/usage-event.js';

const RECEIVED = Date.UTC(2026, 10, 26, 9, 0, 0, 0);
const main = (extra: Partial<UsageRequest> = {}): UsageRequest => ({
  purpose: 'main', duration_ms: 400, prompt_tokens: 1_000, completion_tokens: 20, cost: 0.000125,
  model: 'synthetic/usage-model', tool_calls: 0, reasoning: 'medium', ...extra,
});
const turn = (extra: Partial<UsageMeasurement> = {}): UsageMeasurement => ({
  broker_kind: null, agent_turn: true, rejected_command: false, refused: false, received_at: RECEIVED, elapsed_ms: 1_234,
  requests: [main()], compactions: 0, context_window: 200_000, compaction_threshold: 80_000,
  send: { outcome: 'sent', http_status: null, error_code: null }, ...extra,
});
const fixed = (extra: Partial<UsageMeasurement> = {}): UsageMeasurement => turn({
  agent_turn: false, requests: [], context_window: null, compaction_threshold: null, ...extra,
});

test('usage metrics: turn classification follows broker, gateway rejection, refusal and model turn', () => {
  const base = { broker_kind: null, agent_turn: false, rejected_command: false, refused: false } as const;
  assert.equal(classifyTurn({ ...base, agent_turn: true }), 'agent');
  assert.equal(classifyTurn(base), 'fixed');
  assert.equal(classifyTurn({ ...base, refused: true, agent_turn: true }), 'fixed');
  assert.equal(classifyTurn({ ...base, rejected_command: true }), 'rejected_command');
  assert.equal(classifyTurn({ ...base, rejected_command: true, refused: true }), 'rejected_command');
  for (const kind of ['management', 'fixed', 'rejected_command'] as const) {
    assert.equal(classifyTurn({ ...base, broker_kind: kind, agent_turn: true }), kind);
  }
});

test('usage metrics: context percentage of the window, rounded to two decimals', () => {
  assert.equal(contextPercent(80_000, 200_000), '40.00');
  assert.equal(contextPercent(4_861, 200_000), '2.43');
  assert.equal(contextPercent(1, 3), '33.33');
  assert.equal(contextPercent(2, 3), '66.67');
  assert.equal(contextPercent(250_000, 200_000), '125.00');
  assert.equal(contextPercent(0, 200_000), '0.00');
  assert.equal(contextPercent(null, 200_000), null);
  assert.equal(contextPercent(1_000, null), null);
  assert.equal(contextPercent(1_000, 0), null);
});

test('usage metrics: times, tokens, cost and context of an agent turn with tools, compaction and title', () => {
  const row = buildUsageEvent(turn({
    elapsed_ms: 2_500, compactions: 2,
    requests: [
      { ...main({ purpose: 'compression', duration_ms: 300, prompt_tokens: 50_000, completion_tokens: 500, cost: 0.01, model: 'synthetic/aux', tool_calls: null, reasoning: 'none' }) },
      main({ duration_ms: 700, prompt_tokens: 9_000, completion_tokens: 30, cost: 0.002, tool_calls: 2 }),
      main({ duration_ms: 500, prompt_tokens: 9_500, completion_tokens: 40, cost: 0.0025, tool_calls: 1, model: 'synthetic/served', reasoning: 'high' }),
      // Generated after the reply: in tokens and cost, never in the model time.
      main({ purpose: 'title', duration_ms: 9_000, prompt_tokens: 200, completion_tokens: 8, cost: 0.0000001, tool_calls: null, reasoning: 'none' }),
    ],
  }));
  assert.deepEqual(row, {
    turn_kind: 'agent', received_at: '2026-11-26T09:00:00.000Z', replied_at: '2026-11-26T09:00:02.500Z', total_ms: 2_500,
    model_ms: 1_500, model: 'synthetic/served', reasoning_effort: 'high', input_tokens: 68_700, output_tokens: 578,
    context_tokens: 9_500, context_window: 200_000, context_percent: '4.75', compaction_threshold_tokens: 80_000,
    compactions: 2, tool_calls: 3, model_requests: 4, cost_usd: '0.014500100000',
    send_outcome: 'sent', send_http_status: null, send_error_code: null,
  });
});

test('usage metrics: values the provider does not return stay empty, without estimates', () => {
  const row = buildUsageEvent(turn({
    context_window: null,
    requests: [main({ cost: null }), main({ prompt_tokens: null, completion_tokens: null, model: null, reasoning: null })],
  }));
  assert.equal(row.cost_usd, null);
  assert.equal(row.input_tokens, null);
  assert.equal(row.output_tokens, null);
  assert.equal(row.context_tokens, null);
  assert.equal(row.context_percent, null);
  assert.equal(row.model, null);
  assert.equal(row.reasoning_effort, null);
  assert.equal(row.model_ms, 800);
  // A model turn whose request failed before any response: no model data.
  const failed = buildUsageEvent(turn({ requests: [], send: { outcome: 'none', http_status: null, error_code: null }, elapsed_ms: null }));
  assert.equal(failed.model_ms, null);
  assert.equal(failed.cost_usd, null);
  assert.equal(failed.replied_at, null);
  assert.equal(failed.total_ms, null);
  assert.equal(failed.model_requests, 0);
});

test('usage metrics: fixed, management and rejected replies, send outcomes', () => {
  const refused = buildUsageEvent(fixed({ broker_kind: 'fixed', elapsed_ms: 90, send: { outcome: 'refused', http_status: 400, error_code: 131030 } }));
  assert.equal(refused.turn_kind, 'fixed');
  assert.equal(refused.model_ms, null);
  assert.equal(refused.input_tokens, null);
  assert.equal(refused.tool_calls, 0);
  assert.equal(refused.model_requests, 0);
  assert.deepEqual([refused.send_outcome, refused.send_http_status, refused.send_error_code], ['refused', 400, 131030]);
  assert.equal(buildUsageEvent(fixed({ broker_kind: 'management' })).turn_kind, 'management');
  assert.equal(buildUsageEvent(fixed({ rejected_command: true, send: { outcome: 'network', http_status: null, error_code: null } })).send_outcome, 'network');
  const silent = buildUsageEvent(fixed({ elapsed_ms: null, send: { outcome: 'none', http_status: null, error_code: null } }));
  assert.equal(silent.replied_at, null);
  assert.equal(buildUsageEvent(fixed({ send: { outcome: 'refused', http_status: 500, error_code: null } })).send_error_code, null);
});

test('usage metrics: malformed or impossible measurements are rejected', () => {
  const invalid: unknown[] = [
    null, [], 'turn', { ...turn(), extra: 1 }, { ...turn(), requests: undefined },
    turn({ received_at: 12 }), turn({ received_at: RECEIVED + 0.5 }), turn({ elapsed_ms: -1 }), turn({ elapsed_ms: 1e12 }),
    turn({ broker_kind: 'agent' as never }), turn({ agent_turn: 'yes' as never }),
    turn({ requests: [main({ purpose: 'tool' as never })] }), turn({ requests: [main({ prompt_tokens: -3 })] }),
    turn({ requests: [main({ prompt_tokens: 1.5 })] }), turn({ requests: [main({ cost: Number.NaN })] }),
    turn({ requests: [main({ cost: -0.01 })] }), turn({ requests: [main({ reasoning: 'turbo' })] }),
    turn({ requests: [main({ model: 'testo libero con spazi' })] }), turn({ requests: [main({ model: '' })] }),
    turn({ requests: [{ ...main(), text: 'x' } as never] }),
    turn({ send: { outcome: 'refused', http_status: null, error_code: 131030 } }),
    turn({ send: { outcome: 'sent', http_status: 200, error_code: null } }),
    turn({ send: { outcome: 'sent', http_status: null, error_code: 5 } }),
    turn({ send: { outcome: 'refused', http_status: 400, error_code: 155555501 } }),
    turn({ send: { outcome: 'none', http_status: null, error_code: null } }),
    turn({ send: { outcome: 'delivered' as never, http_status: null, error_code: null } }),
    turn({ context_window: 0 }), turn({ compaction_threshold: 0 }),
    fixed({ requests: [main()] }), fixed({ compactions: 1 }), fixed({ context_window: 1 }),
    fixed({ broker_kind: 'management', agent_turn: true, requests: [main()] }),
  ];
  for (const item of invalid) assert.throws(() => buildUsageEvent(item), /Invalid usage measurement/u, JSON.stringify(item));
});
