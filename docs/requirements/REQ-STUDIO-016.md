# REQ-STUDIO-016 — Gestione guidata riservata al gestore

**State:** Active

Il solo mittente autenticato corrispondente al numero del gestore configurato può, tramite una procedura guidata nella chat WhatsApp, censire sé stesso e gli altri insegnanti, consultarne i dati di gestione, correggere nome e cognome, cambiare il numero degli altri, revocarne o riabilitarne l'accesso. Gli altri utilizzatori non possono fare queste operazioni, neppure indirettamente tramite SQL, richieste libere o la citazione di nuovi insegnanti. Il controllo è imposto dal sistema e dai privilegi del database, non soltanto dalle istruzioni al modello. Gli utilizzatori ordinari possono continuare a consultare i nomi necessari alle operazioni dello studio, ma non i telefoni.

La procedura raccoglie e valida i dati in passaggi dedicati, riepiloga e richiede conferma prima del salvataggio. Il gestore può annullarla senza scritture parziali; richieste incomplete, dati non validi, duplicati e conferme scadute non modificano l'anagrafica. I permessi sono verificati nuovamente al salvataggio. Le risposte in questi passaggi sono dati gestionali, non istruzioni libere per il modello.

I messaggi di gestione che contengono numeri sono elaborati prima di qualsiasi invio al modello; i numeri non entrano nemmeno nella cronologia, nei riassunti, nei titoli o in altre richieste che il modello riceverà in seguito. Eventuali riepiloghi con telefoni sono prodotti dal sistema solo per il gestore e non vengono reinseriti nel contesto del modello. Non si promette un anonimizzatore universale di dati arbitrari scritti fuori dal percorso guidato; restano protetti i numeri di identità e gestione secondo REQ-NFR-005.

Il gestore può correggere il proprio nome e cognome, ma non revocare sé stesso né cambiare il proprio numero dalla chat. Queste ultime operazioni richiedono una procedura dell'operatore che mantenga coerenti configurazione, anagrafica e accessi. Non si aggiunge un comando di censimento ordinario esterno all'agente.
