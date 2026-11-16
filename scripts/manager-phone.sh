# Operator-only alignment of the manager role. Sourced by prod.sh.
# Not an enrollment CLI: transfer and renumber are the only actions, and the
# equivalent chat operations stay forbidden in the database.

write_manager_secret() {
  local phone=$1 dest="$SECRETS_DIR/whatsapp-manager-phone" tmp
  tmp=$(mktemp "$SECRETS_DIR/.manager-phone.XXXXXXXX") || return 1
  chmod 600 "$tmp" || { rm -f -- "$tmp"; return 1; }
  printf '%s\n' "$phone" > "$tmp" || { rm -f -- "$tmp"; return 1; }
  mv -f -- "$tmp" "$dest" || { rm -f -- "$tmp"; return 1; }
  chmod 600 "$dest" || return 1
}

require_env_file() {
  local file=${PILATES_ENV_FILE:-}
  [[ -n $file ]] || return 0
  [[ -f $file && ! -L $file ]] || fail 'Manager environment file is invalid.'
  [[ -z $(find "$file" -maxdepth 0 -perm /077 -print) ]] || fail 'Manager environment file has insecure permissions.'
  [[ $(grep -c '^PILATES_MANAGER_PHONE=' "$file") -eq 1 ]] || fail 'Manager environment file must contain one manager phone setting.'
}

align_env_file() {
  local phone=$1 file=${PILATES_ENV_FILE:-} tmp line
  [[ -n $file ]] || return 0
  tmp=$(mktemp "$(dirname -- "$file")/.manager-env.XXXXXXXX") || return 1
  chmod 600 "$tmp" || { rm -f -- "$tmp"; return 1; }
  while IFS= read -r line || [[ -n $line ]]; do
    if [[ $line == PILATES_MANAGER_PHONE=* ]]; then
      printf 'PILATES_MANAGER_PHONE=%s\n' "$phone"
    else
      printf '%s\n' "$line"
    fi
  done < "$file" > "$tmp" || { rm -f -- "$tmp"; return 1; }
  mv -f -- "$tmp" "$file" || { rm -f -- "$tmp"; return 1; }
  chmod 600 "$file" || return 1
}

# stdout is the canonical phone. stderr is discarded: PostgreSQL details can
# contain values, and the caller prints only fixed messages.
manager_sql() {
  local sql=$1 err rc=0 output
  err=$(mktemp "$SECRETS_DIR/.manager-sql.XXXXXXXX") || return 1
  chmod 600 "$err" || { rm -f -- "$err"; return 1; }
  # -i keeps the piped statement attached. -T avoids a TTY. Without -i, psql
  # sees EOF, exits 0 and the change never runs.
  output=$(printf '%s\n' "$sql" | compose exec -T -i postgres \
    psql -X -qAt -v ON_ERROR_STOP=1 --no-password -U studio_migrator -d studio 2>"$err") || rc=$?
  if (( rc != 0 )); then
    if grep -q 'No manager change to recover' "$err"; then
      rm -f -- "$err"
      fail 'No manager change to recover.'
    fi
    if grep -q 'No manager recovery to compensate' "$err"; then
      rm -f -- "$err"
      fail 'No manager recovery to compensate.'
    fi
    rm -f -- "$err"
    return 1
  fi
  rm -f -- "$err"
  printf '%s' "$output"
}

# A failed recovery must undo that recovery only. Calling recover again would
# consume an older transfer or renumber.
undo_applied_change() {
  if [[ $command == manager-recover ]]; then
    manager_sql "SELECT studio_private.operator_manager_compensate()"
  else
    manager_sql "SELECT studio_private.operator_manager_recover()"
  fi
}

realign_after_undo() {
  local phone=$1
  phone=${phone//$'\r'/}
  phone=${phone##*$'\n'}
  read -r phone <<< "$phone"
  [[ $phone =~ ^\+[1-9][0-9]{7,14}$ ]] || return 1
  write_manager_secret "$phone" || return 1
  align_env_file "$phone" || return 1
}

fail_undo() {
  local undone
  undone=$(undo_applied_change) || fail 'Manager change applied in the database but configuration was not updated; recovery failed. Gateway and broker remain stopped.'
  if ! realign_after_undo "$undone"; then
    if [[ $command == manager-recover ]]; then
      fail 'Manager recovery was compensated in the database but configuration could not be aligned. Gateway and broker remain stopped.'
    fi
    fail 'Manager change applied in the database but configuration was not updated; recovery failed. Gateway and broker remain stopped.'
  fi
  if [[ $command == manager-recover ]]; then
    fail 'Manager recovery was compensated. Configuration matches the registry. No earlier change was consumed.'
  fi
  fail 'Manager change was rejected and reversed.'
}

run_manager_phone() {
  local next_file current next action applied recovered
  load_settings
  check_secrets
  next_file="$SECRETS_DIR/manager-next-phone"
  if [[ $command != manager-recover ]]; then
    [[ -f $next_file && ! -L $next_file ]] || fail 'A private manager-next-phone file is required.'
    [[ -z $(find "$next_file" -maxdepth 0 -perm /077 -print) ]] || fail 'manager-next-phone has insecure permissions.'
    [[ $(grep -c '' "$next_file") == 1 ]] && grep -Eqx '\+[1-9][0-9]{7,14}' "$next_file" \
      || fail 'manager-next-phone must be one canonical international number.'
  fi
  require_env_file
  # The operator stops both consumers first. This command does not stop or start them.
  hermes_must_be_stopped
  current=$(<"$SECRETS_DIR/whatsapp-manager-phone")
  current=${current//$'\r'/}
  if [[ $command == manager-recover ]]; then
    applied=$(manager_sql "SELECT studio_private.operator_manager_recover()") || fail 'Manager change was rejected.'
  else
    next=$(<"$next_file")
    next=${next//$'\r'/}
    action=transfer
    [[ $command == manager-renumber ]] && action=renumber
    applied=$(manager_sql "SELECT studio_private.operator_manager_change('${action}', '${current}', '${next}')") \
      || fail 'Manager change was rejected.'
  fi
  applied=${applied//$'\r'/}
  applied=${applied##*$'\n'}
  read -r applied <<< "$applied"
  if [[ ! $applied =~ ^\+[1-9][0-9]{7,14}$ ]]; then
    fail_undo
  fi
  if ! write_manager_secret "$applied"; then
    fail_undo
  fi
  if ! align_env_file "$applied"; then
    fail_undo
  fi
  [[ $command == manager-recover ]] || rm -f -- "$next_file"
  step 'Manager configuration aligned. Recreate gateway and broker together before exposing the webhook. Recovery reverses only the latest change and requires both writers to stay stopped.'
}
