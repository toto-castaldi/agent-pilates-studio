# TEC-008 — Audit privacy dei log del proxy

**Data:** 2026-11-14

**Stato:** audit eseguito con indicatori sintetici. Esito: log locali del proxy conformi nei formati e negli esiti osservati, salvo una riga storica precedente al filtro. Esposizione Cloudflare confermata: i dataset di analytics conservano la query string, compreso il verify token reale delle verifiche Meta. Mitigazione e decisione: [sezione 6](#6-esposizioni-mitigazioni-e-decisioni). Questo documento non dichiara la conformità completa a REQ-NFR-002: le parti non osservabili restano elencate come tali.

## 1. Ambito e autorizzazioni

Il proxy è il percorso pubblico dei webhook WhatsApp. Le richieste passano dall'edge Cloudflare, dal tunnel `cloudflared` condiviso su `jarvis` e arrivano alle porte loopback del gateway. La produzione usa `agent-pilates-studio.toto-castaldi.com` (`/whatsapp/webhook` → `127.0.0.1:18190`, tutto il resto risponde 404). Lo sviluppo usa `pilates-dev.toto-castaldi.com` (`/webhooks/whatsapp` → `127.0.0.1:8300`, raggiunta dal clone collegato con `ssh -R`). L'audit copre:

- i log Cloudflare pertinenti (dataset, campi, conservazione e prodotti di log dell'account);
- i log locali di `cloudflared` (formati, livello, destinazioni, filtro journald, inoltri, conservazione);
- gli esiti principali del proxy.

I log Docker di Hermes, broker e PostgreSQL restano verificati da TEC-005 e `test:hermes` (solo eventi fissi). Sessioni e backup non sono log.

Autorizzazioni dell'utente del 2026-11-14, inoltrate dall'orchestratore:

1. SSH su `jarvis` e sudo **in sola lettura** per configurazioni e journal; la password sudo la inserisce l'operatore. Nessuna stampa di log grezzi, segreti, messaggi o numeri: il filtraggio avviene sul server, che restituisce solo conteggi ed evidenze non sensibili.
2. Richieste HTTPS con soli indicatori sintetici verso produzione e sviluppo. Origine **temporanea** su `127.0.0.1:8300` solo se la porta è libera, senza fermare servizi né cambiare lo stack, e con la chiusura del solo processo dell'audit, anche in caso di errore.
3. Token API Cloudflare **in sola lettura**: Account Analytics Read e Logs Read sull'account, Analytics Read e Logs Read sulla zona, scadenza consigliata di 7 giorni. Il token sta in un file privato `0600` fuori dal repository, letto solo dal processo che esegue le richieste. Non si usano permessi di scrittura: l'elenco dei job Logpush richiede Logs Write e quindi non è richiesto.
4. Ogni mitigazione infrastrutturale, rotazione o modifica di configurazione richiede una **nuova** autorizzazione.
5. Streaming remoto vietato (REQ-NFR-004): dashboard Live logs, `cloudflared tail`, Instant Logs e strumenti equivalenti non sono stati avviati né usati.

## 2. Prova ripetibile: `npm run proxy:audit`

Lo strumento si lancia dal PC dell'operatore, in un clone del repository. Su `jarvis` non resta alcun file: il collector Python viene inviato via SSH sullo standard input.

```bash
npm run proxy:audit                                    # raccolta e prove; Cloudflare non verificato
npm run proxy:audit -- --cloudflare-config /percorso/privato/cloudflare   # anche le verifiche Cloudflare
npm run proxy:audit -- privileged                      # operatore: password sudo, fatti leggibili solo da root
npm run proxy:audit -- cloudflare --run .local/proxy-audit/run-<id>.json --cloudflare-config /percorso/privato/cloudflare
```

Opzioni: `--host <alias ssh>` (predefinito `jarvis`), `--no-dev`, `--no-origin`, `--wait-minutes <n>` (attesa dell'ingestione Cloudflare, predefinita 10) e `--dev-token-rotated <AAAA-MM-GGTHH:MMZ>`. Quest'ultima è l'istante di rotazione del token di sviluppo dichiarato dall'operatore; la configurazione dello sviluppo non viene letta.

Sequenza di `run`:

1. **Raccolta iniziale (`pre`).** In sola lettura raccoglie: unità `cloudflared` (stato, argomenti, ambiente, destinazione di stdout/stderr, `LogFilterPatterns`), versione e SHA-256 del binario, configurazione e utilizzo del journal, voci più vecchie, righe storiche con gli hostname, syslog e rotazione, dump di memoria, agenti di raccolta, auditd e porte 8300/18190. Scrive nel journal una sola riga sintetica di controllo positivo.
2. **Prove di produzione:** 404 sul resto dell'hostname, 403 (verify token sintetico errato), 401 (POST senza firma o con firma errata), richiesta con user-agent Python, bloccata dall'edge.
3. **Prove di sviluppo**, solo se la porta 8300 è libera: 502 con origine assente. Poi un'origine temporanea (`scripts/proxy-audit-origin.py`) produce 200, 500, chiusura brusca della connessione (502) e una richiesta annullata dal client. L'origine non registra nulla, non scrive su disco e termina alla chiusura dello standard input o dopo 180 secondi.
4. **Raccolta finale (`post`).** Conta le occorrenze dei marcatori in tutti i campi del journal (`journalctl -o export`) e nei file syslog aggiornati. Conta i formati di `cloudflared` comparsi durante la prova e verifica che la porta 8300 sia di nuovo libera.
5. **Verifiche Cloudflare**, se è indicato il file privato: solo richieste in elenco consentito (`ALLOWED_REQUESTS`).
6. **Confronto del binario** con i checksum pubblicati nelle note della release ufficiale di `cloudflared` (GitHub, senza credenziali).

**Marcatori.** Ogni esecuzione genera marcatori sintetici univoci `pxaudit<id>…`, posti in query, header, user-agent, referer, percorso, firma e corpo. I telefoni sono numeri fittizi nordamericani `555-01xx`, inventati. I marcatori non sono mai negli argomenti dei processi remoti.

**Output e privacy.** Il collector stampa solo righe `chiave=valore` con conteggi, enumerazioni, versioni e checksum, convalidate da uno schema rigido (`parseSummary`): non stampa mai righe di log, valori di configurazione, segreti, messaggi o numeri.

**Verifiche Cloudflare.** Selezionano i soli campi necessari. Gli eventi sintetici sono cercati per Ray ID. Per le richieste reali si leggono solo data, host ed esito: la query string non viene mai richiesta.

**Stato privato.** Report, stato dell'esecuzione ed evidenze Cloudflare vanno in `.local/proxy-audit/` (directory `0700`, file `0600`, ignorata da Git) e contengono solo dati sintetici e metadati.

**Codici di uscita.** 0 = nessuna esposizione e tutto verificato; 1 = esposizioni; 3 = nessuna esposizione nelle parti verificate, ma alcune parti non sono verificate; 2 = errore d'uso o di configurazione.

**Raccolta privilegiata.** `privileged` crea una directory temporanea privata su `jarvis` e vi copia il collector. Lo esegue con `sudo` in un terminale interattivo, in cui l'operatore inserisce la password. Recupera il riepilogo e rimuove sempre la directory. Leggibili solo da root sono: livello e destinazioni dei log in `config.yml`, regole di ingresso (`cloudflared tunnel ingress rule`), nomi delle variabili `TUNNEL_*` del processo e dei file d'ambiente. Il riepilogo resta valido 24 ore per le esecuzioni successive.

**Quando ripetere:** dopo un aggiornamento di `cloudflared`, modifiche a tunnel, journald o rsyslog, nuove verifiche del webhook su Meta, rotazioni e, comunque, prima dell'accettazione della release. Le prove inviano poche richieste sintetiche e non modificano servizi.

## 3. Destinazioni, campi e conservazione

| Destinazione | Dati pertinenti | Conservazione | Evidenza | Esito |
| --- | --- | --- | --- | --- |
| Journal di `jarvis`, unità `cloudflared` (stdout/stderr) | Righe di livello info: errori di richiesta e connessione | Journal persistente senza limiti espliciti (`SystemMaxUse` e `MaxRetentionSec` non impostati, valore predefinito 10% del filesystem, massimo 4 GiB); 1,6 GiB usati, voce più vecchia 2026-05-30 (di `cloudflared` 2026-06-02) | Raccolta `pre`/`post` | Righe con URL scartate dal filtro; nessun marcatore |
| Filtro journald (`35-pilates-privacy.conf`) | Due pattern di esclusione, produzione e sviluppo, anche in maiuscolo e in JSON | Applicato prima di memorizzazione e inoltri (systemd v259) | Valutazione dei pattern effettivi su righe sintetiche, codice systemd | Efficace |
| rsyslog (`/var/log/syslog*`) | Copia inoltrata delle righe ammesse dal journal (`ForwardToSyslog=yes`) | Rotazione settimanale, 4 copie | Conteggi sui 5 file | Nessun marcatore; righe storiche al §6.2 |
| File di log, trace e debug di `cloudflared` | Nessun file previsto; il livello debug registrerebbe URL e header | — | Argomenti e ambiente dell'unità, privi delle opzioni; configurazione: raccolta privilegiata | Vedere §4 |
| Messaggi del gestore systemd | Riga di comando di `cloudflared` («Started …») | Come il journal | Nessun token del tunnel negli argomenti | Conforme |
| Dump di memoria | Apport attivo, `LimitCORE=infinity` | `/var/crash` | Nessun crash report di `cloudflared` | Rischio residuo teorico |
| Agenti di raccolta e inoltro, auditd | Nessun agente noto attivo; auditd non attivo | — | `systemctl is-active` su elenco fisso | Nessuna destinazione esterna locale |
| Cloudflare `httpRequestsAdaptive` (zona 31 giorni, account 32 giorni) | Host, percorso, **query string**, user-agent, IP, esito, Ray ID; non header né corpo | Campionamento adattivo; 12 eventi su 12 delle prove ritrovati senza campionamento | Impostazioni GraphQL e marcatori sintetici per Ray ID | **Query string conservata** |
| Cloudflare `firewallEventsAdaptive`, `firewallEventsAdaptiveByTimeGroups` (31 giorni) | Come sopra per le richieste mitigate, anche referer | — | Prova bloccata dall'edge ritrovata con la query | **Query string conservata** |
| Cloudflare `httpRequestsAdaptiveGroups` e analoghi | Percorso, user-agent, IP aggregati, senza query | 31-32 giorni | Impostazioni GraphQL | Nessun segreto |
| Log Explorer (log non campionati, componente aggiuntivo a pagamento) | Campi scelti all'attivazione | 30 giorni | Account: nessun dataset (HTTP 200, elenco vuoto). Zona: elenco e conteggio negati al token (HTTP 403, codice 10004) | Account verificato; zona da controllare dal dashboard |
| Logpush (esportazioni) | Dipende dal job | — | Elenco riservato a Logs Write, non usato; l'operatore dichiara che non sono configurate (TEC-005) | Non verificato via API |
| Logpull (log completi, funzione Enterprise) | Tutti i campi HTTP | 7 giorni se attivo | Flag di retention non leggibile (HTTP 401, codice 10000) | Non verificato |
| Live logs, `cloudflared tail`, Instant Logs | Flussi in tempo reale, anche a livello debug con URL e header | Non memorizzati: il codice invia gli eventi solo alle sessioni attive | Documentazione Cloudflare; `management/logger.go` del tag | Non avviati (REQ-NFR-004) |
| Configurazione del tunnel inviata a Cloudflare | Regole di ingresso locali (hostname, servizi), mostrate nel dashboard | — | `connection/control.go` del tag | Non è un log, nessun segreto |
| Sistemi interni Cloudflare | Terminazione TLS all'edge, log operativi interni | Secondo le politiche Cloudflare | Non osservabili dall'account | **Non verificabile** |

L'elenco completo dei dataset GraphQL disponibili (62 di zona, 45 abilitati; 254 di account, 202 abilitati) è nelle evidenze private dell'esecuzione. I soli dataset con query string della richiesta sono quelli indicati in tabella.

## 4. Formati locali di `cloudflared`

Versione 2026.10.7, protocollo QUIC osservato nel journal, aggiornamento automatico disabilitato (`--no-autoupdate`). Lo SHA-256 del binario installato coincide con l'asset ufficiale `cloudflared-linux-amd64` della [release 2026.10.7](https://github.com/cloudflare/cloudflared/releases/tag/2026.10.7): il codice ispezionato è quello in esecuzione. Riferimenti al codice del tag:

| Formato | Livello | Contenuto | Filtro per hostname |
| --- | --- | --- | --- |
| `Request failed` ([`quic_connection.go`](https://github.com/cloudflare/cloudflared/blob/2026.10.7/connection/quic_connection.go)) | error | `type`, `dest` = URL completo con query, `error` | Scartato: contiene l'hostname |
| Errore del proxy senza messaggio ([`proxy/logger.go`](https://github.com/cloudflare/cloudflared/blob/2026.10.7/proxy/logger.go), [`proxy.go`](https://github.com/cloudflare/cloudflared/blob/2026.10.7/proxy/proxy.go)) | error | `cfRay`, `connIndex`, `event`, `ingressRule`, `originService` (porta loopback), testo dell'errore del trasporto («Unable to reach the origin service…», «Incoming request ended abruptly…») | Conservato: senza URL, header né corpo |
| `failed to serve incoming request` ([`http2.go`](https://github.com/cloudflare/cloudflared/blob/2026.10.7/connection/http2.go)) | error | Errore del trasporto, senza URL | Conservato (solo con HTTP/2) |
| Richiesta e risposta (`logHTTPRequest`, `logOriginHTTPResponse`) | debug | Metodo, URL con query, host, percorso, **tutti gli header** | Scartato se contiene l'hostname; livello debug non configurato |
| `Settings:` all'avvio ([`configuration.go`](https://github.com/cloudflare/cloudflared/blob/2026.10.7/cmd/cloudflared/tunnel/configuration.go)) | info | Opzioni, con i segreti mascherati | Non pertinente |
| Output JSON (`--output json`) | come sopra | Stessi campi | Il pattern trova l'hostname anche nel JSON |

Durante le prove sono comparse soltanto righe senza URL: 3 «Unable to reach the origin service» (502 e chiusura brusca) e 1 «Incoming request ended abruptly» (richiesta annullata). Nessuna riga conteneva gli hostname e nessuno dei 40 marcatori era presente. Gli esiti 200, 401, 403, 404 e 500 non producono righe a livello info. Le righe `Request failed` con `dest` vengono scartate dal filtro e non sono osservabili localmente: la loro esistenza deriva dal codice e dall'evidenza di TEC-005 prima del filtro.

[`journald-client.c`](https://github.com/systemd/systemd/blob/v259/src/journal/journald-client.c) valuta prima i pattern di esclusione e poi quelli di inclusione, sul solo campo `MESSAGE`. [`journald-stream.c`](https://github.com/systemd/systemd/blob/v259/src/journal/journald-stream.c) applica il filtro **prima** di inoltrare a syslog, kmsg, console e wall.

Limiti: righe oltre `LineMax` (48 KiB) vengono spezzate e la parte senza hostname sarebbe conservata, caso non plausibile per gli URL dei webhook. Non sono stati esercitati i percorsi websocket e TCP, non usati dal webhook. Nuove versioni possono cambiare i formati: ripetere l'audit.

## 5. Esecuzioni del 2026-11-14

| Esecuzione | Esito |
| --- | --- |
| `d59941a7` (13:33 UTC) | Locale: nessuna esposizione, 40 marcatori assenti, controllo positivo trovato; origine temporanea chiusa e porta 8300 di nuovo libera |
| `d1f5d25d` (13:41 UTC, con Cloudflare) | Locale invariato. Cloudflare: 12 eventi su 12 ritrovati; marcatori di query presenti in `clientRequestQuery` per tutte le prove con query; header, firma, telefono e messaggio assenti; prova bloccata dall'edge presente anche negli eventi firewall con la query |

Esiti ottenuti in entrambe: `prod-root`, `prod-health` e `prod-subpath` 404; `prod-verify` 403; `prod-unsigned` e `prod-badsig` 401; `prod-python` 403 dall'edge; `dev-verify` e `dev-post` 502; `origin-ok` 200; `origin-error` 500; `origin-reset` 502; `origin-cancel` annullata.

Richieste di verifica conservate negli ultimi 31 giorni, esclusi i marcatori dell'audit, contando solo data, host ed esito: produzione 1 con esito 200 (2026-11-10) e 4 con 403; sviluppo 2 con esito 200 (ultima 2026-11-05), 6 con 403, 11 con 5xx e 3 con altri esiti. Solo il token corretto ottiene 200: **i verify token reali di produzione e sviluppo sono leggibili** nei dataset di analytics fino a circa il 2026-12-11 (produzione) e il 2026-12-06 (sviluppo), un giorno in più a livello di account.

## 6. Esposizioni, mitigazioni e decisioni

### 6.1 Query string conservata da Cloudflare

La verifica del webhook di Meta è una GET con `hub.verify_token` e `hub.challenge` nella query. Cloudflare conserva la query per 31-32 giorni in `httpRequestsAdaptive` e negli eventi firewall: chiunque abbia Analytics Read sulla zona o sull'account, compreso il token dell'audit, e Cloudflare stessa possono leggere il token. Le notifiche dei messaggi sono POST senza query: telefoni e testi stanno nel corpo, che non è tra i campi conservati. L'impatto del verify token è limitato: serve solo all'handshake, mentre le notifiche sono autenticate dalla firma HMAC con l'app secret, che non transita. È comunque una credenziale in un log, contraria a REQ-NFR-002.

Cloudflare non permette di escludere la query dai dataset di analytics su questo piano, e una riscrittura dell'URL all'edge non cambia la richiesta registrata. Mitigazione proposta: un **verify token monouso**. Subito dopo ogni verifica riuscita su Meta, il valore lato server si sostituisce con un nuovo valore casuale non comunicato a Meta, così il valore conservato non è più valido. Meta usa il token solo quando si salva o modifica il webhook: una nuova verifica richiede di impostare un nuovo token su Meta e di ruotarlo di nuovo subito dopo. La rotazione di produzione richiede l'aggiornamento con backup e la ricreazione di gateway e broker (turni interrotti). La regressione è automatica: `proxy:audit` legge solo la data di modifica del file del token e considera mitigato un token conservato se la rotazione è successiva all'ultima verifica accettata.

**Decisione:** in attesa dell'utente, per una nuova autorizzazione alla rotazione oppure per l'accettazione del rischio residuo fino alla scadenza della retention.

### 6.2 Riga storica di sviluppo precedente al filtro

Nel journal restano 317 righe di `cloudflared` con l'hostname di sviluppo, l'ultima del 2026-11-04, anteriori al filtro installato con TEC-005. Una sola ha una query, con un parametro di verifica di formato non riconducibile a un valore generato né a un valore sintetico. In syslog ce ne sono 3, delle quali almeno una è la copia inoltrata; le altre righe con gli hostname provengono da messaggi del gestore systemd delle prove del filtro. Il contenuto non è stato letto: non è stabilito se il valore fosse reale. Il journal non consente di cancellare singole voci e la rimozione selettiva da syslog sarebbe un intervento sui log di sistema. La rotazione del token di sviluppo rende comunque inutilizzabile un eventuale valore reale. Senza rotazione, la copia in syslog esce dalla rotazione entro circa cinque settimane, mentre quella nel journal resta finché lo spazio occupato non supera il limite.

### 6.3 Altri rischi residui

- **Dump di memoria:** un crash di `cloudflared` potrebbe salvare la memoria del processo tramite apport (`LimitCORE=infinity`). Nessun crash report è presente. Mitigazione opzionale: `LimitCORE=0` nel drop-in dell'unità, modifica infrastrutturale da autorizzare.
- **Livello debug, file di log e streaming:** un cambio di configurazione o una sessione Live logs a livello debug esporrebbe URL e header. `proxy:audit` controlla livello, file e righe di debug a ogni esecuzione; lo streaming resta vietato da REQ-NFR-004.
- **Token dell'audit:** con Analytics Read legge i dataset che contengono i verify token. Revocarlo a fine audit, comunque prima della scadenza di 7 giorni.

## 7. Esito rispetto a REQ-NFR-002

- **Log locali del proxy:** nelle parti verificate non contengono credenziali, messaggi o numeri provenienti dalle prove sintetiche. Le righe con URL sono scartate dal filtro prima di memorizzazione e inoltri, quelle conservate non contengono dati della richiesta. Restano la riga storica del §6.2, di origine non determinata, e i controlli privilegiati del §4.
- **Cloudflare:** **non conforme** per la query string. I verify token reali sono conservati nei dataset di analytics; corpi, header e firme non lo sono.
- **Non verificabile con gli accessi autorizzati:** job Logpush, dataset Log Explorer della zona, flag Logpull, sistemi interni Cloudflare. Per i primi due serve il controllo dal dashboard dell'operatore, senza Live logs.
- **Decisioni ancora necessarie per l'accettazione della release:** mitigazione o accettazione del §6.1; accettazione dei limiti non verificabili; eventuale `LimitCORE=0`.
