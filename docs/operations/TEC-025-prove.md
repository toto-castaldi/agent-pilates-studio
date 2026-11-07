# TEC-025 — Prove del contesto per interlocutore e della compattazione

Prove eseguite il 2026-11-07 su Hermes v0.22.7 (immagine fissata dal progetto), con dati, numeri e credenziali sintetici, in progetti Docker temporanei su rete interna. Non riportano messaggi, numeri reali o segreti.

## Analisi dell'immagine fissata

- La soglia percentuale di Hermes è alzata ad almeno il 75% per le finestre sotto 512K token; `compression.threshold_tokens` è un limite superiore, applicato dopo quel ricalcolo. Il progetto lo imposta al 40% della finestra ricavata dal catalogo all'avvio.
- L'inattività nativa misura il tempo da `_last_activity_ts`, azzerato all'inizio di ogni turno dell'agente in cache e perso al riavvio, e non compatta sotto l'8% della finestra: è disabilitata e sostituita dall'adattamento descritto in `docs/TECHNICAL-DESIGN.md` §6.
- `auxiliary.free_only` blocca anche il modello principale su OpenRouter: la prima esecuzione della suite ha mostrato una conversazione oltre 140K token senza alcuna richiesta di riassunto. È stato sostituito da `auxiliary.openrouter_model` fissato al modello configurato.
- In modalità `lean` il riassunto conserva estratti dei messaggi utente: la compattazione è quindi verificata dalla riduzione della richiesta, non dalla scomparsa dei marcatori.

## Esiti

| Verifica | Comando | Esito |
| -------- | ------- | ----- |
| Calcolo della soglia, catalogo, intervallo e validazione dell'avvio in memoria | `npm test` | superato |
| Soglia, ripresa, riavvio, ricreazione, errore, isolamento, autore, persistenza, log, backup | `npm run test:compaction` | superato (circa 4 minuti e mezzo) |
| Suite esistenti adattate al catalogo sintetico o alla nuova configurazione | `npm run test:local`, `test:db`, `test:hermes`, `test:author`, `test:upgrade`, `test:start` | superate |

Nella suite di compattazione, con finestra sintetica di 200K token (soglia 80K) e messaggi di circa 10K token:

- l'avvio è rifiutato con il solo evento `hermes_preflight_failed` per intervallo `0` o non numerico e per modello assente dal catalogo; il gateway avviato riceve `PILATES_COMPACTION_THRESHOLD_TOKENS=80000` e il compressore di Hermes mantiene 80K nonostante il proprio minimo del 75%;
- nessun riassunto fino a una richiesta di circa 72K token; al turno successivo, stimato in circa 82K token (41%), il riassunto precede la richiesta, che scende a circa 38K token e contiene ancora `SOUL.md`, l'ora corrente e il messaggio nuovo;
- per il secondo mittente, sotto soglia, nessun riassunto entro l'intervallo; dopo 35 secondi il riassunto precede la nuova richiesta, che risulta ridotta. Lo stesso avviene dopo `restart` e dopo la ricreazione del container, con il riassunto precedente letto dal volume;
- con il riassunto forzato in errore il turno riceve comunque la risposta, la richiesta non è ridotta e nessun avviso arriva al sostituto Meta, che riceve solo le risposte finali;
- nessuna richiesta al modello contiene marcatori di entrambi i mittenti e tutte usano il modello configurato;
- il database non cambia durante le compattazioni; una registrazione successiva riceve l'autore ricavato dal mittente autenticato;
- i riassunti sono nel volume SQLite e nel backup prodotto da `scripts/backup.sh`, non nei log Docker né nei file di log di Hermes.

## Prova sullo stack reale

Su autorizzazione dell'operatore, `npm run start:local` con la configurazione privata reale ha avviato PostgreSQL, broker e Hermes, tutti sani, con il solo evento `hermes_launch` nei log del gateway. Il gateway ha ricavato dal catalogo OpenRouter reale, per il modello configurato `z-ai/glm-5.2`, la soglia di 419.430 token: corrisponde al 40%, arrotondato per difetto, della finestra di 1.048.576 token pubblicata nel catalogo e consultata separatamente dall'host. L'intervallo è quello predefinito di 14.400 secondi. Sono state lette solo queste variabili; non sono stati inviati messaggi né chiamato il modello. Lo stack, fermo prima della prova, è stato nuovamente arrestato senza toccare i volumi.

## Limiti

- Le prove usano un modello sintetico e la stima approssimata dei token di Hermes; non verificano la qualità dei riassunti di un modello reale.
- Sullo stack reale non è stata provocata una compattazione, perché servirebbero centinaia di migliaia di token o ore di inattività con conversazioni reali. Lo scenario conversazionale `npm run test:conversation` non è stato eseguito.
- Gli adattamenti usano punti interni dell'immagine fissata: ogni aggiornamento di Hermes richiede di ripetere `test:compaction`.
