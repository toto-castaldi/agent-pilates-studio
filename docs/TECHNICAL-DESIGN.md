# Technical design — agent-pilates-studio

**Target version:** v0.1.0

Questo documento registra le scelte iniziali e le decisioni aperte. Il comportamento richiesto è in `docs/REQUIREMENTS.md`; le sezioni non ancora definite non implicano che le integrazioni siano state verificate.

## 1. Initial architectural decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Runtime locale e produzione | Docker Compose; server Linux già predisposto in produzione | Avvio e gestione coerenti nei due ambienti. |
| Codice del progetto | TypeScript 5.9.3, Node.js LTS 24.14.0 e npm 11.9.0 | Stack e versioni di riferimento dello scaffold definiti da TEC-002; dipendenze fissate nel lockfile. Hermes mantiene i propri prerequisiti. |
| Dati | PostgreSQL e migrazioni Prisma | Database relazionale e schema gestito tramite codice e migrazioni versionate. |
| Agente e modello | Hermes con OpenRouter; modello configurabile | Separare l'ambiente agentico dal provider; il modello proposto `gpt-6.1-terra` e la compatibilità richiedono verifica. |
| Canale | API WhatsApp Business tramite app Meta esistente | Usare la configurazione Meta già disponibile; modalità di collegamento da verificare. |
| Rilascio | Versioni fissate, aggiornamento avviato esplicitamente | Riproducibilità e controllo operativo, senza deploy automatico. |
| CI | GitHub Actions | Verificare il quality gate senza eseguire automaticamente il deploy. |

## 2. Context and main flows

L'operatore configura e avvia l'ambiente locale o di produzione, applica le migrazioni con credenziali dedicate e gestisce aggiornamenti e recupero. L'interlocutore autorizzato invia messaggi tramite WhatsApp Business; il componente di integrazione verifica il webhook e l'autorizzazione, inoltra la richiesta a Hermes e restituisce la risposta. Hermes usa OpenRouter e può accedere a PostgreSQL con il solo ruolo agente.

Il flusso è un obiettivo architetturale, non una dichiarazione di supporto delle integrazioni: SPIKE-001 deve verificarne la fattibilità, proporre eventuali alternative da concordare e realizzare lo stack locale.

## 3. Modules

- **Runtime e configurazione:** servizi Compose, versioni fissate e configurazione esterna; TEC-002 e SPIKE-001.
- **Dati e migrazioni:** PostgreSQL, ruoli e migrazioni Prisma; SPIKE-001. L'agente esegue SQL direttamente tramite un piccolo plugin nativo Hermes, senza MCP; il ruolo PostgreSQL limita i privilegi.
- **Agente e modello:** installazione Hermes, configurazione OpenRouter e accesso ai dati con ruolo limitato; SPIKE-001.
- **Canale WhatsApp:** gateway WhatsApp Cloud nativo di Hermes con app Meta, validazione webhook e autorizzazione dei numeri; percorso del webhook configurabile per riutilizzare un callback HTTPS esistente; SPIKE-001.
- **Operatività e CI:** installazione, aggiornamento, recupero, osservabilità e verifiche automatiche; TEC-005 e TEC-006.

I confini concreti dei componenti, inclusi eventuali adattatori, saranno definiti dagli item indicati; non si assume che Hermes includa già le integrazioni richieste.

## 4. Data model

Il database applicativo è PostgreSQL 17.10, fissato per digest in Compose; lo schema è gestito con Prisma 7.10.1 e migrazioni versionate. L'accesso diretto di Hermes usa un plugin nel formato Python richiesto dal suo runtime e il driver `asyncpg` già presente nell'immagine; non introduce un servizio MCP. Non sono state concordate entità o tabelle di dominio iniziali; eventuali dati di prova per le verifiche non definiscono il modello di dominio. Lo schema `app` appartiene al ruolo di migrazione; i metadati Prisma risiedono in `public`, senza accesso da parte dell'agente. Futuri requisiti definiranno le entità necessarie.

Hermes usa anche SQLite per le proprie sessioni; questo archivio è distinto da PostgreSQL e contiene dati sensibili. Persistenza e recupero complessivi restano da verificare in TEC-005.

## 5. Invariants and consistency

- L'agente può eseguire DML, non DDL; il vincolo va applicato e verificato sul database reale, non solo nelle istruzioni all'agente.
- Credenziali e privilegi delle migrazioni sono separati e non disponibili all'agente. I ruoli PostgreSQL sono distinti per amministrazione, migrazione e agente; solo quest'ultimo riceve DML nello schema applicativo. Il ruolo agente non possiede schemi né può creare tabelle temporanee; `pg_hba.conf` limita il suo accesso al database applicativo. PostgreSQL consente però al ruolo di login di cambiare la propria password anche senza `CREATEROLE`: l'utente ha accettato questa eccezione standard, che non consente DDL sugli schemi. Il bootstrap eseguito dall'operatore ripristina la password a partire dal file esterno. SPIKE-001 ha verificato il plugin tramite il registro dei tool Hermes contro PostgreSQL reale; resta da verificare la chiamata generata dal modello.
- Solo numeri configurati possono interagire; le richieste webhook non autentiche sono rifiutate.
- Aggiornamenti e riavvii preservano i dati; una procedura di ripristino deve essere verificata.

## 6. Integrations

- **Hermes:** modalità di installazione, esecuzione e fissaggio delle versioni da verificare e realizzare con SPIKE-001.
- **OpenRouter:** provider configurato esternamente; SPIKE-001 verifica supporto e disponibilità dell'identificativo di modello indicato. Non assumere che `gpt-6.1-terra` sia valido; concordare una scelta se non lo è.
- **WhatsApp Business:** usare l'app Meta esistente; SPIKE-001 valuta supporto, webhook, prerequisiti e alternative e realizza il collegamento concordato.
- **PostgreSQL:** SPIKE-001 valuta il meccanismo di accesso dell'agente e ne applica e verifica i privilegi.

## 7. Security and observability

Segreti e credenziali restano fuori dal repository; gli esempi di configurazione non contengono valori reali. I log non devono includere messaggi, numeri di telefono o credenziali. L'accesso al database è limitato con ruoli distinti; l'integrazione WhatsApp autentica le richieste e applica la lista dei numeri autorizzati. TEC-005 documenta e verifica stato, disponibilità e consultazione dei log; il monitoraggio avanzato è fuori scope.

L'adattatore WhatsApp nativo di Hermes può registrare numeri nei log. In attesa di una diagnostica sicura, il launcher del gateway disabilita il logging Python e sopprime stdout/stderr prima di importare Hermes; i container Hermes e PostgreSQL usano il logging driver Docker `none`. Lo stato e la disponibilità sono verificabili tramite Compose e healthcheck, ma i log dettagliati non sono disponibili. I test con dati sintetici verificano le protezioni previste; ciò non prova l'assenza di ogni possibile fuga. Evitare modalità alternative di avvio non protette.

I dettagli di isolamento, gestione dei segreti nei processi e validazione Meta richiedono ulteriori verifiche con SPIKE-001; protezione dei backup e diagnostica sicura restano in TEC-005. Non assumere che una configurazione predefinita di Hermes soddisfi questi requisiti.

## 8. Test strategy

Il progetto usa Biome 2.6.5 per il lint del codice TypeScript e degli script, TypeScript per controllo dei tipi e build e il test runner integrato di Node.js per i test; `npm test` ricompila prima di eseguirli. `npm run test:db` esegue le prove di migrazione e privilegi su PostgreSQL reale e verifica il plugin SQL tramite il registro Hermes. `npm run test:hermes` avvia lo stack in una rete Docker isolata e verifica gateway nativo, autenticazione e autorizzazione con dati sintetici e protezioni dei log. I test unitari verificano la logica al livello più economico; quelli di integrazione usano PostgreSQL reale per migrazioni e privilegi. I test dei webhook includono autenticazione e accessi negati. Le prove end-to-end reali con Meta e OpenRouter richiedono configurazione, rete e credenziali esterne e sono documentate separatamente; non sostituiscono i test automatici. TEC-005 verifica anche aggiornamento, persistenza e ripristino; TEC-006 configura la CI senza deploy automatico.

## 9. Configuration and local runtime

L'ambiente locale usa Docker Compose; la produzione presume un server Linux con Docker/Compose e un endpoint HTTPS pubblico già disponibili. DNS, certificati e provisioning del server sono fuori scope. I nomi delle variabili, i file di esempio e i comandi operativi saranno definiti dagli item di implementazione; non inserire segreti reali. Node.js 24.14.0 è indicato in `.nvmrc`; gli intervalli supportati di Node.js e npm sono in `package.json`. Le versioni degli altri componenti saranno fissate dagli item responsabili.

## 10. Open decisions

- Installazione e versionamento di Hermes; supporto OpenRouter e disponibilità del modello indicato; integrazione WhatsApp Business, webhook e accesso sicuro a PostgreSQL — SPIKE-001. Eventuali alternative o variazioni di scope richiedono accordo con l'utente.
- Provisioning dei ruoli PostgreSQL, migrazioni Prisma, configurazione concreta di Hermes e del modello, adattatore WhatsApp, autenticazione del webhook e gestione dei numeri autorizzati — SPIKE-001.
- Procedura di deploy, aggiornamento, backup/ripristino e verifica della disponibilità — TEC-005.
- Configurazione CI e separazione delle prove con servizi esterni — TEC-006.
