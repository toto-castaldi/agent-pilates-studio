BEGIN;

CREATE TABLE app.teachers (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  first_name text NOT NULL CHECK (first_name = btrim(first_name) AND first_name <> ''),
  last_name text NOT NULL CHECK (last_name = btrim(last_name) AND last_name <> ''),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by_phone text NOT NULL,
  created_by_name text
);
CREATE UNIQUE INDEX teachers_name_unique ON app.teachers (lower(first_name), lower(last_name));

CREATE TABLE app.teacher_rules (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  teacher_id bigint NOT NULL REFERENCES app.teachers(id),
  rule_text text NOT NULL CHECK (rule_text = btrim(rule_text) AND rule_text <> ''),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by_phone text NOT NULL,
  created_by_name text,
  deactivated_at timestamptz,
  deactivated_by_phone text,
  deactivated_by_name text,
  deactivation_reason text,
  CONSTRAINT teacher_rules_deactivation_consistent CHECK (
    (deactivated_at IS NULL AND deactivated_by_phone IS NULL AND deactivated_by_name IS NULL AND deactivation_reason IS NULL)
    OR (deactivated_at IS NOT NULL AND deactivated_at >= created_at AND deactivated_by_phone IS NOT NULL
        AND deactivation_reason IS NOT NULL AND btrim(deactivation_reason) <> '')
  )
);

CREATE TABLE app.teacher_rule_intervals (
  rule_id bigint NOT NULL REFERENCES app.teacher_rules(id),
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_time_min time NOT NULL CHECK (start_time_min < time '24:00' AND extract(second FROM start_time_min) = 0),
  start_time_max time NOT NULL CHECK (start_time_max < time '24:00' AND extract(second FROM start_time_max) = 0),
  is_active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (rule_id, weekday, start_time_min, start_time_max),
  CHECK (start_time_min <= start_time_max),
  -- Inclusive ranges of lesson start minutes, not lesson durations. The native
  -- range GiST operator class needs no extension and arbitrates concurrent writes.
  CONSTRAINT teacher_intervals_no_active_overlap EXCLUDE USING gist (
    int4range(
      (weekday - 1) * 1440 + extract(hour FROM start_time_min)::integer * 60 + extract(minute FROM start_time_min)::integer,
      (weekday - 1) * 1440 + extract(hour FROM start_time_max)::integer * 60 + extract(minute FROM start_time_max)::integer,
      '[]'
    ) WITH &&
  ) WHERE (is_active)
);

CREATE TABLE app.teacher_assignments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  teacher_id bigint NOT NULL REFERENCES app.teachers(id),
  lesson_date date NOT NULL CHECK (isfinite(lesson_date)),
  start_time time NOT NULL CHECK (start_time < time '24:00' AND extract(second FROM start_time) = 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by_phone text NOT NULL,
  created_by_name text,
  cancelled_at timestamptz,
  cancelled_by_phone text,
  cancelled_by_name text,
  cancellation_reason text,
  CONSTRAINT teacher_assignments_cancellation_consistent CHECK (
    (cancelled_at IS NULL AND cancelled_by_phone IS NULL AND cancelled_by_name IS NULL AND cancellation_reason IS NULL)
    OR (cancelled_at IS NOT NULL AND cancelled_at >= created_at AND cancelled_by_phone IS NOT NULL
        AND cancellation_reason IS NOT NULL AND btrim(cancellation_reason) <> '')
  )
);
CREATE UNIQUE INDEX teacher_assignments_valid_unique ON app.teacher_assignments (lesson_date, start_time)
  WHERE cancelled_at IS NULL;

-- Only the transaction constructing a rule may insert its intervals. The
-- deferred completeness check removes this guard before commit, so no committed
-- transaction IDs can accidentally authorize appends after a dump/restore.
CREATE TABLE studio_private.teacher_rule_builds (
  rule_id bigint PRIMARY KEY REFERENCES app.teacher_rules(id),
  backend_pid integer NOT NULL,
  transaction_id bigint NOT NULL
);
REVOKE ALL ON studio_private.teacher_rule_builds FROM PUBLIC, studio_agent, studio_broker;

CREATE FUNCTION studio_private.require_author_context() RETURNS studio_private.author_context
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  author studio_private.author_context%ROWTYPE;
BEGIN
  SELECT * INTO author FROM studio_private.author_context
   WHERE backend_pid = pg_backend_pid()
     AND transaction_id = txid_current()
     AND expires_at > clock_timestamp();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trusted author context is required' USING ERRCODE = '42501';
  END IF;
  RETURN author;
END;
$$;

CREATE FUNCTION studio_private.apply_teacher_creation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  author studio_private.author_context%ROWTYPE;
BEGIN
  author := studio_private.require_author_context();
  NEW.created_at := clock_timestamp();
  NEW.created_by_phone := author.sender;
  NEW.created_by_name := author.profile_name;
  RETURN NEW;
END;
$$;

CREATE FUNCTION studio_private.apply_teacher_rule_author() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  author studio_private.author_context%ROWTYPE;
BEGIN
  author := studio_private.require_author_context();
  IF TG_OP = 'INSERT' THEN
    IF NEW.deactivated_at IS NOT NULL OR NEW.deactivated_by_phone IS NOT NULL
       OR NEW.deactivated_by_name IS NOT NULL OR NEW.deactivation_reason IS NOT NULL THEN
      RAISE EXCEPTION 'Teacher rules must be inserted active' USING ERRCODE = '23514';
    END IF;
    NEW.created_at := clock_timestamp();
    NEW.created_by_phone := author.sender;
    NEW.created_by_name := author.profile_name;
  ELSE
    IF OLD.deactivated_at IS NOT NULL OR NEW.deactivated_at IS NULL THEN
      RAISE EXCEPTION 'Teacher rule can only be deactivated once' USING ERRCODE = '23514';
    END IF;
    IF ROW(NEW.id, NEW.teacher_id, NEW.rule_text, NEW.created_at, NEW.created_by_phone, NEW.created_by_name)
       IS DISTINCT FROM
       ROW(OLD.id, OLD.teacher_id, OLD.rule_text, OLD.created_at, OLD.created_by_phone, OLD.created_by_name) THEN
      RAISE EXCEPTION 'Teacher rules cannot be rewritten' USING ERRCODE = '42501';
    END IF;
    NEW.deactivated_at := clock_timestamp();
    NEW.deactivated_by_phone := author.sender;
    NEW.deactivated_by_name := author.profile_name;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION studio_private.apply_teacher_assignment_author() RETURNS trigger
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
      RAISE EXCEPTION 'Teacher assignments must be inserted valid' USING ERRCODE = '23514';
    END IF;
    local_start := NEW.lesson_date + NEW.start_time;
    lesson_start := local_start AT TIME ZONE 'Europe/Rome';
    IF lesson_start AT TIME ZONE 'Europe/Rome' <> local_start THEN
      RAISE EXCEPTION 'Lesson start is not a valid local time' USING ERRCODE = '23514';
    END IF;
    -- Past and future lessons are both allowed, independently of attendance.
    NEW.created_at := clock_timestamp();
    NEW.created_by_phone := author.sender;
    NEW.created_by_name := author.profile_name;
  ELSE
    IF OLD.cancelled_at IS NOT NULL OR NEW.cancelled_at IS NULL THEN
      RAISE EXCEPTION 'Teacher assignment can only be cancelled once' USING ERRCODE = '23514';
    END IF;
    IF ROW(NEW.id, NEW.teacher_id, NEW.lesson_date, NEW.start_time, NEW.created_at, NEW.created_by_phone, NEW.created_by_name)
       IS DISTINCT FROM
       ROW(OLD.id, OLD.teacher_id, OLD.lesson_date, OLD.start_time, OLD.created_at, OLD.created_by_phone, OLD.created_by_name) THEN
      RAISE EXCEPTION 'Teacher assignments cannot be rewritten' USING ERRCODE = '42501';
    END IF;
    NEW.cancelled_at := clock_timestamp();
    NEW.cancelled_by_phone := author.sender;
    NEW.cancelled_by_name := author.profile_name;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION studio_private.open_teacher_rule_build() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
BEGIN
  INSERT INTO studio_private.teacher_rule_builds VALUES (NEW.id, pg_backend_pid(), txid_current());
  RETURN NULL;
END;
$$;

CREATE FUNCTION studio_private.complete_teacher_rule_build() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (SELECT FROM app.teacher_rule_intervals WHERE rule_id = NEW.id) THEN
    RAISE EXCEPTION 'Teacher rules require at least one interval' USING ERRCODE = '23514';
  END IF;
  DELETE FROM studio_private.teacher_rule_builds
   WHERE rule_id = NEW.id AND backend_pid = pg_backend_pid() AND transaction_id = txid_current();
  RETURN NULL;
END;
$$;

CREATE FUNCTION studio_private.protect_teacher_interval() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  parent app.teacher_rules%ROWTYPE;
BEGIN
  PERFORM studio_private.require_author_context();
  SELECT * INTO parent FROM app.teacher_rules WHERE id = NEW.rule_id FOR UPDATE;
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

-- AFTER row events open the parent's build before validating child inserts,
-- including when both inserts occur in one data-modifying CTE statement.
CREATE FUNCTION studio_private.check_teacher_interval_build() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (SELECT FROM studio_private.teacher_rule_builds
                  WHERE rule_id = NEW.rule_id AND backend_pid = pg_backend_pid() AND transaction_id = txid_current()) THEN
    RAISE EXCEPTION 'Intervals must be inserted with their teacher rule' USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END;
$$;

CREATE FUNCTION studio_private.deactivate_teacher_intervals() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
BEGIN
  UPDATE app.teacher_rule_intervals SET is_active = false WHERE rule_id = NEW.id;
  RETURN NULL;
END;
$$;

CREATE FUNCTION studio_private.prevent_teacher_history_change() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'Teacher history cannot be deleted or rewritten' USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER teachers_author BEFORE INSERT ON app.teachers
FOR EACH ROW EXECUTE FUNCTION studio_private.apply_teacher_creation();
CREATE TRIGGER teachers_immutable BEFORE UPDATE ON app.teachers
FOR EACH ROW EXECUTE FUNCTION studio_private.prevent_teacher_history_change();
CREATE TRIGGER teachers_no_delete BEFORE DELETE ON app.teachers
FOR EACH STATEMENT EXECUTE FUNCTION studio_private.prevent_teacher_history_change();
CREATE TRIGGER teachers_no_truncate BEFORE TRUNCATE ON app.teachers
FOR EACH STATEMENT EXECUTE FUNCTION studio_private.prevent_teacher_history_change();

CREATE TRIGGER teacher_rules_author BEFORE INSERT OR UPDATE ON app.teacher_rules
FOR EACH ROW EXECUTE FUNCTION studio_private.apply_teacher_rule_author();
CREATE TRIGGER teacher_rules_build_open AFTER INSERT ON app.teacher_rules
FOR EACH ROW EXECUTE FUNCTION studio_private.open_teacher_rule_build();
CREATE CONSTRAINT TRIGGER teacher_rules_complete AFTER INSERT ON app.teacher_rules
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION studio_private.complete_teacher_rule_build();
CREATE TRIGGER teacher_rules_deactivate_intervals AFTER UPDATE ON app.teacher_rules
FOR EACH ROW EXECUTE FUNCTION studio_private.deactivate_teacher_intervals();
CREATE TRIGGER teacher_rules_no_delete BEFORE DELETE ON app.teacher_rules
FOR EACH STATEMENT EXECUTE FUNCTION studio_private.prevent_teacher_history_change();
CREATE TRIGGER teacher_rules_no_truncate BEFORE TRUNCATE ON app.teacher_rules
FOR EACH STATEMENT EXECUTE FUNCTION studio_private.prevent_teacher_history_change();

CREATE TRIGGER teacher_intervals_protect BEFORE INSERT OR UPDATE ON app.teacher_rule_intervals
FOR EACH ROW EXECUTE FUNCTION studio_private.protect_teacher_interval();
CREATE TRIGGER teacher_intervals_build AFTER INSERT ON app.teacher_rule_intervals
FOR EACH ROW EXECUTE FUNCTION studio_private.check_teacher_interval_build();
CREATE TRIGGER teacher_intervals_no_delete BEFORE DELETE ON app.teacher_rule_intervals
FOR EACH STATEMENT EXECUTE FUNCTION studio_private.prevent_teacher_history_change();
CREATE TRIGGER teacher_intervals_no_truncate BEFORE TRUNCATE ON app.teacher_rule_intervals
FOR EACH STATEMENT EXECUTE FUNCTION studio_private.prevent_teacher_history_change();

CREATE TRIGGER teacher_assignments_author BEFORE INSERT OR UPDATE ON app.teacher_assignments
FOR EACH ROW EXECUTE FUNCTION studio_private.apply_teacher_assignment_author();
CREATE TRIGGER teacher_assignments_no_delete BEFORE DELETE ON app.teacher_assignments
FOR EACH STATEMENT EXECUTE FUNCTION studio_private.prevent_teacher_history_change();
CREATE TRIGGER teacher_assignments_no_truncate BEFORE TRUNCATE ON app.teacher_assignments
FOR EACH STATEMENT EXECUTE FUNCTION studio_private.prevent_teacher_history_change();

-- The default DML grant for new app tables is intentionally narrowed.
REVOKE ALL ON app.teachers, app.teacher_rules, app.teacher_rule_intervals, app.teacher_assignments FROM studio_agent;
GRANT SELECT, INSERT ON app.teachers, app.teacher_rules, app.teacher_rule_intervals, app.teacher_assignments TO studio_agent;
GRANT UPDATE (deactivated_at, deactivated_by_phone, deactivated_by_name, deactivation_reason)
  ON app.teacher_rules TO studio_agent;
GRANT UPDATE (cancelled_at, cancelled_by_phone, cancelled_by_name, cancellation_reason)
  ON app.teacher_assignments TO studio_agent;

COMMIT;
