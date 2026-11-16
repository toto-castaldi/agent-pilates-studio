# Configuration and local runtime

## Avvio locale

L'ambiente locale usa Docker Compose; Node.js e npm sull'host, `.env` privato e `npm run start:local`, senza esporre automaticamente il webhook pubblico. Node.js 24.14.0 è indicato in `.nvmrc`; gli intervalli supportati di Node.js e npm sono in `package.json`. Le immagini dei componenti sono fissate per digest nella configurazione.

L'orchestratore locale prepara dipendenze e file privati, avvia database e bootstrap, applica le migrazioni e attende la salute dei servizi. Verifica i valori richiesti e i permessi (`security`), non elimina volumi e segnala i fallimenti senza dichiarare sano lo stack; la salute locale non prova la disponibilità dei servizi esterni.

A ogni avvio arresta il gateway con SIGKILL, per evitare avvisi di spegnimento al vecchio canale home, poi il broker; aggiorna i file esterni e ricrea entrambi, applicando anche i file montati sostituiti da checkout. I turni in corso sono interrotti. Dopo un errore nell'aggiornamento tenta di arrestare entrambi; un guasto Docker può impedire l'arresto e richiede verifica manuale prima del recupero. I file parzialmente aggiornati si riallineano rilanciando il comando. Credenziali database e interne non sono ruotate.

Variabili, esempi e comandi operativi sono descritti nel README e in `.env.example`, senza segreti reali.

## Identità in configurazione

- L'unico numero personale configurato è `PILATES_MANAGER_PHONE` in `.env`: `start:local` lo valida e lo normalizza come le funzioni dell'anagrafica (prefisso `+` o `00`, separatori comuni, 8–15 cifre, nessun paese assunto) e lo scrive nel file privato `whatsapp-manager-phone` in forma canonica. Lo stesso file è montato in gateway e broker, che lo verificano di nuovo all'avvio; il gateway ne deriva `WHATSAPP_CLOUD_HOME_CHANNEL`. Un valore mancante o malformato arresta l'avvio senza esporlo.
- `WHATSAPP_ALLOWED_USERS`, `WHATSAPP_HOME_CHANNEL` e `WHATSAPP_TEACHER_LINKS` non esistono più: `start:local` rifiuta `.env` che le contiene indicando solo i nomi delle chiavi ed elimina i vecchi file privati generati da esse; in produzione `prod.sh` richiede `whatsapp-manager-phone` e rifiuta i vecchi file finché presenti. Nome, cognome, telefoni degli altri insegnanti e accessi si mantengono soltanto nel database tramite il gestore (`identity`), senza sincronizzazioni. Censire un destinatario non supera il limite o la preregistrazione del numero di test Meta.

## Altre variabili

- `PILATES_MODEL`: modello OpenRouter; `PILATES_IDLE_COMPACT_SECONDS`: intervallo di inattività prima della compattazione, in secondi (`compaction`).
- `PILATES_VOLUME_PREFIX`: prefisso comune dei volumi PostgreSQL e Hermes (`production`).

La produzione presume un server Linux con Docker/Compose e un endpoint HTTPS pubblico già disponibili; DNS, certificati e provisioning del server sono fuori scope.
