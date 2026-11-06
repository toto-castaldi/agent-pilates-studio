#!/bin/sh
# Test-only launcher: production gateway and trusted bridge, with Graph HTTP
# requests redirected to the isolated local Meta substitute.
set -eu
case " $* " in
  *" gateway run "*)
  unset PYTHONPATH PYTHONHOME
  export HERMES_SITE=/opt/hermes/.venv/lib/python3.14/site-packages
  export PYTHONPYCACHEPREFIX="${PYTHONPYCACHEPREFIX:-${XDG_CACHE_HOME:-$HOME/.cache}/hermes-pycache}"
  /opt/hermes/libexec/hermes-upstream sessions refresh-prompts >/dev/null 2>&1
  exec /opt/hermes/.venv/bin/python -P -c '
import logging, os, site, sys
logging.disable(1000)
fd = os.open(os.devnull, os.O_WRONLY)
os.dup2(fd, 1)
os.dup2(fd, 2)
if fd > 2:
    os.close(fd)
sys.argv[0] = "hermes"
site.addsitedir(os.environ["HERMES_SITE"])
import httpx
from urllib.parse import urlsplit, urlunsplit
original_request = httpx.AsyncClient.request
async def request(client, method, url, *args, **kwargs):
    parsed = urlsplit(str(url))
    if parsed.hostname == "graph.facebook.com":
        url = urlunsplit(("http", "meta-stub:8088", parsed.path, parsed.query, ""))
    return await original_request(client, method, url, *args, **kwargs)
httpx.AsyncClient.request = request
import pilates_trusted
pilates_trusted.install()
from hermes_cli.main import main
sys.exit(main())
' "$@"
  ;;
esac
exec /opt/hermes/libexec/hermes-upstream "$@"
