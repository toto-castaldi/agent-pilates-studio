BEGIN;

-- Operator-only recovery of the manager role (not ordinary registry management).
-- Chat still cannot revoke or renumber the manager. These functions are
-- executable only by the migration role; they are not granted to the broker
-- or the model and they are not a second enrollment path.
CREATE TABLE studio_private.manager_role_changes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operation text NOT NULL,
  teacher_id bigint NOT NULL REFERENCES studio_private.teachers(id),
  -- The manager identity before the change. Recovery must use this id, never
  -- whoever currently holds the previous phone.
  previous_teacher_id bigint NOT NULL REFERENCES studio_private.teachers(id),
  previous_phone text NOT NULL,
  next_phone text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reverses bigint UNIQUE REFERENCES studio_private.manager_role_changes(id),
  CHECK (
    (operation IN ('transfer', 'renumber') AND reverses IS NULL)
    OR (operation IN ('recover', 'compensate') AND reverses IS NOT NULL)
  )
);
REVOKE ALL ON studio_private.manager_role_changes FROM PUBLIC, studio_agent, studio_broker;
REVOKE ALL ON SEQUENCE studio_private.manager_role_changes_id_seq FROM PUBLIC, studio_agent, studio_broker;
CREATE TRIGGER manager_role_changes_immutable BEFORE UPDATE OR DELETE ON studio_private.manager_role_changes
FOR EACH STATEMENT EXECUTE FUNCTION studio_private.prevent_teacher_history_change();
CREATE TRIGGER manager_role_changes_no_truncate BEFORE TRUNCATE ON studio_private.manager_role_changes
FOR EACH STATEMENT EXECUTE FUNCTION studio_private.prevent_teacher_history_change();

ALTER TABLE studio_private.teacher_identity_changes
  DROP CONSTRAINT teacher_identity_changes_operation_check,
  ADD CONSTRAINT teacher_identity_changes_operation_check
  CHECK (operation IN ('bootstrap', 'enroll', 'complete', 'correct', 'change_phone', 'revoke', 'enable', 'operator_renumber'));

-- The chat path still rejects self-renumber. Only the migration role, through
-- the operator function, may record this distinct operation.
CREATE OR REPLACE FUNCTION studio_private.protect_teacher_identity() RETURNS trigger
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
  IF guard.operation = 'operator_renumber' THEN
    IF session_user <> 'studio_migrator' OR guard.actor_teacher_id IS DISTINCT FROM OLD.id
       OR ROW(NEW.first_name, NEW.last_name, NEW.access_enabled)
          IS DISTINCT FROM ROW(OLD.first_name, OLD.last_name, OLD.access_enabled)
       OR NEW.phone IS NULL OR NEW.phone = OLD.phone THEN
      RAISE EXCEPTION 'Invalid operator renumber' USING ERRCODE = '42501';
    END IF;
  ELSIF guard.operation = 'correct' THEN
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

CREATE FUNCTION studio_private.operator_manager_change(action text, current_phone text, next_phone text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  current_canonical text;
  next_canonical text;
  current_person studio_private.teachers%ROWTYPE;
  next_person studio_private.teachers%ROWTYPE;
BEGIN
  IF session_user <> 'studio_migrator' OR action NOT IN ('transfer', 'renumber') THEN
    RAISE EXCEPTION 'Operator manager change is required' USING ERRCODE = '42501';
  END IF;
  current_canonical := studio_private.normalize_identity_phone(current_phone);
  next_canonical := studio_private.normalize_identity_phone(next_phone);
  IF current_canonical = next_canonical THEN
    RAISE EXCEPTION 'Manager change has no valid transition' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO current_person FROM studio_private.teachers
   WHERE phone = current_canonical FOR UPDATE;
  IF NOT FOUND OR NOT current_person.access_enabled THEN
    RAISE EXCEPTION 'Enabled manager identity is required' USING ERRCODE = '42501';
  END IF;
  IF action = 'transfer' THEN
    SELECT * INTO next_person FROM studio_private.teachers
     WHERE phone = next_canonical FOR UPDATE;
    IF NOT FOUND OR NOT next_person.access_enabled OR next_person.id = current_person.id THEN
      RAISE EXCEPTION 'Enabled successor identity is required' USING ERRCODE = '42501';
    END IF;
    INSERT INTO studio_private.manager_role_changes
      (operation, teacher_id, previous_teacher_id, previous_phone, next_phone)
      VALUES ('transfer', next_person.id, current_person.id, current_canonical, next_canonical);
    RETURN next_canonical;
  END IF;
  IF EXISTS (SELECT 1 FROM studio_private.teachers WHERE phone = next_canonical) THEN
    RAISE EXCEPTION 'Manager phone is already assigned' USING ERRCODE = '23505';
  END IF;
  INSERT INTO studio_private.teacher_identity_writes
    VALUES (pg_backend_pid(), txid_current(), 'operator_renumber', current_person.id, current_person.id,
            ltrim(current_canonical, '+'), current_person.first_name || ' ' || current_person.last_name);
  UPDATE studio_private.teachers SET phone = next_canonical
   WHERE id = current_person.id RETURNING * INTO next_person;
  INSERT INTO studio_private.teacher_identity_changes
    (teacher_id, operation, actor_teacher_id, actor_phone, actor_name, before_state, after_state)
    VALUES (next_person.id, 'operator_renumber', current_person.id, ltrim(current_canonical, '+'),
            current_person.first_name || ' ' || current_person.last_name,
            studio_private.identity_state(current_person), studio_private.identity_state(next_person));
  INSERT INTO studio_private.manager_role_changes
    (operation, teacher_id, previous_teacher_id, previous_phone, next_phone)
    VALUES ('renumber', next_person.id, current_person.id, current_canonical, next_canonical);
  DELETE FROM studio_private.teacher_identity_writes
   WHERE backend_pid = pg_backend_pid() AND transaction_id = txid_current();
  RETURN next_canonical;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Manager phone is already assigned' USING ERRCODE = '23505';
END;
$$;

CREATE FUNCTION studio_private.operator_manager_recover()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  change studio_private.manager_role_changes%ROWTYPE;
  person studio_private.teachers%ROWTYPE;
  restored studio_private.teachers%ROWTYPE;
BEGIN
  IF session_user <> 'studio_migrator' THEN
    RAISE EXCEPTION 'Operator manager change is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO change FROM studio_private.manager_role_changes c
   WHERE c.operation IN ('transfer', 'renumber')
     AND NOT EXISTS (
       SELECT 1 FROM studio_private.manager_role_changes r
        WHERE r.reverses = c.id AND r.operation = 'recover'
          AND NOT EXISTS (SELECT 1 FROM studio_private.manager_role_changes k
                           WHERE k.reverses = r.id AND k.operation = 'compensate')
     )
   ORDER BY c.id DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No manager change to recover' USING ERRCODE = '02000';
  END IF;
  IF change.operation = 'transfer' THEN
    -- The previous manager is an identity, not the current holder of a number.
    SELECT * INTO person FROM studio_private.teachers WHERE id = change.previous_teacher_id FOR UPDATE;
    IF NOT FOUND OR NOT person.access_enabled OR person.phone IS DISTINCT FROM change.previous_phone
       OR NOT EXISTS (SELECT 1 FROM studio_private.teachers t
                       WHERE t.id = change.teacher_id AND t.phone = change.next_phone AND t.access_enabled) THEN
      RAISE EXCEPTION 'Manager recovery does not match the current identity' USING ERRCODE = '23514';
    END IF;
    INSERT INTO studio_private.manager_role_changes
      (operation, teacher_id, previous_teacher_id, previous_phone, next_phone, reverses)
      VALUES ('recover', person.id, change.previous_teacher_id, change.next_phone, change.previous_phone, change.id);
    RETURN change.previous_phone;
  END IF;
  SELECT * INTO person FROM studio_private.teachers WHERE id = change.teacher_id FOR UPDATE;
  IF NOT FOUND OR person.phone IS DISTINCT FROM change.next_phone OR NOT person.access_enabled THEN
    RAISE EXCEPTION 'Manager recovery does not match the current identity' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM studio_private.teachers WHERE phone = change.previous_phone) THEN
    RAISE EXCEPTION 'Manager phone is already assigned' USING ERRCODE = '23505';
  END IF;
  INSERT INTO studio_private.teacher_identity_writes
    VALUES (pg_backend_pid(), txid_current(), 'operator_renumber', person.id, person.id,
            ltrim(person.phone, '+'), person.first_name || ' ' || person.last_name);
  UPDATE studio_private.teachers SET phone = change.previous_phone
   WHERE id = person.id RETURNING * INTO restored;
  INSERT INTO studio_private.teacher_identity_changes
    (teacher_id, operation, actor_teacher_id, actor_phone, actor_name, before_state, after_state)
    VALUES (restored.id, 'operator_renumber', person.id, ltrim(person.phone, '+'),
            person.first_name || ' ' || person.last_name,
            studio_private.identity_state(person), studio_private.identity_state(restored));
  DELETE FROM studio_private.teacher_identity_writes
   WHERE backend_pid = pg_backend_pid() AND transaction_id = txid_current();
  INSERT INTO studio_private.manager_role_changes
    (operation, teacher_id, previous_teacher_id, previous_phone, next_phone, reverses)
    VALUES ('recover', restored.id, change.previous_teacher_id, change.next_phone, change.previous_phone, change.id);
  RETURN change.previous_phone;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Manager phone is already assigned' USING ERRCODE = '23505';
END;
$$;

-- Undoes only the latest recovery. It must not recover an older change.
CREATE FUNCTION studio_private.operator_manager_compensate()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  recovery studio_private.manager_role_changes%ROWTYPE;
  change studio_private.manager_role_changes%ROWTYPE;
  person studio_private.teachers%ROWTYPE;
  restored studio_private.teachers%ROWTYPE;
BEGIN
  IF session_user <> 'studio_migrator' THEN
    RAISE EXCEPTION 'Operator manager change is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO recovery FROM studio_private.manager_role_changes r
   WHERE r.operation = 'recover'
     AND NOT EXISTS (SELECT 1 FROM studio_private.manager_role_changes k WHERE k.reverses = r.id)
   ORDER BY r.id DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No manager recovery to compensate' USING ERRCODE = '02000';
  END IF;
  SELECT * INTO change FROM studio_private.manager_role_changes WHERE id = recovery.reverses FOR UPDATE;
  IF NOT FOUND OR change.operation NOT IN ('transfer', 'renumber') THEN
    RAISE EXCEPTION 'Manager recovery does not match the current identity' USING ERRCODE = '23514';
  END IF;
  IF change.operation = 'renumber' THEN
    SELECT * INTO person FROM studio_private.teachers WHERE id = change.teacher_id FOR UPDATE;
    IF NOT FOUND OR NOT person.access_enabled OR person.phone IS DISTINCT FROM change.previous_phone
       OR EXISTS (SELECT 1 FROM studio_private.teachers WHERE phone = change.next_phone) THEN
      RAISE EXCEPTION 'Manager recovery does not match the current identity' USING ERRCODE = '23514';
    END IF;
    INSERT INTO studio_private.teacher_identity_writes
      VALUES (pg_backend_pid(), txid_current(), 'operator_renumber', person.id, person.id,
              ltrim(person.phone, '+'), person.first_name || ' ' || person.last_name);
    UPDATE studio_private.teachers SET phone = change.next_phone
     WHERE id = person.id RETURNING * INTO restored;
    INSERT INTO studio_private.teacher_identity_changes
      (teacher_id, operation, actor_teacher_id, actor_phone, actor_name, before_state, after_state)
      VALUES (restored.id, 'operator_renumber', person.id, ltrim(person.phone, '+'),
              person.first_name || ' ' || person.last_name,
              studio_private.identity_state(person), studio_private.identity_state(restored));
    DELETE FROM studio_private.teacher_identity_writes
     WHERE backend_pid = pg_backend_pid() AND transaction_id = txid_current();
  ELSE
    SELECT * INTO person FROM studio_private.teachers WHERE id = change.previous_teacher_id FOR UPDATE;
    IF NOT FOUND OR person.phone IS DISTINCT FROM change.previous_phone
       OR NOT EXISTS (SELECT 1 FROM studio_private.teachers t
                       WHERE t.id = change.teacher_id AND t.phone = change.next_phone) THEN
      RAISE EXCEPTION 'Manager recovery does not match the current identity' USING ERRCODE = '23514';
    END IF;
  END IF;
  INSERT INTO studio_private.manager_role_changes
    (operation, teacher_id, previous_teacher_id, previous_phone, next_phone, reverses)
    VALUES ('compensate', change.teacher_id, change.previous_teacher_id,
            recovery.next_phone, recovery.previous_phone, recovery.id);
  RETURN recovery.previous_phone;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Manager phone is already assigned' USING ERRCODE = '23505';
END;
$$;

REVOKE ALL ON FUNCTION studio_private.operator_manager_change(text, text, text),
  studio_private.operator_manager_recover(), studio_private.operator_manager_compensate()
  FROM PUBLIC, studio_agent, studio_broker;

-- Redaction must also cover phones recorded only in the operator audit.
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
