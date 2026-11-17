# Sender identity and teacher registry

Il modello di identità unica è deciso in [ADR-003](../adr/ADR-003-unified-teacher-identity.md): gateway e broker usano insieme la fonte nel database. L'aggiornamento non importa allowlist, mapping o nomi WhatsApp. Il completamento delle anagrafiche preesistenti e il recupero del gestore sono procedure operative, non comandi del modello.

## Ammissione

- Ogni corpo webhook raggiunge il broker (`/v1/admission`) prima dell'adattatore Hermes, degli slash command, di SQLite e di ogni richiesta al modello. Il broker verifica HMAC, Phone Number ID, messaggio diretto, ID e timestamp firmato (`webhook-trust`) e risolve ogni mittente con `studio_private.resolve_teacher_identity`.
- Il solo numero `PILATES_MANAGER_PHONE` entra prima nel percorso gestionale: se non è ancora censito riceve obbligatoriamente il censimento iniziale, senza modello né DML sullo studio; se è censito e abilitato i suoi messaggi non gestionali proseguono come quelli degli altri.
- Un'identità completa e abilitata è ammessa: il broker crea una ricevuta in memoria con ID e revisione della persona, sostituisce nel payload il nome del profilo WhatsApp con nome e cognome censiti e restituisce il corpo filtrato, che il gateway firma di nuovo per l'adattatore. I comandi gestionali di un utilizzatore ordinario ricevono il rifiuto fisso della gestione guidata.
- Un numero non censito, incompleto o revocato riceve una sola volta per messaggio (impronta anti-replay) il testo fisso «Accesso non abilitato. Per usare l'assistente dello studio rivolgiti al gestore.», senza informazioni sul gestore, sessione, turno del modello o accesso ai dati. Messaggi non validi, di gruppo o di un altro account sono scartati. Un errore del broker restituisce un errore HTTP senza inoltro.
- Nel gateway la stessa ammissione è l'unica autorizzazione per WhatsApp: la policy dell'adattatore (`allowlist`) e l'autorizzazione di Hermes leggono soltanto i mittenti ammessi dal broker e non ancora scaduti; non esistono allowlist, pairing o allow-all in configurazione. Eventi interni o di gruppo sul canale WhatsApp non avviano turni.
- La consegna delle risposte fisse e gestionali è best effort: la decisione del broker è già salvata e un nuovo invio dello stesso webhook non riceve una seconda risposta.

## Turno, nome, «io» e autore

- Prima della sessione e del turno il gateway chiede al broker (`/v1/turn`) se l'identità della ricevuta è ancora la stessa persona abilitata con la stessa revisione; altrimenti risponde con il rifiuto fisso senza chiamare il modello.
- Il nome inviato al modello è quello censito, nel contesto nativo della sessione; il profilo WhatsApp non arriva a Hermes. Nessun fallback usa il numero o il profilo.
- Per ogni operazione SQL il plugin chiede al broker di legare la transazione (`/v1/context`): il broker consuma l'impronta del messaggio e chiama `bind_teacher_identity` con ID e revisione della ricevuta. Il database rifiuta un numero revocato, cambiato, riassegnato a un'altra persona o con revisione superata; `require_author_context()` ricontrolla la riga a ogni scrittura con lock condiviso fino al commit. Autore, nome dell'autore e `app.current_sender_teacher_id()` derivano da quella riga.
- Ogni modifica gestionale (correzione, cambio numero, revoca, riabilitazione) incrementa la revisione: messaggi, ricevute o turni in corso con la revisione precedente non possono più scrivere né avviare un nuovo turno; un nuovo messaggio viene ammesso di nuovo con i dati correnti.

## Chat per identità

- `studio_private.chat_owners` registra, per impronta del mittente, l'insegnante proprietario della conversazione Hermes di quella chat. Non è una fonte di identità o di accesso.
- Al primo turno di una chat senza proprietario, cioè precedente al passaggio, o il cui proprietario è un'altra persona, il gateway azzera la sessione Hermes con il reset nativo prima di elaborare il messaggio e solo dopo registra il nuovo proprietario. La cronologia precedente, con nomi di profilo e testi, non è più usata come contesto attivo del modello o dei riassunti; resta nel volume e nei backup e non è dichiarata anonima.
- Ogni sessione Hermes usata da un turno ordinario è legata una sola volta all'insegnante in `studio_private.session_owners`. Prima del modello il broker ricontrolla la ricevuta e registra o verifica il proprietario della sessione; un legame esistente non si riassegna. Il recupero e l'elenco delle sessioni richiedono sia il controllo nativo della chat sia lo stesso proprietario corrente nel broker; una sessione senza legame, inclusa una precedente al passaggio, non è recuperabile da WhatsApp. Non si disabilitano i comandi: restano disponibili per le sessioni della stessa identità.
- Un cambio di numero apre la chat del nuovo numero, vuota; un numero assegnato a un'altra persona non eredita la conversazione, neppure tramite i comandi di recupero. Correzione del nome e riabilitazione conservano la chat. I dati dello studio non cambiano.
- I messaggi che arrivano mentre un turno è in corso seguono il percorso busy di Hermes: sono ammessi dal broker alla ricezione; una revoca confermata nel frattempo blocca le operazioni sui dati, ma non interrompe il turno già avviato.

## Gestione guidata

Il percorso è deterministico e precede il modello ([guida](../operations/US-017-gestione.md)):

- `/anagrafica` apre il flusso, `/annulla` esce e `/conferma <codice>` salva un solo riepilogo entro 10 minuti dall'ingresso. Il gestore incompleto riceve obbligatoriamente il bootstrap.
- La politica pura TypeScript (`src/identity-flow.ts`) è eseguita da Node.js nel broker Python, senza un nuovo servizio; il broker usa le funzioni private dell'identità (`data-model`) e risponde soltanto al mittente autenticato.
- Lock transazionale, impronte anti-replay persistenti, codice casuale e revisioni vincolano conferma, dati e mittente. Al salvataggio si ricontrollano gestore e revisione del destinatario; gli errori chiudono il flusso senza mutazioni o audit parziali.
- Il modello non può creare insegnanti: `app.teachers` è in sola lettura e la creazione richiede la guardia delle funzioni gestionali. Citare un insegnante sconosciuto produce solo la richiesta di censimento del gestore.

## Configurazione

L'unico numero personale configurato è `PILATES_MANAGER_PHONE` (`configuration`), uguale in gateway e broker perché letto dallo stesso file privato; il canale home ne deriva. Allowlist, collegamenti numero–insegnante e canale home separato non esistono: `start:local` e `prod.sh` rifiutano le vecchie chiavi o i vecchi file. Censire un destinatario non supera i limiti esterni di Meta.

Il trasferimento della funzione gestionale a un'altra persona già censita e abilitata, e il cambio del numero della stessa persona, non sono possibili dal flusso in chat. L'operatore li esegue a scrittori fermi, allineando il file del numero gestore e, nel secondo caso, il telefono della stessa identità; poi ricrea insieme gateway e broker. Il recupero annulla solo l'ultimo cambiamento, solo se l'identità precedente ha ancora quel numero, e riallinea la configurazione. Un errore di scrittura non consuma un cambiamento più vecchio. Dettaglio in [produzione](../operations/TEC-035-produzione.md).
