#!/usr/bin/env bash
# Scheduled hot backup of the production database (REQ-OPS-010).
# Installed by hand as ~/backup-agent-pilates.sh on the production host and
# started by the operator's crontab. It only runs `backup-hot` from the ops
# image of the release recorded in state/release, then rotates the scheduled
# hot backups older than 30 days. It never updates or restarts services.
#
# Production defaults are fixed; the PILATES_BACKUP_* overrides exist only for
# the tests with synthetic data and must not be set on the server.
set -uo pipefail

readonly ROOT=${PILATES_BACKUP_ROOT:-/opt/agent-pilates-prod}
readonly LOG=${PILATES_BACKUP_LOG:-$HOME/backup-agent-pilates.log}
readonly LOCK=${PILATES_BACKUP_LOCK:-$HOME/.backup-agent-pilates.lock}
readonly REGISTRY=ghcr.io/toto-castaldi/agent-pilates-studio
readonly CONTAINER_ROOT=/opt/agent-pilates-prod
readonly RETENTION_DAYS=30
readonly HOT_MARKER=hot-postgres-v1
readonly SCHEDULED_MARKER=scheduled-hot-v1
readonly NAME_PATTERN='^hot-([0-9]{8}T[0-9]{6}Z)-[0-9a-f]{12}-[A-Za-z0-9]{8}$'

usage() {
  printf 'Usage: %s\n' "${0##*/}"
  printf 'Runs the scheduled hot backup of the installed release and rotates scheduled backups older than %s days.\n' "$RETENTION_DAYS"
}

if [[ $# -eq 1 && ( $1 == --help || $1 == -h ) ]]; then
  usage
  exit 0
fi
if [[ $# -ne 0 ]]; then
  usage >&2
  exit 2
fi

umask 077

# Only fixed messages are written: never credentials, messages or phone numbers.
log() {
  local line
  line="$(date -u +%Y-%m-%dT%H:%M:%SZ) $*"
  printf '%s\n' "$line" >> "$LOG" 2>/dev/null || { printf 'Error: cannot write the log.\n' >&2; exit 1; }
  printf '%s\n' "$line" >&2
}
fail() { log "Error: $*"; exit 1; }

touch -- "$LOG" 2>/dev/null || { printf 'Error: cannot write the log.\n' >&2; exit 1; }

exec 9>>"$LOCK" 2>/dev/null || fail 'Cannot open the lock file.'
flock -n 9 || fail 'Another scheduled backup is running.'

log 'Scheduled hot backup started.'
[[ -d $ROOT && ! -L $ROOT && -d $ROOT/backups && ! -L $ROOT/backups ]] || fail 'Production is not installed.'
release_file=$ROOT/state/release
[[ -f $release_file && ! -L $release_file ]] || fail 'No installed release recorded.'
[[ $(grep -c '' "$release_file" 2>/dev/null) == 1 ]] || fail 'The recorded release is invalid.'
release=$(<"$release_file")
[[ $release =~ ^[0-9a-f]{40}$ ]] || fail 'The recorded release is invalid.'

rc=0
output=$(docker run --rm \
  --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock \
  --mount "type=bind,src=$ROOT,dst=$CONTAINER_ROOT" \
  "$REGISTRY/ops:$release" backup-hot "$release" 2>&1) || rc=$?
if (( rc != 0 )); then
  # Forward only the fixed "Error:" messages of the ops image.
  while IFS= read -r line; do
    [[ $line =~ ^Error:\ [A-Za-z0-9\ .,:\'/_-]+$ ]] && log "ops $line"
  done <<<"$output"
  fail "Hot backup failed with exit code $rc."
fi

completed=$(sed -n 's/^Hot PostgreSQL backup completed: //p' <<<"$output" | tail -n 1)
name=${completed##*/}
[[ $completed == "$CONTAINER_ROOT/backups/$name" && $name =~ $NAME_PATTERN ]] || fail 'The hot backup did not report its directory.'
backup=$ROOT/backups/$name
[[ -d $backup && ! -L $backup && -f $backup/COMPLETE && ! -L $backup/COMPLETE && ! -e $backup/INCOMPLETE ]] \
  || fail 'The new hot backup is not complete.'
[[ $(<"$backup/COMPLETE") == "$HOT_MARKER" ]] || fail 'The new hot backup is not complete.'
printf '%s\n' "$SCHEDULED_MARKER" > "$backup/SCHEDULED" 2>/dev/null || fail 'Could not mark the backup as scheduled.'
log "Hot backup completed: $name"

# Rotation: only complete scheduled hot backups older than the retention.
cutoff=$(date -u -d "$RETENTION_DAYS days ago" +%Y%m%dT%H%M%SZ 2>/dev/null) || fail 'Could not compute the retention cutoff.'
removed=0
for candidate in "$ROOT"/backups/hot-*; do
  name=${candidate##*/}
  [[ $name =~ $NAME_PATTERN ]] || continue
  stamp=${BASH_REMATCH[1]}
  [[ $stamp < $cutoff ]] || continue
  [[ -d $candidate && ! -L $candidate && ! -e $candidate/INCOMPLETE ]] || continue
  [[ -f $candidate/COMPLETE && ! -L $candidate/COMPLETE && $(<"$candidate/COMPLETE") == "$HOT_MARKER" ]] || continue
  [[ -f $candidate/SCHEDULED && ! -L $candidate/SCHEDULED && $(<"$candidate/SCHEDULED") == "$SCHEDULED_MARKER" ]] || continue
  rm -rf -- "$candidate" 2>/dev/null || fail "Could not remove the expired scheduled backup $name."
  log "Removed expired scheduled backup: $name"
  removed=$((removed + 1))
done
log "Scheduled hot backup finished; expired backups removed: $removed."
