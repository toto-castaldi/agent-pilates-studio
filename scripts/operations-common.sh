#!/usr/bin/env bash
# Shared helpers for the operator's Linux Docker workflows.
set -euo pipefail

readonly OPERATIONS_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
readonly POSTGRES_IMAGE='postgres:17.10@sha256:5f050f770b427fbd477edee6c3968a72e5c6be97e050a7e368b2b74a9494a285'

fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }

validate_project() {
  case "${1:-}" in
    ''|[!a-z0-9]*|*[!a-z0-9_-]*) fail 'Invalid Compose project name.' ;;
  esac
}

compose() {
  docker compose --project-directory "$OPERATIONS_ROOT" -f "$OPERATIONS_ROOT/compose.yaml" -p "$PROJECT" "$@"
}

# A rollback requires the complete, quiescent PostgreSQL + Hermes backup.
# Check it before stopping production, and again at restore time.
validate_quiescent_backup() {
  local backup=$1 file marker lines
  [[ -d $backup && ! -L $backup ]] || fail 'Backup directory is missing or a symlink.'
  for file in COMPLETE SHA256SUMS postgres.dump hermes.tar; do
    [[ -f $backup/$file && ! -L $backup/$file ]] || fail 'Backup is incomplete or contains symlinks.'
  done
  marker=$(<"$backup/COMPLETE") 2>/dev/null || fail 'Backup completion marker is invalid.'
  [[ $marker == 1 ]] || fail 'Backup completion marker is invalid.'
  lines=$(wc -l 2>/dev/null < "$backup/SHA256SUMS") || fail 'Backup manifest is invalid.'
  [[ $lines -eq 2 ]] || fail 'Backup manifest is invalid.'
  LC_ALL=C grep -Eq '^[0-9a-f]{64}  postgres[.]dump$' "$backup/SHA256SUMS" 2>/dev/null || fail 'Backup manifest is invalid.'
  LC_ALL=C grep -Eq '^[0-9a-f]{64}  hermes[.]tar$' "$backup/SHA256SUMS" 2>/dev/null || fail 'Backup manifest is invalid.'
  (cd -- "$backup" && sha256sum --check --status SHA256SUMS) >/dev/null 2>&1 || fail 'Backup checksum verification failed.'
}

hermes_must_be_stopped() {
  local active
  active=$(compose ps -q --status running --status paused --status restarting --status removing hermes)
  [[ -z "$active" ]] || fail 'Stop Hermes before taking a backup.'
  active=$(compose ps -q --status running --status paused --status restarting --status removing author-broker)
  [[ -z "$active" ]] || fail 'Stop author-broker before taking a backup.'
}
