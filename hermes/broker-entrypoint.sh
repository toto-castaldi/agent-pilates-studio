#!/bin/sh
set -eu
exec >/dev/null 2>&1

for name in db_broker bridge_token whatsapp_app_secret whatsapp_phone_number_id whatsapp_manager_phone; do
  [ -s "/run/secrets/$name" ] || exit 1
  [ -z "$(find "/run/secrets/$name" -maxdepth 0 -perm /077 -print)" ] || exit 1
done
# The single manager number is the only personal number in the configuration.
# Its value is never printed; a malformed value stops the broker.
[ "$(grep -c '' /run/secrets/whatsapp_manager_phone)" = 1 ] || exit 1
grep -Eqx '\+[1-9][0-9]{7,14}' /run/secrets/whatsapp_manager_phone || exit 1
install -d -m 0700 -o 10000 -g 10000 /run/pilates-broker
for name in db_broker bridge_token whatsapp_app_secret whatsapp_phone_number_id whatsapp_manager_phone; do
  install -m 0600 -o 10000 -g 10000 "/run/secrets/$name" "/run/pilates-broker/$name"
done
export HOME=/tmp
exec setpriv --reuid=10000 --regid=10000 --clear-groups /opt/hermes/.venv/bin/python -I /opt/pilates/author_broker.py
