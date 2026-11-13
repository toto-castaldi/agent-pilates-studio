-- Trusted context policy, not a model argument and not a new identity source.
ALTER TABLE studio_private.author_context ADD COLUMN management_only_enrollment boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION studio_private.insert_legacy_teacher() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  person studio_private.teachers%ROWTYPE;
  author studio_private.author_context%ROWTYPE;
BEGIN
  author := studio_private.require_author_context();
  IF author.management_only_enrollment THEN
    RAISE EXCEPTION 'Teacher enrollment requires guided management' USING ERRCODE = '42501';
  END IF;
  IF NEW.id IS NULL THEN
    INSERT INTO studio_private.teachers (first_name,last_name)
      VALUES (NEW.first_name,NEW.last_name) RETURNING * INTO person;
  ELSE
    INSERT INTO studio_private.teachers (id,first_name,last_name) OVERRIDING SYSTEM VALUE
      VALUES (NEW.id,NEW.first_name,NEW.last_name) RETURNING * INTO person;
  END IF;
  NEW.id := person.id;
  NEW.created_at := person.created_at;
  NEW.created_by_phone := person.created_by_phone;
  NEW.created_by_name := person.created_by_name;
  RETURN NEW;
END;
$$;
-- Private flow state is not a second identity registry. Restart expires confirmations.
CREATE TABLE studio_private.management_sessions (
  sender_hash text PRIMARY KEY CHECK (sender_hash ~ '^[a-f0-9]{64}$'),
  state text NOT NULL CHECK (octet_length(state) <= 16384)
);
REVOKE ALL ON studio_private.management_sessions FROM PUBLIC, studio_agent;
GRANT SELECT, INSERT, UPDATE, DELETE ON studio_private.management_sessions TO studio_broker;
-- Narrow bootstrap preview: no person enumeration or phones for an incomplete manager.
CREATE FUNCTION studio_private.preview_manager_bootstrap(sender text, manager_phone text, first_name text, last_name text)
RETURNS TABLE (id bigint, identity_revision bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF session_user <> 'studio_broker'
     OR studio_private.identity_sender_phone(sender) <> studio_private.normalize_identity_phone(manager_phone)
     OR EXISTS (SELECT FROM studio_private.teachers t WHERE t.phone = studio_private.identity_sender_phone(sender)) THEN
    RAISE EXCEPTION 'Trusted bootstrap proof is required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT t.id, t.identity_revision FROM studio_private.teachers t
    WHERE lower(t.first_name) = lower($3) AND lower(t.last_name) = lower($4)
      AND t.legacy_identity AND t.phone IS NULL;
END;
$$;
REVOKE ALL ON FUNCTION studio_private.preview_manager_bootstrap(text,text,text,text) FROM PUBLIC, studio_agent;
GRANT EXECUTE ON FUNCTION studio_private.preview_manager_bootstrap(text,text,text,text) TO studio_broker;
