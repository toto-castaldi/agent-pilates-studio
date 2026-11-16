BEGIN;

-- Read-only reconstructions of the studio glossary (ADR-004). They compute data
-- only: confirmations, clarifications and summaries stay in SOUL.md and the
-- skills. Invoker rights (the default) keep the caller's own privileges, so the
-- agent cannot reach studio_private through them; without SET clauses the
-- planner can inline them into the calling query. Both bounds are inclusive.

-- Existing lessons: a client expected by a rule valid at the lesson start, a
-- valid attendance row or a valid teacher assignment, deduplicated by date and
-- start time. Nonexistent local times of the spring transition are excluded;
-- the repeated autumn hour counts once, as in the database constraints.
CREATE FUNCTION app.existing_lessons(first_day date, last_day date)
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
  )
  SELECT l.lesson_date, l.start_time FROM lessons l ORDER BY l.lesson_date, l.start_time
$$;

-- Expected clients: the clients of the rules inserted before the lesson start
-- and not deactivated by then, with a slot on the same ISO weekday and time.
-- Overlapping rules of the same client yield one row per lesson.
CREATE FUNCTION app.expected_clients(first_day date, last_day date)
RETURNS TABLE (lesson_date date, start_time time, client_id bigint)
LANGUAGE sql STABLE
AS $$
  WITH days AS (
    SELECT first_day + n AS day FROM generate_series(0, last_day - first_day) AS n
  )
  SELECT DISTINCT d.day, s.start_time, c.client_id
    FROM days d
    JOIN app.rule_slots s ON s.weekday = extract(isodow FROM d.day)
    JOIN app.training_rules r ON r.id = s.rule_id
    JOIN app.rule_clients c ON c.rule_id = r.id
   WHERE r.created_at < (d.day + s.start_time) AT TIME ZONE 'Europe/Rome'
     AND (r.deactivated_at IS NULL OR r.deactivated_at > (d.day + s.start_time) AT TIME ZONE 'Europe/Rome')
     AND ((d.day + s.start_time) AT TIME ZONE 'Europe/Rome') AT TIME ZONE 'Europe/Rome' = d.day + s.start_time
   ORDER BY 1, 2, 3
$$;

-- Teacher of each existing lesson: the expected teacher from the rule valid at
-- the lesson start (not the current is_active flag), the valid assignment, the
-- resulting teacher (assignment first) and the names. No author or phone data.
CREATE FUNCTION app.lesson_teachers(first_day date, last_day date)
RETURNS TABLE (lesson_date date, start_time time, expected_id bigint, assigned_id bigint, teacher_id bigint,
               expected_teacher text, assigned_teacher text)
LANGUAGE sql STABLE
AS $$
  WITH teaching AS (
    SELECT l.lesson_date, l.start_time,
      (SELECT r.teacher_id FROM app.teacher_rules r
         JOIN app.teacher_rule_intervals i ON i.rule_id = r.id
        WHERE i.weekday = extract(isodow FROM l.lesson_date)
          AND l.start_time BETWEEN i.start_time_min AND i.start_time_max
          AND r.created_at < (l.lesson_date + l.start_time) AT TIME ZONE 'Europe/Rome'
          AND (r.deactivated_at IS NULL
            OR r.deactivated_at > (l.lesson_date + l.start_time) AT TIME ZONE 'Europe/Rome')) AS expected_id,
      (SELECT a.teacher_id FROM app.teacher_assignments a
        WHERE a.lesson_date = l.lesson_date AND a.start_time = l.start_time
          AND a.cancelled_at IS NULL) AS assigned_id
      FROM app.existing_lessons(first_day, last_day) l
  )
  SELECT t.lesson_date, t.start_time, t.expected_id, t.assigned_id, COALESCE(t.assigned_id, t.expected_id),
         e.first_name || ' ' || e.last_name, a.first_name || ' ' || a.last_name
    FROM teaching t
    LEFT JOIN app.teachers e ON e.id = t.expected_id
    LEFT JOIN app.teachers a ON a.id = t.assigned_id
   ORDER BY t.lesson_date, t.start_time
$$;

REVOKE ALL ON FUNCTION app.existing_lessons(date, date), app.expected_clients(date, date),
  app.lesson_teachers(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.existing_lessons(date, date), app.expected_clients(date, date),
  app.lesson_teachers(date, date) TO studio_agent;

COMMIT;
