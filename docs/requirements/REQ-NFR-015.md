# REQ-NFR-015 — Template v1.5.0 e coordinamento del lavoro parallelo

**State:** Active

Il progetto deve aggiornare processo, skill e visualizzatore Pi del backlog al template `agile-project-template` v1.5.0, preservando le personalizzazioni e le protezioni dello studio e registrando risorse adottate e divergenze secondo REQ-NFR-013. Il visualizzatore deve permettere di filtrare gli item per tipo, priorità e stato e mostrare anche gli stati risultanti dai branch degli item; le personalizzazioni del visualizzatore previste da REQ-NFR-014 restano disponibili. La consultazione non modifica i file di lavoro; l'aggiornamento dei riferimenti Git tramite fetch in background e i suoi limiti devono essere documentati.

Gli shared claims della v1.5.0 devono essere attivati per il coordinamento tra copie del progetto: prima di avviare un item si controllano i branch esistenti e, ai cambi di stato, si pubblica il branch dell'item secondo il processo adottato. Un errore di fetch o push e l'assenza di `origin` sono gestiti e segnalati secondo tale processo. Il push automatico di `main` non è autorizzato fino all'adozione dell'eccezione limitata di REQ-NFR-020; il merge automatico resta vietato. La compatibilità con `/work-alone` segue REQ-NFR-010; gli altri vincoli di sicurezza e del gate rimangono invariati (REQ-NFR-002, REQ-NFR-007, REQ-NFR-008).
