# TEC-046 — Prove del contesto compatto

## State

**Done — chiuso il 2026-11-16 con limiti accettati esplicitamente dall'utente, non con verifica conversazionale totalmente positiva.** Dopo il rapporto Blocked l'utente ha dichiarato: «no. sono soddifsatto, per me si può chiudere». La chiusura applica la deroga per il solo TEC-046 registrata in `AGENTS.md` §8 a `docs/PROCESS.md` §6 (allora §8 nella numerazione 3.x) e alla procedura `finish-task`, esclusivamente per la parte conversazionale non soddisfatta. Non dichiara risolte le anomalie né dimostrata la stabilità. Dettagli e gate finale nella sezione di chiusura in fondo; nessun esito originale è cambiato.

### Valutazione tecnica prima dell'accettazione utente

**Blocked, non Done.** I cataloghi reali completi restano baseline 46/57 OK e contesto nuovo 49/57 OK, entrambi exit 1. La successiva diagnosi mirata autorizzata ha individuato e corretto un falso negativo del matcher della pianificazione; identità mancante e assenza anticipata non hanno riprodotto l'errore senza modifiche al prompt, senza dimostrare causa o stabilità. La statistica riproduce il controllo negativo dopo una precisazione della skill e passa in una successiva acquisizione diagnostica con lo stesso comportamento: la causa della differenza e la risoluzione non sono dimostrate. Il criterio conversazionale e la Definition of Done non sono soddisfatti.

Decisione tecnica: [ADR-004](../adr/ADR-004-read-only-skills-computed-data.md). Nessuna baseline o catalogo completo è stato ripetuto. Dopo le sette prove mirate descritte sotto non sono stati eseguiti ulteriori tentativi per cercare un esito verde.

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
| Gate rapido | lint, typecheck, 98/98 test in memoria, build riusciti nella prima valutazione | Il modulo dei testi è prodotto dalla build; i test non leggono file né avviano processi |
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

Al termine del confronto completo nessuna causa radice dei quattro scostamenti era provata dagli indicatori disponibili. La prosecuzione mirata e le sue modifiche sono registrate separatamente qui sotto; gli esiti originali sopra non sono ricalcolati, cancellati o trasformati in successi.

## Prosecuzione mirata autorizzata

L'utente, tramite `t2q`, ha autorizzato diagnosi ed eventuali correzioni dei soli quattro casi, con `openai/gpt-6.1-terra`, senza ripetere baseline o catalogo completo e senza cicli di tentativi fino al verde. Autorizzazione e ripresa da Blocked a In Progress sono registrate nel commit `77d7e28`, pubblicato prima di proseguire. Ogni prima prova ha usato gli stessi testi del confronto completo: nessuna correzione preventiva del comportamento.

### Diagnostica minima e privacy

`CONVERSATION_DIAGNOSTICS=1`, disabilitato per default e accettato solo con uno dei quattro ID selezionati, aggiunge diagnostica dell'harness. La copia della richiesta transitata nel relay è elaborata soltanto in memoria, con limite di quattro MB, ed eliminata; non viene salvata. `conversation-diagnostics` restituisce solo categorie a elenco chiuso: SQL/skill/altro, operazioni e tabelle note, presenza della funzione del mittente, numero di righe, errore booleano/SQLSTATE e indicatori di risposta. Non emette query, parametri, contenuti delle skill, errori arbitrari, ID delle chiamate, messaggi, risposte, nomi, telefoni o credenziali. I test in memoria verificano esplicitamente che valori sorgente ostili non siano restituiti.

Gli indicatori testuali sono ancora lessicali: la categoria inizialmente chiamata `explicitNonparticipant` è stata rinominata `nonparticipantOrCancellationContext` perché riconosce negazioni **oppure** riferimenti ad annullamenti, non prova da sola una classificazione semantica completa. Analogamente `validAttendanceFilter` attesta soltanto la presenza lessicale di `cancelled_at IS NULL`, non che si applichi a ogni ramo della query. Queste cautele evitano di trasformare indizi in cause accertate.

### Registro delle sette prove reali mirate

Tutte il 2026-11-16, fuso Europe/Rome; stack nuovi isolati e dati sintetici, modello OpenRouter reale e Meta sostituita localmente. Le prime quattro sono state eseguite nell'ordine richiesto. La quinta e sesta sono singole verifiche dopo correzioni specifiche. La settima è un'acquisizione diagnostica aggiuntiva, senza cambiare comportamento o controlli, motivata dalla necessità di distinguere negazione, annullamento, appartenenza agli elenchi ed esclusione esplicita: è stata estesa la sola diagnostica con indicatori separati. Non ne sono seguite altre per cercare successi. Log locali ignorati `tmp/targeted-<nome>.log` e timestamp `.start` (eccetto l'avvio della settima, non annotato); nessuna risposta grezza nei log o in questo documento.

| Prova | Orario | Esito | Modifiche rispetto al confronto completo |
| --- | --- | --- | --- |
| `identity` — indicazione-mittente-collegato-inesistente | 13:13:22 → 13:14:44 | OK, due turni, exit 0 | Solo diagnostica; nessun cambio al prompt o al catalogo |
| `stats` — consultazione-presenze-statistiche | 13:14:51 → 13:15:52 | ERRORE T1 testo, exit 1 | Solo diagnostica |
| `absence` — assenza-anticipata-singola-annullamento | 13:16:23 → 13:18:14 | OK, quattro turni, exit 0 | Solo diagnostica |
| `planning` — consultazione-pianificazione | 13:18:21 → 13:20:36 | ERRORE T7 testo, exit 1 | Solo diagnostica |
| `stats-corrected` | 13:23:22 → 13:24:22 | ERRORE T1 testo, exit 1 | Precisazione della skill sulle sole righe valide e sullo storico richiesto; matcher delle esclusioni invariato |
| `planning-corrected` | 13:24:35 → 13:27:17 | OK, sette turni, exit 0 | Correzione del matcher per il giorno ripetuto su più righe; nessuna modifica alla skill della pianificazione |
| `stats-semantic` | Avvio non annotato → 13:33:48 | OK, otto turni, exit 0 | Solo estensione diagnostica con indicatori separati; comportamento e controlli identici a `stats-corrected` |

### Cause, ipotesi e modifiche

**Identità mancante.** Nel primo turno la funzione fidata del mittente ha restituito zero righe e il modello ha chiesto il chiarimento; nel secondo ha cercato l'anagrafica, inserito l'insegnante e l'indicazione, con una riga per ciascuna operazione e senza errori SQL o di contesto osservati. Stato e risposta sono conformi. Questo prova il funzionamento del percorso in questa esecuzione, non la causa dell'omissione originale né la stabilità futura. Non sono stati modificati prompt o controlli e non è stata ripetuta la prova per cercare altre conferme.

**Statistiche.** La prima prova riproduce la menzione della persona esclusa dal catalogo, in una frase con negazione o riferimento all'annullamento; il database è conforme e lo storico conservato. Non ci sono errori degli strumenti osservati. Il segnale non dimostra che la persona sia presentata come partecipante, ma nemmeno autorizza a ignorare l'esclusione. REQ-STUDIO-009 limita le consultazioni ordinarie alle registrazioni valide e ammette le annullate su richiesta: il controllo non viene allentato.

La partizione teneva l'istruzione esplicita dello storico su richiesta nella skill di registrazione/correzione, separata dalla skill di consultazione. Quest'ultima imponeva già `cancelled_at IS NULL`, ma non esplicitava il limite alle note aggiuntive. È stata precisata: nessuna nota negativa con nomi ricavati soltanto da righe annullate; storico solo su richiesta, con data, autore e motivo. Si rende autosufficiente la skill consultata, senza introdurre nuovi comportamenti nel codice o cambiare il requisito. È una correzione motivata della partizione, **non una causa radice provata** dell'errore originale.

L'unica verifica dopo questa precisazione fallisce ancora T1: skill caricata, query riuscita con presenza lessicale del filtro sui record validi, persona esclusa ancora menzionata in contesto negativo/annullamento, database invariato. Non è dimostrato un guasto SQL; non è dimostrato nemmeno che l'intera risposta sia un falso negativo. La precisazione non ha risolto il problema nel tentativo osservato.

Una sola ulteriore acquisizione, con indicatori separati per presenza, assenza, annullamento, negazione, registrazione mancante, attesi ed esclusione esplicita, ha invece completato tutti e otto i turni con esito OK e senza menzionare il nome escluso. Non riproducendo la frase negativa, non permette di completarne retroattivamente la diagnosi semantica. Non è stata cambiata nuovamente la skill e il controllo delle esclusioni è identico: è osservata variabilità sullo stesso comportamento, non dimostrata causalità o stabilità. Non sono seguiti altri tentativi.

Durante questa estensione un test in memoria ha rilevato che un indicatore di registrazione mancante attraversava parole intermedie e confondeva una negazione della presenza con la mancanza di registrazioni. Il pattern diagnostico è stato ristretto prima della verifica finale dei test; non è un controllo del catalogo e non ha cambiato esiti, prompt o operazioni delle prove reali. L'avvio della settima prova non è stato annotato perché il comando preparatorio si era arrestato sull'asserzione; la prova è partita dal comando successivo della shell. Si conserva l'ora di conclusione senza inventare quella d'inizio.

**Assenza anticipata.** Tutti e quattro i turni passano senza cambiare prompt o controlli. Nel quarto non sono osservati nuovi INSERT dopo la richiesta di presenza futura; il database resta conforme, la risposta contiene rifiuto, formulazione temporale riconosciuta e condizione legata all'inizio della lezione. È prova del rifiuto corretto in questo caso, non permette di ricostruire il significato della risposta originale non conservata. Nessuna causa radice o stabilità viene dedotta dal singolo risultato positivo.

**Pianificazione: falso negativo accertato del matcher.** Alla prima prova mirata tutte le singole associazioni richieste di giorno, orario e cliente passano, ma il raggruppamento completo di uno stesso giorno fallisce. Il matcher richiedeva che tutte le righe fossero sotto una sola occorrenza del nome del giorno: una risposta con il giorno ripetuto su ogni riga, pur associando correttamente ciascuna persona e ora, falliva.

Un test in memoria con dati sintetici minimali ha riprodotto l'errore prima della modifica (rosso). Il matcher ora cerca ciascuna associazione in una sezione del giorno corretto, conservando l'associazione cliente/ora nella stessa riga; non concatena sezioni di giorni diversi. Test positivi coprono sezione unica e giorno ripetuto; test negativi mantengono il rifiuto di giorno errato, orari scambiati e giorno mancante. I controlli dei nomi esclusi e tutti gli altri criteri restano invariati. È una correzione di rappresentazione del test, non un allentamento del comportamento richiesto. La singola verifica reale dopo la modifica passa tutti e sette i turni. La causa del falso negativo nella prova mirata è accertata; la medesima causa nell'esecuzione completa originale è compatibile ma non provata, poiché la risposta originale non è conservata.

### Esito della prosecuzione e prossimo passo proposto prima dell'accettazione utente

Gate rapido aggiornato: 100/100 test in memoria, lint, typecheck e build positivi; `test:local` 46/46 positivo dopo le modifiche. Le suite di PostgreSQL, gateway, autore, upgrade, immagini e compattazione restano quelle eseguite nell'item sopra: non sono nuove prove di stabilità con il modello reale.

Il caso statistiche è stato riprodotto e poi non riprodotto sullo stesso comportamento; la risoluzione non è dimostrata. Identità e assenza hanno un esito mirato positivo senza causa originale accertata; non sono dichiarati stabili né retroattivamente corretti. Il prossimo passo necessario è una diagnosi semantica più discriminante della sola risposta statistica e della selezione dei dati (per esempio indicatori separati per appartenenza agli elenchi validi e nota sullo storico), mantenendo i divieti di testo grezzo nei log e senza rimuovere l'esclusione. Serve concordare questa prova ulteriore prima di avviare altre chiamate, non una nuova ripetizione generale. Nessun catalogo o baseline è stato ripetuto e non è stata dichiarata conclusa `finish-task`.

## Verifica dei criteri e della DoD

| Criterio | Evidenza / limite |
| --- | --- |
| Nucleo entro 15.000 caratteri e contenuti comuni | 12.423 caratteri; test in memoria su testi incorporati durante la build |
| Skill versionate, immagini e sola lettura, tentativi del modello | Sei skill; prove images e author positive con modello sintetico e gateway reale |
| Solo caricamento interno; blocco di comandi e varianti anche a sessione nuova e busy | Prova author positiva, senza richiesta al modello per i comandi rifiutati; `skill_view` interno riuscito |
| Risultati e privilegi SQL, protezione numeri e attribuzione | Prove DB, author e upgrade positive su PostgreSQL reale; nessuna nuova fonte d'identità |
| Coerenza schema e assenza di regole di comportamento nel codice | `test:local` positivo; codice SQL limitato alla ricostruzione dei dati, istruzioni nel nucleo e nelle skill |
| Catalogo reale completo, confronto, regressioni corrette | **Non soddisfatto interamente:** i due cataloghi e il confronto sono completi, ma la statistica ha esiti alterni con risoluzione non dimostrata; le cause originarie dei due casi non riprodotti restano indeterminate |
| Requisiti, AGENTS, design, README e suite pertinenti | Aggiornati; esiti sintetici distinti dalle prove reali nel rapporto |

Prima dell'accettazione utente il gate rapido era verde; erano presenti ADR, documentazione, esempi di configurazione senza nuovi segreti e voce CHANGELOG. Ciò non sostituiva il criterio conversazionale mancante: non era stato eseguito `backlog done` né dichiarata conclusa `finish-task`. La tabella conserva questa valutazione tecnica, incluso il criterio non soddisfatto; la successiva chiusura è in deroga, non una modifica retroattiva della valutazione.

Alla verifica dopo le due esecuzioni complete non risultano processi `node scripts/conversation.mjs` né container, volumi o reti con i prefissi delle suite isolate controllate. Le impronte di nucleo, sei skill e catalogo coincidono con quelle d'avvio. Nessun deploy, modifica dello stack operativo, merge o push di `main`.

## Chiusura con limiti accettati dall'utente

Il 2026-11-16, data ricavata dal sistema, `t2q` ha inoltrato la decisione esplicita dell'utente, successiva al rapporto Blocked e ai limiti noti: «no. sono soddifsatto, per me si può chiudere». L'utente rifiuta ulteriore diagnosi e accetta le evidenze già acquisite e il rischio residuo per la chiusura del solo TEC-046. Non sono richiesti o autorizzati da questa decisione altri test reali, diagnosi o nuovi item, e non ne sono stati eseguiti.

La deroga è stata registrata prima della ripresa in `AGENTS.md` §8 e nei remarks del backlog tramite CLI. Il passaggio Blocked → In Progress è stato committato e pubblicato in `909ce8e` prima della procedura di chiusura. La deroga riguarda solo la parte conversazionale non soddisfatta di PROCESS §6 (allora §8 nella numerazione 3.x) e `finish-task`: tutti gli altri criteri e la DoD restano invariati. Non si estende ad altri item, ai requisiti globali, al gate rapido, alla release, al merge o al deploy, né autorizza push di `main` o rimozioni di clone.

### Rischio residuo accettato, non risoluzione dimostrata

- **Statistiche:** esiti alterni anche sullo stesso comportamento; causa e risoluzione non dimostrate. L'ultimo risultato positivo non sana causalmente i fallimenti precedenti.
- **Identità mancante e assenza anticipata:** verifiche mirate positive senza modifiche al prompt; cause originali non accertate e stabilità non dimostrata.
- **Pianificazione:** falso negativo del matcher accertato e corretto con test positivi/negativi e verifica mirata positiva; la stessa causa nell'esecuzione completa originale resta compatibile, non provata.

Le tabelle dei 57 scenari, gli exit 1, la porzione interrotta e i sette esiti mirati restano intatti. Nessuna esclusione lessicale è stata rimossa per ottenere la chiusura; nessun requisito globale è stato riscritto per dichiarare escluse le regressioni. L'accettazione del rischio chiude l'item, non costituisce un'approvazione della release.

### Gate e altri criteri/DoD alla chiusura

Gate finale obbligatorio eseguito il 2026-11-16 dopo la ripresa, senza prove esterne:

| Comando | Esito finale |
| --- | --- |
| `npm run lint` | OK, 91 file |
| `npm run typecheck` | OK |
| `npm test` | OK, 100/100 test in memoria; nessun fallimento o test saltato |
| `npm run build` | OK |

- Gli altri criteri restano verificati dalle evidenze concrete della tabella precedente: limite del nucleo, sei skill versionate e sola lettura, blocco gateway senza turni del modello, SQL e privilegi su PostgreSQL reale, coerenza dello schema, identità protetta e documentazione aggiornata. Le suite separate già eseguite durante l'item non sono state sostituite dal gate rapido né dichiarate ripetute in questa chiusura documentale.
- Test al livello pertinente e regressioni del matcher coperti; l'eccezione riguarda esclusivamente la valutazione conversazionale residua esplicitata sopra.
- Nessun nuovo segreto, configurazione privata o testo grezzo introdotto; restano invariati esempi senza segreti, requisiti, design, ADR-004 e README già aggiornati durante l'item.
- Voce `[Unreleased]` di CHANGELOG presente e precisata per segnalare i limiti accettati, senza annunciare stabilità dimostrata.
- Decisione, deroga e limiti registrati anche nell'outcome di TEC-046 tramite CLI; `backlog check` positivo. Chiusura `Done` con commit e pubblicazione sul solo branch dell'item secondo le shared claims; nessun merge, deploy, push di `main` o rimozione di clone autorizzato o eseguito.
