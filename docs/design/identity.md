# Sender identity and teacher registry

Il modello di identità unica è deciso in [ADR-003](../adr/ADR-003-unified-teacher-identity.md). La base dati e il percorso guidato sono già presenti; l'attivazione coordinata dei consumatori è una decisione aperta (`README`). Finché non avviene restano in esercizio le fonti del runtime precedente descritte sotto.

## Runtime attuale

- L'accesso deriva dall'allowlist `WHATSAPP_ALLOWED_USERS` verificata dal gateway e dal broker.
- Il broker risolve l'insegnante del mittente dal collegamento privato `WHATSAPP_TEACHER_LINKS` (numero autorizzato, nome e cognome) e dall'anagrafica, senza distinzione di maiuscole, tramite una funzione riservata; lo installa nel contesto autore effimero come `sender_teacher_id`, senza tabella persistente di collegamenti. Il modello consulta l'insegnante tramite `app.current_sender_teacher_id()`, non tramite il numero; se non esiste corrispondenza chiede il nome ([ADR-002](../adr/ADR-002-sender-teacher-identity.md), sostituita da ADR-003).
- Il nome dell'autore proviene dal payload firmato; il contesto nativo di sessione di Hermes include il nome visualizzato WhatsApp, quando disponibile, come etichetta non fidata.
- La distinzione tra richieste riferite a «io» e ad altre persone è un'interpretazione del modello; il modello non può fornire argomenti a `app.current_sender_teacher_id()` né alterare il contesto.

## Modello di identità unica

- Il gateway risolve il numero autenticato nel database prima di aprire il turno del modello; un numero non censito, incompleto o revocato riceve solo il rifiuto fisso, senza informazioni sul gestore e senza chiamate al modello. Il broker applica indipendentemente la stessa fonte per l'autore e il mittente.
- Il nome inviato al modello è quello censito, mai quello del profilo WhatsApp, anche nelle sessioni esistenti; il metadato del profilo non è una fonte o un fallback e non è reintrodotto dalla cronologia o dalla compattazione. Il contesto per «io» non accetta parametri dichiarati dal modello.
- Dal numero sostituito non si avviano nuove operazioni; il nuovo numero e un numero assegnato a una persona diversa iniziano una chat vuota, senza cancellare i dati dello studio.
- L'unico numero personale in configurazione è `PILATES_MANAGER_PHONE`, da cui deriva il canale home; allowlist, collegamenti in configurazione e numero home separato non sono fonti né fallback (`configuration`).

## Gestione guidata

Il percorso è deterministico e precede il modello ([guida](../operations/US-017-gestione.md)):

- `/anagrafica` apre il flusso, `/annulla` esce e `/conferma <codice>` salva un solo riepilogo entro 10 minuti dall'ingresso. Il gestore incompleto riceve obbligatoriamente il bootstrap.
- La politica pura TypeScript (`src/identity-flow.ts`) è eseguita da Node.js nel broker Python, senza un nuovo servizio. Il gateway interroga `/v1/management` prima dell'adattatore Hermes, di SQLite e di ogni richiesta al modello; il broker verifica indipendentemente HMAC, account, mittente e timestamp, usa le funzioni private dell'identità (`data-model`) e risponde soltanto al mittente autenticato.
- Lock transazionale, impronte anti-replay persistenti, codice casuale e revisioni vincolano conferma, dati e mittente. Al salvataggio si ricontrollano gestore e revisione del destinatario; gli errori chiudono il flusso senza mutazioni o audit parziali. Le conferme scadono al riavvio: il flusso resta intercettato fino a nuovo ingresso o annullamento, senza riversare risposte tardive al modello.
- Nell'assetto gestionale configurato il broker marca i contesti ordinari `management_only_enrollment`: il trigger fidato vieta l'inserimento di insegnanti incompleti da SQL anche se il modello lo tenta. Il flag non cambia la fonte di accesso, nome, «io» o autore e il modello non può leggerlo o impostarlo. Senza configurazione gestionale la compatibilità resta invariata.
- Il percorso è attivo solo nell'override sintetico delle prove, con `PILATES_MANAGER_PHONE` uguale in gateway e broker; Compose e avvii operativi non lo attivano prima della transizione. La gestione delle lezioni resta conversazionale.

## Transizione

Il passaggio è coordinato: gateway e broker cambiano insieme fonte dell'identità e si applicano insieme le restrizioni definitive su censimenti e lettura dei numeri, compresi gli autori storici. Non si attiva un gateway con una fonte e un broker con un'altra e non si mantiene una sincronizzazione permanente con i vecchi file. La transizione preserva ID, snapshot e dati. Distingue il trasferimento della funzione gestionale a un'altra persona (il vecchio numero perde i soli privilegi gestionali) dal cambio del numero della stessa persona (l'identità interna resta e il numero sostituito perde l'accesso); il flusso ordinario in chat non può eseguire nessuna delle due operazioni.
