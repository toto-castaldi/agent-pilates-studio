# Configuration and local runtime

## Avvio locale

L'ambiente locale usa Docker Compose; Node.js e npm sull'host, `.env` privato e `npm run start:local`, senza esporre automaticamente il webhook pubblico. Node.js 24.14.0 è indicato in `.nvmrc`; gli intervalli supportati di Node.js e npm sono in `package.json`. Le immagini dei componenti sono fissate per digest nella configurazione.

L'orchestratore locale prepara dipendenze e file privati, avvia database e bootstrap, applica le migrazioni e attende la salute dei servizi. PostgreSQL è pronto solo quando `pg_isready -h 127.0.0.1` risponde via TCP, nel healthcheck di `compose.yaml` e nell'attesa dell'orchestratore: al primo avvio di un volume vuoto il server temporaneo di initdb accetta solo il socket Unix. `db-bootstrap` parte dopo il healthcheck e attende comunque il server via TCP con al più 15 tentativi brevi, senza scrivere SQL, valori o errori di psql; in caso di fallimento stampa solo «Database role setup failed.». Verifica i valori richiesti e i permessi (`security`), non elimina volumi e segnala i fallimenti senza dichiarare sano lo stack; la salute locale non prova la disponibilità dei servizi esterni.

A ogni avvio arresta il gateway con SIGKILL, per evitare avvisi di spegnimento al vecchio canale home, poi il broker; aggiorna i file esterni e ricrea entrambi, applicando anche i file montati sostituiti da checkout. I turni in corso sono interrotti. Dopo un errore nell'aggiornamento tenta di arrestare entrambi; un guasto Docker può impedire l'arresto e richiede verifica manuale prima del recupero. I file parzialmente aggiornati si riallineano rilanciando il comando. Credenziali database e interne non sono ruotate.

Variabili, esempi e comandi operativi sono descritti nel README e in `.env.example`, senza segreti reali.

## Identità in configurazione

- L'unico numero personale configurato è `PILATES_MANAGER_PHONE` in `.env`: `start:local` lo valida e lo normalizza come le funzioni dell'anagrafica (prefisso `+` o `00`, separatori comuni, 8–15 cifre, nessun paese assunto) e lo scrive nel file privato `whatsapp-manager-phone` in forma canonica. Lo stesso file è montato in gateway e broker, che lo verificano di nuovo all'avvio; il gateway ne deriva `WHATSAPP_CLOUD_HOME_CHANNEL`. Un valore mancante o malformato arresta l'avvio senza esporlo.
- `WHATSAPP_ALLOWED_USERS`, `WHATSAPP_HOME_CHANNEL` e `WHATSAPP_TEACHER_LINKS` non esistono più: `start:local` rifiuta `.env` che le contiene indicando solo i nomi delle chiavi ed elimina i vecchi file privati generati da esse; in produzione `prod.sh` richiede `whatsapp-manager-phone` e rifiuta i vecchi file finché presenti. Nome, cognome, telefoni degli altri insegnanti e accessi si mantengono soltanto nel database tramite il gestore (`identity`), senza sincronizzazioni. Censire un destinatario non supera il limite o la preregistrazione del numero di test Meta.

## Altre variabili

- `PILATES_MODEL`: modello OpenRouter; `PILATES_REASONING_EFFORT`: livello di thinking applicato a `agent.reasoning_effort` di Hermes, uno tra `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max` e `ultra` (livelli di Hermes 0.22.7), predefinito `medium`. La politica pura `scripts/compaction-policy.mjs` lo valida in `start:local`, che rifiuta anche un valore vuoto prima di toccare i servizi, e nel gateway all'avvio (`hermes_preflight_failed`); `prod.sh` accetta la chiave in `prod.env` e controlla gli stessi livelli. Compose applica il predefinito quando la chiave manca. Il valore è letto a ogni avvio del container, quindi un riavvio o una ricreazione lo applica senza ricostruire le immagini. `PILATES_IDLE_COMPACT_SECONDS`: intervallo di inattività prima della compattazione, in secondi (`compaction`).
- `PILATES_VOLUME_PREFIX`: prefisso comune dei volumi PostgreSQL e Hermes (`production`).
- `GRAFANA_PORT`: porta loopback della dashboard, predefinita `13000` (in produzione `13100` in `prod.env`, anche se assente); `GRAFANA_ADMIN_PASSWORD`: password dell'utente `admin` di Grafana, obbligatoria in `.env`, almeno 16 caratteri stampabili senza spazi e diversa dalle password database; in produzione è il file `secrets/grafana-admin-password` (`usage-metrics`).

La produzione presume un server Linux con Docker/Compose e un endpoint HTTPS pubblico già disponibili; DNS, certificati e provisioning del server sono fuori scope.
