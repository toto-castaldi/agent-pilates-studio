#!/bin/sh
# Starts as root only to hand the mounted secrets to the grafana user, then
# drops privileges. Grafana output never reaches the Docker log: only the fixed
# events grafana_launch and grafana_preflight_failed do.
set -eu
exec 3>&1 >/dev/null 2>&1

fail() { printf 'grafana_preflight_failed\n' >&3; exit 1; }

target=/run/pilates-grafana
for name in grafana_admin_password db_grafana; do
  file=/run/secrets/$name
  [ -f "$file" ] && [ ! -L "$file" ] && [ -s "$file" ] || fail
  [ "$(grep -c '' "$file")" = 1 ] || fail
  LC_ALL=C grep -Eqx '[!-~]+' "$file" || fail
  length=$(tr -d '\n' < "$file" | wc -c)
  [ "$length" -ge 16 ] && [ "$length" -le 512 ] || fail
done
[ -d "$target" ] && [ ! -L "$target" ] || fail

umask 077
chown 472:0 "$target" && chmod 0700 "$target" || fail
for pair in grafana_admin_password:admin-password db_grafana:db-password; do
  source=/run/secrets/${pair%%:*}
  copy=$target/${pair#*:}
  rm -f "$copy"
  tr -d '\n' < "$source" > "$copy" || fail
  chown 472:0 "$copy" && chmod 0400 "$copy" || fail
done

printf 'grafana_launch\n' >&3
exec su -p -s /bin/sh grafana -c 'exec /run.sh' 3>&-
