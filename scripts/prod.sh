#!/usr/bin/env bash
# Manual production operations, run from the ops image of the chosen commit.
# Nothing here starts on its own: the operator launches every command.
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/operations-common.sh"

ROOT_DIR=${PILATES_HOME:-/opt/agent-pilates-prod}
PROJECT=${PILATES_PROJECT:-agent-pilates-prod}
REGISTRY=${PILATES_REGISTRY:-ghcr.io/toto-castaldi/agent-pilates-studio}
SCRIPTS=$(dirname -- "${BASH_SOURCE[0]}")
validate_project "$PROJECT"

readonly INTERNAL_SECRETS=(db-admin db-migrator db-agent db-broker bridge-token)
readonly EXTERNAL_SECRETS=(openrouter-key whatsapp-access-token whatsapp-app-secret whatsapp-verify-token whatsapp-allowed-users whatsapp-home-channel whatsapp-phone-number-id whatsapp-teacher-links)

usage() { fail 'Usage: prod.sh init | install <commit> | update <commit> | backup-hot <commit> | rollback <backup-directory> <commit>'; }
step() { printf '%s\n' "$*"; }
quiet() { "$@" >/dev/null 2>&1; }
# The backup and restore scripts report failures with fixed "Error:" messages;
# forward only those, never the output of the tools they run.
checked() {
  local output rc=0
  output=$("$@" 2>&1) || rc=$?
  (( rc == 0 )) || grep '^Error: ' <<<"$output" >&2 || true
  return "$rc"
}

# The compose file and the images must come from the same commit.
require_release() {
  [[ $1 =~ ^[0-9a-f]{40}$ ]] || fail 'An explicit full commit is required.'
  [[ $1 == "${PILATES_RELEASE:-}" ]] || fail 'Run the ops image built from this same commit.'
}

require_docker() {
  local version
  version=$(docker version --format '{{.Server.Version}}' 2>/dev/null) || fail 'Docker is not reachable.'
  (( ${version%%.*} >= 29 )) || fail 'Docker 29 or later is required.'
}

load_settings() {
  local file="$ROOT_DIR/prod.env" line key value
  [[ -f $file && ! -L $file ]] || fail 'Configuration is missing: run init.'
  while IFS= read -r line || [[ -n $line ]]; do
    [[ -z $line || $line == \#* ]] && continue
    key=${line%%=*}; value=${line#*=}
    case $key in
      POSTGRES_PORT|WHATSAPP_WEBHOOK_PORT|WHATSAPP_WEBHOOK_PATH|PILATES_MODEL|PILATES_IDLE_COMPACT_SECONDS) export "$key=$value" ;;
      *) fail 'Unsupported key in prod.env: credentials belong in the secrets directory.' ;;
    esac
  done < "$file"
  [[ ${POSTGRES_PORT:-} =~ ^[0-9]+$ && ${WHATSAPP_WEBHOOK_PORT:-} =~ ^[0-9]+$ ]] || fail 'Ports are not configured.'
  export SECRETS_DIR="$ROOT_DIR/secrets"
  if [[ -f $ROOT_DIR/state/volume-prefix ]]; then
    PILATES_VOLUME_PREFIX=$(<"$ROOT_DIR/state/volume-prefix")
    export PILATES_VOLUME_PREFIX
  fi
}

use_release() {
  export PILATES_HERMES_IMAGE="$REGISTRY/hermes:$1" PILATES_POSTGRES_IMAGE="$REGISTRY/postgres:$1"
  MIGRATOR_IMAGE="$REGISTRY/migrator:$1"
}

# Upgrades from earlier releases have no mapping file. Create only the empty
# default, without replacing an existing file or following a dangling symlink.
ensure_teacher_links() {
  local file="$SECRETS_DIR/whatsapp-teacher-links"
  [[ -e $file || -L $file ]] && return 0
  (umask 077; set -o noclobber; printf '[]\n' > "$file") || fail 'Could not prepare teacher links.'
}

check_secrets() {
  local name file
  [[ -z $(find "$SECRETS_DIR" -maxdepth 0 -perm /077 -print) ]] || fail 'Secrets directory has insecure permissions.'
  for name in "${INTERNAL_SECRETS[@]}" "${EXTERNAL_SECRETS[@]}"; do
    file="$SECRETS_DIR/$name"
    [[ -f $file && ! -L $file && -s $file ]] || fail "Secret is missing or empty: $name."
    [[ -z $(find "$file" -maxdepth 0 -perm /077 -print) ]] || fail "Secret has insecure permissions: $name."
  done
}

pull_images() {
  step 'Pulling images'
  quiet compose --profile tools pull postgres db-bootstrap author-broker hermes || fail 'Image pull failed.'
  quiet docker pull "$MIGRATOR_IMAGE" || fail 'Image pull failed.'
}

stop_writers() {
  # SIGKILL avoids a shutdown notice on the WhatsApp home channel.
  quiet compose kill -s SIGKILL hermes || true
  quiet compose stop author-broker || true
}

migrate() {
  quiet docker run --rm --network host \
    --mount "type=bind,src=$SECRETS_DIR/db-migrator,dst=/run/secrets/db-migrator,readonly" \
    --env "POSTGRES_PORT=$POSTGRES_PORT" --env SECRETS_DIR=/run/secrets "$MIGRATOR_IMAGE"
}

start_stack() {
  step 'Starting PostgreSQL'
  quiet compose up -d --no-build --wait --wait-timeout 180 postgres || fail 'PostgreSQL did not become healthy.'
  quiet compose run --rm -T --interactive=false db-bootstrap || fail 'Database bootstrap failed.'
  step 'Applying migrations'
  migrate || fail 'Migrations failed.'
  step 'Starting broker and gateway'
  quiet compose up -d --no-build --no-deps --force-recreate --wait --wait-timeout 180 author-broker || fail 'Broker did not become healthy.'
  quiet compose up -d --no-build --no-deps --force-recreate --wait --wait-timeout 180 hermes || fail 'Gateway did not become healthy.'
}

record_release() { printf '%s\n' "$1" > "$ROOT_DIR/state/release.new"; mv "$ROOT_DIR/state/release.new" "$ROOT_DIR/state/release"; }

# Files created as root inside this container must stay manageable by the
# operator who owns the mounted directory.
restore_ownership() {
  [[ -d $ROOT_DIR ]] && chown -R "$(stat -c %u:%g "$ROOT_DIR")" "$ROOT_DIR" 2>/dev/null || true
}

active=0
hot_backup=''
on_exit() {
  local rc=$? owner
  if (( rc != 0 && active )); then
    stop_writers
    printf 'Operation failed: gateway and broker are stopped and no volume was removed.\n' >&2
  fi
  if [[ $command == backup-hot ]]; then
    if [[ -n $hot_backup && -d $hot_backup && ! -L $hot_backup ]]; then
      # Only the newly created directory is changed; never touch the running stack.
      if (( rc != 0 )); then
        if [[ -f $hot_backup/COMPLETE && ! -L $hot_backup/COMPLETE ]]; then
          quiet mv -- "$hot_backup/COMPLETE" "$hot_backup/INCOMPLETE" || quiet rm -f -- "$hot_backup/COMPLETE" || true
        fi
        printf 'Backup incomplete; do not use the new hot backup directory.\n' >&2
      fi
      owner=$(stat -c %u:%g "$ROOT_DIR" 2>/dev/null) && quiet chown -R "$owner" "$hot_backup" || true
    fi
  else
    restore_ownership
  fi
  exit "$rc"
}

command=${1:-}
case $command in
  init) [[ $# -eq 1 ]] || usage ;;
  install|update|backup-hot) [[ $# -eq 2 ]] || usage; require_release "$2" ;;
  rollback) [[ $# -eq 3 ]] || usage; require_release "$3" ;;
  *) usage ;;
esac
[[ -d $ROOT_DIR ]] || fail 'The production directory must exist and be mounted at the same path.'
if [[ $command == rollback ]]; then
  [[ $2 == /* && -d $2 ]] || fail 'An absolute backup directory is required.'
  validate_quiescent_backup "$2"
fi
trap on_exit EXIT
require_docker

case $command in
  init)
    umask 077
    mkdir -p "$ROOT_DIR/secrets" "$ROOT_DIR/backups" "$ROOT_DIR/state"
    chmod 700 "$ROOT_DIR" "$ROOT_DIR/secrets" "$ROOT_DIR/backups" "$ROOT_DIR/state"
    if [[ ! -e $ROOT_DIR/prod.env ]]; then
      printf 'POSTGRES_PORT=55433\nWHATSAPP_WEBHOOK_PORT=18190\nWHATSAPP_WEBHOOK_PATH=/whatsapp/webhook\n' > "$ROOT_DIR/prod.env"
    fi
    for name in "${INTERNAL_SECRETS[@]}"; do
      [[ -e $ROOT_DIR/secrets/$name ]] || openssl rand -hex 32 > "$ROOT_DIR/secrets/$name"
    done
    SECRETS_DIR="$ROOT_DIR/secrets"
    ensure_teacher_links
    for name in "${EXTERNAL_SECRETS[@]}"; do
      [[ -s $ROOT_DIR/secrets/$name ]] || printf 'To provide: secrets/%s\n' "$name"
    done
    ;;
  install)
    load_settings; use_release "$2"; ensure_teacher_links; check_secrets
    [[ -z $(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT") ]] || fail 'The project already has volumes: use update.'
    pull_images
    active=1
    start_stack
    record_release "$2"
    active=0
    step 'Installed and healthy. Public reachability is not verified.'
    ;;
  update)
    load_settings; use_release "$2"; ensure_teacher_links; check_secrets
    [[ -f $ROOT_DIR/state/release ]] || fail 'No installed release: use install.'
    previous=$(<"$ROOT_DIR/state/release")
    pull_images
    active=1
    step 'Stopping gateway and broker'
    stop_writers
    step 'Taking the backup'
    backup="$ROOT_DIR/backups/$(date -u +%Y%m%dT%H%M%SZ)-${previous:0:12}"
    checked bash "$SCRIPTS/backup.sh" "$PROJECT" "$backup" || fail 'Backup failed.'
    start_stack
    record_release "$2"
    active=0
    step "Updated and healthy. Backup of the previous release: $backup"
    ;;
  backup-hot)
    load_settings; use_release "$2"
    backup_parent="$ROOT_DIR/backups"
    [[ $ROOT_DIR == /* && ! -L $ROOT_DIR && -d $backup_parent && ! -L $backup_parent ]] || fail 'A private backup directory is required: run init.'
    for directory in "$ROOT_DIR" "$backup_parent"; do
      insecure=$(find "$directory" -maxdepth 0 -perm /077 -print 2>/dev/null) || fail 'Could not check backup directory permissions.'
      [[ -z $insecure ]] || fail 'Backup directory has insecure permissions.'
    done
    umask 077
    timestamp=$(date -u +%Y%m%dT%H%M%SZ 2>/dev/null) || fail 'Could not determine the backup timestamp.'
    hot_backup=$(mktemp -d -- "$backup_parent/hot-$timestamp-${2:0:12}-XXXXXXXX" 2>/dev/null) || fail 'Could not create a new backup directory.'
    # The marker is renamed only after the dump, checksum and ownership succeed.
    printf 'hot-postgres-v1\n' 2>/dev/null > "$hot_backup/INCOMPLETE" || fail 'Could not mark the backup incomplete.'
    postgres=$(compose ps -q --status running postgres 2>/dev/null) || fail 'Could not inspect PostgreSQL.'
    [[ -n $postgres && $postgres != *$'\n'* ]] || fail 'Exactly one running PostgreSQL container is required.'
    health=$(docker inspect --format '{{.State.Health.Status}}' "$postgres" 2>/dev/null) || fail 'Could not inspect PostgreSQL health.'
    [[ $health == healthy ]] || fail 'PostgreSQL is not healthy.'
    if ! compose exec -T --interactive=false postgres pg_dump --no-password -U studio_admin -d studio -Fc --exclude-table-data=studio_private.author_context 2>/dev/null > "$hot_backup/postgres.dump"; then
      fail 'PostgreSQL backup failed.'
    fi
    (cd -- "$hot_backup" && sha256sum postgres.dump > SHA256SUMS) >/dev/null 2>&1 || fail 'Could not checksum the backup.'
    owner=$(stat -c %u:%g "$ROOT_DIR" 2>/dev/null) || fail 'Could not determine backup ownership.'
    quiet chown -R "$owner" "$hot_backup" || fail 'Could not set backup ownership.'
    quiet mv -- "$hot_backup/INCOMPLETE" "$hot_backup/COMPLETE" || fail 'Could not complete the backup.'
    step "Hot PostgreSQL backup completed: $hot_backup" 2>/dev/null
    ;;
  rollback)
    load_settings; use_release "$3"; ensure_teacher_links; check_secrets
    pull_images
    target="${PROJECT}-r$(date -u +%Y%m%d%H%M%S)"
    active=1
    step 'Stopping the current stack; its volumes are kept'
    stop_writers
    quiet compose stop postgres || fail 'PostgreSQL did not stop.'
    step 'Restoring the backup into new volumes'
    (unset PILATES_VOLUME_PREFIX; checked bash "$SCRIPTS/restore.sh" "$target" "$2") || fail 'Restore failed.'
    (unset PILATES_VOLUME_PREFIX; PROJECT=$target; quiet compose down --remove-orphans) || fail 'Restore cleanup failed.'
    printf '%s\n' "$target" > "$ROOT_DIR/state/volume-prefix"
    export PILATES_VOLUME_PREFIX=$target
    start_stack
    record_release "$3"
    active=0
    step "Rolled back and healthy on volumes $target. Previous volumes were kept."
    ;;
esac
