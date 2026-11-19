-- Frozen pre-reduction SOUL query; independent regression oracle (TEC-046),
-- extended with the valid planned participations of US-019.
WITH days AS (
  SELECT $1::text::date + n AS day FROM generate_series(0, $2::text::date - $1::text::date) AS n
), lessons AS (
  SELECT d.day AS lesson_date, s.start_time
  FROM days d
  JOIN app.rule_slots s ON s.weekday = extract(isodow FROM d.day)
  JOIN app.training_rules r ON r.id = s.rule_id
  WHERE r.created_at < (d.day + s.start_time) AT TIME ZONE 'Europe/Rome'
    AND (r.deactivated_at IS NULL OR r.deactivated_at > (d.day + s.start_time) AT TIME ZONE 'Europe/Rome')
    AND ((d.day + s.start_time) AT TIME ZONE 'Europe/Rome') AT TIME ZONE 'Europe/Rome' = d.day + s.start_time
  UNION
  SELECT lesson_date, start_time FROM app.attendance
  WHERE cancelled_at IS NULL AND lesson_date BETWEEN $1::text::date AND $2::text::date
  UNION
  SELECT lesson_date, start_time FROM app.teacher_assignments
  WHERE cancelled_at IS NULL AND lesson_date BETWEEN $1::text::date AND $2::text::date
  UNION
  SELECT lesson_date, start_time FROM app.planned_participations
  WHERE cancelled_at IS NULL AND lesson_date BETWEEN $1::text::date AND $2::text::date
), teaching AS (
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
  FROM lessons l
)
SELECT t.lesson_date, t.start_time, t.expected_id, t.assigned_id,
  e.first_name || ' ' || e.last_name AS expected_teacher,
  a.first_name || ' ' || a.last_name AS assigned_teacher
FROM teaching t
LEFT JOIN app.teachers e ON e.id = t.expected_id
LEFT JOIN app.teachers a ON a.id = t.assigned_id
ORDER BY t.lesson_date, t.start_time
