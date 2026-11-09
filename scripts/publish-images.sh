#!/usr/bin/env bash
# Build the production images, refuse any that carry local configuration, and
# push them only when asked. Publishing never contacts the production server.
set -euo pipefail

[[ $# -ge 2 && $# -le 3 ]] || { printf 'Usage: publish-images.sh <registry-prefix> <commit> [--push]\n' >&2; exit 1; }
prefix=$1
commit=$2
push=${3:-}
[[ $commit =~ ^[0-9a-f]{40}$ ]] || { printf 'The commit must be a full SHA.\n' >&2; exit 1; }
[[ -z $push || $push == --push ]] || { printf 'Unknown option.\n' >&2; exit 1; }
cd -- "$(dirname -- "$0")/.."

declare -A dockerfiles=([hermes]=hermes/Dockerfile [postgres]=db/Dockerfile [migrator]=scripts/migrator.Dockerfile [ops]=scripts/ops.Dockerfile)
for name in "${!dockerfiles[@]}"; do
  docker build --quiet --file "${dockerfiles[$name]}" \
    --label "org.opencontainers.image.source=https://github.com/toto-castaldi/agent-pilates-studio" \
    --label "org.opencontainers.image.revision=$commit" \
    --tag "$prefix/$name:$commit" . >/dev/null
  # Only the name of a forbidden path is checked: file contents are never read.
  container=$(docker create "$prefix/$name:$commit")
  if docker export "$container" | tar -tf - | grep -Eq '(^|/)(\.env|\.local/|\.git/config$)'; then
    docker rm "$container" >/dev/null
    printf 'Image %s contains local configuration.\n' "$name" >&2
    exit 1
  fi
  docker rm "$container" >/dev/null
done

if [[ $push == --push ]]; then
  for name in "${!dockerfiles[@]}"; do docker push --quiet "$prefix/$name:$commit" >/dev/null; done
fi
printf 'Images ready for commit %s.\n' "$commit"
