# Invariants and consistency

## Privilegi

- L'agente può eseguire DML, non DDL; il vincolo è applicato e verificato sul database reale, non solo nelle istruzioni all'agente.
- I ruoli PostgreSQL sono distinti per amministrazione, migrazione, broker e agente; credenziali e privilegi delle migrazioni non sono disponibili all'agente e solo quest'ultimo riceve DML nello schema applicativo. Il ruolo agente non possiede schemi né può creare tabelle temporanee; `pg_hba.conf` limita il suo accesso al database applicativo.
- PostgreSQL consente al ruolo di login di cambiare la propria password anche senza `CREATEROLE`: è un'eccezione standard accettata, che non consente DDL. Il bootstrap eseguito dall'operatore ripristina la password a partire dal file esterno.
- Il login `studio_broker` non ha DML sulle tabelle applicative né DDL; esegue gli ingressi privati dell'identità, che registrano il contesto autore protetto, e gestisce soltanto lo stato privato del percorso guidato, i proprietari delle chat e le impronte anti-replay.
- Tutte le funzioni fidate usano `SECURITY DEFINER` con `search_path` fisso (`pg_catalog` per quelle dell'identità) e nomi qualificati; l'agente non ha USAGE sullo schema privato né EXECUTE sugli ingressi privati.

## Autore e storico

- L'autore di ogni scrittura viene dal contesto protetto registrato dal broker (`webhook-trust`): i trigger ne controllano scadenza, associazione e identità corrente e sovrascrivono autore e istante dichiarati con il numero autenticato, il nome censito e l'orologio del database. I numeri degli autori non sono leggibili dal ruolo dell'agente (`data-model`). Senza contesto valido l'operazione è rifiutata. Un GUC modificabile dall'agente non è fonte di fiducia e l'autore dei clienti non è modificabile.
- **Regole di allenamento:** l'agente non ha `DELETE` e può aggiornare solo i campi di disattivazione; trigger rifiutano `DELETE` e `TRUNCATE` anche al ruolo di migrazione e una seconda disattivazione. Un vincolo richiede data, numero e motivo coerenti.
- **Presenze e assenze:** inserimenti già annullati, annullamenti incompleti, seconda modifica e riscrittura sono rifiutati; `DELETE` e `TRUNCATE` sono rifiutati anche al migratore. L'agente può aggiornare solo i campi di annullamento.
- **Insegnanti, regole e indicazioni:** le regole si disattivano e le indicazioni si annullano una sola volta, con motivo non vuoto; solo questi campi di transizione sono aggiornabili dall'agente. DELETE e TRUNCATE sono rifiutati anche al migratore e i trigger proteggono dalla riscrittura tramite il normale DML del migratore. Soltanto le funzioni gestionali protette del gestore correggono nome, cognome, telefono e accesso di un insegnante, senza cambiare ID e autore originario.

## Date e orari

- Date e ore delle lezioni sono convertite con `AT TIME ZONE 'Europe/Rome'` e confrontate con `clock_timestamp()` del database, che deve essere sincronizzato.
- Per lezioni non ancora iniziate è ammessa solo `excused_absence`, senza limite di anticipo; presenze e assenze non giustificate future sono rifiutate.
- Gli orari locali inesistenti al cambio primaverile sono rifiutati; nell'ora ripetuta autunnale vale il secondo istante, in ora solare, e una registrazione è ammessa solo quando anche quell'istante è iniziato.
- Le indicazioni ammettono lezioni passate e future, ma rifiutano date non finite, orari con secondi o 24:00 e orari locali inesistenti.

## Intervalli delle regole degli insegnanti

Gli intervalli hanno giorno ISO 1–7, estremi inclusivi al minuto e minimo non superiore al massimo. Un vincolo di esclusione GiST su un `int4range` di minuti dall'inizio della settimana, limitato alle righe `is_active`, impedisce sovrapposizioni anche concorrenti, tra qualsiasi insegnante e anche all'interno di una regola, senza estensioni PostgreSQL. Il database imposta il flag all'inserimento e lo porta a falso solo alla disattivazione della regola. Gli intervalli non si riscrivono né si aggiungono dopo il commit della regola: un controllo differito richiede almeno un intervallo e chiude la finestra di costruzione privata. Regola e intervalli si inseriscono con una sola istruzione CTE ([ADR-001](../adr/ADR-001-teacher-rule-integrity.md)).

## Identità

- Nel modello di identità unica una sola risoluzione fidata determina accesso, nome, «io» e autore ([ADR-003](../adr/ADR-003-unified-teacher-identity.md)). Quando il contesto contiene `identity_revision`, `require_author_context()` ricontrolla ID, telefono, abilitazione e revisione della riga corrente e ricava il nome censito, ignorando profili dichiarati; il lock condiviso della persona dura fino al commit o rollback, così una revoca confermata non può essere seguita da un'operazione con un contesto precedente. Ogni modifica gestionale incrementa la revisione; riabilitare non rende validi i contesti precedenti.
- Ogni contesto ha insegnante e revisione obbligatori: i contesti del runtime precedente non esistono più e il broker non può inserirli direttamente.
- L'accesso ordinario dipende dall'identità completa e abilitata nel database; il solo gestore configurato ha l'eccezione per il proprio censimento iniziale. Le richieste webhook non autentiche sono sempre rifiutate.
- Solo il gestore mantiene l'anagrafica, compreso il completamento delle righe preesistenti; gli utilizzatori ordinari non possono creare insegnanti indirettamente da regole o indicazioni. Nome e numero del gestore non sono privilegi dichiarabili dal modello. Il censimento iniziale consente solo di completare l'identità del numero gestore, non DML anonimo sullo studio. Revoca di sé e cambio del numero gestore via chat sono vietati.
- Il percorso guidato applica validazione, conferma, annullamento e una nuova verifica dei permessi al salvataggio; i dati di una modifica si salvano atomicamente. Telefono malformato, paese mancante, duplicato, identità inesistente, conferma scaduta o accesso non più valido non producono modifiche parziali. La revoca conserva l'insegnante e non modifica le regole delle lezioni.

## Persistenza

Aggiornamenti e riavvii preservano i dati; backup e ripristino sono verificati (`continuity`). Più chiamate del tool SQL sono transazioni distinte: una sostituzione o una correzione composta non è atomica e il modello deve segnalare eventuali operazioni parziali (`agent-context`).
