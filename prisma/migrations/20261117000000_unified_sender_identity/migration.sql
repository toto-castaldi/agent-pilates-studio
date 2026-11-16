BEGIN;

-- TEC-042: coordinated activation of the unified sender identity (ADR-003).
-- The rows, OIDs, identity sequences, foreign keys and author snapshots stay
-- unchanged. Only the model-visible projections lose every author phone.

-- 1. Author-bearing tables move behind phone-free compatibility projections,
--    as app.teachers already did in TEC-041. The physical rows keep the
--    original snapshots, including historical WhatsApp profile names.
ALTER TABLE app.clients SET SCHEMA studio_private;
ALTER TABLE app.training_rules SET SCHEMA studio_private;
ALTER TABLE app.attendance SET SCHEMA studio_private;
ALTER TABLE app.teacher_rules SET SCHEMA studio_private;
ALTER TABLE app.teacher_assignments SET SCHEMA studio_private;
REVOKE ALL ON studio_private.clients, studio_private.training_rules, studio_private.attendance,
  studio_private.teacher_rules, studio_private.teacher_assignments FROM PUBLIC, studio_agent, studio_broker;
REVOKE ALL ON SEQUENCE studio_private.clients_id_seq, studio_private.training_rules_id_seq,
  studio_private.attendance_id_seq, studio_private.teacher_rules_id_seq,
  studio_private.teacher_assignments_id_seq FROM PUBLIC, studio_agent, studio_broker;

-- Simple single-table views stay automatically updatable: INSERT, RETURNING,
-- ON CONFLICT and the permitted UPDATE columns reach the private rows, where
-- the existing BEFORE triggers impose the trusted author. Row conversions,
-- RETURNING * and SELECT * expose only these columns.
CREATE VIEW app.clients AS
  SELECT id, first_name, last_name, created_at, created_by_name FROM studio_private.clients;
CREATE VIEW app.training_rules AS
  SELECT id, rule_text, created_at, created_by_name, deactivated_at, deactivated_by_name, deactivation_reason
    FROM studio_private.training_rules;
CREATE VIEW app.attendance AS
  SELECT id, client_id, lesson_date, start_time, outcome, created_at, created_by_name,
         cancelled_at, cancelled_by_name, cancellation_reason
    FROM studio_private.attendance;
CREATE VIEW app.teacher_rules AS
  SELECT id, teacher_id, rule_text, created_at, created_by_name, deactivated_at, deactivated_by_name, deactivation_reason
    FROM studio_private.teacher_rules;
CREATE VIEW app.teacher_assignments AS
  SELECT id, teacher_id, lesson_date, start_time, created_at, created_by_name,
         cancelled_at, cancelled_by_name, cancellation_reason
    FROM studio_private.teacher_assignments;

-- The teacher projection loses the author phone and the legacy insertion path:
-- only the guided management functions can create or complete people.
DROP VIEW app.teachers;
DROP FUNCTION studio_private.insert_legacy_teacher();
CREATE VIEW app.teachers AS
  SELECT id, first_name, last_name, created_at, created_by_name FROM studio_private.teachers;

-- New app views would otherwise inherit the schema's default DML grants.
REVOKE ALL ON app.clients, app.training_rules, app.attendance, app.teacher_rules,
  app.teacher_assignments, app.teachers FROM PUBLIC, studio_agent, studio_broker;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.clients TO studio_agent;
GRANT SELECT, INSERT ON app.training_rules, app.attendance, app.teacher_rules, app.teacher_assignments TO studio_agent;
GRANT UPDATE (deactivated_at, deactivated_by_name, deactivation_reason)
  ON app.training_rules, app.teacher_rules TO studio_agent;
GRANT UPDATE (cancelled_at, cancelled_by_name, cancellation_reason)
  ON app.attendance, app.teacher_assignments TO studio_agent;
GRANT SELECT ON app.teachers TO studio_agent;

-- Trigger code resolves the moved parent explicitly, not through the view.
CREATE OR REPLACE FUNCTION studio_private.protect_teacher_interval() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  parent studio_private.teacher_rules%ROWTYPE;
BEGIN
  PERFORM studio_private.require_author_context();
  SELECT * INTO parent FROM studio_private.teacher_rules WHERE id = NEW.rule_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Teacher rule does not exist' USING ERRCODE = '23503';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF parent.deactivated_at IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot add intervals to an inactive teacher rule' USING ERRCODE = '23514';
    END IF;
    NEW.is_active := true;
  ELSE
    IF ROW(NEW.rule_id, NEW.weekday, NEW.start_time_min, NEW.start_time_max)
       IS DISTINCT FROM ROW(OLD.rule_id, OLD.weekday, OLD.start_time_min, OLD.start_time_max)
       OR NOT OLD.is_active OR NEW.is_active IS DISTINCT FROM false OR parent.deactivated_at IS NULL THEN
      RAISE EXCEPTION 'Teacher intervals cannot be rewritten' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 2. No more incomplete people: the transitional default and the legacy
--    creation branch are removed. Pre-existing incomplete rows remain.
ALTER TABLE studio_private.teachers ALTER COLUMN legacy_identity SET DEFAULT false;
CREATE OR REPLACE FUNCTION studio_private.apply_teacher_creation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  guard studio_private.teacher_identity_writes%ROWTYPE;
BEGIN
  SELECT * INTO guard FROM studio_private.teacher_identity_writes
   WHERE backend_pid = pg_backend_pid() AND transaction_id = txid_current();
  IF NOT FOUND OR guard.teacher_id IS NOT NULL OR guard.operation NOT IN ('bootstrap', 'enroll') THEN
    RAISE EXCEPTION 'Teacher enrollment requires guided management' USING ERRCODE = '42501';
  END IF;
  IF NEW.legacy_identity OR NEW.phone IS NULL OR NOT NEW.access_enabled THEN
    RAISE EXCEPTION 'New identities must be complete' USING ERRCODE = '23514';
  END IF;
  NEW.created_by_phone := guard.actor_phone;
  NEW.created_by_name := guard.actor_name;
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END;
$$;
DROP FUNCTION studio_private.configured_teacher_id(text, text);

-- 3. Only identity-bound contexts remain. Contexts live for 60 seconds and are
--    excluded from backups: any compatibility row left by the old runtime is void.
DELETE FROM studio_private.author_context;
ALTER TABLE studio_private.author_context
  DROP COLUMN management_only_enrollment,
  ALTER COLUMN sender_teacher_id SET NOT NULL,
  ALTER COLUMN identity_revision SET NOT NULL,
  ALTER COLUMN profile_name SET NOT NULL;
REVOKE INSERT ON studio_private.author_context FROM studio_broker;

CREATE OR REPLACE FUNCTION studio_private.require_author_context() RETURNS studio_private.author_context
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  author studio_private.author_context%ROWTYPE;
  person studio_private.teachers%ROWTYPE;
BEGIN
  SELECT * INTO author FROM studio_private.author_context
   WHERE backend_pid = pg_backend_pid() AND transaction_id = txid_current() AND expires_at > clock_timestamp();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trusted author context is required' USING ERRCODE = '42501';
  END IF;
  -- The current row must still be the same enabled person, with the same
  -- number and revision; the shared lock lasts until commit or rollback.
  SELECT * INTO person FROM studio_private.teachers t WHERE t.id = author.sender_teacher_id FOR SHARE;
  IF NOT FOUND OR NOT person.access_enabled OR person.phone IS DISTINCT FROM ('+' || author.sender)
     OR person.identity_revision IS DISTINCT FROM author.identity_revision THEN
    RAISE EXCEPTION 'Current enabled sender identity is required' USING ERRCODE = '42501';
  END IF;
  author.profile_name := person.first_name || ' ' || person.last_name;
  RETURN author;
END;
$$;

-- The broker binds the identity admitted with the signed message: a number
-- reassigned, revoked or changed since admission cannot reuse the receipt.
DROP FUNCTION studio_private.bind_teacher_identity(integer, bigint, text);
CREATE FUNCTION studio_private.bind_teacher_identity(
  backend integer, transaction bigint, sender text, expected_teacher bigint, expected_revision bigint
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  person studio_private.teachers%ROWTYPE;
BEGIN
  IF session_user <> 'studio_broker' OR backend IS NULL OR transaction IS NULL OR transaction <= 0
     OR NOT EXISTS (SELECT FROM pg_catalog.pg_stat_activity a
                     WHERE a.pid = backend AND a.usename = 'studio_agent' AND a.datname = current_database()) THEN
    RAISE EXCEPTION 'Invalid agent transaction binding' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO person FROM studio_private.teachers t
   WHERE t.phone = studio_private.identity_sender_phone(sender) FOR SHARE;
  IF NOT FOUND OR NOT person.access_enabled OR person.id IS DISTINCT FROM expected_teacher
     OR person.identity_revision IS DISTINCT FROM expected_revision THEN
    RAISE EXCEPTION 'Current enabled sender identity is required' USING ERRCODE = '42501';
  END IF;
  INSERT INTO studio_private.author_context
    (backend_pid, transaction_id, sender, profile_name, expires_at, sender_teacher_id, identity_revision)
    VALUES (backend, transaction, sender, person.first_name || ' ' || person.last_name,
            clock_timestamp() + interval '60 seconds', person.id, person.identity_revision);
END;
$$;

-- 4. Digits of every identity and author number known to the database, for the
--    trusted gateway's redaction of wire copies sent to the model. Broker only.
CREATE FUNCTION studio_private.identity_phone_digits() RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $$
  SELECT DISTINCT digits FROM (
    SELECT ltrim(phone, '+') FROM studio_private.teachers
    UNION ALL SELECT ltrim(created_by_phone, '+') FROM studio_private.teachers
    UNION ALL SELECT ltrim(actor_phone, '+') FROM studio_private.teacher_identity_changes
    UNION ALL SELECT ltrim(before_state->>'phone', '+') FROM studio_private.teacher_identity_changes
    UNION ALL SELECT ltrim(after_state->>'phone', '+') FROM studio_private.teacher_identity_changes
    UNION ALL SELECT created_by_phone FROM studio_private.clients
    UNION ALL SELECT created_by_phone FROM studio_private.training_rules
    UNION ALL SELECT deactivated_by_phone FROM studio_private.training_rules
    UNION ALL SELECT created_by_phone FROM studio_private.attendance
    UNION ALL SELECT cancelled_by_phone FROM studio_private.attendance
    UNION ALL SELECT created_by_phone FROM studio_private.teacher_rules
    UNION ALL SELECT deactivated_by_phone FROM studio_private.teacher_rules
    UNION ALL SELECT created_by_phone FROM studio_private.teacher_assignments
    UNION ALL SELECT cancelled_by_phone FROM studio_private.teacher_assignments
  ) AS numbers (digits)
  WHERE digits ~ '^[0-9]{8,15}$'
$$;

-- 5. Owner of the Hermes conversation of each WhatsApp chat, keyed by the
--    sender digest like the management state. A chat whose owner differs from
--    the admitted identity (pre-transition chat, number reassigned to another
--    person) is emptied before its first turn. Not an identity or access source.
CREATE TABLE studio_private.chat_owners (
  sender_hash text PRIMARY KEY CHECK (sender_hash ~ '^[a-f0-9]{64}$'),
  teacher_id bigint NOT NULL REFERENCES studio_private.teachers(id),
  bound_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON studio_private.chat_owners FROM PUBLIC, studio_agent, studio_broker;
GRANT SELECT, INSERT, UPDATE ON studio_private.chat_owners TO studio_broker;

-- Archived Hermes sessions retain their original person even if the WhatsApp
-- number is later reassigned. No caller may reassign an existing session.
CREATE TABLE studio_private.session_owners (
  session_id text PRIMARY KEY CHECK (length(session_id) BETWEEN 1 AND 128),
  teacher_id bigint NOT NULL REFERENCES studio_private.teachers(id),
  bound_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON studio_private.session_owners FROM PUBLIC, studio_agent, studio_broker;
GRANT SELECT, INSERT ON studio_private.session_owners TO studio_broker;

REVOKE ALL ON FUNCTION studio_private.bind_teacher_identity(integer, bigint, text, bigint, bigint),
  studio_private.identity_phone_digits() FROM PUBLIC, studio_agent;
GRANT EXECUTE ON FUNCTION studio_private.bind_teacher_identity(integer, bigint, text, bigint, bigint),
  studio_private.identity_phone_digits() TO studio_broker;

COMMIT;
