# US-019 — Prove delle partecipazioni previste

Evidenze raccolte il 2026-11-18 nel branch `us/US-019-partecipazioni-previste`, con soli dati sintetici. Nessuna modifica allo stack operativo, deploy, merge o push di `main`.

## Suite su PostgreSQL reale e Docker

| Suite | Esito |
| --- | --- |
| `npm run test:db` | 2/2. `planned-checks.ts` verifica autore protetto, inserimento solo valido, lezioni passate e future, orari con secondi, 24:00, date non finite e orari inesistenti rifiutati, unicità tra le valide, annullamento unico con istante di sistema, divieto di DELETE, TRUNCATE, riscrittura (anche al migratore) e DDL, proiezione senza telefoni, presenza futura ancora rifiutata, numeri degli autori nell'insieme oscurato dal gateway. `lesson-checks.ts` confronta le funzioni con la query di riferimento estesa e verifica `source` (`planned`, `rule` prevalente, annullate escluse) e le lezioni create dalle partecipazioni previste. |
| `npm run test:upgrade` | 1/1. Dopo l'aggiornamento dallo schema precedente con dati, la regola esistente produce un atteso `rule` e una nuova partecipazione prevista un atteso `planned` con autore censito. |
| `npm run test:hermes` | 1/1. Backup e ripristino conservano partecipazioni previste valide e annullate con autori e motivi; dopo il ripristino `expected_clients` le restituisce e i divieti restano attivi. |
| `npm run test:local` | Prima esecuzione: 55/56, il controllo del catalogo richiedeva due turni per scenario e un indicatore di risposta per turno; corretti gli scenari, 56/56. |
| `npm run test:author` | Due esecuzioni parallele complete fallite solo in `management.test.ts` e/o `transition.test.ts` con `Database role setup failed.` durante il bootstrap dei ruoli, prima di qualunque migrazione: è l'intermittenza preesistente già registrata in TEC-043 e TEC-046, non risolta da questo item. Riesecuzioni isolate dei due file: passate. Esecuzione degli stessi sei test con `--test-concurrency=1`: 6/6, compreso il percorso gateway di inserimento e annullamento con autore di sistema. |

Gate rapido (`lint`, `typecheck`, `npm test`, `build`) eseguito alla chiusura.

## Scenari conversazionali con il modello reale

`CONVERSATION_SCENARIO=<id> npm run test:conversation`, modello predefinito `openai/gpt-6.1-terra`, chiave OpenRouter fornita dall'utente solo come variabile d'ambiente del comando. Ogni scenario eseguito una volta, senza ripetizioni:

| Scenario | Esito |
| --- | --- |
| `partecipazione-prevista-oggi-annullamento` (oggi prima dell'inizio, presenza futura rifiutata, annullamento) | OK |
| `partecipazione-prevista-nome-simile` | OK |
| `partecipazione-prevista-data-ambigua` | OK |
| `partecipazione-prevista-gia-attesa` (atteso per regola non registrato, poi recupero in altro orario) | OK |
| `partecipazione-prevista-tutti` («c'erano tutti» con il cliente previsto, poi consultazione) | OK |

Nei log non compaiono la chiave né numeri; container, volumi e directory temporanee dei progetti di prova risultano rimossi.

## Confronto dell'intero catalogo prima/dopo

Eseguito il 2026-11-19 su richiesta dell'utente prima del merge, secondo `docs/design/conversation-tests.md` (Confronti). Modello di entrambe le esecuzioni `openai/gpt-6.1-terra` via OpenRouter reale, chiave solo come variabile d'ambiente del comando; PostgreSQL, gateway e broker reali isolati, webhook sintetici firmati, sostituto locale Meta e soli dati sintetici. Non sono prove con Meta reale.

- Contesto precedente: `origin/main` alla revisione `159b239`, estratto in una directory temporanea dai soli file versionati con `git archive`, dipendenze da `npm ci`, senza configurazione privata; harness e catalogo di quella revisione (56 scenari). SHA-256 di `SOUL.md`: `2c0467ce707e366a926ff3436b198dd9c4f737a339e6998ff2c679781871a864`; del catalogo: `321ea338dbc3ebba6470cd15b8b5e8cfa1424bd340706a79312eb0fc28290555`.
- Contesto nuovo: branch `us/US-019-partecipazioni-previste` alla revisione `0e28059` (61 scenari). SHA-256 di `SOUL.md`: `60e72b89bcb9bb8b0958a8d0e4d0b4654a715d1e6c5ce970f54657d24ff3504c`; del catalogo: `fc24c6bba4b94d4fa456d8eca121055d97167ab0dece23632cf021414755cf9f`. I 56 scenari comuni sono identici nei due cataloghi.
- Le impronte di nucleo, skill, catalogo e harness acquisite prima dell'avvio coincidono con quelle alla fine.
- Node 24.22.2 e npm 11.19.1; immagine Hermes costruita da ciascun contesto per il proprio progetto di prova.

| Esecuzione | Inizio e fine, Europe/Rome | Risultato |
| --- | --- | --- |
| Unica esecuzione sul contesto precedente | 2026-11-19 00:06:44 → 01:27:09 | 56/56 scenari eseguiti; 47 OK, 9 errori; exit 1 |
| Unica esecuzione sul contesto nuovo | 2026-11-19 01:06:14 → 02:29:38 | 61/61 scenari eseguiti; 54 OK, 7 errori; exit 1 |

Un primo lancio del contesto nuovo, previsto alle 00:08, non è partito per un errore dello script di avvio, che aveva perso i percorsi di log e chiave: nessun processo e nessuna richiesta al modello. Il relay stampa i contatori soltanto per gli scenari falliti: 195 richieste nei 9 falliti del contesto precedente, con un errore HTTP intermedio in `disattivazione-esplicita-storico` (ultimo HTTP 200), e 169 nei 7 falliti del nuovo, senza rifiuti né errori. Le richieste degli scenari riusciti non sono contate nei log.

Sui 56 scenari comuni: 45 OK in entrambe le esecuzioni, 4 da errore a OK, 2 da OK a errore, 5 in errore in entrambe. I 5 scenari nuovi sono OK. Ogni scenario fallito si arresta al primo controllo negativo; gli indicatori delle risposte sono lessicali, quindi un errore di testo non è automaticamente un falso negativo né una perdita di dati.

| Scenario | Precedente | Nuovo |
| --- | --- | --- |
| `consultazione-insegnante-lezione` | OK | OK |
| `consultazione-insegnante-periodo` | ERRORE — turno 1: contenuto risposta | OK |
| `consultazione-insegnante-regole` | OK | OK |
| `consultazione-lezioni-senza-insegnante` | OK | ERRORE — turno 4: contenuto risposta |
| `indicazione-passata-senza-presenze` | OK | OK |
| `indicazione-lezione-extra` | OK | OK |
| `sostituzione-singola` | OK | OK |
| `sostituzione-piu-lezioni` | OK | OK |
| `sostituzione-periodo` | OK | OK |
| `sostituzione-non-attesa-ambigua` | OK | OK |
| `sostituzione-senza-lezioni` | OK | OK |
| `indicazione-mittente-collegato` | OK | OK |
| `insegnante-sconosciuto-indicazione` | OK | OK |
| `indicazione-nome-chiarimento` | OK | OK |
| `presenze-senza-indicazione` | OK | OK |
| `indicazione-correzione-annullamento` | OK | OK |
| `insegnanti-fasce-e-orari` | OK | OK |
| `insegnanti-cognome-e-riconoscimento` | ERRORE — turno 3: stato database | ERRORE — turno 5: contenuto risposta |
| `insegnanti-sovrapposizione-conferma` | OK | OK |
| `insegnanti-sovrapposizione-stesso` | OK | OK |
| `insegnanti-disattivazione-parziale` | OK | OK |
| `insegnanti-mittente-collegato` | OK | OK |
| `insegnante-sconosciuto-regola` | OK | OK |
| `insegnanti-io-nome-censito` | OK | OK |
| `nessun-profilo-saluto` | OK | OK |
| `nessun-profilo-richiesta` | OK | OK |
| `nessun-profilo-nome-assente` | OK | OK |
| `consultazione-presenze-ieri` | OK | OK |
| `consultazione-presenze-statistiche` | OK | ERRORE — turno 1: contenuto risposta |
| `assenza-anticipata-singola-annullamento` | ERRORE — turno 4: contenuto risposta | OK |
| `assenza-anticipata-ambigua-non-attesa` | OK | OK |
| `assenza-anticipata-periodo` | OK | OK |
| `assenza-anticipata-conflitto-presenza` | OK | OK |
| `assenza-anticipata-conflitto-assenza` | OK | OK |
| `assenza-anticipata-conflitto-tutti-tranne` | OK | OK |
| `assenza-anticipata-conflitto-esplicito` | OK | OK |
| `correzioni-presenze-storico` | OK | OK |
| `assenze-esplicite-chiarimento` | OK | OK |
| `assenze-attesi-presenze` | ERRORE — turno 5: contenuto risposta | ERRORE — turno 5: contenuto risposta |
| `presenze-data-odierna` | ERRORE — turno 1: contenuto risposta | OK |
| `presenze-nomi-duplicato-futuro` | ERRORE — turno 1: contenuto risposta | ERRORE — turno 5: contenuto risposta |
| `presenze-attesi-storici` | ERRORE — turno 2: contenuto risposta | OK |
| `nome-prima-conversazione` | OK | OK |
| `nome-altro-interlocutore` | OK | OK |
| `consultazione-pianificazione` | OK | OK |
| `registrazione-consultazione` | OK | OK |
| `piu-orari-e-gruppo` | OK | OK |
| `cognome-mancante` | OK | OK |
| `nome-unico` | OK | OK |
| `nome-ambiguo` | OK | OK |
| `orario-mancante` | OK | OK |
| `giorno-mancante` | OK | OK |
| `autore-non-dichiarato` | OK | OK |
| `disattivazione-esplicita-storico` | ERRORE — turno 3: contenuto risposta | ERRORE — turno 3: contenuto risposta |
| `aggiornamento-implicito` | ERRORE — turno 3: contenuto risposta | ERRORE — turno 3: contenuto risposta |
| `cambio-cliente-gruppo` | OK | OK |
| `partecipazione-prevista-oggi-annullamento` | — (non nel catalogo) | OK |
| `partecipazione-prevista-nome-simile` | — (non nel catalogo) | OK |
| `partecipazione-prevista-data-ambigua` | — (non nel catalogo) | OK |
| `partecipazione-prevista-gia-attesa` | — (non nel catalogo) | OK |
| `partecipazione-prevista-tutti` | — (non nel catalogo) | OK |

### Differenze e instabilità

**Da OK a errore.** Entrambe sono errori del contenuto della risposta.

1. `consultazione-lezioni-senza-insegnante`, turno 4: è la consultazione di una settimana del 2023 senza lezioni e non riconosce nessuna delle formule negative attese. Le modifiche di US-019 non toccano `lesson_teachers` né la skill delle consultazioni per insegnante; `existing_lessons` cambia solo con partecipazioni previste, assenti in questo scenario.
2. `consultazione-presenze-statistiche`, turno 1: è già instabile in [TEC-046](TEC-046-prove.md), sia nel confronto completo sia nelle prove mirate, con esiti alterni sullo stesso contesto. US-019 aggiunge alla skill delle consultazioni l'uso di `expected_clients` e le partecipazioni previste negli attesi, assenti in questo scenario.

Per verificare il peggioramento, ciascuno dei due è stato rieseguito una sola volta sul contesto nuovo, senza modifiche a testi, catalogo o harness: `consultazione-lezioni-senza-insegnante` OK (02:30:08 → 02:31:36), `consultazione-presenze-statistiche` con la diagnostica opt-in ammessa OK (→ 02:34:01). Non sono stati eseguiti altri tentativi. Il peggioramento non si riproduce e non è attribuito alle modifiche di US-019, quindi non sono state fatte correzioni. Gli esiti originali restano registrati come errori; una sola riesecuzione positiva non prova la stabilità né esclude del tutto un effetto delle modifiche.

**Da errore a OK.** `consultazione-insegnante-periodo`, `assenza-anticipata-singola-annullamento`, `presenze-data-odierna` e `presenze-attesi-storici` falliscono solo sul contesto precedente. Non è dimostrato un miglioramento dovuto a US-019.

**In errore in entrambe.** `insegnanti-cognome-e-riconoscimento`: precedente al turno 3 per stato database, nuovo al turno 5 per contenuto. `assenze-attesi-presenze` al turno 5 in entrambe. `presenze-nomi-duplicato-futuro`: precedente al turno 1, nuovo al turno 5. `disattivazione-esplicita-storico` e `aggiornamento-implicito` al turno 3 in entrambe. Sul contesto nuovo tutti questi errori riguardano il contenuto della risposta. Dove la diagnostica sintetica è stampata, il database risulta conforme e lo storico conservato. Alcuni di questi scenari erano già in errore in [TEC-046](TEC-046-prove.md): `insegnanti-cognome-e-riconoscimento`, `assenze-attesi-presenze`, `presenze-nomi-duplicato-futuro` (solo baseline), `disattivazione-esplicita-storico` (solo baseline) e `aggiornamento-implicito` (solo baseline). Sono instabilità già presenti nel contesto precedente; non sono riclassificate come successi né attribuite a US-019.

Nei log non compaiono la chiave né numeri di telefono; nessuno scenario segnala pulizia incompleta; al termine non restano processi dell'harness né container, volumi, reti o immagini creati da queste esecuzioni. Le immagini `pilates-conv-*-postgres` presenti sull'host risalgono al 2026-11-10, sono precedenti a questo item e non sono state rimosse. I log grezzi restano fuori dal repository e questo rapporto non riporta risposte o dati.

## Limiti

- Gli esiti con il modello reale sono di una sola esecuzione e non garantiscono il comportamento futuro; gli indicatori delle risposte sono lessicali.
- Il confronto dell'intero catalogo è di una sola esecuzione per contesto. Le due differenze da OK a errore non si riproducono in una sola riesecuzione, che non dimostra la stabilità.
- Che il cliente non sia già atteso per regola è verificato dall'agente, non dal database; le funzioni di lettura deduplicano comunque gli attesi.
