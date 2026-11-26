\getenv migrator_password MIGRATOR_PASSWORD
\getenv agent_password AGENT_PASSWORD
\getenv broker_password BROKER_PASSWORD
\getenv grafana_password GRAFANA_PASSWORD

SELECT 'CREATE ROLE studio_migrator LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'studio_migrator') \gexec
SELECT 'CREATE ROLE studio_agent LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'studio_agent') \gexec
SELECT 'CREATE ROLE studio_broker NOLOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'studio_broker') \gexec
SELECT 'CREATE ROLE studio_grafana NOLOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'studio_grafana') \gexec
SELECT format('ALTER ROLE studio_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD %L', :'migrator_password') \gexec
SELECT format('ALTER ROLE studio_agent LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD %L', :'agent_password') \gexec
SELECT format('ALTER ROLE studio_broker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD %L', :'broker_password') \gexec
-- Grafana reads only the studio_metrics views (US-020); read-only by default as
-- a second barrier after the privileges.
SELECT format('ALTER ROLE studio_grafana LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT 10 PASSWORD %L', :'grafana_password') \gexec
ALTER ROLE studio_grafana SET default_transaction_read_only = on;
ALTER ROLE studio_grafana SET search_path = studio_metrics, pg_catalog;

SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database()) \gexec
SELECT format('GRANT CONNECT, CREATE ON DATABASE %I TO studio_migrator', current_database()) \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO studio_agent, studio_broker, studio_grafana', current_database()) \gexec
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO studio_migrator;
ALTER ROLE studio_agent SET search_path = app, pg_catalog;
ALTER DEFAULT PRIVILEGES FOR ROLE studio_migrator REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
