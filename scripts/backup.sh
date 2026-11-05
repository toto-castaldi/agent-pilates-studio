#!/usr/bin/env bash
# Snapshot only while the operator has quiesced all writers and stopped Hermes.
set -euo pipefail
source "$(dirname -- "$0")/operations-common.sh"

[[ $# -eq 2 ]] || fail 'Usage: bash scripts/backup.sh <compose-project> <new-backup-directory>'
PROJECT=$1
validate_project "$PROJECT"
destination=$2
[[ -n "$destination" ]] || fail 'A new backup directory is required.'

hermes_must_be_stopped
postgres=$(compose ps -q --status running postgres)
[[ -n "$postgres" && "$postgres" != *$'\n'* ]] || fail 'Exactly one running PostgreSQL container is required.'
[[ $(docker inspect --format '{{.State.Health.Status}}' "$postgres") == healthy ]] || fail 'PostgreSQL is not healthy.'
volume=$(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT" --filter 'label=com.docker.compose.volume=hermes_data')
[[ -n "$volume" && "$volume" != *$'\n'* ]] || fail 'Exactly one Hermes volume for this project is required.'

umask 077
mkdir -m 700 -- "$destination" || fail 'The backup directory must be new and its parent must exist.'
complete=0
cleanup() {
  local rc=$?
  if (( rc != 0 && ! complete )); then
    printf 'Backup incomplete; the private directory must not be used for restore.\n' >&2
  fi
  exit "$rc"
}
trap cleanup EXIT

if ! compose exec -T --interactive=false postgres pg_dump --no-password -U studio_admin -d studio -Fc --exclude-table-data=studio_private.author_context > "$destination/postgres.dump" 2>/dev/null; then
  fail 'PostgreSQL backup failed.'
fi
if ! docker run --rm --network none --read-only --cap-drop ALL --cap-add DAC_OVERRIDE \
  --mount "type=volume,src=$volume,dst=/data,readonly" --entrypoint tar "$POSTGRES_IMAGE" \
  -C /data -cf - . > "$destination/hermes.tar" 2>/dev/null; then
  fail 'Hermes volume backup failed.'
fi
hermes_must_be_stopped
(cd -- "$destination" && sha256sum postgres.dump hermes.tar > SHA256SUMS)
printf '1\n' > "$destination/COMPLETE"
complete=1
printf 'Backup completed. Protect it as sensitive data and verify a restore.\n'
