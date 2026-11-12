# TEC-041 — Prove della base dati dell'identità unica

**Data della verifica:** 2026-11-13 (`date +%F`).

## Scope

Verificata soltanto la base dati additiva di ADR-003: stessa anagrafica, telefono corrente canonico, accesso tecnico, risoluzione privata, gestione atomica e audit. Il gateway e il broker applicativi restano quelli della baseline; non viene attivato il modello target. Nessuna configurazione privata, dato reale o stack operativo dello studio è stato usato o modificato. Il clone è stato preparato con `npm ci`, senza copie dal clone principale.

Riferimenti: [contratto SQL](../data/TEC-041-identity-contract.md), [ADR-003](../adr/ADR-003-unified-teacher-identity.md), TECHNICAL-DESIGN §§3–5, 7–8. Il contratto distingue gli ingressi già disponibili nel database dal loro futuro utilizzo nel runtime e dalle restrizioni definitive di TEC-042.

## Environment

- Node.js 24.22.2, npm 11.19.1, dipendenze da lockfile; `npm ci` riuscito, audit senza vulnerabilità. npm ha segnalato gli script di installazione Prisma non ancora approvati dal proprio meccanismo `allowScripts`; le migrazioni reali e la costruzione dell'immagine migrator sono comunque riuscite, senza modificare lockfile o politica npm.
- Docker 29.9.3 e Compose 5.7.0; PostgreSQL 17.10 reale, non un database simulato.
- Upgrade isolato PostgreSQL 17.9 → 17.10 e Hermes 0.22.6 → 0.22.7 con i digest fissati dal progetto.
- Progetti, reti, volumi, credenziali e dati sintetici temporanei. Le suite rimuovono soltanto le proprie risorse; nessun servizio Meta/OpenRouter reale, tunnel o streaming remoto dei log.

## Acceptance evidence

| Criterio | Evidenza concreta |
| --- | --- |
| Migrazione additiva con ID, nomi, relazioni e snapshot preservati | `20261112000000_teacher_identity` sposta la stessa tabella nello schema privato e crea la proiezione pubblica a sei colonne. `test:upgrade` applica prima lo schema US-011 completo, con clienti, regole, presenze valide/annullate, indicazioni e mapping sintetico. Confronta gli snapshot completi prima/dopo e lo stesso OID dello storage; nessun telefono importato, nessun accesso nuovo abilitato automaticamente e audit iniziale vuoto. |
| Censimento completo, normalizzazione, unicità e ID stabile | `identity-checks.ts` confronta le politiche TypeScript/SQL sugli stessi casi sintetici, prova prefissi internazionali, separatori, limiti, dati mancanti e duplicati equivalenti. Due connessioni broker concorrenti attendono sui lock e il secondo inserimento fallisce sul vincolo univoco per telefono o nome senza distinzione di maiuscole. Completamento, correzione e cambio numero conservano l'ID. |
| Risoluzione e mittente non dichiarabili dal modello | Privilegi PostgreSQL verificati con login distinti: soltanto il broker esegue risoluzione e binding; tutte le entry point sono SECURITY DEFINER del migratore, con search_path fisso. Il modello riceve l'ID solo da `app.current_sender_teacher_id()` senza argomenti. Contesti mancanti, scaduti, di altro backend, con revisione/ID falsificati, numero cambiato o accesso revocato falliscono. Un profilo inventato nel contesto nuovo non sostituisce il nome della riga censita. |
| Gestione protetta, bootstrap e casi negativi | Provati bootstrap nuovo con rollback e completamento della stessa persona preesistente, inserimento completo, correzione anche di sé, cambio numero degli altri, revoca e riabilitazione. Mittente/configurazione discordanti, gestore non censito o revocato, bootstrap di un numero diverso, tentativi con GUC, session authorization, ruolo, DML e funzioni riservate sono rifiutati. Revoca di sé e cambio numero del gestore falliscono. Una configurazione sintetica alternativa in una transazione poi annullata prova che un gestore revocato non può aggirare il rifiuto con bootstrap. |
| Telefoni e gestione non estraibili dalle nuove fonti | Il ruolo agente non legge la tabella privata, audit o guardia e non chiama helper/ingressi gestionali. SELECT esplicito delle nuove colonne sulla proiezione fallisce; conversioni JSON, testuali e XML e statistiche non estraggono i campi di identità privati. Il numero dell'autore dei nuovi censimenti gestionali è NULL nella vista ma resta nello snapshot privato. Il contratto rende esplicita la lettura residua degli autori della baseline e la sua rimozione con TEC-042. |
| Audit, atomicità e conservazione dello studio | Ogni modifica riuscita ha autore e data di sistema, stato prima/dopo e revisione coerente con la riga corrente. Errori e duplicati non lasciano persona, audit o guardia parziali; il commit di una guardia dimenticata viene rifiutato dal trigger differito. UPDATE, DELETE e TRUNCATE dell'audit sono vietati anche al DML del migratore. Clienti, regole, slot, legami, presenze, regole degli insegnanti e indicazioni vengono confrontati dopo le operazioni gestionali; gli snapshot originali restano identici. |
| Concorrenza di revoca e operazioni | Il contesto nuovo prende un lock condiviso della persona per la transazione. Una revoca concorrente attende finché l'operazione precedente termina; dopo la conferma non autorizza un vecchio contesto. Correzione, cambio numero e successiva riabilitazione non rendono di nuovo valida una vecchia revisione. |
| Compatibilità e persistenza | `test:author` e `test:compaction` passano con il runtime precedente, webhook firmati e componenti reali. `test:hermes` migra da vuoto, prepara persone complete/incomplete, accessi abilitati/revocati, cambio numero e audit; confronta lo stato privato completo dopo riavvio, ricreazione e backup/ripristino quiescente. Dopo il ripristino verifica nuovamente gestione, risoluzione, funzione del mittente e privilegi. `test:start` e `test:images` verificano installazione isolata, migrazioni e immagini senza checkout; il backup a caldo continua a essere coerente e ripristinabile. |
| Documentazione e mancata attivazione | TECHNICAL-DESIGN, ADR-003, contratto SQL, README e descrizione dello schema in SOUL distinguono dati additivi e runtime ancora legacy. `test:local` confronta colonne pubbliche/private e il montaggio del contesto. Nessuna modifica a Compose, segreti, configurazione di avvio o codice dei consumatori gateway/broker. |

## Executed commands

Tutti con esito positivo nell'esecuzione conclusiva pertinente:

| Comando | Esito |
| --- | --- |
| `npm ci` | Dipendenze installate da lockfile; nessun segreto copiato. |
| `npm run lint` | Nessun errore. |
| `npm run typecheck` | Nessun errore. |
| `npm test` | 67 test unitari in memoria, nessun test saltato. |
| `npm run build` | Riuscito. |
| `npm run test:local` | 28 test, inclusa coerenza della descrizione SOUL. |
| `npm run test:db` | PostgreSQL reale, compresi i controlli di `identity-checks.ts`. |
| `npm run test:upgrade` | Upgrade reale da schema precedente con dati e immagini precedenti; snapshot e storage preservati. |
| `npm run test:hermes` | Migrazione da vuoto, baseline, log protetti, persistenza e backup/ripristino di identità/audit/privilegi. |
| `npm run test:author` | 2 test, turni autenticati e canale home/cron invariati. |
| `npm run test:compaction` | Contesti e compattazione invariati, attribuzione e privacy della baseline. |
| `npm run test:start` | Installazione nuova, riavvio, ricreazione dei volumi sintetici. |
| `npm run test:images` | 2 test, immagini autonome e backup a caldo isolato. |
| `python3 .agents/tools/backlog.py check` | Store valido. |
| `git diff --check` e `git diff --cached --check` | Nessun errore di whitespace. |

Il gate di chiusura resta quello rapido: lint, typecheck, test unitari e build. Le suite con processi, Git, filesystem, rete e Docker sono state eseguite separatamente. Le prove Pi non sono state rieseguite: harness, skill, impostazioni e pacchetti Pi non sono modificati; tutte le suite restano richieste in CI e alla chiusura della versione.

## Development failures and corrections

Due esecuzioni iniziali di `test:db` sono fallite, senza essere saltate o riclassificate come successi:

1. `42703`, il trigger comune tentava di risolvere `NEW.deactivated_at` anche per la tabella clienti. Ripristinata la selezione annidata per tipo di tabella, preservando la semantica originale.
2. `0A000`, l'UPDATE dell'autore sulla vista falliva come colonna calcolata prima del controllo di immutabilità atteso. Aggiunto il trigger INSTEAD OF UPDATE/DELETE che rifiuta esplicitamente le riscritture; il divieto sullo storage privato resta verificato separatamente.

Le esecuzioni successive sono passate, inclusi i casi negativi interessati e le regressioni del runtime. Nessun vincolo è stato disabilitato per ottenere il risultato.

## Limits and next deliveries

- Nessun nuovo controllo di accesso è attivato nel gateway: allowlist, mapping e nome WhatsApp restano la baseline fino a US-017 e TEC-042. La sola disponibilità delle funzioni non autorizza collegare un consumatore isolato al nuovo modello.
- La privacy dimostrata riguarda i nuovi campi di identità e il tracciamento privato. Le colonne degli autori della baseline sono ancora leggibili, anche quando un valore coincide con un telefono corrente: non installare i nuovi contesti nei turni reali del modello prima di rimuovere queste fonti con TEC-042. Snapshot e vecchie cronologie non sono dichiarati anonimi.
- La facciata pubblica conserva SELECT, conversioni della riga e INSERT/CTE/RETURNING usati dal percorso dello studio verificato. Una vista non offre TRUNCATE, DDL, indici propri o INSERT con ON CONFLICT. I conflitti concorrenti sono rifiutati dai vincoli dello storage; non si promette SQL amministrativo arbitrario compatibile con la vecchia tabella.
- La validazione internazionale è strutturale e non certifica assegnazione o raggiungibilità della linea né preregistrazione sul numero di test Meta. Non assume un paese per numeri senza prefisso.
- Il login broker e la configurazione privata da cui proviene il numero gestore sono confini fidati. La prova SQL non sostituisce l'autenticazione del webhook e il percorso guidato che saranno verificati in US-017. Il proprietario con privilegi DDL può modificare funzioni e trigger: non è un ruolo del modello.
- Nessuna prova con Meta/OpenRouter reali o dati reali, nessuna prova del nuovo flusso conversazionale o delle sessioni al riuso del numero. Quelle verifiche appartengono ai consumatori e alla transizione di TEC-042/TEC-043; non sono dichiarate già soddisfatte. TEC-008 e il rischio privacy residuo del proxy non cambiano.
