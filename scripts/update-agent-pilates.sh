#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf 'Usage: %s <commit-sha>\n' "${0##*/}"
  printf 'Use a full 40-character lowercase hexadecimal SHA with published images.\n'
}

if [[ $# -eq 1 && ( $1 == --help || $1 == -h ) ]]; then
  usage
  exit 0
fi
if [[ $# -ne 1 ]]; then
  usage >&2
  exit 2
fi
if [[ ! $1 =~ ^[0-9a-f]{40}$ ]]; then
  usage >&2
  exit 2
fi

commit=$1
exec docker run --rm \
  --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock \
  --mount type=bind,src=/opt/agent-pilates-prod,dst=/opt/agent-pilates-prod \
  "ghcr.io/toto-castaldi/agent-pilates-studio/ops:$commit" update "$commit"
