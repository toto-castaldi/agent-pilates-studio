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

hermes_must_be_stopped() {
  local active
  active=$(compose ps -q --status running --status paused --status restarting --status removing hermes)
  [[ -z "$active" ]] || fail 'Stop Hermes before taking a backup.'
}
