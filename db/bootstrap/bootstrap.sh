#!/bin/sh
set -eu

export PGHOST=postgres PGPORT=5432 PGDATABASE=studio PGUSER=studio_admin PGCONNECT_TIMEOUT=5

# Bounded wait for the final server over TCP; no psql output reaches the logs.
attempt=0
until pg_isready -q -t 2 >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 15 ]; then
    echo "Database role setup failed." >&2
    exit 1
  fi
  sleep 1
done

export PGPASSWORD="$(cat /run/secrets/db_admin)"
export MIGRATOR_PASSWORD="$(cat /run/secrets/db_migrator)"
export AGENT_PASSWORD="$(cat /run/secrets/db_agent)"
export BROKER_PASSWORD="$(cat /run/secrets/db_broker)"

if ! psql -X --no-psqlrc --set ON_ERROR_STOP=1 --file /scripts/roles.sql >/dev/null 2>&1; then
  echo "Database role setup failed." >&2
  exit 1
fi
unset PGPASSWORD MIGRATOR_PASSWORD AGENT_PASSWORD BROKER_PASSWORD
echo "Database roles configured."
