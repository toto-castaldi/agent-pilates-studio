# TEC-033 — Prove dello schema degli insegnanti

- **Date:** 2026-11-11
- **Item:** TEC-033
- **Environment:** Node.js 24.22.2, npm 11.19.1, Docker client/server 29.9.3, Compose 5.7.0; PostgreSQL 17.10 e Hermes 0.22.7 fissati dal repository. `test:upgrade` parte anche dalle immagini PostgreSQL 17.9 e Hermes 0.22.6 previste dalla suite.

## Execution

Dipendenze preparate con `npm ci` da lockfile. Le prove Docker sono state eseguite con `sg docker -c 'npm run …'`: l'utente apparteneva già al gruppo Docker, non ancora attivo nei gruppi della sessione. Nessuna modifica a permessi, gruppi o configurazione di sistema.

| Command | Result |
| --- | --- |
| `npm run test:db` | Pass: PostgreSQL reale, migrazioni, privilegi, `checkTeachers`, concorrenza delle regole e delle indicazioni. |
| `npm run test:author` | Pass: due test, gateway/broker/plugin reali, webhook firmati e sostituto deterministico del modello. |
| `npm run test:hermes` | Pass: stack isolato, persistenza, dump e ripristino dello storico completo degli insegnanti e nuove scritture dopo il recupero. |
| `npm run test:upgrade` | Pass: immagini precedenti e schema precedente completo con dati, migrazione e nuove entità protette. |
| `npm run test:local` | Pass: 22 test, incluso il confronto delle colonne di SOUL con la migrazione. |
| `npm run lint` | Pass. |
| `npm run typecheck` | Pass. |
| `npm test` | Pass: 59 test unitari in memoria. |
| `npm run build` | Pass. |

Ogni suite usa progetti Compose casuali, volumi e directory temporanei, credenziali e dati sintetici. I test non leggono configurazione privata dal clone principale, non usano il proxy pubblico e non avviano lo stack operativo. La pulizia riguarda soltanto le risorse delle prove.

## Acceptance evidence

1. **Tabelle e vincoli:** `20261111000000_teachers/migration.sql` e `integration/teacher-checks.ts` verificano insegnanti distinti dai clienti, nomi univoci senza distinzione di maiuscole, nomi e testi vuoti/non puliti rifiutati, riferimenti esistenti, giorni ISO, precisione al minuto, estremi inclusivi ordinati e stati di disattivazione/annullamento coerenti. Il commit di una regola senza intervalli fallisce; anche un INSERT saltato con ON CONFLICT non apre una finestra per modificare una regola già registrata.
2. **Unicità e tempo:** indicazioni passate e future, unicità tra insegnanti per la stessa lezione, reinserimento dopo annullamento, cambio primaverile inesistente rifiutato e ora ripetuta autunnale verificata. Due transazioni concorrenti sulla stessa indicazione attendono e una è rifiutata. Il vincolo GiST delle regole rifiuta sovrapposizioni anche agli estremi; un inserimento concorrente attende il commit e fallisce, mentre una sostituzione attende la disattivazione e poi riesce. Motivazione in [ADR-001](../adr/ADR-001-teacher-rule-integrity.md).
3. **Autore non falsificabile:** `test:db` verifica contesto assente, scaduto o di un altro backend, GUC non attendibile, accessi privati rifiutati, nomi di profilo facoltativi e valori dichiarati sovrascritti. `test:author` crea le nuove entità da due mittenti concorrenti e verifica disattivazione e annullamenti da un altro mittente, con autore e date falsi nel SQL generato dal modello deterministico. Gli intervalli ereditano l'autore della regola e non si possono aggiungere dopo la chiusura della transazione.
4. **Privilegi e storico:** agente con SELECT/INSERT sulle quattro nuove tabelle, UPDATE solo sui campi di transizione di regole e indicazioni. Test di DELETE/TRUNCATE su tutte le tabelle, anche dal migratore; riscrittura, riattivazione degli intervalli, secondo annullamento/disattivazione e DDL dell'agente rifiutati. Le protezioni del normale DML non pretendono di limitare un amministratore che può alterare lo schema o disabilitare trigger.
5. **Migrazioni e recupero:** `test:author` e `test:hermes` applicano tutte le migrazioni a database vuoti. `test:upgrade` prepara lo schema completo fino a `20261108000000_future_excused_absences`, con regole e registrazioni valide/annullate e assenza futura; confronta tutti i dati preesistenti dopo la nuova migrazione. `test:hermes` confronta insegnanti, regole attive/disattivate, tutti gli intervalli e indicazioni valide/annullate/future dopo riavvio, ricreazione e ripristino. Verifica anche la finestra privata vuota e, dopo il recupero, rifiuto di aggiunte tardive, attribuzione protetta, disattivazione, nuova regola, annullamento e nuova indicazione con il ruolo agente.
6. **Contesto:** `hermes/SOUL.md` elenca tutte le nuove colonne, la costruzione con CTE e le definizioni di insegnante atteso, insegnante della lezione e lezione puntuale esistente. `integration/local/soul.test.ts` confronta lo schema versionato con queste colonne. Le fasce e le regole di comportamento non sono duplicate nel codice.
7. **Design:** TECHNICAL-DESIGN §4–5 descrive dati, attribuzione e invarianti; §8 descrive le suite e §10 chiude la decisione sullo schema. ADR-001 motiva difesa concorrente e immutabilità degli intervalli.

## Limits

Nessuna prova conversazionale con modello reale, Meta o OpenRouter: queste verifiche non sono necessarie per lo schema e non sono attestate dai sostituti locali. Il collegamento configurato tra mittente e insegnante e i relativi scenari restano in US-011; i comportamenti conversazionali di indicazioni e consultazioni restano agli item dedicati. Nessun deploy, modifica allo stack operativo, merge o push di `main` è stato eseguito.
