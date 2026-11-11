# TEC-036 — WhatsApp per ambiente e callback stabile

Configurazione di Meta, del tunnel e della produzione su `jarvis`, per avere due ambienti indipendenti (REQ-OPS-006). L'installazione dei servizi segue [TEC-035](TEC-035-produzione.md). Non inserire segreti, numeri di telefono o ID Meta in comandi, chat, log o rapporti.

**REQ-NFR-004:** non avviare lo streaming remoto dei log del tunnel condiviso, né dal dashboard Live logs né con `cloudflared tail` o strumenti equivalenti.

## Ambienti

| | Sviluppo | Produzione |
| --- | --- | --- |
| Business portfolio Meta | quello originale | `Agent Pilates Studio Prod`, dedicato |
| App Meta | `Agent Pilates Studio - Test` | `agent-pilates-studio-live` |
| Numero | numero di test del portfolio originale | numero di test del portfolio di produzione |
| Callback | `https://pilates-dev.toto-castaldi.com/webhooks/whatsapp` | `https://agent-pilates-studio.toto-castaldi.com/whatsapp/webhook` |
| Destinazione su `jarvis` | porta loopback della regola di sviluppo, raggiunta dal clone attivo con `ssh -R` | `127.0.0.1:18190`, stack `agent-pilates-prod` |
| Segreti | `.env` o `SECRETS_DIR` del clone | `/opt/agent-pilates-prod/secrets/` |

Il numero di test, il suo account WhatsApp Business e l'elenco dei destinatari appartengono al portfolio, non alla singola app: una seconda app nello stesso portfolio condivide numero, account e destinatari con lo sviluppo. Per questo la produzione ha un portfolio proprio. Un account WhatsApp non si può spostare tra portfolio ([Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/whatsapp-business-accounts/)) e un utente può creare personalmente al massimo 2 portfolio ([Centro assistenza](https://www.facebook.com/business/help/1710077379203657)): il limite è raggiunto.

## Configurazione Meta di produzione

1. Creare l'app di tipo Business con caso d'uso WhatsApp scegliendo, nel passo del portfolio, la creazione di un nuovo portfolio: Meta crea account WhatsApp di test, account di messaggistica e numero di test. Il nome dell'app ha al massimo 30 caratteri.
2. Registrare nell'elenco destinatari del numero di test i soli numeri degli utilizzatori, che devono coincidere con l'allowlist. Il pannello indica un massimo di 5 destinatari.
3. Nel portfolio di produzione, in Impostazioni business > Utenti di sistema, creare il system user `pilates-prod` e assegnargli con accesso completo l'app, l'account WhatsApp di test e l'account di messaggistica. Generare il token con scadenza **Mai** e le sole autorizzazioni `whatsapp_business_messaging` e `whatsapp_business_management`; `business_management`, indicato dalla guida Meta, non serve e darebbe poteri sull'intero portfolio.
4. Scrivere i segreti su `jarvis` dopo `ops init` (TEC-035), uno per comando, senza che il valore compaia a schermo:

   ```bash
   ssh -t jarvis 'umask 077; read -rsp "Valore: " v; printf "%s" "$v" > /opt/agent-pilates-prod/secrets/NOME; echo; unset v'
   ```

   | `NOME` | Origine |
   | --- | --- |
   | `whatsapp-access-token` | token del system user |
   | `whatsapp-app-secret` | Impostazioni app > Di base > Chiave segreta |
   | `whatsapp-phone-number-id` | Passaggio 1. Prova: «ID numero di telefono», diverso dall'ID dell'account WhatsApp |
   | `openrouter-key` | chiave OpenRouter dedicata alla produzione |
   | `whatsapp-allowed-users` | numeri internazionali in sole cifre, separati da virgole |
   | `whatsapp-home-channel` | uno dei numeri dell'allowlist, identico |

   `whatsapp-verify-token` si genera su `jarvis` senza mostrarlo: `umask 077; openssl rand -hex 32 > /opt/agent-pilates-prod/secrets/whatsapp-verify-token`.
5. Installare con `ops install` (TEC-035) e configurare il tunnel (sezione seguente) prima del webhook.
6. In Casi d'uso > Personalizza > Configurazione di produzione > Configura webhook: callback di produzione e verify token, letto dall'operatore con `ssh jarvis cat /opt/agent-pilates-prod/secrets/whatsapp-verify-token`, poi «Verifica e salva». Meta iscrive in automatico dieci campi: lasciare solo `messages`. Il broker ignora gli altri, ma portano dati non necessari, come quelli delle chiamate.
7. Pubblicare l'app: senza pubblicazione riceve solo i webhook di prova del pannello, nemmeno i messaggi di amministratori e tester. Basta l'URL dell'informativa sulla privacy, lo stesso dell'app di sviluppo; Meta non ha chiesto verifica dell'azienda né App Review.
8. Iscrivere l'app all'account WhatsApp di produzione: l'iscrizione dei campi nell'app non basta, e senza questa i messaggi vengono consegnati al numero ma non al callback. L'ID dell'account («ID account WhatsApp Business», nella pagina Prova) va scritto in un file temporaneo, mai in chat:

   ```bash
   ssh -t jarvis 'umask 077; read -rp "WABA ID: " v; printf "%s" "$v" > /dev/shm/waba; unset v'
   ssh jarvis 'cd /opt/agent-pilates-prod/secrets; W=$(cat /dev/shm/waba); h(){ printf "Authorization: Bearer %s" "$(cat whatsapp-access-token)"; }
     curl -s -X POST -H @<(h) "https://graph.facebook.com/v21.0/$W/subscribed_apps"; echo
     curl -s -H @<(h) "https://graph.facebook.com/v21.0/$W/subscribed_apps" | python3 -c "import sys,json;print([(x.get(\"whatsapp_business_api_data\") or {}).get(\"name\") for x in json.load(sys.stdin)[\"data\"]])"
     rm -f /dev/shm/waba'
   ```

   L'elenco deve contenere `agent-pilates-studio-live`. Si annulla con `DELETE` sullo stesso indirizzo.
9. Il numero di test non compare tra i contatti finché non scrive per primo: dalla pagina Prova inviare il template `hello_world` al destinatario e rispondere in quella chat.

## Tunnel e filtro dei log su `jarvis`

Il tunnel è gestito localmente da `/etc/cloudflared/config.yml`, modificabile solo con sudo. L'hostname di produzione ha un record DNS proprio sulla zona Cloudflare: un CNAME proxied verso `<tunnel>.cfargotunnel.com`, lo stesso target dell'hostname di sviluppo. Non affidarsi a un record jolly: rimuoverlo rende l'hostname irraggiungibile senza alcun errore sul server.

1. **Filtro dei log**, prima di esporre l'hostname. Il drop-in `/etc/systemd/system/cloudflared.service.d/35-pilates-privacy.conf` contiene una riga `LogFilterPatterns=` per ciascun hostname; la riga di produzione è

   ```text
   LogFilterPatterns=~[aA][gG][eE][nN][tT]-[pP][iI][lL][aA][tT][eE][sS]-[sS][tT][uU][dD][iI][oO][.][tT][oO][tT][oO]-[cC][aA][sS][tT][aA][lL][dD][iI][.][cC][oO][mM]
   ```

   Prima di aggiungerla, provarla con sudo su un'unità di sistema temporanea con righe sintetiche: con un'unità utente (`systemd-run --user`) il filtro non si applica e la prova non è valida. Il controllo va fatto solo sulle righe scritte dal processo: il messaggio «Started …» del gestore systemd contiene la riga di comando e non è filtrato.

   ```bash
   sudo systemd-run --quiet --wait --unit=pilates-filter-test -p "LogFilterPatterns=<pattern>" \
     sh -c 'echo SYNTH-DROP host=agent-pilates-studio.toto-castaldi.com; echo SYNTH-KEEP host=example.invalid'
   sudo journalctl -u pilates-filter-test -o cat | grep -E '^SYNTH-'   # deve restare solo SYNTH-KEEP
   ```

   Poi aggiungere la riga al drop-in ed eseguire `sudo systemctl daemon-reload`. Il filtro scarta interi record del journal locale; non protegge i log lato Cloudflare, lo streaming remoto, file, tracce o i messaggi del gestore systemd.
2. **Regola del tunnel**, nella lista `ingress:` prima della voce di chiusura:

   ```yaml
     - hostname: agent-pilates-studio.toto-castaldi.com
       path: ^/whatsapp/webhook$
       service: http://127.0.0.1:18190
     - hostname: agent-pilates-studio.toto-castaldi.com
       service: http_status:404
   ```

3. **Verifica e riavvio**, che interrompe per qualche secondo gli altri servizi del tunnel:

   ```bash
   C=/etc/cloudflared/config.yml
   sudo cloudflared tunnel --config $C ingress validate
   sudo cloudflared tunnel --config $C ingress rule https://agent-pilates-studio.toto-castaldi.com/whatsapp/webhook  # servizio 18190
   sudo cloudflared tunnel --config $C ingress rule https://agent-pilates-studio.toto-castaldi.com/health            # http_status:404
   sudo systemctl restart cloudflared
   ```

## Sviluppo da qualsiasi clone

L'URL di sviluppo nella tabella è stato comunicato dall'operatore dal pannello Meta e registrato su sua richiesta esplicita. Per questo ambiente `WHATSAPP_WEBHOOK_PATH` deve essere `/webhooks/whatsapp`, diverso da `/whatsapp/webhook` di produzione.

Per identificare la porta della regola di sviluppo, eseguire su `jarvis` questo controllo in sola lettura, senza riavviare il tunnel né avviare lo streaming dei log:

```bash
sudo cloudflared tunnel --config /etc/cloudflared/config.yml \
  ingress rule 'https://pilates-dev.toto-castaldi.com/webhooks/whatsapp'
```

La regola selezionata deve indicare un servizio HTTP su loopback. Un risultato `http_status:404` non identifica la porta del gateway: verificare prima hostname e percorso esatti, senza caratteri aggiunti.

Il callback di sviluppo su Meta non cambia. La regola del tunnel di sviluppo punta a una porta loopback di `jarvis`, che deve coincidere con `WHATSAPP_WEBHOOK_PORT` nel `.env` del clone (predefinita 18090) e con il port forward; anche `WHATSAPP_WEBHOOK_PATH` deve coincidere con il percorso configurato su Meta. Il port forward va aperto dalla macchina su cui gira lo stack: da un'altra macchina `jarvis` inoltra verso una porta dove non ascolta nessuno (`connect_to 127.0.0.1 port …: failed`). Il clone attivo avvia lo stack con `npm run start:local` e apre il port forward, lasciandolo aperto:

```bash
PORT=<WHATSAPP_WEBHOOK_PORT del clone>
ssh -N -o ExitOnForwardFailure=yes -R "$PORT:127.0.0.1:$PORT" jarvis
```

Un solo clone alla volta può tenere la porta: se il comando termina con `remote port forwarding failed`, un altro clone è collegato. Non usare la porta di produzione (18190): è occupata dallo stack di produzione e il port forward fallirebbe. Chiudendo il port forward lo sviluppo smette di ricevere messaggi; la produzione non ne dipende.

## Passaggio a un numero reale

Necessario prima di superare cinque utilizzatori o di aprire l'uso ai clienti (REQ-OPS-006). Registrare il numero nel portfolio di produzione, che richiederà verifica dell'azienda e approvazione del nome visualizzato; generare o riassegnare il token, aggiornare `whatsapp-phone-number-id`, eventualmente `whatsapp-access-token` e l'allowlist, iscrivere l'app all'account del numero (passo 8) e applicare i segreti ricreando i servizi con `ops update` sul commit installato (`/opt/agent-pilates-prod/state/release`), che esegue anche un backup. Codice, immagini e callback non cambiano. Questo passaggio non è stato provato.

## Prova del 2026-11-10

Produzione installata da vuoto con il commit `c755f2b`; risultati:

- token valido, di tipo system user, senza scadenza; numero di produzione `CLOUD_API`, `CONNECTED`;
- filtro di produzione provato con righe sintetiche su un'unità di sistema: le due righe con l'hostname, anche in maiuscolo, sono scartate, quelle senza restano;
- dall'esterno `/health` e `/` rispondono 404, la verifica del webhook con verify token errato 403, le POST senza firma o con firma errata 401;
- verifica del callback da parte di Meta riuscita; un primo messaggio reale è stato consegnato al numero ma non al callback, finché l'app non è stata iscritta all'account WhatsApp (passo 8); dopo l'iscrizione un numero autorizzato ha conversato con l'agente sul numero di produzione;
- un webhook firmato con l'app secret di produzione e un mittente sintetico fuori allowlist, inviato in locale, non ha creato sessioni;
- da un clone su una macchina diversa da quella usata in precedenza, con il port forward sulla porta della regola di sviluppo e senza modifiche su Meta, lo sviluppo ha risposto sul proprio numero; la produzione ha risposto sia con il port forward aperto sia dopo averlo chiuso;
- durante la prova la rimozione di un record DNS jolly ha reso l'hostname di produzione irraggiungibile (NXDOMAIN) senza errori su `jarvis`; il CNAME dedicato ha ripristinato le risposte 404, 403 e 401 attese.

Limiti: il rifiuto del numero non autorizzato non è stato provato con un telefono reale attraverso Meta, né è stata osservata l'assenza di risposte in uscita; il filtro dei log non è stato osservato su richieste reali: dopo le prove il journal di cloudflared non conteneva righe con l'hostname o il percorso, ma non è stato verificato se cloudflared le avrebbe registrate senza filtro.
