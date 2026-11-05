#!/bin/sh
set -eu
exec >/dev/null 2>&1

for name in db_broker bridge_token whatsapp_app_secret whatsapp_allowed_users whatsapp_phone_number_id; do
  [ -s "/run/secrets/$name" ] || exit 1
  [ -z "$(find "/run/secrets/$name" -maxdepth 0 -perm /077 -print)" ] || exit 1
done
install -d -m 0700 -o 10000 -g 10000 /run/pilates-broker
for name in db_broker bridge_token whatsapp_app_secret whatsapp_allowed_users whatsapp_phone_number_id; do
  install -m 0600 -o 10000 -g 10000 "/run/secrets/$name" "/run/pilates-broker/$name"
done
export HOME=/tmp
exec setpriv --reuid=10000 --regid=10000 --clear-groups /opt/hermes/.venv/bin/python -I /opt/pilates/author_broker.py
