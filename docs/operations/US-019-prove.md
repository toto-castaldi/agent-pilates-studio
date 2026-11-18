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

## Limiti

- Gli esiti con il modello reale sono di una sola esecuzione e non garantiscono il comportamento futuro; gli indicatori delle risposte sono lessicali.
- Il confronto dell'intero catalogo sul contesto precedente e su quello nuovo (`docs/design/conversation-tests.md`, Confronti) non è stato eseguito: l'autorizzazione riguardava gli scenari dei criteri. Le modifiche alle skill delle presenze, delle consultazioni, delle regole dei clienti e delle indicazioni non sono quindi verificate con il modello reale sugli scenari preesistenti.
- Che il cliente non sia già atteso per regola è verificato dall'agente, non dal database; le funzioni di lettura deduplicano comunque gli attesi.
