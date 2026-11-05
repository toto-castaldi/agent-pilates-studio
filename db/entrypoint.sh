#!/bin/sh
set -eu

# PostgreSQL and its bootstrap can log SQL and values; only a fixed event is
# sent to Docker. The real entrypoint inherits no Docker log descriptor.
exec 3>&1
exec >/dev/null 2>&1
printf '%s\n' postgres_launch >&3
exec 3>&-
exec /usr/local/bin/docker-entrypoint.sh "$@"
