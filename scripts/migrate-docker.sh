#!/bin/sh
set -eu

# Host networking is intentional: PostgreSQL is published only on loopback.
# This command is for Linux Docker hosts, not Docker Desktop.
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
secrets_dir=${SECRETS_DIR:-"$root/.local/secrets"}
case "$secrets_dir" in /*) ;; *) secrets_dir="$(pwd)/$secrets_dir" ;; esac
port=${POSTGRES_PORT:-55432}
case "$port" in ''|*[!0-9]*) echo 'Invalid POSTGRES_PORT.' >&2; exit 1 ;; esac
if [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
  echo 'Invalid POSTGRES_PORT.' >&2
  exit 1
fi
case "$root:$secrets_dir" in *','*) echo 'Paths containing commas are not supported.' >&2; exit 1 ;; esac
if [ ! -f "$secrets_dir/db-migrator" ] || [ ! -s "$secrets_dir/db-migrator" ]; then
  echo 'Migration secret is missing or empty.' >&2
  exit 1
fi
if [ -n "$(find "$secrets_dir/db-migrator" -maxdepth 0 -perm /077 -print)" ]; then
  echo 'Migration secret has insecure permissions.' >&2
  exit 1
fi

# Install dependencies before mounting the migration secret. Only whitelisted
# files enter the build context; .env and .local are excluded by .dockerignore.
image_file=$(mktemp)
trap 'rm -f "$image_file"' EXIT HUP INT TERM
docker build --file "$root/scripts/migrator.Dockerfile" --iidfile "$image_file" "$root"
image=$(cat "$image_file")
docker run --rm --network host \
  --mount "type=bind,src=$secrets_dir/db-migrator,dst=/run/secrets/db-migrator,readonly" \
  --env "POSTGRES_PORT=$port" --env SECRETS_DIR=/run/secrets "$image"
