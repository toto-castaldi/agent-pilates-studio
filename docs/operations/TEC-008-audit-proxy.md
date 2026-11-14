# TEC-008 — Audit privacy dei log del proxy

**Data:** 2026-11-14

**Stato:** audit eseguito con indicatori sintetici.

- **Log locali del proxy:** conformi nei formati e negli esiti osservati, salvo una riga storica precedente al filtro.
- **Cloudflare:** esposizione confermata: i dataset di analytics conservano la query string, compreso il verify token reale delle verifiche Meta.
- **Decisione dell'utente:** nessuna rotazione e accettazione del rischio residuo fino alla scadenza della retention, verify token monouso per il futuro (§6).

Questo documento non dichiara la conformità completa a REQ-NFR-002: le parti non osservabili o non verificate restano indicate come tali.

## 1. Ambito e autorizzazioni

Il proxy è il percorso pubblico dei webhook WhatsApp: edge Cloudflare, tunnel `cloudflared` condiviso su `jarvis`, porte loopback del gateway.

- **Produzione:** `agent-pilates-studio.toto-castaldi.com`; `/whatsapp/webhook` porta a `127.0.0.1:18190`, tutto il resto risponde 404.
- **Sviluppo:** `pilates-dev.toto-castaldi.com`; `/webhooks/whatsapp` porta a `127.0.0.1:8300`, raggiunta dal clone collegato con `ssh -R`.

L'audit copre:

- i log Cloudflare pertinenti (dataset, campi, conservazione e prodotti di log dell'account);
- i log locali di `cloudflared` (formati, livello, destinazioni, filtro journald, inoltri, conservazione);
- gli esiti principali del proxy.

I log Docker di Hermes, broker e PostgreSQL restano verificati da TEC-005 e `test:hermes` (solo eventi fissi). Sessioni e backup non sono log.

Autorizzazioni e decisioni dell'utente del 2026-11-14, inoltrate dall'orchestratore:

1. SSH su `jarvis` e sudo **in sola lettura** per configurazioni e journal. Nessuna stampa di log grezzi, segreti, messaggi o numeri: il filtraggio avviene sul server, che restituisce solo conteggi ed evidenze non sensibili. La raccolta con sudo l'ha eseguita l'utente nel proprio terminale, inserendo la password (17:39 e 17:57 UTC); il worker ne ha usato soltanto il riepilogo privato.
2. Richieste HTTPS con soli indicatori sintetici verso produzione e sviluppo. Origine **temporanea** su `127.0.0.1:8300` solo se la porta è libera, senza fermare servizi né cambiare lo stack, e con la chiusura del solo processo dell'audit, anche in caso di errore.
3. Token API Cloudflare **in sola lettura**: Account Analytics Read e Logs Read sull'account, Analytics Read e Logs Read sulla zona, scadenza consigliata di 7 giorni.
   - Il token sta in un file privato `0600` fuori dal repository, letto solo dal processo che esegue le richieste.
   - Non si usano permessi di scrittura: l'elenco dei job Logpush richiede Logs Write e quindi non è stato richiesto.
   - Il token va **revocato al termine dell'item**: con Analytics Read può leggere i dataset che contengono i verify token.
4. Ogni mitigazione infrastrutturale, rotazione o modifica di configurazione richiede una **nuova** autorizzazione. Nessuna è stata concessa (§6).
5. L'utente **non esegue** i controlli dal dashboard (Logpush di zona e di account, dataset Log Explorer della zona): restano non verificati.
6. Streaming remoto vietato (REQ-NFR-004): dashboard Live logs, `cloudflared tail`, Instant Logs e strumenti equivalenti non sono stati avviati né usati.

## 2. Prova ripetibile: `npm run proxy:audit`

Lo strumento si lancia dal PC dell'operatore, in un clone del repository. Su `jarvis` non resta alcun file: il collector Python viene inviato via SSH sullo standard input.

```bash
npm run proxy:audit                                    # raccolta e prove; Cloudflare non verificato
npm run proxy:audit -- --cloudflare-config /percorso/privato/cloudflare   # anche le verifiche Cloudflare
npm run proxy:audit -- privileged                      # operatore: password sudo, fatti leggibili solo da root
npm run proxy:audit -- cloudflare --run .local/proxy-audit/run-<id>.json --cloudflare-config /percorso/privato/cloudflare
```

Opzioni:

- `--host <alias ssh>`: predefinito `jarvis`;
- `--no-dev`, `--no-origin`;
- `--wait-minutes <n>`: attesa dell'ingestione Cloudflare, predefinita 10;
- `--dev-token-rotated <AAAA-MM-GGTHH:MMZ>`: istante di rotazione del token di sviluppo dichiarato dall'operatore; la configurazione dello sviluppo non viene letta.

Sequenza di `run`:

1. **Raccolta iniziale (`pre`).** In sola lettura raccoglie:
   - unità `cloudflared`: stato, argomenti, ambiente, destinazione di stdout/stderr, `LogFilterPatterns`;
   - versione e SHA-256 del binario;
   - configurazione, utilizzo e voci più vecchie del journal, righe storiche con gli hostname;
   - syslog e rotazione, dump di memoria, agenti di raccolta, auditd, porte 8300/18190;
   - data di modifica del file del verify token di produzione, mai il contenuto.

   Scrive nel journal una sola riga sintetica di controllo positivo.
2. **Prove di produzione:** 404 sul resto dell'hostname, 403 (verify token sintetico errato), 401 (POST senza firma o con firma errata), richiesta con user-agent Python, bloccata dall'edge.
3. **Prove di sviluppo**, solo se la porta 8300 è libera: 502 con origine assente. Poi un'origine temporanea (`scripts/proxy-audit-origin.py`) produce 200, 500, chiusura brusca della connessione (502) e una richiesta annullata dal client. L'origine non registra nulla, non scrive su disco e termina alla chiusura dello standard input o dopo 180 secondi.
4. **Raccolta finale (`post`).** Conta le occorrenze dei marcatori in tutti i campi del journal (`journalctl -o export`) e nei file syslog aggiornati. Conta i formati di `cloudflared` comparsi durante la prova e verifica che la porta 8300 sia di nuovo libera.
5. **Verifiche Cloudflare**, se è indicato il file privato: solo richieste in elenco consentito (`ALLOWED_REQUESTS`).
6. **Confronto del binario** con i checksum pubblicati nelle note della release ufficiale di `cloudflared` (GitHub, senza credenziali).

**Marcatori.** Ogni esecuzione genera marcatori sintetici univoci `pxaudit<id>…`, posti in query, header, user-agent, referer, percorso, firma e corpo. I telefoni sono numeri fittizi nordamericani `555-01xx`, inventati. I marcatori non sono mai negli argomenti dei processi remoti.

**Output e privacy.** Il collector stampa solo righe `chiave=valore` con conteggi, enumerazioni, versioni e checksum, convalidate da uno schema rigido (`parseSummary`). Non stampa mai righe di log, valori di configurazione, segreti, messaggi o numeri. Delle righe storiche indica soltanto il formato dei token: generato (64 esadecimali), sintetico o altro.

**Verifiche Cloudflare.**

- Gli eventi sintetici si cercano per Ray ID con il solo Ray ID selezionato. Ogni campo si legge poi con una richiesta separata, su due finestre (fino a 15 minuti dopo la prova e fino all'istante della richiesta), unendo i risultati per Ray ID.
- I dataset adattivi rispondono in modo diverso secondo la selezione e la finestra: selezioni ampie, o una finestra che termina nel futuro prossimo, possono non restituire eventi presenti.
- Lo strumento ripete soltanto le letture mancanti fino all'attesa massima. Un campo non restituito è segnalato come non verificato, mai considerato assente.
- Per le richieste reali si contano soltanto le date, usando host ed esito come filtri: la query string non viene mai richiesta.

**Stato privato.** Report, stato dell'esecuzione ed evidenze Cloudflare vanno in `.local/proxy-audit/` (directory `0700`, file `0600`, ignorata da Git) e contengono solo dati sintetici e metadati.

**Codici di uscita.** 0 = nessuna esposizione e tutto verificato; 1 = esposizioni; 3 = nessuna esposizione nelle parti verificate, ma alcune parti non sono verificate; 2 = errore d'uso o di configurazione.

**Raccolta privilegiata.** `privileged` crea una directory temporanea privata su `jarvis` e vi copia il collector. Lo esegue con `sudo` in un terminale interattivo, in cui l'operatore inserisce la password. Recupera il riepilogo e rimuove sempre la directory. Sono leggibili solo da root:

- livello, destinazioni dei log e ambito dell'endpoint metriche in `config.yml`;
- regole di ingresso (`cloudflared tunnel ingress rule`);
- nomi delle variabili `TUNNEL_*` del processo e dei file d'ambiente.

Il riepilogo resta valido 24 ore per le esecuzioni successive.

**Quando ripetere:**

- dopo un aggiornamento di `cloudflared`;
- dopo modifiche a tunnel, journald o rsyslog;
- dopo nuove verifiche del webhook su Meta e rotazioni;
- comunque prima dell'accettazione della release.

Le prove inviano poche richieste sintetiche e non modificano servizi.

## 3. Destinazioni, campi e conservazione

| Destinazione | Dati pertinenti | Conservazione | Evidenza | Esito |
| --- | --- | --- | --- | --- |
| Journal di `jarvis`, unità `cloudflared` (stdout/stderr) | Righe di livello info: errori di richiesta e connessione | Journal persistente senza limiti espliciti (`SystemMaxUse` e `MaxRetentionSec` non impostati, valore predefinito 10% del filesystem, massimo 4 GiB); 1,7 GiB usati, voce più vecchia 2026-05-30 (di `cloudflared` 2026-06-02) | Raccolta `pre`/`post` | Righe con URL scartate dal filtro; nessun marcatore |
| Filtro journald (`35-pilates-privacy.conf`) | Due pattern di esclusione, produzione e sviluppo, anche in maiuscolo e in JSON | Applicato prima di memorizzazione e inoltri (systemd v259) | Valutazione dei pattern effettivi su righe sintetiche, codice systemd | Efficace |
| rsyslog (`/var/log/syslog*`) | Copia inoltrata delle righe ammesse dal journal (`ForwardToSyslog=yes`) | Rotazione settimanale, 4 copie | Conteggi sui 5 file | Nessun marcatore; righe storiche al §6.2 |
| File di log, trace e debug di `cloudflared` | Nessun `logfile`, `log-directory` o `trace-output`; livello non impostato (predefinito info) | — | Argomenti e ambiente dell'unità; raccolta privilegiata su `config.yml`, ambiente del processo e file d'ambiente | Conforme |
| Endpoint metriche di `cloudflared` | Contatori, configurazione di ingresso, profili runtime, diagnostica; nessun log delle richieste | — | `metrics` solo su loopback (raccolta privilegiata), [`metrics.go`](https://github.com/cloudflare/cloudflared/blob/2026.10.7/metrics/metrics.go) | Non è un log |
| Messaggi del gestore systemd | Riga di comando di `cloudflared` («Started …») | Come il journal | Nessun token del tunnel negli argomenti, nella configurazione o nell'ambiente | Conforme |
| Dump di memoria | Apport attivo, `LimitCORE=infinity` | `/var/crash` | Nessun crash report di `cloudflared` | Rischio residuo teorico |
| Agenti di raccolta e inoltro, auditd | Nessun agente noto attivo; auditd non attivo | — | `systemctl is-active` su elenco fisso | Nessuna destinazione esterna locale |
| Cloudflare `httpRequestsAdaptive` (zona 31 giorni, account 32 giorni) | Host, percorso, **query string**, user-agent, IP, esito, Ray ID; non header né corpo | Campionamento adattivo; eventi e campi leggibili da meno di 2 a circa 15 minuti dopo la richiesta, secondo la forma della query | Impostazioni GraphQL e marcatori sintetici per Ray ID | **Query string conservata** |
| Cloudflare `firewallEventsAdaptive`, `firewallEventsAdaptiveByTimeGroups` (31 giorni) | Come sopra per le richieste mitigate, anche referer | — | Prova bloccata dall'edge ritrovata con la query | **Query string conservata** |
| Cloudflare `httpRequestsAdaptiveGroups` e analoghi | Percorso, user-agent, IP aggregati, senza query | 31-32 giorni | Impostazioni GraphQL | Nessun segreto |
| Log Explorer dell'account (log non campionati, componente a pagamento) | Campi scelti all'attivazione | 30 giorni | Elenco vuoto (HTTP 200) | Nessun dataset |
| Log Explorer della zona | Come sopra | 30 giorni | Elenco e conteggio negati al token (HTTP 403, codici 400 e 10004); controllo dal dashboard non eseguito per scelta dell'utente | **Non verificato** |
| Logpush (esportazioni) | Dipende dal job | — | L'elenco richiede Logs Write, permesso di modifica non concesso; l'operatore dichiara che non sono configurate (TEC-005); controllo dal dashboard non eseguito | **Non verificato** |
| Logpull (log completi, funzione Enterprise) | Tutti i campi HTTP | 7 giorni se attivo | Flag di retention non leggibile (HTTP 401, codice 10000) | **Non verificato** |
| Live logs, `cloudflared tail`, Instant Logs | Flussi in tempo reale, anche a livello debug con URL e header | Non memorizzati: il codice invia gli eventi solo alle sessioni attive | Documentazione Cloudflare; [`management/logger.go`](https://github.com/cloudflare/cloudflared/blob/2026.10.7/management/logger.go) | Non avviati (REQ-NFR-004) |
| Configurazione del tunnel inviata a Cloudflare | Regole di ingresso locali (hostname, servizi), mostrate nel dashboard | — | [`connection/control.go`](https://github.com/cloudflare/cloudflared/blob/2026.10.7/connection/control.go) | Non è un log, nessun segreto |
| Sistemi interni Cloudflare | Terminazione TLS all'edge, log operativi interni | Secondo le politiche Cloudflare | Non osservabili dall'account | **Non verificabile** |

L'elenco completo dei dataset GraphQL disponibili è nelle evidenze private delle esecuzioni: 62 di zona, di cui 45 abilitati, e 254 di account, di cui 202 abilitati. I soli dataset con query string della richiesta sono quelli indicati in tabella.

## 4. Formati locali di `cloudflared`

Versione 2026.10.7, protocollo QUIC osservato nel journal, aggiornamento automatico disabilitato (`--no-autoupdate`). Livello di log non impostato in argomenti, configurazione o ambiente, quindi info. Lo SHA-256 del binario installato coincide con l'asset ufficiale `cloudflared-linux-amd64` della [release 2026.10.7](https://github.com/cloudflare/cloudflared/releases/tag/2026.10.7): il codice ispezionato è quello in esecuzione.

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

## 5. Esecuzioni del 2026-11-14

| Esecuzione (UTC) | Esito |
| --- | --- |
| `d59941a7` (13:33) | Locale: nessuna esposizione, 40 marcatori assenti, controllo positivo trovato; origine temporanea chiusa e porta 8300 di nuovo libera |
| `d1f5d25d` (13:41, con Cloudflare) | Locale invariato. Cloudflare: 12 eventi HTTP su 12 entro 2 minuti; marcatori di query presenti per tutte le prove con query; header, firma, telefono e messaggio assenti; prova bloccata dall'edge presente con la query negli eventi firewall |
| `a5daa077` (14:50) | Classificazione delle righe storiche per formato (§6.2); binario verificato rispetto alla release |
| Raccolte privilegiate (17:39, 17:57) | Configurazione senza livello, file di log, trace, output o token; endpoint metriche su loopback; ingresso come documentato; nessuna variabile `TUNNEL_*`; nessun crash report |
| `1a914556` (17:41) e `0ae90a75` (18:07), con Cloudflare | Locale e privilegiato conformi. Con la lettura iniziale, a selezione ampia, gli eventi HTTP risultavano assenti. Una prova di soli conteggi li ha trovati tutti con il solo Ray ID o con una finestra fino all'istante della richiesta: da qui la lettura campo per campo su più finestre. Riletti così, 12 su 12 con la query conservata |
| `1ee141b9` (18:30, con Cloudflare) | **Riferimento finale.** Locale e privilegiato conformi, tutti gli esiti attesi. Cloudflare: 12 eventi su 12 con tutti i campi, i più lenti leggibili circa 15 minuti dopo le prove; query conservata, header e corpo assenti; evento firewall con la query |

Esiti ottenuti in tutte le esecuzioni:

- `prod-root`, `prod-health`, `prod-subpath`: 404;
- `prod-verify`: 403;
- `prod-unsigned`, `prod-badsig`: 401;
- `prod-python`: 403 dall'edge;
- `dev-verify`, `dev-post`: 502;
- `origin-ok`: 200; `origin-error`: 500; `origin-reset`: 502;
- `origin-cancel`: annullata.

Richieste di verifica conservate negli ultimi 31 giorni, esclusi i marcatori dell'audit; per ogni host ed esito si conta solo la data:

| Host | 200 | 403 | 5xx | Altri esiti |
| --- | --- | --- | --- | --- |
| Produzione | 1 (2026-11-10) | 4 | 0 | 0 |
| Sviluppo | 2 (ultima 2026-11-05) | 6 | 11 | 3 |

Solo il token corretto ottiene 200: **i verify token reali di produzione e sviluppo sono leggibili** nei dataset di analytics. La produzione fino a circa il 2026-12-11, lo sviluppo fino a circa il 2026-12-06; un giorno in più a livello di account.

## 6. Esposizioni, mitigazioni e decisioni

### 6.1 Query string conservata da Cloudflare

La verifica del webhook di Meta è una GET con `hub.verify_token` e `hub.challenge` nella query. Cloudflare conserva la query per 31-32 giorni in `httpRequestsAdaptive` e negli eventi firewall: chiunque abbia Analytics Read sulla zona o sull'account, compreso il token dell'audit, e Cloudflare stessa possono leggere il token.

Le notifiche dei messaggi sono POST senza query: telefoni e testi stanno nel corpo, che non è tra i campi conservati. L'impatto del verify token è limitato: serve solo all'handshake, mentre le notifiche sono autenticate dalla firma HMAC con l'app secret, che non transita. È comunque una credenziale in un log, contraria a REQ-NFR-002. Su questo piano Cloudflare non permette di escludere la query dai dataset di analytics, e una riscrittura dell'URL all'edge non cambia la richiesta registrata.

**Decisione dell'utente (2026-11-14), registrata in REQ-NFR-002:**

- nessuna rotazione dei verify token di produzione e sviluppo;
- rischio residuo accettato fino alla scadenza della retention (circa 2026-12-06 per lo sviluppo e 2026-12-11 per la produzione);
- per le verifiche future si adotta il **verify token monouso**: subito dopo ogni verifica riuscita su Meta il valore lato server si sostituisce con uno nuovo, non comunicato a Meta ([procedura](TEC-036-whatsapp-ambienti.md#verify-token-monouso));
- nessuna rotazione o modifica infrastrutturale autorizzata; nessuna dichiarazione di conformità.

La regressione è automatica: `proxy:audit` legge solo la data di modifica del file del token di produzione e considera mitigato un token conservato se la rotazione è successiva all'ultima verifica accettata. Finché la retention non scade, l'esecuzione resta con esito 1 per l'esposizione accettata.

### 6.2 Riga storica di sviluppo precedente al filtro

Nel journal restano 317 righe di `cloudflared` con l'hostname di sviluppo, l'ultima del 2026-11-04, anteriori al filtro installato con TEC-005. Una sola ha una query, con un parametro di verifica di formato «altro»: né 64 esadecimali generati né sintetico riconoscibile.

In syslog le righe con parametro di verifica sono 3, con 4 valori: 3 sintetici, nei messaggi del gestore systemd delle prove del filtro, e 1 «altro», la copia inoltrata della stessa riga.

Il contenuto non è stato letto: non è stabilito se il valore fosse reale. Il journal non consente di cancellare singole voci e la rimozione selettiva da syslog sarebbe un intervento sui log di sistema. La copia in syslog esce dalla rotazione entro circa cinque settimane, mentre quella nel journal resta finché lo spazio occupato non supera il limite. **Decisione dell'utente (2026-11-14):** rischio residuo accettato, nessun intervento.

### 6.3 Altri rischi residui

- **Dump di memoria:** un crash di `cloudflared` potrebbe salvare la memoria del processo tramite apport (`LimitCORE=infinity`). Nessun crash report è presente. Mitigazione opzionale non autorizzata: `LimitCORE=0` nel drop-in dell'unità.
- **Livello debug, file di log e streaming:** un cambio di configurazione o una sessione Live logs a livello debug esporrebbe URL e header. `proxy:audit` controlla livello, file e righe di debug a ogni esecuzione; lo streaming resta vietato da REQ-NFR-004.
- **Token dell'audit:** con Analytics Read legge i dataset che contengono i verify token. **Revocarlo al termine dell'item**, comunque prima della scadenza di 7 giorni.

## 7. Esito rispetto a REQ-NFR-002

- **Log locali del proxy:** nelle parti verificate, comprese quelle privilegiate, non contengono credenziali, messaggi o numeri provenienti dalle prove sintetiche. Le righe con URL sono scartate dal filtro prima di memorizzazione e inoltri, e quelle conservate non contengono dati della richiesta. Resta la riga storica del §6.2, di origine non determinata, accettata come rischio residuo.
- **Cloudflare:** **non conforme** per la query string. I verify token reali sono conservati nei dataset di analytics fino alla scadenza della retention, con rischio accettato dall'utente. Corpi, header e firme non sono conservati.
- **Non verificato:** job Logpush, dataset Log Explorer della zona e flag Logpull, per token in sola lettura, permessi di modifica non concessi e controlli dal dashboard non eseguiti. **Non verificabili:** i sistemi interni Cloudflare.
- **Decisione ancora necessaria alla chiusura della versione:** accettare come limiti le parti non verificate oppure verificarle dal dashboard, senza Live logs. Facoltativi `LimitCORE=0` e una nuova esecuzione di `proxy:audit` dopo la scadenza della retention.

## 8. Limiti

- Prove con soli marcatori sintetici e poche richieste: non dimostrano l'assenza di ogni possibile fuga, né coprono i percorsi websocket e TCP, non usati dal webhook. Le righe oltre `LineMax` (48 KiB) verrebbero spezzate, caso non plausibile per gli URL dei webhook.
- I dataset adattivi di Cloudflare sono campionati. Le risposte dipendono dalla forma della query e dalla finestra, e i campi diventano leggibili con ritardi diversi: osservati fino a circa 15 minuti. L'assenza di un evento o di un campo non è prova di non conservazione, e i conteggi delle richieste reali (letti con selezioni minime) possono essere inferiori al vero. La conservazione della query è comunque provata da più esecuzioni indipendenti.
- Le classi di formato dei token storici sono euristiche: «altro» non distingue un valore reale da uno sintetico senza parole chiave.
- Il filtro locale si basa sull'hostname: una riga sensibile senza hostname non sarebbe scartata. Nei formati del tag ispezionato tali righe non contengono URL, header o corpi.
- Una nuova versione di `cloudflared`, di systemd o una diversa configurazione può cambiare i risultati: ripetere `proxy:audit`.
