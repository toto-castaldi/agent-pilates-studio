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

Il lint con Biome controlla codice, test e script; il test smoke usa il test runner integrato di Node.js. `npm test` ricompila prima di eseguire i test e `npm run build` rigenera `dist/`, includendo il codice compilato e i test. Le dipendenze sono fissate nel lockfile.

## Integrazione continua

Il workflow `.github/workflows/ci.yml` viene eseguito su push, pull request e avvio manuale. Su un runner Linux usa la versione di Node.js indicata in `.nvmrc`, esegue i cinque comandi del quality gate e poi i test `test:db`, `test:hermes`, `test:upgrade` e `test:start` con Docker Compose. Prima prepara le immagini fissate dal progetto; i test creano risorse temporanee isolate e usano solo credenziali e dati sintetici. Un comando fallito rende negativo il job; non è previsto deploy automatico né servono segreti GitHub o credenziali Meta/OpenRouter. Un test automatico controlla trigger, comandi e configurazione essenziale del workflow.

Le prove end-to-end con servizi e credenziali reali si eseguono separatamente come descritto in [Hermes e WhatsApp Cloud](#hermes-e-whatsapp-cloud); non fanno parte della CI.

## Configurazione Pi

Avviare Pi dalla directory del progetto con:

```bash
sh scripts/pi.sh
# Per scegliere una sessione: sh scripts/pi.sh --resume
```

Lo script usa la directory personale `.pi/local/`, ignorata da Git, e avvia Pi nella radice del progetto. Sostituisce `PI_CODING_AGENT_DIR` e rimuove l'eventuale `PI_CODING_AGENT_SESSION_DIR` ereditata, per isolare le sessioni; l'opzione esplicita Pi `--session-dir` continua a prevalere. Usare lo script a ogni avvio: lanciare direttamente `pi` con `PI_CODING_AGENT_DIR=./.pi` fa nuovamente coincidere le impostazioni personali con quelle versionate. Una sessione già avviata va chiusa e riaperta: `/reload` non cambia la sua directory personale.

Il repository condivide `.pi/settings.json`, il template `.pi/prompts/avvio.md` e le skill in `.agents/skills/`. Pi legge anche `.pi/local/settings.json`: le risorse dei due livelli vengono combinate e, per le preferenze, quelle di progetto prevalgono. Per consentire modifiche personali persistenti, mantenere modello, tema e preferenze d'interfaccia solo nel file personale. `pi install --local` e altre operazioni esplicite sulla configurazione di progetto possono modificare il file condiviso: revisionarne sempre il diff.

Dopo aver verificato le risorse e accordato fiducia al progetto in Pi, usare `/avvio` per ottenere un riepilogo e le prossime attività. Alcune estensioni e skill condivise puntano a percorsi dell'ambiente originale e potrebbero non essere disponibili altrove; i pacchetti possono richiedere l'installazione. La configurazione non garantisce da sola la portabilità. Non inserire credenziali nel file condiviso; eventuali estensioni locali vanno revisionate e ammesse singolarmente.

### Migrazione dei dati Pi precedenti

La nuova directory personale parte vuota. Prima di migrare, **chiudere tutte le sessioni Pi del progetto** e conservare una copia privata dei dati. Lo script crea `.pi/local/` se manca; in alternativa, dalla radice del progetto:

```bash
umask 077
mkdir -p .pi/local
# Copia solo i file esistenti, senza sovrascrivere quelli già presenti (cp GNU).
for file in auth.json trust.json pi-voice.json models.json sessions; do
  if [ -e ".pi/$file" ]; then cp -an ".pi/$file" .pi/local/; fi
done
```

La copia non sincronizza sessioni già presenti nella destinazione: verificarle con `sh scripts/pi.sh --resume` prima di rimuovere qualsiasi originale. Altri file personali o di estensioni vanno valutati e copiati separatamente; cache e dipendenze possono essere ricreate. I file originali restano intatti e consentono il ritorno alla configurazione precedente. Proteggere entrambe le copie: autenticazione, sessioni e configurazioni di estensioni possono contenere dati sensibili e restano fuori da Git.

Se si desidera recuperare preferenze personali da una precedente versione di `.pi/settings.json`, copiarle manualmente in `.pi/local/settings.json` senza copiare le liste di risorse condivise; non sovrascrivere preferenze personali già presenti. Per verificare con Pi installato, senza credenziali reali né rete, eseguire `npm run test:pi`: la prova usa una directory temporanea, un'estensione sintetica e Pi in modalità RPC.

## Avvio locale con un comando

Servono Node.js 24.14.0 e npm 11.9.0, Docker e Docker Compose funzionanti, rete per immagini e dipendenze e credenziali Meta/OpenRouter. Da un clone nuovo, copiare l'esempio e renderlo privato, quindi compilare `.env` con un editor locale, senza inserire i valori nella cronologia della shell o in chat:

```bash
cp .env.example .env
chmod 600 .env
# Compilare .env privatamente prima del comando seguente.
npm run start:local
```

Impostare tre password database casuali e distinte di almeno 16 caratteri, i valori Meta/OpenRouter, il verify token configurato anche su Meta e l'allowlist di numeri internazionali in sole cifre, separati da virgole. `WHATSAPP_PHONE_NUMBER_ID` è l'identificativo Meta, non un numero telefonico. L'esempio non contiene valori reali. `.env` e la directory `.local/secrets/` contengono credenziali: mantenerli privati, fuori da Git e conservarne copie cifrate. Se si usa `SECRETS_DIR`, la directory deve essere privata (`0700`) e i suoi file privati (`0600`).

Il comando reinstalla le dipendenze dal lockfile a ogni avvio, crea i file segreti senza sovrascriverli, avvia PostgreSQL, configura i ruoli, applica le migrazioni e avvia Hermes; aspetta gli healthcheck. Non elimina volumi. Se i file di segreto esistono già, i rispettivi valori in `.env` devono coincidere: in particolare, per uno stack esistente l'operatore deve riportare privatamente in `.env` le credenziali già conservate, senza rigenerarle. Una differenza arresta il comando prima del bootstrap; la rotazione è un'operazione distinta e intenzionale. Usare un solo operatore alla volta.

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

`db:init-secrets` crea password casuali e un verify token WhatsApp in `.local/secrets/`, ignorata da Git, senza sovrascrivere quelli già presenti. Proteggere e conservare questi file: cancellare o sostituire la password amministrativa non la cambia nel database già inizializzato. Il progetto Compose si chiama `agent-pilates-v010`; i suoi volumi conservano i dati. `docker compose down` arresta i servizi senza eliminarli: non usare `down --volumes` se i dati devono essere conservati.

PostgreSQL ascolta solo su `127.0.0.1:55432`; impostare `POSTGRES_PORT` se la porta è occupata. `SECRETS_DIR` può indicare una directory privata alternativa, usata coerentemente nei comandi. Prisma applica le migrazioni versionate; lo schema `app` è riservato ai dati applicativi, senza tabelle di dominio iniziali. L'archivio delle sessioni di Hermes è separato.

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

Se si usa `SECRETS_DIR`, creare i file in quella directory. Non montare i file `db-admin` o `db-migrator` nel contenitore Hermes: Compose gli fornisce solo la credenziale del ruolo agente per PostgreSQL.

Dopo aver inizializzato il database e creato i file, avviare Hermes:

```bash
docker compose up -d --build --wait hermes
docker compose ps
```

Il modello predefinito è `openai/gpt-6.1-terra`; `PILATES_MODEL` lo rende configurabile. Le opzioni e le credenziali del comando unico sono descritte in `.env.example`; la procedura manuale continua a usare i file di segreto separati. Il webhook è esposto solo su `127.0.0.1:18090` (`WHATSAPP_WEBHOOK_PORT` per cambiare porta). Un reverse proxy HTTPS già predisposto deve inoltrare **solo** il percorso del webhook a quella porta senza alterare il corpo della richiesta. Il percorso predefinito è `/whatsapp/webhook`; impostare `WHATSAPP_WEBHOOK_PATH` per usare un percorso già configurato. Configurare su Meta l'URL pubblico corrispondente, lo stesso verify token e la sottoscrizione all'evento `messages`. Non esporre `/health`. Configurare anche il proxy affinché non registri token nei parametri URL, numeri o corpi dei messaggi.

Il plugin nativo `studio_sql_query` riceve una singola query SQL ed eventuali parametri `$1`, `$2`, ecc. Hermes si collega direttamente come `studio_agent`: PostgreSQL autorizza DML e rifiuta il DDL sugli schemi. Non si usa MCP. **Eccezione accettata:** PostgreSQL permette comunque al ruolo di modificare la propria password, con il rischio di interrompere l'accesso; non sono privilegi esclusivamente DML in senso assoluto. I dati delle sessioni di Hermes sono in un volume SQLite separato da PostgreSQL e devono essere protetti.

Se la password del ruolo agente è stata cambiata accidentalmente, l'operatore può ripristinare quella contenuta nel file `db-agent` conservato esternamente, rieseguendo `docker compose run --rm db-bootstrap`. Il comando riallinea anche il ruolo di migrazione al relativo file di segreto: conservare entrambi i file originali e non rendere disponibile all'agente quello di migrazione.

**Privacy e diagnostica:** Hermes e PostgreSQL possono registrare messaggi, numeri o dati SQL. I loro entrypoint sopprimono l'output dei processi e inviano al logging Docker `local` soltanto gli eventi fissi `hermes_launch`, `hermes_preflight_failed` e `postgres_launch`, con rotazione limitata. Consultarli con `docker compose logs --tail=20 hermes postgres` e verificare stato e salute con `docker compose ps`; un evento di avvio non prova che il servizio sia sano. Non sono disponibili dettagli diagnostici degli errori. I test usano dati sintetici e non dimostrano l'assenza di ogni possibile fuga; non aggirare le protezioni con comandi o profili alternativi senza rivalutare la privacy.

Per una prova locale isolata del gateway nativo, della configurazione del plugin, delle firme webhook, dell'allowlist e dell'assenza dei dati sintetici dai log:

```bash
npm run test:hermes
```

Il test usa solo credenziali e messaggi sintetici, una rete Docker senza accesso esterno e risorse temporanee dedicate. Non sostituisce una prova reale con Meta e OpenRouter. La risposta WhatsApp libera è soggetta alla finestra di 24 ore prevista da Meta. Al primo contatto Hermes può inviare un avviso sul proprio canale home; non occorre configurarlo per usare il webhook.

`npm run test:upgrade` verifica in un progetto Docker temporaneo e isolato un aggiornamento reale da PostgreSQL 17.9 a 17.10 e da Hermes 0.22.6 a 0.22.7, con credenziali e dati sintetici. Il test scarica immagini aggiuntive e non dimostra la compatibilità di altre versioni o degli aggiornamenti maggiori.

**Per la sola prova temporanea autorizzata**, dopo i controlli e con le mitigazioni descritte nella procedura operativa, per verificare una configurazione reale avviare il proxy HTTPS e inviare dal numero autorizzato un messaggio di prova; confermare la risposta sul dispositivo. Per verificare anche i privilegi si può chiedere al modello di eseguire `SELECT current_user` e di tentare `CREATE TEMP TABLE spike_permission_probe (id integer)`: il primo restituisce il ruolo agente e il secondo deve essere rifiutato. Non includere numeri, messaggi o credenziali nei rapporti.

Se il servizio non diventa sano o non risponde, verificare con `docker compose ps` che PostgreSQL e Hermes siano avviati, che tutti i file dei segreti richiesti esistano e abbiano permessi `0600`, che il percorso del proxy corrisponda a `WHATSAPP_WEBHOOK_PATH` e che le credenziali esterne siano valide. Non stampare i segreti per diagnostica. I dettagli dei log non sono disponibili con l'attuale mitigazione della privacy.

## Prerequisiti previsti per l'ambiente completo

- Docker e Docker Compose per l'ambiente locale e il server Linux di produzione.
- Un endpoint HTTPS pubblico già disponibile per i webhook Meta.
- App Meta WhatsApp Business configurata e credenziali per i servizi esterni; non inserire credenziali nel repository.

La [procedura operativa](docs/operations/TEC-005-continuita.md) descrive installazione intenzionale, backup quiescente e ripristino isolato. Gli script `scripts/backup.sh` e `scripts/restore.sh` non avviano Hermes durante il recupero e non cifrano i backup: proteggerli su supporti cifrati. La sola prova pubblica temporanea autorizzata è conclusa; l'audit completo dei log del proxy resta nel debito TEC-008 e l'uso continuativo non è autorizzato.
