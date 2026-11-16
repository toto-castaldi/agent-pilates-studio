# Data model

Il database applicativo è PostgreSQL 17.10, fissato per digest in Compose; lo schema è gestito con Prisma 7.10.1 e migrazioni versionate. L'accesso diretto di Hermes usa un plugin nel formato Python richiesto dal suo runtime e il driver `asyncpg` già presente nell'immagine, senza un servizio MCP. Lo schema `app` appartiene al ruolo di migrazione; i metadati Prisma risiedono in `public`, senza accesso da parte dell'agente. I vincoli sono in `invariants`.

## Proiezioni senza numeri

Clienti, regole di allenamento, presenze, insegnanti, regole degli insegnanti e indicazioni hanno le righe fisiche nello schema privato (`studio_private.clients`, `training_rules`, `attendance`, `teachers`, `teacher_rules`, `teacher_assignments`), con gli stessi OID, ID, sequenze, chiavi esterne e snapshot degli autori, compresi i numeri e i nomi dei profili WhatsApp storici. Lo schema `app` le espone come viste con le stesse colonne meno quelle dei numeri degli autori (`*_by_phone`) e, per gli insegnanti, meno i campi dell'identità. Le viste semplici restano aggiornabili: INSERT, `RETURNING` e gli UPDATE delle colonne consentite raggiungono le righe private, dove i trigger impongono autore e storico; `SELECT *` e le conversioni della riga non includono mai i numeri. Le viste non espongono indici o vincoli propri per un conflict target SQL. `app.teachers` è in sola lettura per l'agente. `rule_slots`, `rule_clients` e `teacher_rule_intervals` non hanno autori e restano tabelle di `app`. Si preferiscono le viste ai soli privilegi di colonna, che farebbero fallire `SELECT *` e `RETURNING *` ([ADR-003](../adr/ADR-003-unified-teacher-identity.md)).

## Clienti e regole di allenamento

- `app.clients`: nome e cognome univoci senza distinzione tra maiuscole e minuscole, data e nome dell'autore di creazione.
- `app.training_rules`: testo pulito, inserimento e disattivazione con i nomi dei rispettivi autori e motivo.
- `app.rule_slots`: giorno ISO e ora; `app.rule_clients`: legame N:N fra regole e clienti.

## Presenze e assenze

`app.attendance`: cliente, data e ora locale della lezione al minuto, esito `present`, `excused_absence` o `unexcused_absence`, istante e autore di inserimento, istante, autore e motivo di annullamento. Un indice univoco parziale su cliente, data e ora riguarda solo le righe non annullate. Le assenze anticipate sono le assenze giustificate con `created_at` precedente all'inizio della lezione e restano annullabili senza riscrittura.

Il cliente atteso si ricava dai legami e dagli slot delle regole inserite prima dell'inizio della lezione e non ancora disattivate a quell'istante; non è materializzato.

## Insegnanti, regole e indicazioni

- `studio_private.teachers`: identità degli insegnanti, con nome e cognome univoci senza distinzione di maiuscole, data e autore di creazione, `phone` canonico univoco (non chiave delle relazioni), `access_enabled`, `legacy_identity` (default falso) e `identity_revision`.
- `app.teachers`: proiezione in sola lettura con ID, nomi, data e nome dell'autore di creazione; telefoni, numeri degli autori e audit non fanno parte del tipo di riga accessibile al modello. Nuove persone si creano solo con le funzioni gestionali.
- `app.teacher_rules`: insegnante, testo pulito, inserimento e disattivazione con autori e motivo.
- `app.teacher_rule_intervals`: regola, giorno ISO, minimo e massimo inclusivi degli orari d'inizio al minuto, proiezione tecnica `is_active` dello stato corrente.
- `app.teacher_assignments`: indicazioni dell'insegnante per data e ora locale della lezione al minuto, con registrazione e annullamento, autori e motivo. Un indice univoco parziale sulle righe non annullate garantisce al più un'indicazione valida per lezione, senza limiti di data.
- `studio_private.teacher_rule_builds`: finestra di costruzione privata di una regola e dei suoi intervalli, vincolata a backend e transazione e svuotata dal controllo differito prima del commit; non è uno storico. Motivazioni in [ADR-001](../adr/ADR-001-teacher-rule-integrity.md).

Le lezioni esistenti e i loro insegnanti non sono materializzati: una SELECT unisce e deduplica le lezioni con clienti attesi, presenze o assenze valide o indicazioni valide. L'insegnante atteso viene dalle regole inserite prima dell'inizio della lezione e non disattivate entro quell'istante, con intervallo nel giorno ISO che ne comprende l'orario d'inizio; per il passato si usano le date della regola, non `is_active`. Un'indicazione valida prevale sull'atteso; senza entrambi la lezione è senza insegnante. Le regole degli insegnanti non creano lezioni.

## Identità e gestione

Funzioni private, con EXECUTE per il solo broker e nessun DML diretto su persone, audit o guardia ([contratto SQL](../data/TEC-041-identity-contract.md)):

- `studio_private.resolve_teacher_identity(text)`: ID, nomi, accesso e revisione della riga riconosciuta tramite le cifre internazionali del mittente autenticato;
- `bind_teacher_identity(integer,bigint,text,bigint,bigint)`: installa il contesto dell'identità per backend e transazione, solo se la persona del numero è ancora quella ammessa (ID) alla stessa revisione e abilitata;
- `identity_phone_digits()`: cifre di tutti i numeri dell'anagrafica, dell'audit e degli autori, usate dal gateway fidato solo per oscurarle nelle copie inviate al modello;
- `manage_teacher_identity(text,text,text,bigint,text,text,text)`: salva atomicamente bootstrap, nuovo censimento, completamento, correzione, cambio numero, revoca e riabilitazione;
- `list_teacher_identities(text,text)`: dati di gestione per il solo gestore abilitato;
- una preview ristretta del bootstrap, che restituisce solo ID e revisione corrispondenti ai nomi già raccolti, senza elenco o telefoni.

`app.current_sender_teacher_id()`, senza argomenti e senza telefono, restituisce l'insegnante del contesto autenticato o NULL se non risolto; senza contesto valido fallisce.

- `studio_private.teacher_identity_changes`: audit append-only con data di sistema, autore e dati prima/dopo, senza cambiare la creazione originale.
- `studio_private.teacher_identity_writes`: guardia privata di backend e transazione, svuotata prima del ritorno; un controllo differito impedisce di commetterla.
- `studio_private.management_sessions`: stato del percorso guidato, indicizzato dall'impronta del mittente; non è un'altra anagrafica.
- `studio_private.chat_owners`: insegnante proprietario della conversazione Hermes di ogni chat, indicizzato dall'impronta del mittente; serve solo ad azzerare una chat che cambia persona (`identity`) e non è una fonte di identità o di accesso.
- `studio_private.session_owners`: insegnante proprietario di una sessione Hermes, indicizzato dall'ID della sessione; il legame è immutabile e consente elenco e recupero solo alla stessa persona (`identity`).

Solo le funzioni gestionali creano persone, sempre complete; non esiste un inserimento di compatibilità che possa crearle incomplete. Restano incomplete (`legacy_identity = true`, telefono NULL, accesso falso) soltanto le righe preesistenti, finché il gestore non le completa. Nessuna importazione di allowlist, mapping o nomi WhatsApp e nessuna riscrittura di autori o di altre entità.

## Funzioni di lettura delle lezioni

`app.existing_lessons(first_day date, last_day date)` ricostruisce date e inizi delle lezioni da regole dei clienti valide all'inizio, registrazioni valide e indicazioni valide. `app.expected_clients` restituisce i clienti attesi deduplicati per lezione; `app.lesson_teachers` aggiunge ID atteso, ID indicato, ID effettivo e nomi. Il tool SQL trasmette stringhe come `text`: le istruzioni impongono i cast `$1::text::date` e `$2::text::date` nelle chiamate, senza affidarsi alla risoluzione implicita di PostgreSQL. I due limiti sono inclusivi; gli orari inesistenti sono esclusi e l'ora ripetuta conta una volta. Le regole degli insegnanti non creano lezioni e per il passato valgono gli istanti storici, non `is_active`.

Sono funzioni SQL `STABLE`, con diritti dell'invocante e nomi qualificati, senza clausole `SET`; non scrivono, non restituiscono telefoni e non accedono allo schema privato. `EXECUTE` è revocato a PUBLIC e concesso al ruolo agente. Filtri, join e aggregazioni restano possibili in una sola istruzione. Conferme, chiarimenti e modalità dei resoconti restano nelle fonti di istruzioni, non nel codice SQL ([ADR-004](../adr/ADR-004-read-only-skills-computed-data.md)).

## Dati privati del broker

- `studio_private.author_context`: contesto autore per PID e ID di transazione con insegnante e revisione obbligatori (`webhook-trust`), scritto solo da `bind_teacher_identity`, inaccessibile all'agente ed escluso dai backup.
- `studio_private.consumed_messages`: impronte temporanee degli ID già usati, per impedire replay anche dopo un riavvio; conservate nei backup.

Identità, audit e stato gestionale entrano nei backup privati; la guardia è sempre vuota al commit.

## Archivio di Hermes

Hermes usa SQLite per le proprie sessioni, conversazioni, riassunti e cronologia compattata. L'archivio è distinto da PostgreSQL, contiene dati sensibili e persiste nel volume Hermes, incluso nel backup quiescente (`continuity`).
