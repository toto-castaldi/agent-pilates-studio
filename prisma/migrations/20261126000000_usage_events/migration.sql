BEGIN;

-- TEC-052 (REQ-OPS-011): one usage event per authenticated WhatsApp message
-- handled by the gateway. Only numbers, enumerations, instants, the provider's
-- model identifier and the teacher ID: no phone, text, summary, name, message
-- ID or credential. The table is private: the agent has no USAGE on the schema
-- and no privilege here; only the broker writes, through the function below.
CREATE TABLE studio_private.usage_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  teacher_id bigint REFERENCES studio_private.teachers(id),
  turn_kind text NOT NULL CHECK (turn_kind IN ('agent', 'management', 'fixed', 'rejected_command')),
  received_at timestamptz NOT NULL CHECK (received_at > timestamptz '2020-01-01 00:00:00+00' AND received_at < timestamptz '2200-01-01 00:00:00+00'),
  replied_at timestamptz,
  total_ms integer CHECK (total_ms BETWEEN 0 AND 86400000),
  model_ms integer CHECK (model_ms BETWEEN 0 AND 86400000),
  model text CHECK (model ~ '^[A-Za-z0-9][A-Za-z0-9._:/@+~-]{0,199}$'),
  reasoning_effort text CHECK (reasoning_effort IN ('none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra')),
  input_tokens bigint CHECK (input_tokens >= 0),
  output_tokens bigint CHECK (output_tokens >= 0),
  context_tokens bigint CHECK (context_tokens >= 0),
  context_window bigint CHECK (context_window > 0),
  context_percent numeric(8, 2) CHECK (context_percent >= 0),
  compaction_threshold_tokens bigint CHECK (compaction_threshold_tokens > 0),
  compactions integer NOT NULL CHECK (compactions >= 0),
  tool_calls integer NOT NULL CHECK (tool_calls >= 0),
  model_requests integer NOT NULL CHECK (model_requests >= 0),
  -- OpenRouter usage.cost of every request of the turn, as reported (credits, USD).
  cost_usd numeric(18, 12) CHECK (cost_usd >= 0),
  send_outcome text NOT NULL CHECK (send_outcome IN ('sent', 'refused', 'network', 'none')),
  send_http_status integer CHECK (send_http_status BETWEEN 100 AND 599),
  -- Meta error codes have at most seven digits: never a phone number.
  send_error_code integer CHECK (send_error_code BETWEEN 0 AND 9999999),
  CHECK ((replied_at IS NULL) = (total_ms IS NULL)),
  CHECK (replied_at IS NULL OR replied_at = received_at + total_ms * interval '1 millisecond'),
  CHECK ((send_outcome = 'none') = (replied_at IS NULL)),
  CHECK (send_outcome = 'refused' OR (send_http_status IS NULL AND send_error_code IS NULL)),
  CHECK (send_outcome <> 'refused' OR send_http_status IS NOT NULL),
  CHECK ((context_percent IS NULL) = (context_tokens IS NULL OR context_window IS NULL)),
  CHECK (turn_kind = 'agent' OR (model_ms IS NULL AND model IS NULL AND reasoning_effort IS NULL
    AND input_tokens IS NULL AND output_tokens IS NULL AND context_tokens IS NULL AND context_window IS NULL
    AND compaction_threshold_tokens IS NULL AND cost_usd IS NULL AND compactions = 0 AND tool_calls = 0 AND model_requests = 0))
);
CREATE INDEX usage_events_received_at ON studio_private.usage_events (received_at);

-- Kept without limit: no rewrite, deletion or truncation, also for the migrator.
CREATE FUNCTION studio_private.prevent_usage_event_change() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'Usage events cannot be changed or deleted' USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER usage_events_no_update BEFORE UPDATE ON studio_private.usage_events
FOR EACH ROW EXECUTE FUNCTION studio_private.prevent_usage_event_change();
CREATE TRIGGER usage_events_no_delete BEFORE DELETE ON studio_private.usage_events
FOR EACH STATEMENT EXECUTE FUNCTION studio_private.prevent_usage_event_change();
CREATE TRIGGER usage_events_no_truncate BEFORE TRUNCATE ON studio_private.usage_events
FOR EACH STATEMENT EXECUTE FUNCTION studio_private.prevent_usage_event_change();

-- The broker's only write path. The teacher comes from the broker's own
-- receipt; every other value has a fixed type and the table constraints.
CREATE FUNCTION studio_private.record_usage_event(p_teacher_id bigint, p_event jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  inserted bigint;
BEGIN
  IF p_event IS NULL OR jsonb_typeof(p_event) <> 'object' OR NOT (p_event ?& ARRAY['turn_kind', 'received_at', 'replied_at',
      'total_ms', 'model_ms', 'model', 'reasoning_effort', 'input_tokens', 'output_tokens', 'context_tokens', 'context_window',
      'context_percent', 'compaction_threshold_tokens', 'compactions', 'tool_calls', 'model_requests', 'cost_usd',
      'send_outcome', 'send_http_status', 'send_error_code'])
      OR (SELECT count(*) FROM pg_catalog.jsonb_object_keys(p_event)) <> 20 THEN
    RAISE EXCEPTION 'Invalid usage event' USING ERRCODE = '22023';
  END IF;
  INSERT INTO studio_private.usage_events (teacher_id, turn_kind, received_at, replied_at, total_ms, model_ms, model,
    reasoning_effort, input_tokens, output_tokens, context_tokens, context_window, context_percent,
    compaction_threshold_tokens, compactions, tool_calls, model_requests, cost_usd, send_outcome, send_http_status,
    send_error_code)
  VALUES (p_teacher_id, p_event->>'turn_kind', (p_event->>'received_at')::timestamptz, (p_event->>'replied_at')::timestamptz,
    (p_event->>'total_ms')::integer, (p_event->>'model_ms')::integer, p_event->>'model', p_event->>'reasoning_effort',
    (p_event->>'input_tokens')::bigint, (p_event->>'output_tokens')::bigint, (p_event->>'context_tokens')::bigint,
    (p_event->>'context_window')::bigint, (p_event->>'context_percent')::numeric,
    (p_event->>'compaction_threshold_tokens')::bigint, (p_event->>'compactions')::integer,
    (p_event->>'tool_calls')::integer, (p_event->>'model_requests')::integer, (p_event->>'cost_usd')::numeric,
    p_event->>'send_outcome', (p_event->>'send_http_status')::integer, (p_event->>'send_error_code')::integer)
  RETURNING id INTO inserted;
  RETURN inserted;
END;
$$;

REVOKE ALL ON studio_private.usage_events FROM PUBLIC, studio_agent, studio_broker;
REVOKE ALL ON SEQUENCE studio_private.usage_events_id_seq FROM PUBLIC, studio_agent, studio_broker;
REVOKE ALL ON FUNCTION studio_private.prevent_usage_event_change(),
  studio_private.record_usage_event(bigint, jsonb) FROM PUBLIC, studio_agent, studio_broker;
GRANT EXECUTE ON FUNCTION studio_private.record_usage_event(bigint, jsonb) TO studio_broker;

COMMIT;
