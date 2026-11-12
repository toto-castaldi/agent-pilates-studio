BEGIN;

-- The mapping itself remains in private external configuration. Only the
-- resolved teacher identifier lives in the short-lived, transaction-bound
-- author context; backups already exclude that table's data.
ALTER TABLE studio_private.author_context
  ADD COLUMN sender_teacher_id bigint REFERENCES app.teachers(id);

-- The broker may resolve exactly a configured name, but cannot read the
-- teachers table or its authors. It invokes this only after verifying a receipt.
CREATE FUNCTION studio_private.configured_teacher_id(first text, last text) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $$
  SELECT id FROM app.teachers
   WHERE lower(first_name) = lower(first) AND lower(last_name) = lower(last)
$$;
REVOKE ALL ON FUNCTION studio_private.configured_teacher_id(text, text) FROM PUBLIC, studio_agent;
GRANT EXECUTE ON FUNCTION studio_private.configured_teacher_id(text, text) TO studio_broker;

-- No arguments, GUC or model-provided identity can select a different sender.
-- A valid context with no linked or existing teacher returns NULL; an absent
-- or expired context fails closed through require_author_context().
CREATE FUNCTION app.current_sender_teacher_id() RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  author studio_private.author_context%ROWTYPE;
BEGIN
  author := studio_private.require_author_context();
  RETURN author.sender_teacher_id;
END;
$$;
REVOKE ALL ON FUNCTION app.current_sender_teacher_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.current_sender_teacher_id() TO studio_agent;

COMMIT;
