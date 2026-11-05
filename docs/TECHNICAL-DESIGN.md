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

SPIKE-001 ha realizzato lo stack locale e verificato questo flusso in una prova reale con l'app Meta e OpenRouter; la continuità operativa resta affidata a TEC-005 e la CI è stata configurata da TEC-006.

## 3. Modules

- **Runtime e configurazione:** servizi Compose, versioni fissate e configurazione esterna; TEC-002 e SPIKE-001.
- **Dati e migrazioni:** PostgreSQL, ruoli e migrazioni Prisma; SPIKE-001. L'agente esegue SQL direttamente tramite un piccolo plugin nativo Hermes, senza MCP; il ruolo PostgreSQL limita i privilegi.
- **Agente e modello:** installazione Hermes, configurazione OpenRouter e accesso ai dati con ruolo limitato; SPIKE-001.
- **Canale WhatsApp:** gateway WhatsApp Cloud nativo di Hermes con app Meta, validazione webhook e autorizzazione dei numeri; percorso del webhook configurabile per riutilizzare un callback HTTPS esistente; SPIKE-001.
- **Operatività e CI:** installazione, aggiornamento, recupero, osservabilità e verifiche automatiche; TEC-005 e TEC-006.

Hermes fornisce l'adattatore WhatsApp Cloud nativo; il progetto aggiunge un plugin SQL diretto e protezioni della configurazione e dei log.

## 4. Data model

Il database applicativo è PostgreSQL 17.10, fissato per digest in Compose; lo schema è gestito con Prisma 7.10.1 e migrazioni versionate. L'accesso diretto di Hermes usa un plugin nel formato Python richiesto dal suo runtime e il driver `asyncpg` già presente nell'immagine; non introduce un servizio MCP. Non sono state concordate entità o tabelle di dominio iniziali; eventuali dati di prova per le verifiche non definiscono il modello di dominio. Lo schema `app` appartiene al ruolo di migrazione; i metadati Prisma risiedono in `public`, senza accesso da parte dell'agente. Futuri requisiti definiranno le entità necessarie.

Hermes usa anche SQLite per le proprie sessioni; questo archivio è distinto da PostgreSQL e contiene dati sensibili. Persistenza e recupero complessivi restano da verificare in TEC-005.

## 5. Invariants and consistency

- L'agente può eseguire DML, non DDL; il vincolo va applicato e verificato sul database reale, non solo nelle istruzioni all'agente.
- Credenziali e privilegi delle migrazioni sono separati e non disponibili all'agente. I ruoli PostgreSQL sono distinti per amministrazione, migrazione e agente; solo quest'ultimo riceve DML nello schema applicativo. Il ruolo agente non possiede schemi né può creare tabelle temporanee; `pg_hba.conf` limita il suo accesso al database applicativo. PostgreSQL consente però al ruolo di login di cambiare la propria password anche senza `CREATEROLE`: l'utente ha accettato questa eccezione standard, che non consente DDL sugli schemi. Il bootstrap eseguito dall'operatore ripristina la password a partire dal file esterno. SPIKE-001 ha verificato il plugin tramite il registro dei tool Hermes contro PostgreSQL reale e con una chiamata generata dal modello durante una conversazione WhatsApp reale.
- Solo numeri configurati possono interagire; le richieste webhook non autentiche sono rifiutate.
- Aggiornamenti e riavvii preservano i dati; una procedura di ripristino deve essere verificata.

## 6. Integrations

- **Hermes:** immagine ufficiale v0.22.7 fissata per digest e avviata in Compose; verifica in SPIKE-001.
- **OpenRouter:** provider configurato esternamente; SPIKE-001 ha verificato l'ID `openai/gpt-6.1-terra` e una risposta reale tramite Hermes. Il modello resta configurabile.
- **WhatsApp Business:** gateway nativo con l'app Meta esistente; SPIKE-001 ha verificato webhook, allowlist e una conversazione reale.
- **PostgreSQL:** plugin SQL nativo e privilegi distinti verificati su PostgreSQL reale, anche tramite una chiamata generata dal modello in SPIKE-001.

## 7. Security and observability

Segreti e credenziali restano fuori dal repository; gli esempi di configurazione non contengono valori reali. I log non devono includere messaggi, numeri di telefono o credenziali. L'accesso al database è limitato con ruoli distinti; l'integrazione WhatsApp autentica le richieste e applica la lista dei numeri autorizzati. TEC-005 documenta e verifica stato, disponibilità e consultazione dei log; il monitoraggio avanzato è fuori scope.

Per REQ-NFR-004, la procedura di TEC-005 deve vietare agli operatori l'avvio dello streaming remoto dei log del tunnel condiviso tramite dashboard Cloudflare, `cloudflared tail` o strumenti equivalenti. Il divieto è operativo e non impedisce tecnicamente l'avvio da parte di utenti autorizzati; non è prova della sicurezza di altri log Cloudflare o dei log locali, che restano soggetti a REQ-NFR-002.

L'adattatore WhatsApp nativo di Hermes può registrare numeri nei log e PostgreSQL può registrare query e valori. Gli entrypoint deviano stdout/stderr verso `/dev/null` prima di avviare i rispettivi processi; un descrittore separato, chiuso prima dell'avvio dei figli, invia al driver Docker `local` solo gli eventi fissi `hermes_launch`, `hermes_preflight_failed` e `postgres_launch`. Il launcher del gateway disabilita inoltre il logging Python prima di importare Hermes. La rotazione è limitata a tre file da 1 MB; gli eventi non attestano che i servizi siano sani. Stato e disponibilità richiedono Compose e healthcheck; dettagli degli errori non sono disponibili. I test esercitano messaggi, numeri, token sintetici e un errore SQL su PostgreSQL reale e controllano che i log contengano solo eventi fissi; ciò non prova l'assenza di ogni possibile fuga. Evitare modalità alternative di avvio non protette.

SPIKE-001 ha verificato isolamento dei segreti di migrazione, webhook e allowlist con test locali e una conversazione reale. Durante TEC-005, una richiesta sintetica al proxy HTTPS condiviso con origine non disponibile ha ricevuto 502 e il parametro di verifica sintetico è comparso nel journal di cloudflared. L'operatore ha installato un filtro systemd mirato all'hostname: due nuovi 502 sintetici non hanno prodotto i rispettivi valori nel journal, con controllo positivo su un evento precedente. Il filtro elimina l'intera riga e non copre tutti i formati né i log esterni. L'operatore dichiara che non sono configurate esportazioni Cloudflare e che non verranno configurate; tale scelta non esclude la conservazione di eventi in Cloudflare. Restano da verificare i dataset e i campi raccolti da Cloudflare e i formati locali. L'operatore ha autorizzato una prova pubblica temporanea e controllata accettando questo rischio residuo, con i limiti di REQ-NFR-002; non ha autorizzato l'uso continuativo. Lo streaming remoto del tunnel è vietato da REQ-NFR-004 e non viene avviato per la verifica. Il token reale attuale non è stato rilevato nella ricerca limitata nel journal locale: questa ricerca non dimostra che non sia presente altrove. Protezione dei backup e diagnostica sicura restano in TEC-005. Non assumere che una configurazione predefinita di Hermes soddisfi questi requisiti.

## 8. Test strategy

Per gli host Linux con Docker ma senza Node.js, TEC-005 introduce un'immagine temporanea di migrazione costruita da Node.js 24.14.0 fissato per digest e dal lockfile. L'installazione delle dipendenze precede il montaggio del solo segreto di migrazione; l'immagine usa la rete host per raggiungere PostgreSQL su loopback e non viene montata in Hermes. Il contesto Docker esclude configurazione locale e segreti. La prova PostgreSQL verifica anche questo percorso.

Per la continuità, l'operatore arresta Hermes e gli altri scrittori prima di catturare dump PostgreSQL e volume Hermes completo. Gli script creano un backup privato in una directory nuova con somme di controllo e ripristinano solo in un nuovo progetto Compose con porta loopback effimera, senza avviare Hermes. È richiesta una destinazione cifrata esterna e una copia separata dei segreti: gli script non garantiscono cifratura, autenticità del backup o mutua esclusione contro altri operatori. Il test di integrazione ripristina PostgreSQL e lo stato SQLite reale di Hermes su risorse isolate, verifica privilegi e casi di rifiuto, e prova la persistenza dopo riavvio e ricreazione con la stessa immagine. Un test separato verifica, con dati sintetici e servizi in rete isolata, l'aggiornamento reale PostgreSQL 17.9→17.10 e Hermes 0.22.6→0.22.7, inclusa la persistenza e il divieto di DDL; è stato eseguito anche su `jarvis`. Su `jarvis` gli script sono stati verificati con PostgreSQL reale e, in rete isolata, con lo stato SQLite sintetico creato da Hermes reale. Dopo la prova pubblica temporanea è stato inoltre creato su disco LUKS e ripristinato in isolamento un backup dello stato reale, senza esporre il contenuto; una copia indipendente è stata verificata su disco esterno LUKS. I segreti devono essere conservati separatamente. Il PostgreSQL operativo è stato riavviato e riconfigurato sulla stessa immagine e volume; migrazioni, autenticazione agente, rifiuto del DDL e persistenza dei dati controllati sono stati verificati. Le verifiche non garantiscono la compatibilità di altre versioni.

Il progetto usa Biome 2.6.5 per il lint del codice TypeScript e degli script, TypeScript per controllo dei tipi e build e il test runner integrato di Node.js per i test; `npm test` ricompila prima di eseguirli. `npm run test:db` esegue le prove di migrazione e privilegi su PostgreSQL reale e verifica il plugin SQL tramite il registro Hermes. `npm run test:hermes` avvia lo stack in una rete Docker isolata e verifica gateway nativo, autenticazione e autorizzazione con dati sintetici e protezioni dei log. I test unitari verificano la logica al livello più economico; quelli di integrazione usano PostgreSQL reale per migrazioni e privilegi. I test dei webhook includono autenticazione e accessi negati. Le prove end-to-end reali con Meta e OpenRouter richiedono configurazione, rete e credenziali esterne e sono documentate separatamente; non sostituiscono i test automatici. TEC-005 verifica anche aggiornamento, persistenza e ripristino.

TEC-006 configura GitHub Actions su push, pull request e avvio manuale: un job Linux esegue il quality gate e i test di integrazione PostgreSQL, Hermes e aggiornamento, preparando prima le immagini Docker fissate dal progetto. Il job usa soltanto dati sintetici, permessi di lettura del repository e action fissate per commit; non esegue deploy e non richiede segreti GitHub. Un test del contratto interpreta il workflow con `yaml` 2.9.1 e verifica trigger, comandi, permessi e assenza di condizioni che permettano di saltare o ignorare i controlli.

## 9. Configuration and local runtime

L'ambiente locale usa Docker Compose; la produzione presume un server Linux con Docker/Compose e un endpoint HTTPS pubblico già disponibili. DNS, certificati e provisioning del server sono fuori scope. I nomi delle variabili, i file di esempio e i comandi operativi saranno definiti dagli item di implementazione; non inserire segreti reali. Node.js 24.14.0 è indicato in `.nvmrc`; gli intervalli supportati di Node.js e npm sono in `package.json`. Le versioni degli altri componenti saranno fissate dagli item responsabili.

## 10. Open decisions

- Procedura di deploy, aggiornamento, backup/ripristino e verifica della disponibilità — TEC-005.
- Debito tecnico individuato su richiesta dell'operatore: completare l'audit dei dati conservati da Cloudflare e dei formati di log locali non coperti dalle prove sintetiche. I rischi, le verifiche effettuate e il lavoro residuo sono descritti in `docs/operations/TEC-005-prove-preliminari.md`; l'item dedicato va registrato su `main` secondo PROCESS §6.1. L'indagine rinviata non costituisce prova di conformità completa; REQ-NFR-002 documenta la sola prova temporanea autorizzata.
