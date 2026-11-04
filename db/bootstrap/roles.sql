\getenv migrator_password MIGRATOR_PASSWORD
\getenv agent_password AGENT_PASSWORD

SELECT 'CREATE ROLE studio_migrator LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'studio_migrator') \gexec
SELECT 'CREATE ROLE studio_agent LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'studio_agent') \gexec
SELECT format('ALTER ROLE studio_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD %L', :'migrator_password') \gexec
SELECT format('ALTER ROLE studio_agent LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD %L', :'agent_password') \gexec

SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database()) \gexec
SELECT format('GRANT CONNECT, CREATE ON DATABASE %I TO studio_migrator', current_database()) \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO studio_agent', current_database()) \gexec
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO studio_migrator;
ALTER ROLE studio_agent SET search_path = app, pg_catalog;
ALTER DEFAULT PRIVILEGES FOR ROLE studio_migrator REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
