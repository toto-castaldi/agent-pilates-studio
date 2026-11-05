#!/bin/sh
set -eu

# Only fixed preflight events reach Docker logs. No child inherits this channel.
exec 3>&1
exec >/dev/null 2>&1
trap 'printf "%s\n" hermes_preflight_failed >&3' EXIT

# Hermes loads its persistent .env with override enabled; refuse settings that
# could silently bypass the secret files or the sender allowlist.
if [ -f /opt/data/.env ] && grep -Eqi '^[[:space:]]*(export[[:space:]]+)?(WHATSAPP_CLOUD_|GATEWAY_ALLOW_ALL_USERS|OPENROUTER_API_KEY|PILATES_)' /opt/data/.env; then
  exit 1
fi

for name in db_agent bridge_token openrouter_key whatsapp_access_token whatsapp_app_secret whatsapp_verify_token whatsapp_allowed_users whatsapp_phone_number_id; do
  if [ ! -s "/run/secrets/$name" ]; then
    exit 1
  fi
  if [ -n "$(find "/run/secrets/$name" -maxdepth 0 -perm /077 -print)" ]; then
    exit 1
  fi
done

# Only the agent role's password is made readable to the unprivileged gateway.
install -d -m 0700 -o 10000 -g 10000 /run/pilates-agent
install -m 0600 -o 10000 -g 10000 /run/secrets/db_agent /run/pilates-agent/db_agent
install -m 0600 -o 10000 -g 10000 /run/secrets/bridge_token /run/pilates-agent/bridge_token
export PILATES_DB_PASSWORD_FILE=/run/pilates-agent/db_agent
export OPENROUTER_API_KEY="$(cat /run/secrets/openrouter_key)"
export WHATSAPP_CLOUD_ACCESS_TOKEN="$(cat /run/secrets/whatsapp_access_token)"
export WHATSAPP_CLOUD_APP_SECRET="$(cat /run/secrets/whatsapp_app_secret)"
export WHATSAPP_CLOUD_VERIFY_TOKEN="$(cat /run/secrets/whatsapp_verify_token)"
export WHATSAPP_CLOUD_ALLOWED_USERS="$(cat /run/secrets/whatsapp_allowed_users)"
export WHATSAPP_CLOUD_PHONE_NUMBER_ID="$(cat /run/secrets/whatsapp_phone_number_id)"
export WHATSAPP_CLOUD_ALLOW_ALL_USERS=false
export GATEWAY_ALLOW_ALL_USERS=false
case "$WHATSAPP_CLOUD_ALLOWED_USERS" in
  *[!0-9,]*|,*|*,|*,,*|'') exit 1 ;;
esac
case "$WHATSAPP_CLOUD_PHONE_NUMBER_ID" in
  *[!0-9]*|'') exit 1 ;;
esac

trap - EXIT
printf '%s\n' hermes_launch >&3
exec 3>&-
exec /opt/hermes/docker/entrypoint-dispatch.sh "$@"
