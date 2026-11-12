BEGIN;

-- Keep the very same rows, identity sequence and FK targets. The public name
-- remains a legacy-compatible projection, never a second identity registry.
ALTER TABLE app.teachers SET SCHEMA studio_private;
REVOKE ALL ON studio_private.teachers FROM PUBLIC, studio_agent, studio_broker;
REVOKE ALL ON SEQUENCE studio_private.teachers_id_seq FROM PUBLIC, studio_agent, studio_broker;
ALTER TABLE studio_private.teachers
  ADD COLUMN phone text,
  ADD COLUMN access_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN legacy_identity boolean NOT NULL DEFAULT true,
  ADD COLUMN identity_revision bigint NOT NULL DEFAULT 1,
  ADD CONSTRAINT teachers_phone_canonical CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$'),
  ADD CONSTRAINT teachers_complete_identity CHECK (legacy_identity OR phone IS NOT NULL),
  ADD CONSTRAINT teachers_access_complete CHECK (phone IS NOT NULL OR NOT access_enabled),
  ADD CONSTRAINT teachers_revision_positive CHECK (identity_revision > 0);
CREATE UNIQUE INDEX teachers_phone_unique ON studio_private.teachers (phone);

-- Do not extend the model-visible row type with sensitive columns. Author
-- snapshots stay intact underneath; newly managed creations do not expose the
-- manager's phone through this compatibility view either. Historical author
-- phone access elsewhere is removed together with the consumers in TEC-042.
CREATE VIEW app.teachers WITH (security_barrier = true) AS
  SELECT id, first_name, last_name, created_at,
         CASE WHEN legacy_identity THEN created_by_phone ELSE NULL::text END AS created_by_phone,
         created_by_name
    FROM studio_private.teachers;
REVOKE ALL ON app.teachers FROM PUBLIC, studio_agent, studio_broker;
GRANT SELECT, INSERT ON app.teachers TO studio_agent;

CREATE FUNCTION studio_private.normalize_identity_phone(raw text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog
AS $$
DECLARE
  canonical text;
BEGIN
  IF raw IS NULL OR length(raw) > 80 THEN
    RAISE EXCEPTION 'Invalid international phone' USING ERRCODE = '23514';
  END IF;
  -- ASCII space, NBSP, narrow NBSP, parentheses, dot and hyphen only.
  canonical := regexp_replace(raw, '[ ().  -]', '', 'g');
  IF left(canonical, 2) = '00' THEN
    canonical := '+' || substr(canonical, 3);
  END IF;
  IF canonical !~ '^\+[1-9][0-9]{7,14}$' THEN
    RAISE EXCEPTION 'Invalid international phone' USING ERRCODE = '23514';
  END IF;
  RETURN canonical;
END;
$$;

CREATE FUNCTION studio_private.identity_sender_phone(sender text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog
AS $$
BEGIN
  IF sender IS NULL OR sender !~ '^[1-9][0-9]{7,14}$' THEN
    RAISE EXCEPTION 'Invalid authenticated sender' USING ERRCODE = '42501';
  END IF;
  RETURN '+' || sender;
END;
$$;

CREATE FUNCTION studio_private.normalize_identity_name(raw text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog
AS $$
DECLARE
  clean text;
BEGIN
  IF raw IS NULL OR length(raw) > 512 OR raw ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Invalid identity name' USING ERRCODE = '23514';
  END IF;
  clean := regexp_replace(btrim(translate(raw, '  ', '  ')), ' +', ' ', 'g');
  IF clean = '' OR length(clean) > 200 THEN
    RAISE EXCEPTION 'Invalid identity name' USING ERRCODE = '23514';
  END IF;
  RETURN clean;
END;
$$;

-- Persistent, private, append-only history; no grant to the broker or model.
CREATE TABLE studio_private.teacher_identity_changes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  teacher_id bigint NOT NULL REFERENCES studio_private.teachers(id),
  operation text NOT NULL CHECK (operation IN ('bootstrap', 'enroll', 'complete', 'correct', 'change_phone', 'revoke', 'enable')),
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_teacher_id bigint NOT NULL REFERENCES studio_private.teachers(id),
  actor_phone text NOT NULL,
  actor_name text NOT NULL,
  before_state jsonb,
  after_state jsonb NOT NULL
);
REVOKE ALL ON studio_private.teacher_identity_changes FROM PUBLIC, studio_agent, studio_broker;
CREATE TRIGGER teacher_identity_changes_immutable BEFORE UPDATE OR DELETE ON studio_private.teacher_identity_changes
FOR EACH STATEMENT EXECUTE FUNCTION studio_private.prevent_teacher_history_change();
CREATE TRIGGER teacher_identity_changes_no_truncate BEFORE TRUNCATE ON studio_private.teacher_identity_changes
FOR EACH STATEMENT EXECUTE FUNCTION studio_private.prevent_teacher_history_change();

-- A private, statement-scoped capability. Neither a caller flag nor a GUC can
-- open this window. The deferred assertion also prevents committed guard rows.
CREATE TABLE studio_private.teacher_identity_writes (
  backend_pid integer NOT NULL,
  transaction_id bigint NOT NULL,
  operation text NOT NULL,
  teacher_id bigint,
  actor_teacher_id bigint,
  actor_phone text NOT NULL,
  actor_name text NOT NULL,
  PRIMARY KEY (backend_pid, transaction_id)
);
REVOKE ALL ON studio_private.teacher_identity_writes FROM PUBLIC, studio_agent, studio_broker;
CREATE FUNCTION studio_private.check_identity_write_closed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
BEGIN
  IF EXISTS (SELECT FROM studio_private.teacher_identity_writes
              WHERE backend_pid = NEW.backend_pid AND transaction_id = NEW.transaction_id) THEN
    RAISE EXCEPTION 'Identity write context must not persist' USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER teacher_identity_write_closed AFTER INSERT ON studio_private.teacher_identity_writes
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION studio_private.check_identity_write_closed();

CREATE OR REPLACE FUNCTION studio_private.apply_teacher_creation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  author studio_private.author_context%ROWTYPE;
  guard studio_private.teacher_identity_writes%ROWTYPE;
BEGIN
  SELECT * INTO guard FROM studio_private.teacher_identity_writes
   WHERE backend_pid = pg_backend_pid() AND transaction_id = txid_current();
  IF FOUND AND guard.teacher_id IS NULL AND guard.operation IN ('bootstrap', 'enroll') THEN
    NEW.created_by_phone := guard.actor_phone;
    NEW.created_by_name := guard.actor_name;
    IF NEW.legacy_identity OR NEW.phone IS NULL OR NOT NEW.access_enabled THEN
      RAISE EXCEPTION 'New identities must be complete' USING ERRCODE = '23514';
    END IF;
  ELSE
    -- Only the previous runtime may still create incomplete people, until the
    -- common activation removes this path. It cannot write new identity fields.
    author := studio_private.require_author_context();
    IF NEW.phone IS NOT NULL OR NEW.access_enabled OR NOT NEW.legacy_identity OR NEW.identity_revision <> 1 THEN
      RAISE EXCEPTION 'Protected identity write is required' USING ERRCODE = '42501';
    END IF;
    NEW.created_by_phone := author.sender;
    NEW.created_by_name := author.profile_name;
  END IF;
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE FUNCTION studio_private.protect_teacher_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  guard studio_private.teacher_identity_writes%ROWTYPE;
BEGIN
  SELECT * INTO guard FROM studio_private.teacher_identity_writes
   WHERE backend_pid = pg_backend_pid() AND transaction_id = txid_current() AND teacher_id = OLD.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Protected identity write is required' USING ERRCODE = '42501';
  END IF;
  IF ROW(NEW.id, NEW.created_at, NEW.created_by_phone, NEW.created_by_name, NEW.legacy_identity)
     IS DISTINCT FROM ROW(OLD.id, OLD.created_at, OLD.created_by_phone, OLD.created_by_name, OLD.legacy_identity) THEN
    RAISE EXCEPTION 'Original teacher attribution is immutable' USING ERRCODE = '42501';
  END IF;
  IF guard.operation IN ('revoke', 'change_phone') AND guard.actor_teacher_id = OLD.id THEN
    RAISE EXCEPTION 'Manager cannot revoke or renumber self' USING ERRCODE = '42501';
  END IF;
  IF guard.operation = 'correct' THEN
    IF ROW(NEW.phone, NEW.access_enabled) IS DISTINCT FROM ROW(OLD.phone, OLD.access_enabled) THEN
      RAISE EXCEPTION 'Invalid identity correction' USING ERRCODE = '42501';
    END IF;
  ELSIF guard.operation IN ('bootstrap', 'complete', 'change_phone') THEN
    IF ROW(NEW.first_name, NEW.last_name) IS DISTINCT FROM ROW(OLD.first_name, OLD.last_name)
       OR NEW.phone IS NULL OR (guard.operation = 'change_phone' AND NEW.access_enabled <> OLD.access_enabled)
       OR (guard.operation IN ('bootstrap', 'complete') AND (NOT OLD.legacy_identity OR OLD.phone IS NOT NULL OR NOT NEW.access_enabled)) THEN
      RAISE EXCEPTION 'Invalid identity completion or phone change' USING ERRCODE = '42501';
    END IF;
  ELSIF guard.operation IN ('revoke', 'enable') THEN
    IF ROW(NEW.first_name, NEW.last_name, NEW.phone) IS DISTINCT FROM ROW(OLD.first_name, OLD.last_name, OLD.phone)
       OR NEW.access_enabled <> (guard.operation = 'enable') THEN
      RAISE EXCEPTION 'Invalid identity access change' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid identity write context' USING ERRCODE = '42501';
  END IF;
  NEW.identity_revision := OLD.identity_revision + 1;
  RETURN NEW;
END;
$$;
DROP TRIGGER teachers_immutable ON studio_private.teachers;
CREATE TRIGGER teachers_immutable BEFORE UPDATE ON studio_private.teachers
FOR EACH ROW EXECUTE FUNCTION studio_private.protect_teacher_identity();

-- An INSTEAD OF trigger preserves explicit legacy author parameters and
-- RETURNING *, even though the public phone-author expression is read-only.
CREATE FUNCTION studio_private.insert_legacy_teacher() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  person studio_private.teachers%ROWTYPE;
BEGIN
  IF NEW.id IS NULL THEN
    INSERT INTO studio_private.teachers (first_name, last_name)
      VALUES (NEW.first_name, NEW.last_name) RETURNING * INTO person;
  ELSE
    INSERT INTO studio_private.teachers (id, first_name, last_name) OVERRIDING SYSTEM VALUE
      VALUES (NEW.id, NEW.first_name, NEW.last_name) RETURNING * INTO person;
  END IF;
  NEW.id := person.id;
  NEW.created_at := person.created_at;
  NEW.created_by_phone := person.created_by_phone;
  NEW.created_by_name := person.created_by_name;
  RETURN NEW;
END;
$$;
CREATE TRIGGER teachers_legacy_insert INSTEAD OF INSERT ON app.teachers
FOR EACH ROW EXECUTE FUNCTION studio_private.insert_legacy_teacher();
CREATE TRIGGER teachers_public_immutable INSTEAD OF UPDATE OR DELETE ON app.teachers
FOR EACH ROW EXECUTE FUNCTION studio_private.prevent_teacher_history_change();

CREATE FUNCTION studio_private.identity_state(person studio_private.teachers) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog
AS $$
  SELECT CASE WHEN person.id IS NULL THEN NULL ELSE jsonb_build_object(
    'first_name', person.first_name, 'last_name', person.last_name, 'phone', person.phone,
    'access_enabled', person.access_enabled, 'legacy_identity', person.legacy_identity,
    'identity_revision', person.identity_revision) END
$$;

CREATE FUNCTION studio_private.require_identity_manager(sender text, manager_phone text) RETURNS studio_private.teachers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  manager studio_private.teachers%ROWTYPE;
BEGIN
  IF studio_private.identity_sender_phone(sender) <> studio_private.normalize_identity_phone(manager_phone) THEN
    RAISE EXCEPTION 'Authenticated manager is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO manager FROM studio_private.teachers
   WHERE phone = studio_private.identity_sender_phone(sender) FOR UPDATE;
  IF NOT FOUND OR NOT manager.access_enabled THEN
    RAISE EXCEPTION 'Enabled manager identity is required' USING ERRCODE = '42501';
  END IF;
  RETURN manager;
END;
$$;

CREATE FUNCTION studio_private.manage_teacher_identity(
  sender text, manager_phone text, operation text, teacher_id bigint DEFAULT NULL,
  first_name text DEFAULT NULL, last_name text DEFAULT NULL, phone text DEFAULT NULL
) RETURNS TABLE (id bigint, identity_revision bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  manager studio_private.teachers%ROWTYPE;
  previous studio_private.teachers%ROWTYPE;
  person studio_private.teachers%ROWTYPE;
  canonical text;
  clean_first text;
  clean_last text;
  actor_id bigint;
  actor_name text;
BEGIN
  IF session_user <> 'studio_broker'
     OR studio_private.identity_sender_phone(sender) <> studio_private.normalize_identity_phone(manager_phone) THEN
    RAISE EXCEPTION 'Trusted manager proof is required' USING ERRCODE = '42501';
  END IF;
  IF operation IS NULL OR operation NOT IN ('bootstrap', 'enroll', 'complete', 'correct', 'change_phone', 'revoke', 'enable') THEN
    RAISE EXCEPTION 'Invalid identity operation' USING ERRCODE = '23514';
  END IF;
  IF operation IN ('bootstrap', 'enroll', 'correct') THEN
    clean_first := studio_private.normalize_identity_name(first_name);
    clean_last := studio_private.normalize_identity_name(last_name);
  ELSIF first_name IS NOT NULL OR last_name IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected identity names' USING ERRCODE = '23514';
  END IF;
  IF operation IN ('bootstrap', 'enroll', 'complete', 'change_phone') THEN
    canonical := studio_private.normalize_identity_phone(phone);
  ELSIF phone IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected identity phone' USING ERRCODE = '23514';
  END IF;
  IF (teacher_id IS NOT NULL AND teacher_id <= 0)
     OR (operation = 'enroll' AND teacher_id IS NOT NULL)
     OR (operation NOT IN ('bootstrap', 'enroll') AND teacher_id IS NULL) THEN
    RAISE EXCEPTION 'Invalid identity target' USING ERRCODE = '23514';
  END IF;

  IF operation = 'bootstrap' THEN
    IF canonical <> studio_private.identity_sender_phone(sender) THEN
      RAISE EXCEPTION 'Bootstrap is restricted to the manager phone' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT FROM studio_private.teachers t WHERE t.phone = canonical) THEN
      RAISE EXCEPTION 'Manager identity is already registered' USING ERRCODE = '42501';
    END IF;
    actor_name := clean_first || ' ' || clean_last;
  ELSE
    -- Serialize manager writes, including rechecking access at save time.
    manager := studio_private.require_identity_manager(sender, manager_phone);
    actor_id := manager.id;
    actor_name := manager.first_name || ' ' || manager.last_name;
  END IF;

  IF teacher_id IS NOT NULL THEN
    SELECT * INTO previous FROM studio_private.teachers t WHERE t.id = teacher_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Identity does not exist' USING ERRCODE = '23503';
    END IF;
    IF operation IN ('bootstrap', 'complete') AND (NOT previous.legacy_identity OR previous.phone IS NOT NULL) THEN
      RAISE EXCEPTION 'Only incomplete legacy identities can be completed' USING ERRCODE = '23514';
    END IF;
    IF operation = 'bootstrap' THEN
      IF lower(previous.first_name) <> lower(clean_first) OR lower(previous.last_name) <> lower(clean_last) THEN
        RAISE EXCEPTION 'Bootstrap identity names do not match' USING ERRCODE = '23514';
      END IF;
      actor_id := previous.id;
      actor_name := previous.first_name || ' ' || previous.last_name;
    END IF;
    IF operation IN ('revoke', 'change_phone') AND previous.id = manager.id THEN
      RAISE EXCEPTION 'Manager cannot revoke or renumber self' USING ERRCODE = '42501';
    END IF;
    IF (operation = 'correct' AND ROW(clean_first, clean_last) IS NOT DISTINCT FROM ROW(previous.first_name, previous.last_name))
       OR (operation = 'change_phone' AND (previous.phone IS NULL OR previous.phone = canonical))
       OR (operation IN ('revoke', 'enable') AND (previous.phone IS NULL OR previous.access_enabled = (operation = 'enable'))) THEN
      RAISE EXCEPTION 'Identity operation has no valid transition' USING ERRCODE = '23514';
    END IF;
  END IF;

  INSERT INTO studio_private.teacher_identity_writes
    VALUES (pg_backend_pid(), txid_current(), operation, teacher_id, actor_id, sender, actor_name);
  IF teacher_id IS NULL THEN
    INSERT INTO studio_private.teachers (first_name, last_name, phone, access_enabled, legacy_identity)
      VALUES (clean_first, clean_last, canonical, true, false) RETURNING * INTO person;
  ELSE
    UPDATE studio_private.teachers t SET
      first_name = CASE WHEN operation = 'correct' THEN clean_first ELSE t.first_name END,
      last_name = CASE WHEN operation = 'correct' THEN clean_last ELSE t.last_name END,
      phone = CASE WHEN operation IN ('bootstrap', 'complete', 'change_phone') THEN canonical ELSE t.phone END,
      access_enabled = CASE WHEN operation IN ('bootstrap', 'complete', 'enable') THEN true
                            WHEN operation = 'revoke' THEN false ELSE t.access_enabled END
      WHERE t.id = teacher_id RETURNING * INTO person;
  END IF;
  INSERT INTO studio_private.teacher_identity_changes
    (teacher_id, operation, actor_teacher_id, actor_phone, actor_name, before_state, after_state)
    VALUES (person.id, operation, coalesce(actor_id, person.id), sender, actor_name,
            studio_private.identity_state(previous), studio_private.identity_state(person));
  DELETE FROM studio_private.teacher_identity_writes
    WHERE backend_pid = pg_backend_pid() AND transaction_id = txid_current();
  RETURN QUERY SELECT person.id, person.identity_revision;
END;
$$;

CREATE FUNCTION studio_private.list_teacher_identities(sender text, manager_phone text)
RETURNS TABLE (id bigint, first_name text, last_name text, phone text, access_enabled boolean, legacy_identity boolean, identity_revision bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
BEGIN
  IF session_user <> 'studio_broker' THEN
    RAISE EXCEPTION 'Trusted manager proof is required' USING ERRCODE = '42501';
  END IF;
  PERFORM studio_private.require_identity_manager(sender, manager_phone);
  RETURN QUERY SELECT t.id, t.first_name, t.last_name, t.phone, t.access_enabled, t.legacy_identity, t.identity_revision
    FROM studio_private.teachers t ORDER BY t.id;
END;
$$;

CREATE FUNCTION studio_private.resolve_teacher_identity(sender text)
RETURNS TABLE (id bigint, first_name text, last_name text, access_enabled boolean, identity_revision bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $$
  SELECT t.id, t.first_name, t.last_name, t.access_enabled, t.identity_revision
    FROM studio_private.teachers t WHERE t.phone = studio_private.identity_sender_phone(sender)
$$;

-- NULL revision is strictly the compatibility context, not a manager flag. The
-- final activation must remove legacy installation/acceptance at the same time.
ALTER TABLE studio_private.author_context ADD COLUMN identity_revision bigint;
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
  IF author.identity_revision IS NOT NULL THEN
    SELECT * INTO person FROM studio_private.teachers t WHERE t.id = author.sender_teacher_id FOR SHARE;
    IF NOT FOUND OR NOT person.access_enabled OR person.phone IS DISTINCT FROM ('+' || author.sender)
       OR person.identity_revision IS DISTINCT FROM author.identity_revision THEN
      RAISE EXCEPTION 'Current enabled sender identity is required' USING ERRCODE = '42501';
    END IF;
    author.profile_name := person.first_name || ' ' || person.last_name;
  END IF;
  RETURN author;
END;
$$;

CREATE FUNCTION studio_private.bind_teacher_identity(backend integer, transaction bigint, sender text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  person studio_private.teachers%ROWTYPE;
BEGIN
  IF backend IS NULL OR transaction IS NULL OR transaction <= 0
     OR NOT EXISTS (SELECT FROM pg_catalog.pg_stat_activity a
                     WHERE a.pid = backend AND a.usename = 'studio_agent' AND a.datname = current_database()) THEN
    RAISE EXCEPTION 'Invalid agent transaction binding' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO person FROM studio_private.teachers t
   WHERE t.phone = studio_private.identity_sender_phone(sender) FOR SHARE;
  IF NOT FOUND OR NOT person.access_enabled THEN
    RAISE EXCEPTION 'Current enabled sender identity is required' USING ERRCODE = '42501';
  END IF;
  INSERT INTO studio_private.author_context
    (backend_pid, transaction_id, sender, profile_name, expires_at, sender_teacher_id, identity_revision)
    VALUES (backend, transaction, sender, person.first_name || ' ' || person.last_name,
            clock_timestamp() + interval '60 seconds', person.id, person.identity_revision);
END;
$$;

-- The original client/rule and attendance triggers predate require_author_context.
-- Route them through the same validation, without changing their legacy rules.
CREATE OR REPLACE FUNCTION studio_private.apply_author() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  author studio_private.author_context%ROWTYPE;
BEGIN
  author := studio_private.require_author_context();
  IF TG_OP = 'INSERT' THEN
    NEW.created_by_phone := author.sender;
    NEW.created_by_name := author.profile_name;
    IF TG_TABLE_NAME = 'training_rules' THEN
      IF NEW.deactivated_at IS NOT NULL THEN
        RAISE EXCEPTION 'Rules must be inserted active' USING ERRCODE = '23514';
      END IF;
    END IF;
  ELSE
    IF OLD.deactivated_at IS NOT NULL OR NEW.deactivated_at IS NULL THEN
      RAISE EXCEPTION 'Rule can only be deactivated once' USING ERRCODE = '23514';
    END IF;
    NEW.deactivated_by_phone := author.sender;
    NEW.deactivated_by_name := author.profile_name;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION studio_private.apply_attendance_author() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  author studio_private.author_context%ROWTYPE;
  local_start timestamp;
  lesson_start timestamptz;
BEGIN
  author := studio_private.require_author_context();
  IF TG_OP = 'INSERT' THEN
    IF NEW.cancelled_at IS NOT NULL OR NEW.cancelled_by_phone IS NOT NULL
       OR NEW.cancelled_by_name IS NOT NULL OR NEW.cancellation_reason IS NOT NULL THEN
      RAISE EXCEPTION 'Attendance must be inserted valid' USING ERRCODE = '23514';
    END IF;
    local_start := NEW.lesson_date + NEW.start_time;
    lesson_start := local_start AT TIME ZONE 'Europe/Rome';
    IF lesson_start AT TIME ZONE 'Europe/Rome' <> local_start THEN
      RAISE EXCEPTION 'Lesson start is not a valid local time' USING ERRCODE = '23514';
    END IF;
    IF lesson_start > clock_timestamp() AND NEW.outcome IS DISTINCT FROM 'excused_absence' THEN
      RAISE EXCEPTION 'Lesson has not started' USING ERRCODE = '23514';
    END IF;
    NEW.created_at := clock_timestamp();
    NEW.created_by_phone := author.sender;
    NEW.created_by_name := author.profile_name;
  ELSE
    IF OLD.cancelled_at IS NOT NULL OR NEW.cancelled_at IS NULL THEN
      RAISE EXCEPTION 'Attendance can only be cancelled once' USING ERRCODE = '23514';
    END IF;
    IF ROW(NEW.id, NEW.client_id, NEW.lesson_date, NEW.start_time, NEW.outcome,
           NEW.created_at, NEW.created_by_phone, NEW.created_by_name)
       IS DISTINCT FROM
       ROW(OLD.id, OLD.client_id, OLD.lesson_date, OLD.start_time, OLD.outcome,
           OLD.created_at, OLD.created_by_phone, OLD.created_by_name) THEN
      RAISE EXCEPTION 'Attendance cannot be rewritten' USING ERRCODE = '42501';
    END IF;
    NEW.cancelled_by_phone := author.sender;
    NEW.cancelled_by_name := author.profile_name;
  END IF;
  RETURN NEW;
END;
$$;

-- Default function privileges are already deny-by-default; state entry-point
-- grants explicitly. No helper, guard, audit or new identity column goes to the
-- model. Legacy author-phone columns still require the common TEC-042 cutover;
-- do not wire new contexts into model turns before that restriction is applied.
-- Existing broker grants are preserved only for the old runtime.
REVOKE ALL ON FUNCTION studio_private.resolve_teacher_identity(text),
  studio_private.bind_teacher_identity(integer, bigint, text),
  studio_private.manage_teacher_identity(text, text, text, bigint, text, text, text),
  studio_private.list_teacher_identities(text, text) FROM PUBLIC, studio_agent;
GRANT EXECUTE ON FUNCTION studio_private.resolve_teacher_identity(text),
  studio_private.bind_teacher_identity(integer, bigint, text),
  studio_private.manage_teacher_identity(text, text, text, bigint, text, text, text),
  studio_private.list_teacher_identities(text, text) TO studio_broker;

COMMIT;
