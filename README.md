# agent-pilates-studio

Progetto per installare e aggiornare [Hermes Agent](https://hermes-agent.nousresearch.com/), provarlo in locale e collegarlo a PostgreSQL, OpenRouter e WhatsApp Business.

## Stato

La v0.1.0 include una configurazione locale Compose per PostgreSQL e Hermes, con OpenRouter, il gateway WhatsApp Cloud nativo e un tool SQL diretto. Una prova reale ha verificato la conversazione WhatsApp tramite Hermes e OpenRouter e l'accesso SQL con il ruolo limitato.

## Scaffold e verifiche locali

Per lo scaffold servono Node.js LTS 24.14.0 e npm 11.9.0, le versioni usate per le verifiche. Il progetto accetta Node.js dalla 24.14.0 alla 24.x e npm dalla 11.9.0 alla 11.x; `.nvmrc` indica la versione di Node.js verificata. Con `nvm` si possono usare `nvm install` e `nvm use` dalla directory del progetto.

Da una copia pulita del repository:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Il gate rapido comprende lint, controllo dei tipi, test unitari e build; `npm ci` prepara le dipendenze da lockfile. `npm test` ricompila e usa il runner Node.js senza isolamento a processi: i test lavorano solo in memoria, senza filesystem, processi figli, Git, rete o Docker. `npm run build` rigenera `dist/`, includendo codice e test; la compilazione stessa usa filesystem e processi.

Le prove con effetti reali sono separate: `npm run test:local` verifica Git, file, processi e contratto CI; `npm run test:pi` richiede Pi 1.5.0; `npm run test:db`, `test:hermes`, `test:author`, `test:upgrade` e `test:start` richiedono Docker Compose. Eseguirle durante il lavoro quando servono per dimostrare i criteri; alla chiusura della versione eseguire tutte le suite di integrazione. Le prove end-to-end reali richiedono anche servizi e credenziali esterni.

## Integrazione continua

Il workflow `.github/workflows/ci.yml` viene eseguito su push, pull request e avvio manuale. Su un runner Linux usa Node.js da `.nvmrc`, installa le dipendenze ed esegue il gate rapido, `test:local`, `test:pi` con Pi 1.5.0 e le suite Docker `test:db`, `test:hermes`, `test:author`, `test:upgrade` e `test:start`. Prima prepara le immagini fissate dal progetto; i test creano risorse temporanee isolate e usano solo credenziali e dati sintetici. Un comando fallito rende negativo il job; non è previsto deploy automatico né servono segreti GitHub o credenziali Meta/OpenRouter. `test:local` controlla trigger, comandi e configurazione effettiva del workflow.

Le prove end-to-end con servizi e credenziali reali si eseguono separatamente come descritto in [Hermes e WhatsApp Cloud](#hermes-e-whatsapp-cloud); non fanno parte della CI.

## Configurazione Pi

Con Pi installato, avviarlo direttamente dalla radice del progetto:

```bash
pi
# Per scegliere una sessione: pi --resume
```

Il repository versiona `.pi/settings.json`, il template `.pi/prompts/start.md` e le skill in `.agents/skills/`. Dopo aver verificato le risorse, accordare fiducia al progetto in Pi per caricare le impostazioni e le risorse locali: la fiducia non è una sandbox e le estensioni possono eseguire codice. La configurazione può includere preferenze e riferimenti a pacchetti o percorsi dell'ambiente dell'operatore: la disponibilità di tali risorse su un altro computer non è garantita. Rivedere le modifiche al file versionato prima di condividerle e non inserirvi credenziali.

In una sessione Pi con fiducia accordata, `/start` richiede un riepilogo dello stato e delle attività, basato sui documenti del progetto, e un controllo Git in sola lettura. È un'istruzione al modello, non un blocco tecnico delle sue azioni: verificare le operazioni proposte. Dopo aver aggiunto o modificato il template in una sessione già aperta, usare `/reload` per ricaricarlo; il nome del file determina il comando.

Pi usa normalmente `~/.pi/agent` come directory personale; `PI_CODING_AGENT_DIR` può indicarne un'altra. Le impostazioni del progetto prevalgono sulle preferenze personali e le liste di risorse vengono combinate. `PI_CODING_AGENT_SESSION_DIR` o `--session-dir` possono cambiare la posizione delle sessioni. Nessun launcher del progetto impone la separazione: se la directory personale coincide con la `.pi` del progetto, le modifiche alle preferenze possono aggiornare `.pi/settings.json` versionato. Sessioni, autenticazione, log e altri dati locali possono essere sensibili: proteggerli e non inserirli in Git.

Per verificare Pi installato in modalità offline e senza credenziali reali, eseguire `npm run test:pi`. La prova avvia Pi direttamente in directory temporanee con impostazioni ed estensioni sintetiche: verifica caricamento delle risorse e precedenza, sia con directory distinte sia quando coincidono. Verifica anche il caricamento del template `/start` con fiducia accordata e la sua assenza senza fiducia, senza invocare un modello: non prova l'osservanza delle istruzioni né il ricaricamento interattivo. Non ispeziona né modifica la configurazione personale esistente e non verifica la disponibilità delle risorse esterne configurate dall'operatore. La modalità offline disabilita l'attività di rete automatica di Pi, ma non è una sandbox di rete.

## Avvio locale con un comando

Servono Node.js 24.14.0 e npm 11.9.0, Docker e Docker Compose funzionanti, rete per immagini e dipendenze e credenziali Meta/OpenRouter. Da un clone nuovo, copiare l'esempio e renderlo privato, quindi compilare `.env` con un editor locale, senza inserire i valori nella cronologia della shell o in chat:

```bash
cp .env.example .env
chmod 600 .env
# Compilare .env privatamente prima del comando seguente.
npm run start:local
```

Impostare tre password database casuali e distinte di almeno 16 caratteri, i valori Meta/OpenRouter, il verify token configurato anche su Meta e l'allowlist di numeri internazionali in sole cifre, separati da virgole. `WHATSAPP_PHONE_NUMBER_ID` è l'identificativo Meta, non un numero telefonico. L'esempio non contiene valori reali. `.env` e la directory `.local/secrets/` contengono credenziali: mantenerli privati, fuori da Git e conservarne copie cifrate. Se si usa `SECRETS_DIR`, la directory deve essere privata (`0700`) e i suoi file privati (`0600`).

Il comando reinstalla le dipendenze dal lockfile a ogni avvio, crea i file segreti senza sovrascriverli, avvia PostgreSQL, configura i ruoli, applica le migrazioni e avvia il broker e Hermes; aspetta gli healthcheck. A ogni esecuzione ricrea il gateway, interrompendo eventuali turni in corso, per applicare il contesto versionato aggiornato. Genera e conserva anche i file privati `db-broker` e `bridge-token`, indipendenti dalle tre password in `.env`. Non elimina volumi. Se i file di segreto esistono già, i rispettivi valori in `.env` devono coincidere: in particolare, per uno stack esistente l'operatore deve riportare privatamente in `.env` le credenziali già conservate, senza rigenerarle. Una differenza arresta il comando prima del bootstrap; la rotazione è un'operazione distinta e intenzionale. Usare un solo operatore alla volta.

In caso di configurazione non valida o errore il comando termina con esito negativo, senza stampare output grezzo o dati sensibili; verificare in privato configurazione, permessi, disponibilità Docker e porte. I servizi già avviati possono restare attivi dopo un errore. Verificare e arrestare senza eliminare i dati:

```bash
docker compose --env-file /dev/null ps
docker compose --env-file /dev/null stop
```

Questi comandi non caricano `.env`; usare lo stesso eventuale nome di progetto Compose impostato nell'ambiente per l'avvio. La salute locale non verifica Meta, OpenRouter o la raggiungibilità pubblica. Il port forwarding verso `jarvis` e il proxy HTTPS sono esterni al comando. Non pubblicare `/health`; la prova temporanea conclusa non autorizza l'uso pubblico continuativo. L'audit privacy del proxy resta aperto e **non** va avviato lo streaming remoto dei log del tunnel condiviso, nemmeno per diagnostica.

Per verificare il percorso con credenziali sintetiche e risorse Docker isolate: `npm run test:start`. Il test usa PostgreSQL reale, una rete interna per Hermes e rimuove solo il proprio progetto e i propri volumi temporanei; non prova le integrazioni reali Meta/OpenRouter.

## Database locale — procedura manuale alternativa

Servono Docker e Docker Compose funzionanti. Dalla directory del progetto, dopo `npm ci`:

```bash
npm run db:init-secrets
docker compose up -d --wait postgres
docker compose run --rm db-bootstrap
npm run db:migrate
```

I primi due comandi Docker non richiedono privilegi di migrazione nell'agente: `db-bootstrap` è un contenitore temporaneo con credenziali separate. Il comando di migrazione usa il file della sola credenziale di migrazione sul computer dell'operatore. Non montare la directory completa dei segreti nel contenitore dell'agente.

Su un host Linux con Docker ma senza Node.js, dopo aver creato i file dei segreti e avviato PostgreSQL e `db-bootstrap`, la migrazione può essere eseguita con `sh scripts/migrate-docker.sh`. Il comando costruisce un'immagine da Node.js 24.14.0 fissato per digest e dal lockfile, installando le dipendenze **prima** di montare il solo segreto di migrazione. Usa la rete host per raggiungere PostgreSQL su loopback; non è destinato a Docker Desktop. Impostare esplicitamente `SECRETS_DIR` e `POSTGRES_PORT` nell'ambiente se diversi dai valori predefiniti: lo script non legge `.env`.

`db:init-secrets` crea password casuali, il token interno del broker e un verify token WhatsApp in `.local/secrets/`, ignorata da Git, senza sovrascrivere quelli già presenti. Proteggere e conservare questi file: cancellare o sostituire la password amministrativa non la cambia nel database già inizializzato. Il progetto Compose si chiama `agent-pilates-v010`; i suoi volumi conservano i dati. `docker compose down` arresta i servizi senza eliminarli: non usare `down --volumes` se i dati devono essere conservati.

PostgreSQL ascolta solo su `127.0.0.1:55432`; impostare `POSTGRES_PORT` se la porta è occupata. `SECRETS_DIR` può indicare una directory privata alternativa, usata coerentemente nei comandi. Prisma applica le migrazioni versionate; lo schema `app` contiene clienti, regole, slot e legami della pianificazione. L'archivio delle sessioni di Hermes è separato.

Per verificare migrazioni e privilegi su un PostgreSQL reale isolato, eseguire:

```bash
npm run test:db
```

Il test crea un progetto Compose e un volume temporanei dedicati, applica anche una migrazione di prova su uno schema esistente, verifica DML e rifiuto di DDL e infine rimuove soltanto le proprie risorse. Scarica anche l'immagine ufficiale Hermes fissata dal progetto e verifica il plugin SQL tramite il registro reale dei suoi tool. Non effettua chiamate a OpenRouter o Meta.

## Hermes e WhatsApp Cloud

Per completare l'avvio servono un account OpenRouter e un'app Meta con WhatsApp Business configurata. Dopo `npm run db:init-secrets`, completare nella stessa directory privata i file seguenti, ciascuno contenente solo il valore indicato, con permessi `0600`. Il verify token è già generato dal comando. Usare un editor locale: non inserire i valori nel repository, nella cronologia della shell o in chat.

| File in `.local/secrets/` | Contenuto |
| ------------------------- | --------- |
| `openrouter-key` | Chiave API OpenRouter. |
| `whatsapp-access-token` | Token di accesso dell'app Meta. |
| `whatsapp-app-secret` | App secret Meta per verificare le firme webhook. |
| `whatsapp-verify-token` | Token generato automaticamente per la verifica iniziale del webhook; va impostato anche su Meta. |
| `whatsapp-allowed-users` | Numeri autorizzati separati da virgole, con prefisso internazionale, solo cifre. |
| `whatsapp-phone-number-id` | Phone Number ID dell'API Meta, non il numero telefonico. |

Se si usa `SECRETS_DIR`, creare i file in quella directory. `db-broker` e `bridge-token` sono generati da `db:init-secrets`; conservarli privatamente insieme agli altri segreti. Non montare `db-admin`, `db-migrator` o `db-broker` in Hermes: Compose gli fornisce solo la credenziale database dell'agente e il token del canale interno. Il broker non riceve credenziali dell'agente, amministrative o di migrazione.

Dopo aver inizializzato il database e creato i file, avviare Hermes:

```bash
docker compose up -d --build --wait author-broker
docker compose up -d --build --no-deps --force-recreate --wait hermes
docker compose ps
```

### Contesto dello studio

`hermes/SOUL.md` è la fonte versionata delle istruzioni e delle fasce orarie dell'assistente. Rivedere ogni modifica senza aggiungere dati reali o segreti; il file è montato in sola lettura su `/opt/data/SOUL.md` sia in locale sia nell'installazione descritta dalla procedura operativa. Dopo un aggiornamento usare il normale avvio con ricreazione del container, affinché il mount punti al file del nuovo commit. Non modificare una copia nel volume Hermes.

All'avvio il gateway richiede il refresh dei prompt delle sessioni: le sessioni già aperte ricostruiscono il prompt **al turno successivo**, conservando la cronologia; un turno già in corso non cambia. Se il refresh fallisce, il gateway non parte. Per una modifica in loco già visibile nel mount, senza ricreare il container, un operatore può richiedere esplicitamente il refresh con `docker compose exec --user 10000 hermes /opt/hermes/libexec/hermes-upstream sessions refresh-prompts`; non usare questa scorciatoia al posto di un aggiornamento versionato. La cronologia SQLite e i vecchi prompt possono contenere dati sensibili e restano nel volume e nei backup. Memoria e profilo integrati e provider di memoria esterni sono disabilitati; lo scanner anti-injection di Hermes non è una barriera di sicurezza.

L'ora corrente Europe/Rome viene aggiunta come metadato effimero a ogni richiesta del gateway al modello, anche nelle sessioni riprese; serve un orologio host sincronizzato. Il comportamento conversazionale resta da verificare con il modello reale negli scenari di TEC-012 e nelle relative User Story. `npm run test:author` verifica in isolamento caricamento, refresh, riavvio, data e confini dell'ora legale con gateway e modello sintetico.

### Configurazione del gateway

Il modello predefinito è `openai/gpt-6.1-terra`; `PILATES_MODEL` lo rende configurabile. Le opzioni e le credenziali del comando unico sono descritte in `.env.example`; la procedura manuale continua a usare i file di segreto separati. Il webhook è esposto solo su `127.0.0.1:18090` (`WHATSAPP_WEBHOOK_PORT` per cambiare porta). Un reverse proxy HTTPS già predisposto deve inoltrare **solo** il percorso del webhook a quella porta senza alterare il corpo della richiesta. Il percorso predefinito è `/whatsapp/webhook`; impostare `WHATSAPP_WEBHOOK_PATH` per usare un percorso già configurato. Configurare su Meta l'URL pubblico corrispondente, lo stesso verify token e la sottoscrizione all'evento `messages`. Non esporre `/health`. Configurare anche il proxy affinché non registri token nei parametri URL, numeri o corpi dei messaggi.

Il plugin nativo `studio_sql_query` riceve una singola query SQL ed eventuali parametri `$1`, `$2`, ecc. Hermes si collega come `studio_agent`: PostgreSQL autorizza il DML previsto e rifiuta il DDL sugli schemi. Per ogni turno WhatsApp ammesso un broker separato verifica nuovamente la firma e l'allowlist, associa l'identità alla transazione e la rende disponibile ai trigger; gli autori proposti dal modello sono ignorati. Senza prova attendibile il tool rifiuta la richiesta. Il broker accetta messaggi firmati fino a 5 minuti di età, con 30 secondi di tolleranza futura; un messaggio ritardato o un turno interrotto dal riavvio può richiedere un nuovo messaggio. Il broker non espone porte sull'host; solo il tool SQL è abilitato al modello. Non si usa MCP. **Eccezione accettata:** PostgreSQL permette comunque al ruolo di modificare la propria password, con il rischio di interrompere l'accesso; non sono privilegi esclusivamente DML in senso assoluto. I dati delle sessioni di Hermes sono in un volume SQLite separato da PostgreSQL e devono essere protetti.

Se la password del ruolo agente è stata cambiata accidentalmente, l'operatore può ripristinare quella contenuta nel file `db-agent` conservato esternamente, rieseguendo `docker compose run --rm db-bootstrap`. Il comando riallinea anche i ruoli di migrazione e broker ai rispettivi file: conservare i file originali e non rendere disponibile all'agente quello di migrazione.

**Privacy e diagnostica:** Hermes e PostgreSQL possono registrare messaggi, numeri o dati SQL. I loro entrypoint sopprimono l'output dei processi e inviano al logging Docker `local` soltanto gli eventi fissi `hermes_launch`, `hermes_preflight_failed` e `postgres_launch`, con rotazione limitata. Consultarli con `docker compose logs --tail=20 hermes postgres` e verificare stato e salute con `docker compose ps`; un evento di avvio non prova che il servizio sia sano. Non sono disponibili dettagli diagnostici degli errori. I test usano dati sintetici e non dimostrano l'assenza di ogni possibile fuga; non aggirare le protezioni con comandi o profili alternativi senza rivalutare la privacy.

Per una prova locale isolata del gateway nativo, della configurazione del plugin, delle firme webhook, dell'allowlist e dell'assenza dei dati sintetici dai log:

```bash
npm run test:hermes
npm run test:author
```

I test usano solo credenziali e messaggi sintetici, una rete Docker senza accesso esterno e risorse temporanee dedicate. `test:author` usa il gateway reale, un modello locale deterministico e PostgreSQL reale per verificare autori, concorrenza, contraffazione e replay. Non sostituisce una prova reale con Meta e OpenRouter. La risposta WhatsApp libera è soggetta alla finestra di 24 ore prevista da Meta. Al primo contatto Hermes può inviare un avviso sul proprio canale home; non occorre configurarlo per usare il webhook.

`npm run test:upgrade` verifica in un progetto Docker temporaneo e isolato un aggiornamento reale da PostgreSQL 17.9 a 17.10 e da Hermes 0.22.6 a 0.22.7, con credenziali e dati sintetici. Il test scarica immagini aggiuntive e non dimostra la compatibilità di altre versioni o degli aggiornamenti maggiori.

**Per la sola prova temporanea autorizzata**, dopo i controlli e con le mitigazioni descritte nella procedura operativa, per verificare una configurazione reale avviare il proxy HTTPS e inviare dal numero autorizzato un messaggio di prova; confermare la risposta sul dispositivo. Per verificare anche i privilegi si può chiedere al modello di eseguire `SELECT current_user` e di tentare `CREATE TEMP TABLE spike_permission_probe (id integer)`: il primo restituisce il ruolo agente e il secondo deve essere rifiutato. Non includere numeri, messaggi o credenziali nei rapporti.

Se il servizio non diventa sano o non risponde, verificare con `docker compose ps` che PostgreSQL e Hermes siano avviati, che tutti i file dei segreti richiesti esistano e abbiano permessi `0600`, che il percorso del proxy corrisponda a `WHATSAPP_WEBHOOK_PATH` e che le credenziali esterne siano valide. Non stampare i segreti per diagnostica. I dettagli dei log non sono disponibili con l'attuale mitigazione della privacy.

## Prerequisiti previsti per l'ambiente completo

- Docker e Docker Compose per l'ambiente locale e il server Linux di produzione.
- Un endpoint HTTPS pubblico già disponibile per i webhook Meta.
- App Meta WhatsApp Business configurata e credenziali per i servizi esterni; non inserire credenziali nel repository.

La [procedura operativa](docs/operations/TEC-005-continuita.md) descrive installazione intenzionale, backup quiescente e ripristino isolato. Gli script `scripts/backup.sh` e `scripts/restore.sh` non avviano Hermes durante il recupero e non cifrano i backup: proteggerli su supporti cifrati. La sola prova pubblica temporanea autorizzata è conclusa; l'audit completo dei log del proxy resta nel debito TEC-008 e l'uso continuativo non è autorizzato.
