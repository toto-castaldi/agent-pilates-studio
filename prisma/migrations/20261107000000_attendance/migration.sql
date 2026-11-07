-- One row per recorded outcome, with cancellations retained as history.
CREATE TABLE app.attendance (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id bigint NOT NULL REFERENCES app.clients(id),
  lesson_date date NOT NULL,
  start_time time NOT NULL CHECK (start_time < time '24:00' AND extract(second FROM start_time) = 0),
  outcome text NOT NULL CHECK (outcome IN ('present', 'excused_absence', 'unexcused_absence')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by_phone text NOT NULL,
  created_by_name text,
  cancelled_at timestamptz,
  cancelled_by_phone text,
  cancelled_by_name text,
  cancellation_reason text,
  CONSTRAINT attendance_cancellation_consistent CHECK (
    (cancelled_at IS NULL AND cancelled_by_phone IS NULL AND cancelled_by_name IS NULL AND cancellation_reason IS NULL)
    OR (cancelled_at IS NOT NULL AND cancelled_by_phone IS NOT NULL AND cancellation_reason IS NOT NULL AND btrim(cancellation_reason) <> '')
  )
);

CREATE UNIQUE INDEX attendance_valid_unique ON app.attendance (client_id, lesson_date, start_time)
  WHERE cancelled_at IS NULL;

CREATE FUNCTION studio_private.apply_attendance_author() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  author studio_private.author_context%ROWTYPE;
  local_start timestamp;
  lesson_start timestamptz;
BEGIN
  SELECT * INTO author FROM studio_private.author_context
   WHERE backend_pid = pg_backend_pid()
     AND transaction_id = txid_current()
     AND expires_at > clock_timestamp();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trusted author context is required' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.cancelled_at IS NOT NULL OR NEW.cancelled_by_phone IS NOT NULL
       OR NEW.cancelled_by_name IS NOT NULL OR NEW.cancellation_reason IS NOT NULL THEN
      RAISE EXCEPTION 'Attendance must be inserted valid' USING ERRCODE = '23514';
    END IF;
    local_start := NEW.lesson_date + NEW.start_time;
    lesson_start := local_start AT TIME ZONE 'Europe/Rome';
    -- Reject nonexistent local times during the spring transition.
    IF lesson_start AT TIME ZONE 'Europe/Rome' <> local_start THEN
      RAISE EXCEPTION 'Lesson start is not a valid local time' USING ERRCODE = '23514';
    END IF;
    IF lesson_start > clock_timestamp() THEN
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

CREATE FUNCTION studio_private.prevent_attendance_delete() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'Attendance cannot be deleted' USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER attendance_author BEFORE INSERT OR UPDATE ON app.attendance
FOR EACH ROW EXECUTE FUNCTION studio_private.apply_attendance_author();
CREATE TRIGGER attendance_no_delete BEFORE DELETE ON app.attendance
FOR EACH ROW EXECUTE FUNCTION studio_private.prevent_attendance_delete();
CREATE TRIGGER attendance_no_truncate BEFORE TRUNCATE ON app.attendance
FOR EACH STATEMENT EXECUTE FUNCTION studio_private.prevent_attendance_delete();

REVOKE ALL ON app.attendance FROM studio_agent;
GRANT SELECT, INSERT ON app.attendance TO studio_agent;
GRANT UPDATE (cancelled_at, cancelled_by_phone, cancelled_by_name, cancellation_reason)
  ON app.attendance TO studio_agent;
