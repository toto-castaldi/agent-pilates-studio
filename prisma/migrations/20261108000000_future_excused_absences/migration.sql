-- Allow announced, excused absences before the lesson while preserving authorship
-- and every existing attendance invariant.
CREATE OR REPLACE FUNCTION studio_private.apply_attendance_author() RETURNS trigger
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
