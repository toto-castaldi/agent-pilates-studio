-- Application objects belong to the migration role, never to the agent.
CREATE SCHEMA app AUTHORIZATION studio_migrator;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO studio_agent;
ALTER DEFAULT PRIVILEGES FOR ROLE studio_migrator IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO studio_agent;
ALTER DEFAULT PRIVILEGES FOR ROLE studio_migrator IN SCHEMA app
  GRANT USAGE, SELECT ON SEQUENCES TO studio_agent;
