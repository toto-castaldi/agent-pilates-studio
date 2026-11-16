# TEC-046 — Prove del contesto compatto

## State

Verifica in corso: **non è una dichiarazione di completamento**. Manca il confronto conversazionale completo sul contesto nuovo. Decisione tecnica: [ADR-004](../adr/ADR-004-read-only-skills-computed-data.md).

## Ambiente e contenuti

- Hermes 0.22.7 fissato al digest `e6d81ae52ebf6a43efa529701405509f20054ba818f179ddd748bed4f8af584c`; Node 24.22.2, npm 11.19.1.
- Contesto precedente: `origin/main` alla revisione `85791d2`, estratto in `tmp/baseline` dai soli file versionati, senza configurazione privata; dipendenze da `npm ci`.
- `SOUL.md` precedente: 40.611 caratteri, 40.838 byte UTF-8. Nucleo nuovo: 12.423 caratteri; sei skill di dettaglio, tra 1.402 e 7.275 caratteri ciascuna. Il limite viene misurato in punti di codice Unicode, non byte.
- Solo ambienti Docker temporanei dedicati e dati sintetici. Nessun avvio, aggiornamento o modifica dello stack operativo. La credenziale OpenRouter autorizzata resta soltanto nella memoria del relay host; non viene copiata nel clone di baseline, nei file o nei container.

## Prove sintetiche

| Prova | Risultato acquisito | Evidenza |
| --- | --- | --- |
| Gate rapido | lint, typecheck, 98/98 test in memoria, build riusciti | Il nuovo modulo dei testi è prodotto dalla build; i test non leggono file né avviano processi |
| `test:local` | 46/46 riusciti | Nucleo, configurazione, mount, colonne e funzioni confrontati con le migrazioni |
| `test:db` | riuscito su PostgreSQL reale | Confronto con la query congelata del vecchio SOUL, confini stretti di creazione/disattivazione, regole sovrapposte, annullamenti, ora legale, invoker, EXECUTE senza PUBLIC, rifiuto DDL e assenza di telefoni |
| `test:author` (caso principale aggiornato) | riuscito | Webhook firmati: comandi di skill rifiutati senza richieste al modello in sessioni nuove, esistenti e busy; varianti, pila, skill inclusa in Hermes, bundle e alias; caricamento interno e chiamate SQL delle funzioni con parametri testuali riusciti |
| `test:hermes` | riuscito | Gateway, plugin, firme, dati e log protetti; toolset attesi aggiornati a skills e studio-postgres |
| `test:upgrade` | riuscito | Migrazioni additive, storico, aggiornamento delle immagini e persistenza |
| `test:images` | 2/2 riusciti | File di release dall'immagine; scrittura, aggiunta, rimozione e sostituzione delle skill rifiutate; nuova skill dall'immagine aggiornata visibile sul volume esistente; backup a caldo |

Il modello sintetico tenta `skill_manage` con create, patch, delete, write_file e install, e l'installazione tramite terminale: Hermes risponde che i tool non esistono. Nel medesimo turno `skill_view` restituisce la skill versionata. Il test verifica che solo `skill_view` e `studio_sql_query` siano annunciati e che l'indice non inviti più a correggere o salvare skill. L'allowlist resta imposta anche nei dispatcher sequenziale e concorrente.

Durante lo sviluppo le prove hanno individuato e corretto il percorso busy, che non attraversa `_handle_message`, e le aspettative precedenti sui toolset. Alcune esecuzioni concorrenti hanno incontrato il rifiuto intermittente del bootstrap dei ruoli (`Database role setup failed.`); le riesecuzioni isolate sono riuscite. Non si dichiara risolto questo problema preesistente del bootstrap con la riduzione del contesto.

## Confronto con il modello reale

Autorizzazione: una baseline completa e un confronto completo dei 57 scenari, `openai/gpt-6.1-terra`, credenziale già presente nell'ambiente del worker. Le risposte e i dati non vengono riportati qui: soltanto esiti e indicatori sintetici.

- Baseline avviata il 2026-11-16 alle 11:02:47 +01:00, ancora in corso al momento di questa registrazione. Log locale ignorato: `tmp/conversation-baseline.log`.
- Prima porzione del confronto nuovo avviata alle 11:31:33 +01:00 e interrotta con SIGTERM dopo l'errore della prima consultazione, per evitare ulteriori chiamate non utili. Il processo ha terminato la pulizia alle 11:33:36 +01:00. Primo scenario: database conforme ma risposta con errore; secondo scenario interrotto. Relay: rispettivamente 11 e 6 richieste, tutte con HTTP finale 200 e nessun rifiuto del relay. Non equivale a un confronto completo.
- Causa candidata riprodotta su PostgreSQL (gli errori SQL grezzi del modello reale non sono registrati): i parametri stringa di psycopg sono `text`, mentre le funzioni richiedono `date`; una chiamata con parametri `text` senza cast fallisce con `42883`. Il nucleo ora prescrive esplicitamente `$1::text::date` e `$2::text::date`, con esempio. La chiamata corretta è verificata anche attraverso il tool SQL del gateway reale con il modello sintetico. È stata inoltre resa esplicita nel nucleo la risoluzione condivisa delle anagrafiche, evitando rinvii tra skill non ancora caricate.
- È stata chiesta all'orchestratore conferma per riavviare il confronto nuovo completo dopo questa porzione consumata. Nessun ulteriore confronto reale viene avviato in attesa della risposta.

Da completare: esito finale della baseline, tabella per tutti i 57 scenari prima/dopo, regressioni e loro verifiche, confronto con l'instabilità già descritta in [TEC-012](TEC-012-prove.md). Fino ad allora non sono soddisfatti il criterio conversazionale e la Definition of Done.
