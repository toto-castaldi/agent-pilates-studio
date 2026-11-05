-- Context is private to the migration owner and the separately provisioned broker.
-- It is bound to the backend and transaction, never to a model-controlled GUC.
CREATE SCHEMA studio_private AUTHORIZATION studio_migrator;
REVOKE ALL ON SCHEMA studio_private FROM PUBLIC, studio_agent;
GRANT USAGE ON SCHEMA studio_private TO studio_broker;

CREATE TABLE studio_private.author_context (
  backend_pid integer NOT NULL,
  transaction_id bigint NOT NULL,
  sender text NOT NULL CHECK (sender ~ '^[0-9]+$'),
  profile_name text,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (backend_pid, transaction_id)
);
REVOKE ALL ON studio_private.author_context FROM PUBLIC, studio_agent;
GRANT SELECT, INSERT, DELETE ON studio_private.author_context TO studio_broker;

-- Durable replay markers contain only a digest; they outlive the signed-message
-- acceptance window even if the broker or gateway is restarted.
CREATE TABLE studio_private.consumed_messages (
  message_hash text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);
REVOKE ALL ON studio_private.consumed_messages FROM PUBLIC, studio_agent;
GRANT SELECT, INSERT, DELETE ON studio_private.consumed_messages TO studio_broker;

CREATE TABLE app.clients (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  first_name text NOT NULL CHECK (btrim(first_name) <> ''),
  last_name text NOT NULL CHECK (btrim(last_name) <> ''),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by_phone text NOT NULL,
  created_by_name text
);
CREATE UNIQUE INDEX clients_name_unique ON app.clients (lower(first_name), lower(last_name));

CREATE TABLE app.training_rules (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule_text text NOT NULL CHECK (btrim(rule_text) <> ''),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by_phone text NOT NULL,
  created_by_name text,
  deactivated_at timestamptz,
  deactivated_by_phone text,
  deactivated_by_name text,
  deactivation_reason text,
  CONSTRAINT training_rules_deactivation_consistent CHECK (
    (deactivated_at IS NULL AND deactivated_by_phone IS NULL AND deactivated_by_name IS NULL AND deactivation_reason IS NULL)
    OR (deactivated_at IS NOT NULL AND deactivated_by_phone IS NOT NULL AND deactivation_reason IS NOT NULL AND btrim(deactivation_reason) <> '')
  )
);

CREATE TABLE app.rule_slots (
  rule_id bigint NOT NULL REFERENCES app.training_rules(id),
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_time time NOT NULL,
  PRIMARY KEY (rule_id, weekday, start_time)
);

CREATE TABLE app.rule_clients (
  rule_id bigint NOT NULL REFERENCES app.training_rules(id),
  client_id bigint NOT NULL REFERENCES app.clients(id),
  PRIMARY KEY (rule_id, client_id)
);

CREATE FUNCTION studio_private.apply_author() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
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

CREATE FUNCTION studio_private.protect_client_author() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.created_by_phone IS DISTINCT FROM OLD.created_by_phone
     OR NEW.created_by_name IS DISTINCT FROM OLD.created_by_name
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Client creation attribution is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION studio_private.prevent_rule_delete() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'Training rules cannot be deleted' USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER clients_author BEFORE INSERT ON app.clients
FOR EACH ROW EXECUTE FUNCTION studio_private.apply_author();
CREATE TRIGGER clients_author_immutable BEFORE UPDATE ON app.clients
FOR EACH ROW EXECUTE FUNCTION studio_private.protect_client_author();
CREATE TRIGGER training_rules_author BEFORE INSERT OR UPDATE ON app.training_rules
FOR EACH ROW EXECUTE FUNCTION studio_private.apply_author();
CREATE TRIGGER training_rules_no_delete BEFORE DELETE ON app.training_rules
FOR EACH ROW EXECUTE FUNCTION studio_private.prevent_rule_delete();
CREATE TRIGGER training_rules_no_truncate BEFORE TRUNCATE ON app.training_rules
FOR EACH STATEMENT EXECUTE FUNCTION studio_private.prevent_rule_delete();

-- The initial migration grants DML on new app tables by default. Narrow rules
-- explicitly: the agent can deactivate, but cannot rewrite or delete them.
REVOKE ALL ON app.training_rules FROM studio_agent;
GRANT SELECT, INSERT ON app.training_rules TO studio_agent;
GRANT UPDATE (deactivated_at, deactivated_by_phone, deactivated_by_name, deactivation_reason)
  ON app.training_rules TO studio_agent;
