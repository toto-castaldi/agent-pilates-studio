# Dettato vocale Pi su server remoto (TEC-020)

Procedura per usare il dettato di Pi Voice (`Ctrl+Space`) quando Pi gira su un server remoto senza schede audio, raggiunto via SSH da un client Ubuntu con PipeWire, anche dentro Herdr. Requisito: REQ-NFR-012.

## Funzionamento

Pi Voice registra sul computer dove gira Pi, tramite il registratore nativo `@handy-computer/recorder`, che apre il dispositivo ALSA predefinito. Su un server senza schede audio il dettato fallisce con `DeviceUnavailable: no input device is available`.

La soluzione porta sul server il server audio del client, senza porte TCP:

```text
Pi Voice (server) → ALSA "default" → plugin ALSA pulse → PULSE_SERVER=unix:/run/user/<UID_SERVER>/pulse-remote.socket
  → socket creato da sshd per RemoteForward → connessione SSH → /run/user/<UID_CLIENT>/pulse/native (pipewire-pulse del client)
```

La configurazione di Pi Voice (`.pi/pi-voice.json`) e i suoi log non vanno modificati: restano personali ed esclusi da Git. Il registratore usa `PULSE_SERVER` solo nella forma `unix:<percorso assoluto>` e apre comunque il dispositivo tramite ALSA, quindi servono sia il plugin ALSA sia la variabile.

## Valori usati

- `<UID_SERVER>`: risultato di `id -u` sul server, per l'utente che esegue Pi.
- `<UID_CLIENT>`: risultato di `id -u` sul client.
- Socket sul server: `/run/user/<UID_SERVER>/pulse-remote.socket`. La directory runtime dell'utente è un tmpfs con permessi `0700`; il percorso è stabile tra le connessioni.
- Socket sul client: `/run/user/<UID_CLIENT>/pulse/native`, fornito da `pipewire-pulse`.

`RemoteForward` richiede percorsi letterali: sostituire i segnaposto con i valori numerici.

## Server

I passi 1–4 sono automatizzati da uno script idempotente, da eseguire sul server come l'utente che usa Pi, dalla radice del progetto:

```bash
npm run voice:setup
```

Lo script (`scripts/voice-server-setup.sh`) usa `sudo` solo per i passi amministrativi 1 e 2, chiedendo la password; non va eseguito come root. Salta i passi già completati, non sovrascrive un `~/.asoundrc` con altra configurazione né un `~/.bashrc` che imposta già `PULSE_SERVER`, e se la configurazione sshd non è valida rimuove il file aggiunto senza ricaricare sshd. Alla fine stampa la riga `RemoteForward` da aggiungere sul client. I passi seguenti descrivono le stesse operazioni per l'esecuzione manuale.

### 1. Pacchetti di sistema — comando amministrativo, a cura dell'operatore

```bash
sudo apt install libasound2-plugins pulseaudio-utils
```

`libasound2-plugins` fornisce il plugin ALSA `pulse`, `pulseaudio-utils` fornisce `pactl`. Non serve installare né avviare un server audio sul server.

### 2. sshd — comando amministrativo, a cura dell'operatore

Una connessione interrotta lascia il socket sul server: senza `StreamLocalBindUnlink` la riconnessione successiva non riesce a ricrearlo.

```bash
echo 'StreamLocalBindUnlink yes' | sudo tee /etc/ssh/sshd_config.d/60-pulse-forward.conf
sudo sshd -t
sudo systemctl reload ssh
sudo sshd -T | grep -i -E '^(streamlocalbindunlink|allowstreamlocalforwarding|streamlocalbindmask) '
```

Valori attesi: `streamlocalbindunlink yes`, `allowstreamlocalforwarding yes` (o `all`/`remote`) e `streamlocalbindmask 0177`, che crea il socket con permessi `0600`. Per sshd vale il primo valore letto: se un altro file in `sshd_config.d` imposta valori diversi, correggerlo. Le connessioni già aperte non cambiano.

La directory `/run/user/<UID_SERVER>` deve esistere quando sshd crea il socket. Con il linger attivo (`loginctl show-user "$USER" -p Linger` restituisce `Linger=yes`) esiste sempre; altrimenti l'operatore può abilitarlo con `sudo loginctl enable-linger <utente>` (comando amministrativo).

### 3. ALSA verso Pulse — utente

Creare `~/.asoundrc` (se esiste già, salvarne una copia e sostituire solo le definizioni predefinite):

```text
pcm.!default {
    type pulse
}
ctl.!default {
    type pulse
}
```

### 4. `PULSE_SERVER` — utente

Aggiungere in fondo a `~/.bashrc` (o al file equivalente della shell usata nei pannelli Herdr):

```bash
export PULSE_SERVER="unix:/run/user/$(id -u)/pulse-remote.socket"
```

Le nuove shell, anche nei pannelli Herdr, ricevono la variabile. Nelle shell già aperte eseguire `source ~/.bashrc`; i processi Pi già avviati senza la variabile vanno riavviati.

## Client

### 5. Server audio del client — utente

Ubuntu desktop usa PipeWire con `pipewire-pulse`. Verificare:

```bash
systemctl --user is-active pipewire-pulse.socket
pactl info | grep '^Server Name'     # atteso: PulseAudio (on PipeWire ...)
```

Con PulseAudio classico al posto di PipeWire, aggiungere sul server `enable-shm = no` a `~/.config/pulse/client.conf`, perché la memoria condivisa non attraversa SSH; PipeWire non la usa.

### 6. `~/.ssh/config` — utente

```text
Host studio-server
    HostName <host-del-server>
    User <utente-sul-server>
    RemoteForward /run/user/<UID_SERVER>/pulse-remote.socket /run/user/<UID_CLIENT>/pulse/native
```

Usare questo alias per la connessione con cui si lavora in Herdr. Le altre connessioni allo stesso server non devono inoltrare il socket: ognuna lo sostituirebbe e, chiudendosi, interromperebbe il dettato. Usare un alias senza `RemoteForward` oppure `ssh -o ClearAllForwardings=yes studio-server`. Se ssh mostra `Warning: remote port forwarding failed for listen path`, il socket non è stato creato: verificare il passo 2.

## Verifica

Dalla radice del progetto, in una nuova shell sul server con la connessione `studio-server` aperta:

```bash
npm run voice:diagnose
```

Lo script è in sola lettura: controlla plugin ALSA Pulse, `pactl`, dispositivo ALSA predefinito, `PULSE_SERVER`, esistenza, proprietario e permessi del socket, risposta del server audio del client e presenza di almeno una sorgente di acquisizione non monitor. Per ogni passo mancante indica il rimedio ed esce con codice 1; con tutti i passi soddisfatti esce con 0. Non installa pacchetti, non modifica file, non registra audio e non stampa il percorso del socket né i nomi dei dispositivi. `pactl` viene invocato solo con `PULSE_SERVER` valido e socket privato, con una directory di configurazione non scrivibile per evitare che crei il cookie Pulse; il cookie e il `client.conf` esistenti dell'utente restano usati. Per verificare l'ambiente esatto di Pi, eseguire il comando da Pi con `!npm run voice:diagnose`.

Verifiche manuali equivalenti e breve registrazione, senza salvare audio su file:

```bash
pactl info | grep '^Server Name'
arecord -q -d 3 -f S16_LE -r 16000 -c 1 -t raw | wc -c    # circa 96000 byte
```

Infine, in una sessione Pi avviata dopo la configurazione, premere `Ctrl+Space`, parlare e premere di nuovo: il testo trascritto compare nell'editor.

## Limiti

- Il tunnel esiste solo finché è aperta la connessione SSH con `RemoteForward`. Dopo la chiusura il socket resta sul server ma non risponde: la diagnosi segnala "il socket non risponde" e il dettato fallisce fino alla riconnessione, che sostituisce il socket grazie a `StreamLocalBindUnlink`.
- In Herdr i processi Pi sopravvivono alla disconnessione. Quelli avviati con `PULSE_SERVER` e `~/.asoundrc` già configurati tornano a funzionare dopo la riconnessione, perché il percorso è stabile; quelli avviati prima della configurazione vanno riavviati.
- Nessuna porta TCP: l'audio passa solo dal socket Unix dentro la connessione SSH cifrata. L'accesso al socket è limitato all'utente dalla directory runtime `0700` e dalla maschera `0177` di sshd; root sul server e qualsiasi processo dello stesso utente possono però usare il server audio del client, microfono e riproduzione compresi, finché la connessione è aperta. Usare l'inoltro solo verso server fidati.
- La trascrizione segue la configurazione di Pi Voice, invariata: modello locale sul server o endpoint remoto configurato dall'operatore.
- La diagnosi riconosce la configurazione ALSA predefinita leggendo `/etc/asound.conf`, `~/.asoundrc` e `~/.config/alsa/asoundrc` con un'analisi testuale, non con ALSA stesso; non verifica la configurazione di sshd, che richiede privilegi amministrativi.

## Verifiche

### Prova simulata durante lo sviluppo (2026-11-07)

Sul server di destinazione, senza installare pacchetti né modificare la configurazione dell'operatore, con `pulseaudio`, `pactl` e il plugin ALSA estratti dai pacchetti Ubuntu 26.04 in una directory temporanea. Un demone PulseAudio con memoria condivisa disattivata, come PipeWire, e una sorgente nulla sintetica ha simulato il client; un inoltro locale con socket `0600` in una directory `0700` ha simulato `RemoteForward`. Risultati:

- `npm run voice:diagnose` ha segnalato soddisfatti tutti i passi tranne il plugin ALSA, cercato nei percorsi di sistema; nessun file è stato creato nella home sintetica.
- Senza plugin ALSA il registratore di Pi Voice falliva aprendo `alsa:default` anche con `PULSE_SERVER` impostato; con il plugin ha registrato dalla sorgente sintetica, come `arecord`.
- Interrotto l'inoltro, il socket restava presente e la diagnosi segnalava il server non raggiungibile; ricreato l'inoltro sullo stesso percorso, lo stesso processo ha registrato di nuovo senza riavvio.
- Contro un PulseAudio classico con memoria condivisa attiva, `pactl` attraverso l'inoltro falliva con errore di protocollo memfd: da qui l'indicazione `enable-shm = no` per i client senza PipeWire.

La prova non sostituisce quella reale: non usa SSH, PipeWire, un microfono né Herdr.

### Prova reale

Da eseguire nell'ambiente dell'operatore: con il tunnel attivo la diagnosi segnala tutti i passi soddisfatti, il dettato trascrive in una sessione Pi dentro Herdr e, dopo una riconnessione SSH, funziona di nuovo senza interventi sul socket.
