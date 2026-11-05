#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
cd "$project_dir"
umask 077
mkdir -p .pi/local
export PI_CODING_AGENT_DIR="$project_dir/.pi/local"
unset PI_CODING_AGENT_SESSION_DIR
exec pi "$@"
