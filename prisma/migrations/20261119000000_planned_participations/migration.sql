BEGIN;

-- US-019: planned participations of a client in a point lesson outside the
-- training rules (extra lessons, make-up lessons). Same protection model as
-- attendance: private rows with author snapshots, a phone-free projection for
-- the agent, trusted author, single cancellation and no delete or rewrite.
CREATE TABLE studio_private.planned_participations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id bigint NOT NULL REFERENCES studio_private.clients(id),
  lesson_date date NOT NULL CHECK (lesson_date > date '-infinity' AND lesson_date < date 'infinity'),
  start_time time NOT NULL CHECK (start_time < time '24:00' AND extract(second FROM start_time) = 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by_phone text NOT NULL,
  created_by_name text,
  cancelled_at timestamptz,
  cancelled_by_phone text,
  cancelled_by_name text,
  cancellation_reason text,
  CONSTRAINT planned_participations_cancellation_consistent CHECK (
    (cancelled_at IS NULL AND cancelled_by_phone IS NULL AND cancelled_by_name IS NULL AND cancellation_reason IS NULL)
    OR (cancelled_at IS NOT NULL AND cancelled_by_phone IS NOT NULL AND cancellation_reason IS NOT NULL AND btrim(cancellation_reason) <> '')
  )
);

-- At most one valid planned participation per client and point lesson.
CREATE UNIQUE INDEX planned_participations_valid_unique
  ON studio_private.planned_participations (client_id, lesson_date, start_time) WHERE cancelled_at IS NULL;

CREATE FUNCTION studio_private.apply_planned_participation_author() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  author studio_private.author_context%ROWTYPE;
  local_start timestamp;
BEGIN
  author := studio_private.require_author_context();
  IF TG_OP = 'INSERT' THEN
    IF NEW.cancelled_at IS NOT NULL OR NEW.cancelled_by_phone IS NOT NULL
       OR NEW.cancelled_by_name IS NOT NULL OR NEW.cancellation_reason IS NOT NULL THEN
      RAISE EXCEPTION 'Planned participations must be inserted valid' USING ERRCODE = '23514';
    END IF;
    local_start := NEW.lesson_date + NEW.start_time;
    -- Reject nonexistent local times during the spring transition.
    IF (local_start AT TIME ZONE 'Europe/Rome') AT TIME ZONE 'Europe/Rome' <> local_start THEN
      RAISE EXCEPTION 'Lesson start is not a valid local time' USING ERRCODE = '23514';
    END IF;
    -- Past and future lessons are allowed, without an advance limit.
    NEW.created_at := clock_timestamp();
    NEW.created_by_phone := author.sender;
    NEW.created_by_name := author.profile_name;
  ELSE
    IF OLD.cancelled_at IS NOT NULL OR NEW.cancelled_at IS NULL THEN
      RAISE EXCEPTION 'Planned participation can only be cancelled once' USING ERRCODE = '23514';
    END IF;
    IF ROW(NEW.id, NEW.client_id, NEW.lesson_date, NEW.start_time, NEW.created_at, NEW.created_by_phone, NEW.created_by_name)
       IS DISTINCT FROM
       ROW(OLD.id, OLD.client_id, OLD.lesson_date, OLD.start_time, OLD.created_at, OLD.created_by_phone, OLD.created_by_name) THEN
      RAISE EXCEPTION 'Planned participations cannot be rewritten' USING ERRCODE = '42501';
    END IF;
    NEW.cancelled_at := clock_timestamp();
    NEW.cancelled_by_phone := author.sender;
    NEW.cancelled_by_name := author.profile_name;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION studio_private.prevent_planned_participation_delete() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'Planned participations cannot be deleted' USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER planned_participations_author BEFORE INSERT OR UPDATE ON studio_private.planned_participations
FOR EACH ROW EXECUTE FUNCTION studio_private.apply_planned_participation_author();
CREATE TRIGGER planned_participations_no_delete BEFORE DELETE ON studio_private.planned_participations
FOR EACH STATEMENT EXECUTE FUNCTION studio_private.prevent_planned_participation_delete();
CREATE TRIGGER planned_participations_no_truncate BEFORE TRUNCATE ON studio_private.planned_participations
FOR EACH STATEMENT EXECUTE FUNCTION studio_private.prevent_planned_participation_delete();

REVOKE ALL ON studio_private.planned_participations FROM PUBLIC, studio_agent, studio_broker;
REVOKE ALL ON SEQUENCE studio_private.planned_participations_id_seq FROM PUBLIC, studio_agent, studio_broker;
REVOKE ALL ON FUNCTION studio_private.apply_planned_participation_author(),
  studio_private.prevent_planned_participation_delete() FROM PUBLIC, studio_agent, studio_broker;

-- Phone-free, automatically updatable projection, as for attendance.
CREATE VIEW app.planned_participations AS
  SELECT id, client_id, lesson_date, start_time, created_at, created_by_name,
         cancelled_at, cancelled_by_name, cancellation_reason
    FROM studio_private.planned_participations;
REVOKE ALL ON app.planned_participations FROM PUBLIC, studio_agent, studio_broker;
GRANT SELECT, INSERT ON app.planned_participations TO studio_agent;
GRANT UPDATE (cancelled_at, cancelled_by_name, cancellation_reason) ON app.planned_participations TO studio_agent;

-- Existing lessons also include valid planned participations.
CREATE OR REPLACE FUNCTION app.existing_lessons(first_day date, last_day date)
RETURNS TABLE (lesson_date date, start_time time)
LANGUAGE sql STABLE
AS $$
  WITH days AS (
    SELECT first_day + n AS day FROM generate_series(0, last_day - first_day) AS n
  ), lessons AS (
    SELECT d.day AS lesson_date, s.start_time
      FROM days d
      JOIN app.rule_slots s ON s.weekday = extract(isodow FROM d.day)
      JOIN app.training_rules r ON r.id = s.rule_id
     WHERE r.created_at < (d.day + s.start_time) AT TIME ZONE 'Europe/Rome'
       AND (r.deactivated_at IS NULL OR r.deactivated_at > (d.day + s.start_time) AT TIME ZONE 'Europe/Rome')
       AND ((d.day + s.start_time) AT TIME ZONE 'Europe/Rome') AT TIME ZONE 'Europe/Rome' = d.day + s.start_time
    UNION
    SELECT a.lesson_date, a.start_time FROM app.attendance a
     WHERE a.cancelled_at IS NULL AND a.lesson_date BETWEEN first_day AND last_day
    UNION
    SELECT t.lesson_date, t.start_time FROM app.teacher_assignments t
     WHERE t.cancelled_at IS NULL AND t.lesson_date BETWEEN first_day AND last_day
    UNION
    SELECT p.lesson_date, p.start_time FROM app.planned_participations p
     WHERE p.cancelled_at IS NULL AND p.lesson_date BETWEEN first_day AND last_day
  )
  SELECT l.lesson_date, l.start_time FROM lessons l ORDER BY l.lesson_date, l.start_time
$$;

-- Expected clients gain their source: 'rule' for the rules valid at the lesson
-- start, 'planned' for a valid planned participation. A client expected by a
-- rule keeps one 'rule' row even if a planned participation also exists.
DROP FUNCTION app.expected_clients(date, date);
CREATE FUNCTION app.expected_clients(first_day date, last_day date)
RETURNS TABLE (lesson_date date, start_time time, client_id bigint, source text)
LANGUAGE sql STABLE
AS $$
  WITH days AS (
    SELECT first_day + n AS day FROM generate_series(0, last_day - first_day) AS n
  ), by_rule AS (
    SELECT DISTINCT d.day AS lesson_date, s.start_time, c.client_id
      FROM days d
      JOIN app.rule_slots s ON s.weekday = extract(isodow FROM d.day)
      JOIN app.training_rules r ON r.id = s.rule_id
      JOIN app.rule_clients c ON c.rule_id = r.id
     WHERE r.created_at < (d.day + s.start_time) AT TIME ZONE 'Europe/Rome'
       AND (r.deactivated_at IS NULL OR r.deactivated_at > (d.day + s.start_time) AT TIME ZONE 'Europe/Rome')
       AND ((d.day + s.start_time) AT TIME ZONE 'Europe/Rome') AT TIME ZONE 'Europe/Rome' = d.day + s.start_time
  )
  SELECT e.lesson_date, e.start_time, e.client_id, e.source FROM (
    SELECT b.lesson_date, b.start_time, b.client_id, 'rule'::text AS source FROM by_rule b
    UNION ALL
    SELECT p.lesson_date, p.start_time, p.client_id, 'planned'::text FROM app.planned_participations p
     WHERE p.cancelled_at IS NULL AND p.lesson_date BETWEEN first_day AND last_day
       AND NOT EXISTS (SELECT FROM by_rule b WHERE b.lesson_date = p.lesson_date
                         AND b.start_time = p.start_time AND b.client_id = p.client_id)
  ) e
  ORDER BY 1, 2, 3
$$;

REVOKE ALL ON FUNCTION app.existing_lessons(date, date), app.expected_clients(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.existing_lessons(date, date), app.expected_clients(date, date) TO studio_agent;

-- Redaction of the trusted gateway also covers the new author numbers.
CREATE OR REPLACE FUNCTION studio_private.identity_phone_digits() RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $$
  SELECT DISTINCT digits FROM (
    SELECT ltrim(phone, '+') FROM studio_private.teachers
    UNION ALL SELECT ltrim(created_by_phone, '+') FROM studio_private.teachers
    UNION ALL SELECT ltrim(actor_phone, '+') FROM studio_private.teacher_identity_changes
    UNION ALL SELECT ltrim(before_state->>'phone', '+') FROM studio_private.teacher_identity_changes
    UNION ALL SELECT ltrim(after_state->>'phone', '+') FROM studio_private.teacher_identity_changes
    UNION ALL SELECT ltrim(previous_phone, '+') FROM studio_private.manager_role_changes
    UNION ALL SELECT ltrim(next_phone, '+') FROM studio_private.manager_role_changes
    UNION ALL SELECT created_by_phone FROM studio_private.clients
    UNION ALL SELECT created_by_phone FROM studio_private.training_rules
    UNION ALL SELECT deactivated_by_phone FROM studio_private.training_rules
    UNION ALL SELECT created_by_phone FROM studio_private.attendance
    UNION ALL SELECT cancelled_by_phone FROM studio_private.attendance
    UNION ALL SELECT created_by_phone FROM studio_private.planned_participations
    UNION ALL SELECT cancelled_by_phone FROM studio_private.planned_participations
    UNION ALL SELECT created_by_phone FROM studio_private.teacher_rules
    UNION ALL SELECT deactivated_by_phone FROM studio_private.teacher_rules
    UNION ALL SELECT created_by_phone FROM studio_private.teacher_assignments
    UNION ALL SELECT cancelled_by_phone FROM studio_private.teacher_assignments
  ) AS numbers (digits)
  WHERE digits ~ '^[0-9]{8,15}$'
$$;
REVOKE ALL ON FUNCTION studio_private.identity_phone_digits() FROM PUBLIC, studio_agent;
GRANT EXECUTE ON FUNCTION studio_private.identity_phone_digits() TO studio_broker;

COMMIT;
