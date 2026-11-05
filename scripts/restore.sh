#!/usr/bin/env bash
# Restore trusted backups only into a new, isolated Compose project.
set -euo pipefail
source "$(dirname -- "$0")/operations-common.sh"

[[ $# -eq 2 ]] || fail 'Usage: bash scripts/restore.sh <new-compose-project> <backup-directory>'
PROJECT=$1
validate_project "$PROJECT"
backup=$2
[[ -d "$backup" && ! -L "$backup" ]] || fail 'Backup directory is missing or a symlink.'
backup=$(cd -- "$backup" && pwd -P)
for file in COMPLETE SHA256SUMS postgres.dump hermes.tar; do
  [[ -f "$backup/$file" && ! -L "$backup/$file" ]] || fail 'Backup is incomplete or contains symlinks.'
done
[[ $(<"$backup/COMPLETE") == 1 ]] || fail 'Backup completion marker is invalid.'
[[ $(wc -l < "$backup/SHA256SUMS") -eq 2 ]] || fail 'Backup manifest is invalid.'
LC_ALL=C grep -Eq '^[0-9a-f]{64}  postgres[.]dump$' "$backup/SHA256SUMS" || fail 'Backup manifest is invalid.'
LC_ALL=C grep -Eq '^[0-9a-f]{64}  hermes[.]tar$' "$backup/SHA256SUMS" || fail 'Backup manifest is invalid.'
(cd -- "$backup" && sha256sum --check --status SHA256SUMS) || fail 'Backup checksum verification failed.'

case "${SECRETS_DIR:-}" in /*) ;; *) fail 'Set SECRETS_DIR to an absolute private directory.' ;; esac
[[ -d "$SECRETS_DIR" && ! -L "$SECRETS_DIR" ]] || fail 'Secrets directory is invalid.'
[[ -z $(find "$SECRETS_DIR" -maxdepth 0 -perm /077 -print) ]] || fail 'Secrets directory has insecure permissions.'
for name in db-admin db-migrator db-agent db-broker; do
  file="$SECRETS_DIR/$name"
  [[ -f "$file" && ! -L "$file" && -s "$file" ]] || fail 'A database secret is missing or invalid.'
  [[ -z $(find "$file" -maxdepth 0 -perm /077 -print) ]] || fail 'A database secret has insecure permissions.'
done

[[ -z $(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT") ]] || fail 'Target project has containers.'
[[ -z $(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT") ]] || fail 'Target project has volumes.'
[[ -z $(docker network ls -q --filter "label=com.docker.compose.project=$PROJECT") ]] || fail 'Target project has networks.'
for volume in "${PROJECT}_postgres_data" "${PROJECT}_hermes_data"; do
  if docker volume inspect "$volume" >/dev/null 2>&1; then fail 'A target volume name already exists.'; fi
done
if docker network inspect "${PROJECT}_default" >/dev/null 2>&1; then fail 'The target network name already exists.'; fi

# Reject damaged archives before creating any target resources.
if ! docker run --rm -i --network none --read-only --cap-drop ALL --entrypoint pg_restore \
  "$POSTGRES_IMAGE" --list < "$backup/postgres.dump" >/dev/null 2>&1; then
  fail 'PostgreSQL archive is invalid.'
fi
if ! docker run --rm -i --network none --read-only --cap-drop ALL --entrypoint tar \
  "$POSTGRES_IMAGE" -tf - < "$backup/hermes.tar" >/dev/null 2>&1; then
  fail 'Hermes archive is invalid.'
fi

# A new PostgreSQL listens on an ephemeral loopback port. Hermes is never started.
export POSTGRES_PORT=0 WHATSAPP_WEBHOOK_PORT=0
started=1
complete=0
cleanup() {
  local rc=$?
  if (( rc != 0 && started && ! complete )); then
    printf 'Restore incomplete; the new project resources were retained for inspection.\n' >&2
  fi
  exit "$rc"
}
trap cleanup EXIT
compose up -d --wait postgres
compose run --rm -T --interactive=false db-bootstrap
if ! compose exec -T postgres pg_restore --exit-on-error --no-password -U studio_admin -d studio < "$backup/postgres.dump" >/dev/null 2>&1; then
  fail 'PostgreSQL restore failed.'
fi
volume="${PROJECT}_hermes_data"
docker volume create --label "com.docker.compose.project=$PROJECT" --label 'com.docker.compose.volume=hermes_data' "$volume" >/dev/null
if ! docker run --rm -i --network none --read-only --cap-drop ALL --cap-add DAC_OVERRIDE --cap-add FOWNER --cap-add CHOWN \
  --security-opt no-new-privileges --mount "type=volume,src=$volume,dst=/data" --entrypoint tar \
  "$POSTGRES_IMAGE" -C /data -xf - < "$backup/hermes.tar" >/dev/null 2>&1; then
  fail 'Hermes volume restore failed.'
fi
complete=1
printf 'Restore created in a new project. Hermes remains stopped; verify data before any cutover.\n'
