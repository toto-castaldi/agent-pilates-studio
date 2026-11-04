# agent-pilates-studio

Progetto per installare e aggiornare [Hermes Agent](https://hermes-agent.nousresearch.com/), provarlo in locale e collegarlo a PostgreSQL, OpenRouter e WhatsApp Business.

## Stato

La v0.1.0 include una configurazione locale Compose per PostgreSQL e Hermes, con OpenRouter, il gateway WhatsApp Cloud nativo e un tool SQL diretto. La soluzione è ancora in verifica: le prove reali con OpenRouter e Meta non sono ancora state eseguite.

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

## Database locale

Servono Docker e Docker Compose funzionanti. Dalla directory del progetto, dopo `npm ci`:

```bash
npm run db:init-secrets
docker compose up -d --wait postgres
docker compose run --rm db-bootstrap
npm run db:migrate
```

I primi due comandi Docker non richiedono privilegi di migrazione nell'agente: `db-bootstrap` è un contenitore temporaneo con credenziali separate. Il comando di migrazione usa il file della sola credenziale di migrazione sul computer dell'operatore. Non montare la directory dei segreti nel futuro contenitore dell'agente.

`db:init-secrets` crea password casuali e un verify token WhatsApp in `.local/secrets/`, ignorata da Git, senza sovrascrivere quelli già presenti. Proteggere e conservare questi file: cancellare o sostituire la password amministrativa non la cambia nel database già inizializzato. Il progetto Compose si chiama `agent-pilates-v010`; i suoi volumi conservano i dati. `docker compose down` arresta i servizi senza eliminarli: non usare `down --volumes` se i dati devono essere conservati.

PostgreSQL ascolta solo su `127.0.0.1:55432`; impostare `POSTGRES_PORT` se la porta è occupata. `SECRETS_DIR` può indicare una directory privata alternativa, usata coerentemente nei comandi. Prisma applica le migrazioni versionate; lo schema `app` è riservato ai dati applicativi, senza tabelle di dominio iniziali. L'archivio delle sessioni di Hermes è separato e sarà configurato con l'agente.

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

Il modello predefinito è `openai/gpt-6.1-terra`; `PILATES_MODEL` lo rende configurabile. Le opzioni non segrete sono in `.env.example`, copiabile in `.env`. Il webhook è esposto solo su `127.0.0.1:18090` (`WHATSAPP_WEBHOOK_PORT` per cambiare porta). Un reverse proxy HTTPS già predisposto deve inoltrare **solo** `/whatsapp/webhook` a quella porta senza alterare il corpo della richiesta. Configurare su Meta l'URL pubblico corrispondente, lo stesso verify token e la sottoscrizione all'evento `messages`. Non esporre `/health`. Configurare anche il proxy affinché non registri token nei parametri URL, numeri o corpi dei messaggi.

Il plugin nativo `studio_sql_query` riceve una singola query SQL ed eventuali parametri `$1`, `$2`, ecc. Hermes si collega direttamente come `studio_agent`: PostgreSQL autorizza DML e rifiuta il DDL sugli schemi. Non si usa MCP. **Eccezione accettata:** PostgreSQL permette comunque al ruolo di modificare la propria password, con il rischio di interrompere l'accesso; non sono privilegi esclusivamente DML in senso assoluto. I dati delle sessioni di Hermes sono in un volume SQLite separato da PostgreSQL e devono essere protetti.

Se la password del ruolo agente è stata cambiata accidentalmente, l'operatore può ripristinare quella contenuta nel file `db-agent` conservato esternamente, rieseguendo `docker compose run --rm db-bootstrap`. Il comando riallinea anche il ruolo di migrazione al relativo file di segreto: conservare entrambi i file originali e non rendere disponibile all'agente quello di migrazione.

**Privacy e diagnostica:** la release Hermes usata può inserire numeri e messaggi nei log. Per evitarlo, il processo gateway è eseguito senza output e logging Python; i container Hermes e PostgreSQL usano il logging driver Docker `none`. Non sono quindi disponibili log dettagliati di questi due servizi: verificare almeno `docker compose ps` e lo stato di salute. La diagnostica sicura e la continuità operativa restano da completare; non aggirare queste protezioni con comandi o profili Hermes alternativi senza rivalutare la privacy.

Per una prova locale isolata del gateway nativo, della configurazione del plugin, delle firme webhook, dell'allowlist e dell'assenza dei dati sintetici dai log:

```bash
npm run test:hermes
```

Il test usa solo credenziali e messaggi sintetici, una rete Docker senza accesso esterno e risorse temporanee dedicate. Non sostituisce una prova reale con Meta e OpenRouter. La risposta WhatsApp libera è soggetta alla finestra di 24 ore prevista da Meta.

## Prerequisiti previsti per l'ambiente completo

- Docker e Docker Compose per l'ambiente locale e il server Linux di produzione.
- Un endpoint HTTPS pubblico già disponibile per i webhook Meta.
- App Meta WhatsApp Business configurata e credenziali per i servizi esterni; non inserire credenziali nel repository.

Le procedure di installazione in produzione, aggiornamento, backup e ripristino saranno documentate e verificate separatamente.
