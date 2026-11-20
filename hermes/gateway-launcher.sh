#!/bin/sh
# Hermes gateway logs may contain messages and phone numbers. Silence this
# process before importing Hermes; keep other CLI commands unchanged.
set -eu
case " $* " in
  *" gateway run "*)
  # The release files must be the image's own (release-links.sh) or an
  # explicit Compose mount; never a copy in the volume or Hermes' defaults.
  for name in SOUL.md config.yaml plugins skills; do
    [ "$(readlink "/opt/data/$name")" = "/opt/pilates/release/$name" ] && continue
    awk -v path="/opt/data/$name" '$5 == path { found = 1 } END { exit !found }' /proc/self/mountinfo || exit 1
  done
  unset PYTHONPATH PYTHONHOME
  export HERMES_SITE=/opt/hermes/.venv/lib/python3.14/site-packages
  export PYTHONPYCACHEPREFIX="${PYTHONPYCACHEPREFIX:-${XDG_CACHE_HOME:-$HOME/.cache}/hermes-pycache}"
  # Request a refresh before accepting turns, including sessions persisted by
  # an earlier release. Failure must stop startup rather than reuse stale rules.
  /opt/hermes/libexec/hermes-upstream sessions refresh-prompts >/dev/null 2>&1 9>&-
  exec /opt/hermes/.venv/bin/python -P -c '
import logging, os, site, sys
logging.disable(1000)
# Send-failure event channel from the entrypoint: a non-inheritable copy for
# this process only; absent in diagnostic runs.
try:
    events = os.dup(9)
    os.close(9)
except OSError:
    events = None
fd = os.open(os.devnull, os.O_WRONLY)
os.dup2(fd, 1)
os.dup2(fd, 2)
if fd > 2:
    os.close(fd)
sys.argv[0] = "hermes"
site.addsitedir(os.environ["HERMES_SITE"])
import pilates_trusted
pilates_trusted.install(events)
from hermes_cli.main import main
sys.exit(main())
' "$@"
  ;;
esac
exec /opt/hermes/libexec/hermes-upstream "$@" 9>&-
