#!/usr/bin/env bash
# Server setup for Pi Voice dictation through the client's forwarded Pulse socket (TEC-020).
# Run as the user who runs Pi; administrative steps use sudo and ask for the password.
# Idempotent: completed steps are skipped and existing user files are never overwritten.
set -euo pipefail

SSHD_DROPIN=/etc/ssh/sshd_config.d/60-pulse-forward.conf
PULSE_LINE='export PULSE_SERVER="unix:/run/user/$(id -u)/pulse-remote.socket"'

step() { printf '\n== %s\n' "$1"; }

if [ "$(id -u)" -eq 0 ]; then
  echo "Eseguire come l'utente che usa Pi, non come root: i comandi amministrativi usano sudo." >&2
  exit 1
fi

step "1/4 Pacchetti di sistema (amministrativo)"
missing=()
for package in libasound2-plugins pulseaudio-utils; do
  if ! dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -q 'install ok installed'; then
    missing+=("$package")
  fi
done
if [ ${#missing[@]} -eq 0 ]; then
  echo "Già installati."
else
  echo "Installo: ${missing[*]}"
  sudo apt-get install -y "${missing[@]}"
fi

step "2/4 sshd: StreamLocalBindUnlink (amministrativo)"
if [ -f "$SSHD_DROPIN" ] && grep -qx 'StreamLocalBindUnlink yes' "$SSHD_DROPIN"; then
  echo "Già configurato in $SSHD_DROPIN."
else
  echo 'StreamLocalBindUnlink yes' | sudo tee "$SSHD_DROPIN" >/dev/null
  if ! sudo sshd -t; then
    sudo rm -f "$SSHD_DROPIN"
    echo "Configurazione sshd non valida: file rimosso, sshd non ricaricato." >&2
    exit 1
  fi
  sudo systemctl reload ssh
  echo "Scritto $SSHD_DROPIN e ricaricato sshd."
fi
sudo sshd -T | grep -i -E '^(streamlocalbindunlink|allowstreamlocalforwarding|streamlocalbindmask) ' || true

step "3/4 ALSA verso Pulse (~/.asoundrc)"
if [ ! -e "$HOME/.asoundrc" ]; then
  printf 'pcm.!default {\n    type pulse\n}\nctl.!default {\n    type pulse\n}\n' > "$HOME/.asoundrc"
  echo "Creato ~/.asoundrc."
elif grep -Eq '^[[:space:]]*type[[:space:]]+pulse' "$HOME/.asoundrc"; then
  echo "~/.asoundrc già presente con Pulse: non modificato."
else
  echo "~/.asoundrc esiste con un'altra configurazione: non modificato. Vedere il passo 3 della procedura." >&2
fi

step "4/4 PULSE_SERVER (~/.bashrc)"
if grep -q 'PULSE_SERVER' "$HOME/.bashrc" 2>/dev/null; then
  echo "~/.bashrc imposta già PULSE_SERVER: non modificato."
else
  printf '\n# Pi Voice: Pulse socket forwarded from the SSH client (TEC-020)\n%s\n' "$PULSE_LINE" >> "$HOME/.bashrc"
  echo "Aggiunta la riga PULSE_SERVER a ~/.bashrc."
fi

if [ "$(loginctl show-user "$(id -un)" -p Linger --value 2>/dev/null || true)" != "yes" ]; then
  echo
  echo "Attenzione: linger non attivo; abilitarlo con: sudo loginctl enable-linger $(id -un)"
fi

cat <<EOF

Server configurato. Sul client aggiungere al blocco Host del server in ~/.ssh/config
(sostituire <UID_CLIENT> con il risultato di 'id -u' sul client):

    RemoteForward /run/user/$(id -u)/pulse-remote.socket /run/user/<UID_CLIENT>/pulse/native

Poi ricollegarsi, aprire una nuova shell o un nuovo pannello Herdr ed eseguire: npm run voice:diagnose
EOF
