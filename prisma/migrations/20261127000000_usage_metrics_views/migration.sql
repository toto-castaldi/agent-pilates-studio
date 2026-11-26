BEGIN;

-- US-020 (REQ-OPS-012): the only data Grafana may read. Views owned by the
-- migrator expose the usage events and the teachers' first and last names,
-- never phones, audit rows or other studio data. studio_grafana is created by
-- the role bootstrap, which always precedes the migrations.
CREATE SCHEMA studio_metrics;
REVOKE ALL ON SCHEMA studio_metrics FROM PUBLIC;

CREATE VIEW studio_metrics.teachers WITH (security_barrier) AS
  SELECT id, first_name, last_name FROM studio_private.teachers;

-- Unregistered senders keep an empty teacher; a revoked teacher keeps the name.
CREATE VIEW studio_metrics.usage_events WITH (security_barrier) AS
  SELECT e.id, e.recorded_at, e.teacher_id, t.first_name AS teacher_first_name, t.last_name AS teacher_last_name,
    e.turn_kind, e.received_at, e.replied_at, e.total_ms, e.model_ms, e.model, e.reasoning_effort,
    e.input_tokens, e.output_tokens, e.context_tokens, e.context_window, e.context_percent,
    e.compaction_threshold_tokens, e.compactions, e.tool_calls, e.model_requests, e.cost_usd,
    e.send_outcome, e.send_http_status, e.send_error_code
  FROM studio_private.usage_events e
  LEFT JOIN studio_private.teachers t ON t.id = e.teacher_id;

REVOKE ALL ON studio_metrics.teachers, studio_metrics.usage_events FROM PUBLIC, studio_agent, studio_broker, studio_grafana;
GRANT USAGE ON SCHEMA studio_metrics TO studio_grafana;
GRANT SELECT ON studio_metrics.teachers, studio_metrics.usage_events TO studio_grafana;

COMMIT;
