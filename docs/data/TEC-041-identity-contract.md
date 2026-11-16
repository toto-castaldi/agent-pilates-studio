# TEC-041 — Contratto additivo dell'identità

Questo contratto concretizza ADR-003 per il solo database. Non attiva il modello target: gateway e broker continuano a usare la baseline fino a TEC-042, dopo US-017. Nessuna importazione di allowlist, mapping o nomi WhatsApp.

## Storage and compatibility

L'unica riga dell'insegnante resta quella esistente, con lo stesso OID della tabella, ID, sequenza, chiavi esterne e snapshot. La migrazione sposta la tabella in `studio_private.teachers` e la estende con `phone`, `access_enabled`, `legacy_identity` e `identity_revision`. Non nasce una seconda anagrafica. `app.teachers` diventa una proiezione di compatibilità con le sei colonne precedenti; SELECT, anche `*` e conversioni della riga, non includono i nuovi campi. Un trigger di inserimento conserva il percorso della baseline e l'attribuzione autenticata. Le modifiche dirette e le cancellazioni restano vietate. I telefoni degli autori originari restano conservati nella tabella; la proiezione non mostra il telefono dell'autore delle persone create dalle nuove funzioni gestionali.

Il contratto SQL pubblico conserva SELECT e INSERT semplici, anche in CTE con RETURNING, verificati con il runtime precedente. Essendo una vista non offre TRUNCATE, DDL, indici propri o INSERT con ON CONFLICT: il modello deve risolvere prima il nome come già previsto dal contesto dello studio; un conflitto concorrente viene rifiutato dal vincolo della tabella privata. Non è promessa la compatibilità con ogni forma di SQL amministrativo della vecchia tabella.

I record precedenti e quelli creati dal runtime precedente durante la fase additiva hanno `legacy_identity = true`, telefono assente e accesso nuovo disabilitato. Il nuovo censimento protetto crea invece una riga completa con `legacy_identity = false`. Completare una riga precedente non cambia la sua origine. `identity_revision` aumenta a ogni modifica gestionale effettiva, per invalidare i contesti di identità precedenti. Regole, presenze, indicazioni e snapshot degli autori non sono riscritti.

## Canonical input

`normalizeInternationalPhone` (politica pura TypeScript) e `studio_private.normalize_identity_phone(text)` (vincolo autorevole SQL) richiedono `+` o `00` internazionale. Accettano spazi ASCII, spazio non separabile, spazio non separabile stretto, parentesi, punto e trattino; producono `+` seguito da 8–15 cifre, la prima non zero. Non assumono un paese e non attestano assegnazione, raggiungibilità o preregistrazione Meta. Non accettano estensioni, lettere, caratteri di controllo o prefissi mancanti. Le funzioni fidate per il mittente ricevono invece le cifre internazionali del webhook autenticato, senza interpretare testo libero. Nome e cognome gestionali sono obbligatori, puliti e limitati a 200 caratteri; restano univoci senza distinzione di maiuscole.

## Trusted SQL entry points

Tutte le funzioni sotto sono `SECURITY DEFINER`, con `search_path = pg_catalog` e nomi qualificati. Solo `studio_broker` ha EXECUTE sugli ingressi; nessun ingresso è nel tool del modello. Le tabelle private e gli helper non hanno privilegi per agente o broker, salvo il contesto autore già riservato al broker dalla baseline.

- `studio_private.resolve_teacher_identity(sender text)` restituisce ID, nome, cognome, accesso e revisione dalla stessa riga, oppure nessuna riga. `sender` è il numero tecnico autenticato, non un parametro del modello.
- `studio_private.bind_teacher_identity(backend integer, transaction bigint, sender text)` risolve di nuovo l'identità completa e abilitata e installa il contesto autore per backend/transazione dell'agente, con scadenza di 60 secondi. Non accetta ID, nome, accesso o ruolo dichiarati. La funzione esistente `app.current_sender_teacher_id()` resta senza argomenti: il contesto nuovo è verificato contro la riga corrente a ogni operazione, con lock condiviso fino alla fine della transazione. Un contesto vecchio, revocato, scaduto o con numero sostituito fallisce; non basta impostare un GUC. I contesti della baseline continuano a funzionare durante la sola fase additiva.
- `studio_private.manage_teacher_identity(sender text, manager_phone text, operation text, teacher_id bigint, first_name text, last_name text, phone text)` salva una sola operazione atomica. `sender` e `manager_phone` sono prove fornite dal componente fidato: mittente verificato e unica configurazione privata, non argomenti disponibili al modello. Il database richiede che coincidano e ricontrolla l'identità del gestore al salvataggio; un flag booleano non conferisce privilegi. Nessuna copia persistente del numero gestore diventa una seconda fonte di autorizzazione.
- `studio_private.list_teacher_identities(sender text, manager_phone text)` restituisce al solo gestore completo e abilitato ID, nome, cognome, telefono, accesso, origine e revisione. Non restituisce il tracciamento privato al modello.

Il gestore è bloccato con `FOR UPDATE` fino alla fine della transazione gestionale: più salvataggi vengono serializzati e l'abilitazione è ricontrollata dopo un'eventuale attesa. US-017 può leggere i dati correnti con `list_teacher_identities` e confrontarli con quelli confermati nella stessa transazione prima di chiamare la mutazione; scadenza e conferma del flusso restano responsabilità del percorso deterministico, non argomenti del modello.

Le operazioni sono `bootstrap`, `enroll`, `complete`, `correct`, `change_phone`, `revoke`, `enable`. `bootstrap` richiede nome, cognome e il solo numero del gestore; può completare un ID preesistente senza telefono con gli stessi nomi, oppure creare la propria riga. Non riabilita un gestore già censito ma revocato. `enroll` richiede tutti e tre i dati e nessun ID. `complete` richiede ID precedente incompleto e telefono; `correct` ID e entrambi i nomi; `change_phone` ID già completo e telefono; `revoke`/`enable` soltanto ID. Campi estranei, operazioni vuote e transizioni già applicate sono rifiutati. Revoca di sé e cambio numero del gestore sono sempre rifiutati. Le correzioni conservano ID e autore originario; correggere il proprio nome attribuisce la modifica all'identità valida prima della correzione.

L'audit append-only `studio_private.teacher_identity_changes` registra operazione, istante del database, ID e snapshot dell'autore, valori gestionali prima/dopo. La guardia `studio_private.teacher_identity_writes` è privata e vincolata a backend/transazione; viene rimossa prima del ritorno e un controllo differito vieta di commetterla. Un errore annulla anche guardia e audit. I privilegi di migrazione restano fidati per il DDL: non si promette protezione da chi può disabilitare i trigger o modificare le funzioni.

## Guided extension — US-017

La migrazione successiva aggiunge `preview_manager_bootstrap(sender text, manager_phone text, first_name text, last_name text)`, SECURITY DEFINER a search_path fisso, riservata al broker: il solo gestore non ancora censito ottiene ID/revisione della persona legacy incompleta corrispondente ai nomi raccolti. Non concede elenco o lettura di telefoni prima del bootstrap. La mutazione resta `manage_teacher_identity` e richiede la conferma del riepilogo nel flusso.

`management_sessions` contiene solo lo stato privato del percorso (chiave: impronta del mittente), non una seconda identità o fonte di autorizzazione. Il broker ha SELECT/INSERT/UPDATE/DELETE su questa tabella, non sulla tabella delle persone o sull'audit. Il modello non vi accede. Lo stato entra nei backup privati; il nonce di istanza invalida le conferme dopo riavvio/ripristino, mantenendo l'intercettazione fino a nuovo ingresso o annullamento.

Il nuovo campo privato `author_context.management_only_enrollment`, default falso, è impostato dal broker quando la gestione è configurata. Il trigger di inserimento legacy rifiuta allora nuovi insegnanti via SQL. Il modello non può impostarlo, annullarlo tramite GUC o aggirarlo con una citazione libera. Il percorso senza configurazione gestionale conserva la compatibilità precedente; non si anticipano la fonte dell'accesso ordinario, la risoluzione del nome, di «io» o dell'autore. Rimozione definitiva dell'inserimento legacy e attivazione dei consumatori restano a TEC-042. Nessuno stack operativo è aggiornato. [Protocollo e verifiche](../operations/US-017-gestione.md).

## Coordinated activation — TEC-042

La migrazione `20261117000000_unified_sender_identity` completa il contratto insieme al cambio di gateway e broker ([ADR-003](../adr/ADR-003-unified-teacher-identity.md)):

- `app.clients`, `training_rules`, `attendance`, `teacher_rules` e `teacher_assignments` diventano viste aggiornabili senza le colonne `*_by_phone`, sopra le stesse righe spostate in `studio_private`; `app.teachers` perde il numero dell'autore e diventa di sola lettura per l'agente. I privilegi dell'agente sono quelli precedenti meno i numeri; dati, OID, chiavi esterne e snapshot non cambiano.
- `insert_legacy_teacher`, `configured_teacher_id` e il default transitorio di `legacy_identity` sono rimossi: `apply_teacher_creation` accetta solo la guardia delle funzioni gestionali. `management_only_enrollment` non serve più ed è rimosso.
- `author_context` richiede insegnante, revisione e nome; i contesti senza revisione sono eliminati e `require_author_context()` ricontrolla sempre la riga corrente. Il broker perde l'INSERT diretto sul contesto.
- `bind_teacher_identity(backend, transaction, sender, expected_teacher, expected_revision)` sostituisce la versione a tre argomenti e rifiuta un'identità diversa da quella ammessa con il messaggio.
- `identity_phone_digits()`, riservata al broker, restituisce le cifre dei numeri dell'anagrafica, dell'audit e degli autori per la sola redazione delle copie verso il modello.
- `studio_private.chat_owners` registra il proprietario della conversazione Hermes di ogni chat (impronta del mittente), con SELECT/INSERT/UPDATE per il broker.

## Verification

Le prove usano soltanto dati sintetici. Unit test in memoria verificano le politiche pure; `test:db` prova PostgreSQL reale da vuoto e da schema precedente, normalizzazione, vincoli, unicità concorrente, privilegi ed estrazione SQL, falsificazione, bootstrap, gestione e contesti. `test:upgrade` confronta dati e snapshot prima/dopo la migrazione e verifica la compatibilità del runtime precedente. Le prove pertinenti di backup e autore confermano che lo spostamento della tabella non altera relazioni, storico e ripristino. Il gate rapido resta separato.
