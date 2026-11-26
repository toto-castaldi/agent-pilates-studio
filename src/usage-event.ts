// Pure usage-metrics policy (REQ-OPS-011). The gateway measures, the broker
// adds the turn kind it decided and the teacher; this module validates the
// measurement and derives the stored row. No I/O, clock or random source here.
// The broker runs it through usage-event-runner.mjs, as for identity-flow.ts.

// Fixed gateway log event when an event cannot be handed to the broker or
// written (hermes/pilates_trusted.py): no field, number, text or name.
export const USAGE_EVENT_FAILED = 'usage_event_failed';
export const TURN_KINDS = ['agent', 'management', 'fixed', 'rejected_command'] as const;
export type TurnKind = (typeof TURN_KINDS)[number];
export const SEND_OUTCOMES = ['sent', 'refused', 'network', 'none'] as const;
export type SendOutcome = (typeof SEND_OUTCOMES)[number];
export const REQUEST_PURPOSES = ['main', 'compression', 'title', 'other'] as const;
export type RequestPurpose = (typeof REQUEST_PURPOSES)[number];
// Hermes' effort ladder (agent/reasoning_effort.py EFFORT_LADDER).
export const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];
// Provider model identifiers such as openai/gpt-6.1-terra or vendor/model:free.
export const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@+~-]{0,199}$/u;

const MAX_MS = 86_400_000;
const MAX_TOKENS = 1_000_000_000;
const MAX_COUNT = 10_000;
const MAX_COST = 1_000_000;
// Costs are stored as numeric(18,12): sums use integer pico-units, not floats.
const COST_SCALE = 1_000_000_000_000n;

export interface UsageRequest {
  purpose: RequestPurpose;
  duration_ms: number;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cost: number | null;
  model: string | null;
  tool_calls: number | null;
  reasoning: string | null;
}

// What the trusted gateway observed for one message, plus the broker's decision.
export interface UsageMeasurement {
  // Kind decided by the broker for a webhook reply (ticket); null for Hermes turns.
  broker_kind: 'management' | 'fixed' | 'rejected_command' | null;
  // The message reached TurnRunner._run_conversation_with_approval.
  agent_turn: boolean;
  // A gateway handler replaced a command with a fixed rejection.
  rejected_command: boolean;
  // The gateway answered with the access refusal (stale receipt).
  refused: boolean;
  received_at: number;
  elapsed_ms: number | null;
  requests: UsageRequest[];
  compactions: number;
  context_window: number | null;
  compaction_threshold: number | null;
  send: { outcome: SendOutcome; http_status: number | null; error_code: number | null };
}

export interface UsageRow {
  turn_kind: TurnKind;
  received_at: string;
  replied_at: string | null;
  total_ms: number | null;
  model_ms: number | null;
  model: string | null;
  reasoning_effort: ReasoningEffort | null;
  input_tokens: number | null;
  output_tokens: number | null;
  context_tokens: number | null;
  context_window: number | null;
  context_percent: string | null;
  compaction_threshold_tokens: number | null;
  compactions: number;
  tool_calls: number;
  model_requests: number;
  cost_usd: string | null;
  send_outcome: SendOutcome;
  send_http_status: number | null;
  send_error_code: number | null;
}

function fail(): never {
  throw new Error('Invalid usage measurement');
}

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail();
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail();
  return value as Record<string, unknown>;
}

function integer(value: unknown, max: number, nullable: boolean): number | null {
  if (value === null && nullable) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) fail();
  return value;
}

function choice<T extends string>(value: unknown, options: readonly T[], nullable: boolean): T | null {
  if (value === null && nullable) return null;
  if (typeof value !== 'string' || !(options as readonly string[]).includes(value)) fail();
  return value as T;
}

function flag(value: unknown): boolean {
  if (typeof value !== 'boolean') fail();
  return value;
}

function cost(value: unknown): bigint | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_COST) fail();
  return BigInt(Math.round(value * 1e12));
}

function request(value: unknown): UsageRequest & { pico: bigint | null } {
  const item = record(value, ['purpose', 'duration_ms', 'prompt_tokens', 'completion_tokens', 'cost', 'model', 'tool_calls', 'reasoning']);
  const model = item.model;
  if (model !== null && (typeof model !== 'string' || !MODEL_ID.test(model))) fail();
  return {
    purpose: choice(item.purpose, REQUEST_PURPOSES, false) as RequestPurpose,
    duration_ms: integer(item.duration_ms, MAX_MS, false) as number,
    prompt_tokens: integer(item.prompt_tokens, MAX_TOKENS, true),
    completion_tokens: integer(item.completion_tokens, MAX_TOKENS, true),
    cost: item.cost as number | null,
    pico: cost(item.cost),
    model: model as string | null,
    tool_calls: integer(item.tool_calls, MAX_COUNT, true),
    reasoning: choice(item.reasoning, REASONING_EFFORTS, true),
  };
}

// The broker's decision wins; then the gateway's own rejections; a model turn
// is `agent`; anything else answered without the model is a fixed reply.
export function classifyTurn(input: Pick<UsageMeasurement, 'broker_kind' | 'agent_turn' | 'rejected_command' | 'refused'>): TurnKind {
  if (input.broker_kind !== null) return input.broker_kind;
  if (input.rejected_command) return 'rejected_command';
  if (input.refused) return 'fixed';
  return input.agent_turn ? 'agent' : 'fixed';
}

// Context as a percentage of the model window, two decimals; empty when either is unknown.
export function contextPercent(context: number | null, window: number | null): string | null {
  if (context === null || window === null || window <= 0) return null;
  const hundredths = (BigInt(context) * 10_000n + BigInt(window) / 2n) / BigInt(window);
  return `${hundredths / 100n}.${String(hundredths % 100n).padStart(2, '0')}`;
}

function formatCost(pico: bigint): string {
  return `${pico / COST_SCALE}.${String(pico % COST_SCALE).padStart(12, '0')}`;
}

// Sum of a value over requests, empty if any request did not report it: a
// partial sum would be an estimate (REQ-OPS-011).
function total(values: (number | null)[]): number | null {
  if (values.length === 0 || values.some((value) => value === null)) return null;
  return (values as number[]).reduce((sum, value) => sum + value, 0);
}

export function buildUsageEvent(input: unknown): UsageRow {
  const data = record(input, ['broker_kind', 'agent_turn', 'rejected_command', 'refused', 'received_at', 'elapsed_ms',
    'requests', 'compactions', 'context_window', 'compaction_threshold', 'send']);
  const brokerKind = choice(data.broker_kind, ['management', 'fixed', 'rejected_command'] as const, true);
  const kind = classifyTurn({ broker_kind: brokerKind, agent_turn: flag(data.agent_turn),
    rejected_command: flag(data.rejected_command), refused: flag(data.refused) });
  const received = data.received_at;
  // 2020-01-01 .. 2200-01-01: a wall clock, never a counter.
  if (typeof received !== 'number' || !Number.isSafeInteger(received) || received < 1_577_836_800_000 || received > 7_258_118_400_000) fail();
  const elapsed = integer(data.elapsed_ms, MAX_MS, true);
  if (!Array.isArray(data.requests) || data.requests.length > MAX_COUNT) fail();
  const requests = data.requests.map(request);
  const send = record(data.send, ['outcome', 'http_status', 'error_code']);
  const outcome = choice(send.outcome, SEND_OUTCOMES, false) as SendOutcome;
  const status = integer(send.http_status, 599, true);
  const code = integer(send.error_code, 9_999_999, true);
  // Status and code only describe a refused send; a refusal has a status.
  if (outcome === 'refused' ? status === null || status < 100 : status !== null || code !== null) fail();
  if ((outcome === 'none') !== (elapsed === null)) fail();
  const compactions = integer(data.compactions, MAX_COUNT, false) as number;
  const window = integer(data.context_window, MAX_TOKENS, true);
  const threshold = integer(data.compaction_threshold, MAX_TOKENS, true);
  if (window === 0 || threshold === 0) fail();
  // Only a model turn has model requests, compactions and a context window.
  if (kind !== 'agent' && (requests.length > 0 || compactions > 0 || window !== null || threshold !== null)) fail();

  const main = requests.filter((item) => item.purpose === 'main');
  const timed = requests.filter((item) => item.purpose === 'main' || item.purpose === 'compression');
  const last = main.at(-1);
  const context = last?.prompt_tokens ?? null;
  const costs = requests.map((item) => item.pico);
  return {
    turn_kind: kind,
    received_at: new Date(received).toISOString(),
    replied_at: elapsed === null ? null : new Date(received + elapsed).toISOString(),
    total_ms: elapsed,
    model_ms: total(timed.map((item) => item.duration_ms)),
    model: last?.model ?? null,
    reasoning_effort: (last?.reasoning ?? null) as ReasoningEffort | null,
    input_tokens: total(requests.map((item) => item.prompt_tokens)),
    output_tokens: total(requests.map((item) => item.completion_tokens)),
    context_tokens: context,
    context_window: window,
    context_percent: contextPercent(context, window),
    compaction_threshold_tokens: threshold,
    compactions,
    tool_calls: main.reduce((sum, item) => sum + (item.tool_calls ?? 0), 0),
    model_requests: requests.length,
    cost_usd: costs.length === 0 || costs.some((item) => item === null)
      ? null : formatCost((costs as bigint[]).reduce((sum, item) => sum + item, 0n)),
    send_outcome: outcome,
    send_http_status: status,
    send_error_code: code,
  };
}
