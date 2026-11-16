# TEC-046 — Prove del contesto compatto

## State

**Blocked, non Done.** Entrambi i cataloghi reali di 57 scenari sono terminati: baseline 46/57 OK, contesto nuovo corretto 49/57 OK, entrambi con exit 1. Quattro scenari passano nella baseline e falliscono sul contesto nuovo: sono possibili regressioni non risolte, non liquidate come instabilità. Il miglioramento di altri sette scenari non le compensa. La verifica secondo `finish-task` non soddisfa il criterio conversazionale né la Definition of Done.

Decisione tecnica: [ADR-004](../adr/ADR-004-read-only-skills-computed-data.md). Nessun ulteriore test reale è stato avviato dopo il confronto autorizzato; nuove ripetizioni richiedono autorizzazione esplicita.

## Ambiente e contenuti

- Hermes 0.22.7 fissato al digest `e6d81ae52ebf6a43efa529701405509f20054ba818f179ddd748bed4f8af584c`; Node 24.22.2, npm 11.19.1.
- Contesto precedente: `origin/main` alla revisione `85791d2`, estratto in `tmp/baseline` dai soli file versionati, senza configurazione privata; dipendenze da `npm ci`. Non è stato ripetuto.
- Contesto nuovo corretto: commit `9de21a8`, implementazione `5d047a6`; i testi e il catalogo sono rimasti invariati per tutto il confronto, verificato anche alla fine con le impronte SHA-256 acquisite prima dell'avvio.
- `SOUL.md` precedente: 40.611 caratteri, 40.838 byte UTF-8. Nucleo nuovo: 12.423 caratteri; sei skill di dettaglio, tra 1.402 e 7.275 caratteri ciascuna. Il limite viene misurato in punti di codice Unicode, non byte. La riduzione del solo nucleo è del 69,4%: non è una misura dei token o del costo complessivo dei turni, che comprendono anche indice, cronologia e skill caricate.
- SHA-256 del nucleo nuovo: `92fc880f546699973d7a4cc9251381c635e2e2845a04ac3b57130de0c665a63d`; del catalogo comune: `c25a23b49ca837b1279843ea1f427926c08298cf797d4f149ca7d3353d61627c`.
- Solo ambienti Docker temporanei dedicati e dati sintetici. Nessun avvio, aggiornamento o modifica dello stack operativo. La credenziale OpenRouter autorizzata resta nell'ambiente e nella memoria del relay host; non viene copiata nel clone di baseline, nei file o nei container. Le risposte e i dati non sono riportati qui: soltanto esiti e indicatori sintetici.

## Prove sintetiche

Queste prove usano PostgreSQL e gateway reali, ma sostituiscono il modello e/o Meta con servizi deterministici locali: **non sono prove del comportamento con un modello reale**.

| Prova | Risultato acquisito | Evidenza |
| --- | --- | --- |
| Gate rapido | lint, typecheck, 98/98 test in memoria, build riusciti, anche nella verifica finale | Il modulo dei testi è prodotto dalla build; i test non leggono file né avviano processi |
| `test:local` | 46/46 riusciti | Nucleo, configurazione, mount, colonne e funzioni confrontati con le migrazioni; controllo aggiuntivo delle colonne SQL negli esempi riuscito |
| `test:db` | riuscito su PostgreSQL reale | Confronto con la query congelata del vecchio SOUL, confini stretti di creazione/disattivazione, regole sovrapposte, annullamenti, ora legale, invoker, EXECUTE senza PUBLIC, rifiuto DDL e assenza di telefoni |
| `test:author` | 3/3 riusciti | Webhook firmati: comandi di skill rifiutati senza richieste al modello in sessioni nuove, esistenti e busy; varianti, pila, skill inclusa in Hermes, bundle e alias; caricamento interno e chiamate SQL delle funzioni con parametri testuali riusciti |
| `test:hermes` | riuscito | Gateway, plugin, firme, dati e log protetti; toolset attesi aggiornati a skills e studio-postgres |
| `test:upgrade` | riuscito | Migrazioni additive, storico, aggiornamento delle immagini e persistenza |
| `test:compaction` | riuscito | Compattazione per mittente, soglia, inattività, riavvio, conservazione del nucleo, redazione, backup e assenza di notifiche tecniche |
| `test:images` | 2/2 riusciti | File di release dall'immagine; scrittura, aggiunta, rimozione e sostituzione delle skill rifiutate; nuova skill dall'immagine aggiornata visibile sul volume esistente; backup a caldo |

Il modello sintetico tenta `skill_manage` con create, patch, delete, write_file e install, e l'installazione tramite terminale: Hermes risponde che i tool non esistono. Nel medesimo turno `skill_view` restituisce la skill versionata. Il test verifica che solo `skill_view` e `studio_sql_query` siano annunciati e che l'indice non inviti più a correggere o salvare skill. L'allowlist resta imposta anche nei dispatcher sequenziale e concorrente. I comandi nativi non sono rimossi: il percorso `/btw` è esercitato dal test esistente.

Durante lo sviluppo le prove hanno individuato e corretto il percorso busy, che non attraversa `_handle_message`, e le aspettative precedenti sui toolset. Alcune esecuzioni concorrenti hanno incontrato il rifiuto intermittente del bootstrap dei ruoli (`Database role setup failed.`); le riesecuzioni isolate sono riuscite. Non si dichiara risolto questo problema preesistente del bootstrap con la riduzione del contesto. Le prime asserzioni sui tool rifiutati cercavano il messaggio del dispatcher anziché quello del registro: il controllo finale accetta entrambi, senza ammettere l'esecuzione dei tool vietati.

## Prove reali e porzione interrotta

Modello di entrambe le esecuzioni complete: `openai/gpt-6.1-terra` via OpenRouter reale; PostgreSQL, gateway e broker reali isolati, webhook sintetici firmati e sostituto locale Meta. Non sono prove con Meta reale né un'accettazione privacy.

| Esecuzione | Inizio e fine del 2026-11-16, Europe/Rome | Risultato |
| --- | --- | --- |
| Unica baseline | 11:02:47 +01:00 → 12:25:12 +01:00 | 57/57 scenari eseguiti; 46 OK, 11 errori; exit 1 |
| Prima porzione nuova, precedente alle correzioni | 11:31:33 +01:00 → 11:33:36 +01:00 | Interrotta con SIGTERM; errore della prima consultazione e secondo scenario interrotto; exit 1; non è un catalogo completo |
| Unico riavvio completo sul contesto corretto | 11:45:52 +01:00 → 13:06:20 +01:00 | 57/57 scenari eseguiti; 49 OK, 8 errori; exit 1 |

### Evidenza conservata della porzione interrotta

La prima consultazione aveva database conforme ma risposta con errore. Il secondo scenario non ha un esito valido, perché interrotto. Il relay ha contato rispettivamente 11 e 6 richieste, tutte con HTTP finale 200 e nessun rifiuto del relay: **17 richieste già consumate**, distinte dal riavvio completo.

Causa candidata riprodotta su PostgreSQL (gli errori SQL grezzi del modello reale non sono registrati): i parametri stringa di psycopg sono `text`, mentre le funzioni richiedono `date`; una chiamata con parametri `text` senza cast fallisce con `42883`. Il nucleo corretto prescrive `$1::text::date` e `$2::text::date`, con esempio. La chiamata corretta è verificata anche attraverso il tool SQL del gateway reale con il modello sintetico. È stata inoltre resa esplicita nel nucleo la risoluzione condivisa delle anagrafiche, evitando rinvii tra skill non ancora caricate. Nel confronto completo corretto le quattro consultazioni iniziali passano; non è una prova causale esclusiva del difetto precedente.

L'utente ha autorizzato esplicitamente, tramite `t2q`, UN riavvio completo oltre alle 17 richieste, senza ripetere la baseline. Autorizzazione e ripresa a In Progress sono state registrate e pubblicate nel commit `9de21a8` prima dell'avvio. Nessuna ulteriore ripetizione reale era autorizzata, e non ne è stata eseguita alcuna.

I log locali ignorati restano separati: `tmp/conversation-baseline.log`, `tmp/conversation-new.log` e `tmp/conversation-new-full.log`; impronte dei contenuti nuovi in `tmp/conversation-new-full.hashes`. Questo rapporto conserva gli esiti senza versionare log grezzi, risposte o snapshot.

## Confronto completo prima/dopo

42 scenari OK in entrambe le esecuzioni, 7 da errore a OK, 4 da OK a errore, 4 in errore in entrambe. Ogni scenario fallito si arresta al primo controllo negativo: l'esecuzione del catalogo intero non significa che tutti i turni degli scenari falliti siano stati completati. I controlli lessicali non provano il significato completo delle risposte; un errore di testo con database conforme non è automaticamente una perdita di dati né automaticamente un falso negativo.

| Scenario | Precedente | Nuovo |
| --- | --- | --- |
| `consultazione-insegnante-lezione` | OK | OK |
| `consultazione-insegnante-periodo` | OK | OK |
| `consultazione-insegnante-regole` | OK | OK |
| `consultazione-lezioni-senza-insegnante` | OK | OK |
| `indicazione-passata-senza-presenze` | OK | OK |
| `indicazione-lezione-extra` | OK | OK |
| `sostituzione-singola` | OK | OK |
| `sostituzione-piu-lezioni` | OK | OK |
| `sostituzione-periodo` | OK | OK |
| `sostituzione-non-attesa-ambigua` | OK | OK |
| `sostituzione-senza-lezioni` | OK | OK |
| `indicazione-mittente-collegato` | OK | OK |
| `indicazione-mittente-non-collegato` | OK | OK |
| `indicazione-mittente-collegato-inesistente` | OK | ERRORE — turno 2: stato database |
| `indicazione-nome-chiarimento` | ERRORE — turno 2: stato database | OK |
| `presenze-senza-indicazione` | ERRORE — turno 1: contenuto risposta | OK |
| `indicazione-correzione-annullamento` | ERRORE — turno 1: stato database | ERRORE — turno 6: contenuto risposta |
| `insegnanti-fasce-e-orari` | OK | OK |
| `insegnanti-cognome-e-riconoscimento` | ERRORE — turno 5: contenuto risposta | ERRORE — turno 5: contenuto risposta |
| `insegnanti-sovrapposizione-conferma` | OK | OK |
| `insegnanti-sovrapposizione-stesso` | OK | OK |
| `insegnanti-disattivazione-parziale` | OK | OK |
| `insegnanti-mittente-collegato` | OK | OK |
| `insegnanti-mittente-non-collegato` | OK | OK |
| `insegnanti-mittente-collegato-inesistente` | OK | OK |
| `nessun-profilo-saluto` | OK | OK |
| `nessun-profilo-richiesta` | OK | OK |
| `nessun-profilo-nome-assente` | OK | OK |
| `consultazione-presenze-ieri` | OK | OK |
| `consultazione-presenze-statistiche` | OK | ERRORE — turno 1: contenuto risposta |
| `assenza-anticipata-singola-annullamento` | OK | ERRORE — turno 4: contenuto risposta |
| `assenza-anticipata-ambigua-non-attesa` | OK | OK |
| `assenza-anticipata-periodo` | OK | OK |
| `assenza-anticipata-conflitto-presenza` | OK | OK |
| `assenza-anticipata-conflitto-assenza` | OK | OK |
| `assenza-anticipata-conflitto-tutti-tranne` | OK | OK |
| `assenza-anticipata-conflitto-esplicito` | OK | OK |
| `correzioni-presenze-storico` | OK | OK |
| `assenze-esplicite-chiarimento` | ERRORE — turno 1: stato database | OK |
| `assenze-attesi-presenze` | ERRORE — turno 5: contenuto risposta | ERRORE — turno 5: contenuto risposta |
| `presenze-data-odierna` | ERRORE — turno 1: contenuto risposta | ERRORE — turno 1: contenuto risposta |
| `presenze-nomi-duplicato-futuro` | ERRORE — turno 1: contenuto risposta | OK |
| `presenze-attesi-storici` | OK | OK |
| `nome-prima-conversazione` | OK | OK |
| `nome-altro-interlocutore` | OK | OK |
| `consultazione-pianificazione` | OK | ERRORE — turno 7: contenuto risposta |
| `registrazione-consultazione` | OK | OK |
| `piu-orari-e-gruppo` | OK | OK |
| `cognome-mancante` | OK | OK |
| `nome-unico` | OK | OK |
| `nome-ambiguo` | OK | OK |
| `orario-mancante` | OK | OK |
| `giorno-mancante` | OK | OK |
| `autore-non-dichiarato` | OK | OK |
| `disattivazione-esplicita-storico` | ERRORE — turno 1: stato database | OK |
| `aggiornamento-implicito` | ERRORE — turno 3: contenuto risposta | OK |
| `cambio-cliente-gruppo` | ERRORE — turno 1: stato database | OK |

## Differenze bloccanti e instabilità

Le quattro differenze baseline OK / nuovo errore richiedono diagnosi e una verifica mirata delle eventuali correzioni:

1. **`indicazione-mittente-collegato-inesistente`, turno 2:** mancano sia il nuovo insegnante sia l'indicazione attesi dopo la risposta al chiarimento. Database rimasto vuoto e storico conservato; nessun errore riconosciuto nella risposta. Il ramo di recupero è ancora descritto nella skill, ma questo non prova che sia stato seguito. È una differenza funzionale da non declassare a errore lessicale.
2. **`consultazione-presenze-statistiche`, turno 1:** database conforme e storico conservato; una esclusione lessicale violata, con possibile richiesta di chiarimento. Non è stabilito se sia risposta scorretta o falso negativo del controllo.
3. **`assenza-anticipata-singola-annullamento`, turno 4:** database conforme e storico conservato; alternativa lessicale attesa non riconosciuta nella risposta. Non sono state conservate risposte grezze per determinarne il significato.
4. **`consultazione-pianificazione`, turno 7:** database conforme e storico conservato, ma associazione ai giorni non riconosciuta. Non è dimostrato che una causa del passato spieghi questo esito.

[TEC-012](TEC-012-prove.md) documenta instabilità pregresse delle statistiche (US-009, integrazione US-015), dell'assenza anticipata singola (integrazione US-008/US-013) e della pianificazione (US-003, integrazione US-015). Le prove US-015 usavano `z-ai/glm-5.2`, non il modello attuale: non sono controprove equivalenti. L'esistenza di errori storici non basta a escludere regressioni della riduzione nei quattro casi sopra.

I quattro errori comuni sono `indicazione-correzione-annullamento`, `insegnanti-cognome-e-riconoscimento`, `assenze-attesi-presenze` e `presenze-data-odierna`. Negli ultimi tre il turno fallito coincide; per le correzioni la baseline si arresta già al turno 1, il nuovo contesto arriva al turno 6. Quest'ultimo non dimostra né la stessa causa né la regressione di un turno mai raggiunto dalla baseline. Sul nuovo contesto, in tutti e quattro i casi il database risulta conforme e lo storico conservato. Anche questi esiti restano registrati, non trasformati in successi.

Nessuna causa radice dei quattro scostamenti bloccanti è provata dagli indicatori disponibili. Non sono state introdotte modifiche speculative al prompt dopo il confronto, né allentati i controlli del catalogo. Per proseguire serve concordare diagnosi mirata e autorizzazione per le necessarie nuove prove reali; non occorre creare automaticamente un altro item sul branch.

## Verifica dei criteri e della DoD

| Criterio | Evidenza / limite |
| --- | --- |
| Nucleo entro 15.000 caratteri e contenuti comuni | 12.423 caratteri; test in memoria su testi incorporati durante la build |
| Skill versionate, immagini e sola lettura, tentativi del modello | Sei skill; prove images e author positive con modello sintetico e gateway reale |
| Solo caricamento interno; blocco di comandi e varianti anche a sessione nuova e busy | Prova author positiva, senza richiesta al modello per i comandi rifiutati; `skill_view` interno riuscito |
| Risultati e privilegi SQL, protezione numeri e attribuzione | Prove DB, author e upgrade positive su PostgreSQL reale; nessuna nuova fonte d'identità |
| Coerenza schema e assenza di regole di comportamento nel codice | `test:local` positivo; codice SQL limitato alla ricostruzione dei dati, istruzioni nel nucleo e nelle skill |
| Catalogo reale completo, confronto, regressioni corrette | **Non soddisfatto interamente:** i due cataloghi e il confronto sono completi, ma quattro possibili regressioni restano non risolte |
| Requisiti, AGENTS, design, README e suite pertinenti | Aggiornati; esiti sintetici distinti dalle prove reali nel rapporto |

Il gate rapido è verde; sono presenti ADR, documentazione, esempi di configurazione senza nuovi segreti e voce CHANGELOG. Questo non sostituisce il criterio conversazionale mancante: non si esegue `backlog done` e non si dichiara conclusa `finish-task`.

Alla verifica dopo le due esecuzioni complete non risultano processi `node scripts/conversation.mjs` né container, volumi o reti con i prefissi delle suite isolate controllate. Le impronte di nucleo, sei skill e catalogo coincidono con quelle d'avvio. Nessun deploy, modifica dello stack operativo, merge o push di `main`.
