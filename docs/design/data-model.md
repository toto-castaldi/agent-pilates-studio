# Data model

Il database applicativo è PostgreSQL 17.10, fissato per digest in Compose; lo schema è gestito con Prisma 7.10.1 e migrazioni versionate. L'accesso diretto di Hermes usa un plugin nel formato Python richiesto dal suo runtime e il driver `asyncpg` già presente nell'immagine, senza un servizio MCP. Lo schema `app` appartiene al ruolo di migrazione; i metadati Prisma risiedono in `public`, senza accesso da parte dell'agente. I vincoli sono in `invariants`.

## Clienti e regole di allenamento

- `app.clients`: nome e cognome univoci senza distinzione tra maiuscole e minuscole, data e autore di creazione.
- `app.training_rules`: testo pulito, inserimento e disattivazione con i rispettivi autori e motivo.
- `app.rule_slots`: giorno ISO e ora; `app.rule_clients`: legame N:N fra regole e clienti.

## Presenze e assenze

`app.attendance`: cliente, data e ora locale della lezione al minuto, esito `present`, `excused_absence` o `unexcused_absence`, istante e autore di inserimento, istante, autore e motivo di annullamento. Un indice univoco parziale su cliente, data e ora riguarda solo le righe non annullate. Le assenze anticipate sono le assenze giustificate con `created_at` precedente all'inizio della lezione e restano annullabili senza riscrittura.

Il cliente atteso si ricava dai legami e dagli slot delle regole inserite prima dell'inizio della lezione e non ancora disattivate a quell'istante; non è materializzato.

## Insegnanti, regole e indicazioni

- `studio_private.teachers`: identità degli insegnanti, con nome e cognome univoci senza distinzione di maiuscole, data e autore di creazione, `phone` canonico univoco (non chiave delle relazioni), `access_enabled`, `legacy_identity` e `identity_revision`.
- `app.teachers`: vista di compatibilità con le sole sei colonne pubbliche (ID, nomi, creazione e autore). Preserva SELECT, anche `*` e conversioni della riga, e INSERT con parametri e RETURNING tramite trigger fidato; telefono corrente e audit non fanno parte del tipo di riga accessibile al modello. L'autore telefonico di una persona creata dalla gestione guidata è mascherato nella vista e conservato nella tabella.
- `app.teacher_rules`: insegnante, testo pulito, inserimento e disattivazione con autori e motivo.
- `app.teacher_rule_intervals`: regola, giorno ISO, minimo e massimo inclusivi degli orari d'inizio al minuto, proiezione tecnica `is_active` dello stato corrente.
- `app.teacher_assignments`: indicazioni dell'insegnante per data e ora locale della lezione al minuto, con registrazione e annullamento, autori e motivo. Un indice univoco parziale sulle righe non annullate garantisce al più un'indicazione valida per lezione, senza limiti di data.
- `studio_private.teacher_rule_builds`: finestra di costruzione privata di una regola e dei suoi intervalli, vincolata a backend e transazione e svuotata dal controllo differito prima del commit; non è uno storico. Motivazioni in [ADR-001](../adr/ADR-001-teacher-rule-integrity.md).

Le lezioni esistenti e i loro insegnanti non sono materializzati: una SELECT unisce e deduplica le lezioni con clienti attesi, presenze o assenze valide o indicazioni valide. L'insegnante atteso viene dalle regole inserite prima dell'inizio della lezione e non disattivate entro quell'istante, con intervallo nel giorno ISO che ne comprende l'orario d'inizio; per il passato si usano le date della regola, non `is_active`. Un'indicazione valida prevale sull'atteso; senza entrambi la lezione è senza insegnante. Le regole degli insegnanti non creano lezioni.

## Identità e gestione

Funzioni private, con EXECUTE per il solo broker e nessun DML diretto su persone, audit o guardia ([contratto SQL](../data/TEC-041-identity-contract.md)):

- `studio_private.resolve_teacher_identity(text)`: ID, nomi, accesso e revisione della riga riconosciuta tramite le cifre internazionali del mittente autenticato;
- `bind_teacher_identity(integer,bigint,text)`: installa il contesto dell'identità per backend e transazione;
- `manage_teacher_identity(text,text,text,bigint,text,text,text)`: salva atomicamente bootstrap, nuovo censimento, completamento, correzione, cambio numero, revoca e riabilitazione;
- `list_teacher_identities(text,text)`: dati di gestione per il solo gestore abilitato;
- una preview ristretta del bootstrap, che restituisce solo ID e revisione corrispondenti ai nomi già raccolti, senza elenco o telefoni.

`app.current_sender_teacher_id()`, senza argomenti e senza telefono, restituisce l'insegnante del contesto autenticato o NULL se non risolto; senza contesto valido fallisce.

- `studio_private.teacher_identity_changes`: audit append-only con data di sistema, autore e dati prima/dopo, senza cambiare la creazione originale.
- `studio_private.teacher_identity_writes`: guardia privata di backend e transazione, svuotata prima del ritorno; un controllo differito impedisce di commetterla.
- `studio_private.management_sessions`: stato del percorso guidato, indicizzato dall'impronta del mittente; non è un'altra anagrafica.

Le funzioni nuove creano solo persone complete. Finché la transizione all'identità unica non è attiva, il runtime precedente può ancora creare righe incomplete (`legacy_identity = true`, telefono NULL, accesso falso), salvo nell'assetto gestionale configurato (`identity`); alla transizione questo inserimento e il default transitorio sono rimossi e solo le righe preesistenti possono restare incomplete. Nessuna importazione di allowlist, mapping o nomi WhatsApp e nessuna riscrittura di autori o di altre entità.

## Dati privati del broker

- `studio_private.author_context`: contesto autore per PID e ID di transazione (`webhook-trust`), inaccessibile all'agente ed escluso dai backup.
- `studio_private.consumed_messages`: impronte temporanee degli ID già usati, per impedire replay anche dopo un riavvio; conservate nei backup.

Identità, audit e stato gestionale entrano nei backup privati; la guardia è sempre vuota al commit.

## Archivio di Hermes

Hermes usa SQLite per le proprie sessioni, conversazioni, riassunti e cronologia compattata. L'archivio è distinto da PostgreSQL, contiene dati sensibili e persiste nel volume Hermes, incluso nel backup quiescente (`continuity`).
