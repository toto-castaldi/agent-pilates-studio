# Product Backlog — agent-pilates-studio

## Management

- Process: `docs/PROCESS.md` (versioni, epic, item, stati e branch).
- Requirements: `docs/REQUIREMENTS.md` · Technical design: `docs/TECHNICAL-DESIGN.md`.
- `STATUS.md` viene aggiornato insieme al backlog per ogni transizione.
- States: `Todo`, `In Progress`, `Blocked`, `Done`.
- Priorities: **P0** fondamenta e vincoli, **P1** funzionalità essenziali, **P2** completamento e rifiniture.
- Nessuno sprint o stima temporale.

## Version v0.1.0

**State:** Open

**Goal:** Rendere riproducibili installazione, prova locale e aggiornamento di Hermes con PostgreSQL, OpenRouter e WhatsApp Business, con sicurezza e operatività di base.

### EPIC-001 — Fondamenta del progetto

**Scope:** inizializzazione, strumenti di sviluppo, scaffold, quality gate e integrazione continua.

#### TEC-001 — Kickoff

- **Epic:** EPIC-001 — Fondamenta del progetto
- **Type:** Task · **Priority:** P0 · **Status:** Done
- **Branch:** `task/TEC-001-kickoff`
- **Dependencies:** none
- **Design references:** PROCESS §3, §4, §5; AGENTS (all sections)
- **Description:** Inizializzare la documentazione del progetto attraverso l'intervista e la pianificazione concordata.
- **Acceptance criteria:**
  - `AGENTS.md` definisce progetto, lingua, scope, stack, regole, quality gate e aggiunte alla DoD; l'avviso del template non inizializzato è rimosso.
  - `docs/REQUIREMENTS.md` contiene obiettivo, attori, glossario, scope, requisiti con ID stabili e accettazione della v0.1.0.
  - `docs/TECHNICAL-DESIGN.md` contiene scelte iniziali e decisioni aperte associate agli item.
  - `BACKLOG.md` contiene obiettivo, epic e item con dipendenze, riferimenti e criteri; le eventuali idee future sono nel backlog non assegnato.
  - `README.md` presenta il progetto; `CHANGELOG.md` e `.gitignore` sono adattati.
  - `STATUS.md` è coerente con `BACKLOG.md`.
- **Outcome:** Baseline documentale, requisiti, design e backlog iniziale concordati e verificati; nessun codice applicativo. Completato il 2026-11-04.

#### TEC-002 — Scaffold TypeScript e quality gate

- **Epic:** EPIC-001 — Fondamenta del progetto
- **Type:** Task · **Priority:** P0 · **Status:** Done
- **Branch:** `task/TEC-002-scaffold-typescript-quality-gate`
- **Dependencies:** TEC-001
- **Requirements:** REQ-NFR-001
- **Design references:** TECHNICAL-DESIGN §1, §3, §8, §9
- **Acceptance criteria:**
  - Il progetto contiene uno scaffold TypeScript con Node.js LTS, npm e lockfile; le versioni scelte sono documentate.
  - Da un ambiente pulito passano `npm ci`, `npm run lint`, `npm run typecheck`, `npm test` e `npm run build`.
  - È presente almeno un test eseguibile e sono documentati prerequisiti e comandi; non sono introdotte funzionalità di dominio non richieste.
- **Outcome:** Scaffold TypeScript con Node.js LTS, npm, Biome e test smoke; quality gate verificato da directory pulita. Completato il 2026-11-04.

#### TEC-006 — Integrazione continua

- **Epic:** EPIC-001 — Fondamenta del progetto
- **Type:** Task · **Priority:** P1 · **Status:** Done
- **Branch:** `task/TEC-006-integrazione-continua`
- **Dependencies:** TEC-002, SPIKE-001
- **Requirements:** REQ-NFR-001, REQ-NFR-003
- **Design references:** TECHNICAL-DESIGN §7, §8, §9
- **Acceptance criteria:**
  - GitHub Actions esegue installazione, lint, controllo dei tipi, test e build, inclusi test di integrazione con PostgreSQL reale.
  - La pipeline segnala l'esito negativo dei controlli e non effettua deploy automatico.
  - Le prove end-to-end con credenziali e servizi esterni sono documentate separatamente; nessun segreto reale viene inserito nel repository o nei log.
- **Outcome:** Workflow GitHub Actions con quality gate e test Docker per PostgreSQL e gateway Hermes, senza deploy né segreti reali. Sintassi, contratto e comandi verificati localmente; la prima esecuzione su GitHub richiede la pubblicazione del branch. Completato il 2026-11-05.

#### TEC-007 — Allowlist Git per la configurazione Pi

- **Epic:** EPIC-001 — Fondamenta del progetto
- **Type:** Task · **Priority:** P1 · **Status:** Done
- **Branch:** `task/TEC-007-allowlist-git-configurazione-pi`
- **Dependencies:** none
- **Requirements:** REQ-NFR-002
- **Design references:** PROCESS §3, §6; AGENTS §9
- **Description:** Consentire il versionamento selettivo della configurazione e delle risorse Pi approvate, mantenendo esclusi i dati locali personali.
- **Acceptance criteria:**
  - `.gitignore` consente di versionare `.pi/settings.json` e `.pi/prompts/avvio.md`; le eventuali estensioni locali sono ammesse singolarmente dopo revisione, non tramite inclusione indiscriminata di `.pi`.
  - Il template `/avvio` e la configurazione condivisa sono versionati dopo verifica; non contengono segreti o credenziali. Eventuali riferimenti personali nella configurazione sono segnalati prima della condivisione.
  - Le skill esistenti in `.agents/skills/` rimangono versionate senza duplicazioni. Sessioni, autenticazione, log, cache e dipendenze installate di Pi restano esclusi da Git.
  - Le regole di inclusione ed esclusione sono verificate con `git check-ignore` o test equivalenti e l'uso della configurazione condivisa è documentato senza segreti.
- **Outcome:** Allowlist per configurazione Pi e template `/avvio`, con esclusione dei dati locali e delle estensioni non approvate; regole verificate con test Git e quality gate. I riferimenti personali esterni rimangono documentati come limite di portabilità. Completato il 2026-11-05.

### EPIC-002 — Agente e integrazioni

**Scope:** integrazione di Hermes con database, modello e canali di comunicazione.

#### SPIKE-001 — Verifica delle integrazioni e stack locale completo

- **Epic:** EPIC-002 — Agente e integrazioni
- **Type:** Spike · **Priority:** P0 · **Status:** Done
- **Branch:** `spike/SPIKE-001-verifica-integrazioni-hermes`
- **Dependencies:** TEC-001, TEC-002
- **Requirements:** REQ-DB-001, REQ-DB-002, REQ-AGENT-001, REQ-AGENT-002, REQ-WA-001, REQ-WA-002, REQ-NFR-002
- **Design references:** TECHNICAL-DESIGN §1, §2, §3, §4, §5, §6, §7, §8, §9, §10
- **Description:** Verificare le integrazioni di Hermes e realizzare uno stack locale completo e avviabile, con PostgreSQL, OpenRouter e WhatsApp Business. I criteri originari di TEC-003, TEC-004 e US-001 confluiscono qui; la deroga per l'implementazione nello spike è registrata in AGENTS §8.
- **Acceptance criteria:**
  - Un rapporto in `docs/spikes/` documenta installazione e versionamento di Hermes, integrazione con OpenRouter e disponibilità dell'identificativo di modello `gpt-6.1-terra`.
  - Il rapporto valuta il collegamento alle API WhatsApp Business tramite l'app Meta esistente, webhook, HTTPS, autorizzazione dei numeri e alternative se non direttamente supportato.
  - Il rapporto valuta accesso DML a PostgreSQL, isolamento delle credenziali di migrazione e impedimento del DDL, con indicazione delle verifiche necessarie.
  - Il rapporto espone prerequisiti, rischi, eventuali costi, raccomandazioni e decisioni ancora da concordare; non include segreti.
  - Hermes e PostgreSQL si avviano localmente con Docker Compose, versioni fissate e configurazione documentata senza segreti reali.
  - Prisma applica migrazioni versionate da uno stato pulito e su uno schema esistente; non sono introdotte tabelle di dominio non richieste.
  - Le credenziali dell'agente sono separate da quelle delle migrazioni, che non sono disponibili all'agente. Test su PostgreSQL reale e una prova tramite l'agente verificano DML consentito e rifiuto del DDL.
  - Con credenziali configurate, una prova documentata ottiene una risposta tramite OpenRouter; il modello è configurabile e l'identificativo effettivo è verificato.
  - Usando l'app Meta configurata, un messaggio di un numero autorizzato riceve una risposta tramite Hermes e OpenRouter; è documentata una prova reale end-to-end.
  - Le richieste webhook prive di autenticazione valida sono rifiutate; i messaggi da numeri non autorizzati non raggiungono l'agente. I test verificano webhook e autorizzazione, compresi casi negativi.
  - Prerequisiti, configurazione senza segreti, comandi per avvio, migrazione e test, errori e prove sono documentati. Log e configurazione rispettano REQ-NFR-002: i log non contengono messaggi, numeri o credenziali.
- **Outcome:** Stack locale con Hermes, PostgreSQL e gateway WhatsApp nativo; migrazioni e privilegi verificati su PostgreSQL reale, risposta WhatsApp tramite OpenRouter e invocazione SQL del modello provate. Mitigazione dei log e limiti operativi documentati. Completato il 2026-11-05.

### EPIC-003 — Dati e operatività

**Scope:** database, migrazioni, installazione, aggiornamento e continuità operativa.

#### TEC-005 — Deploy e continuità operativa

- **Epic:** EPIC-003 — Dati e operatività
- **Type:** Task · **Priority:** P1 · **Status:** Done
- **Branch:** `task/TEC-005-deploy-continuita-operativa`
- **Dependencies:** SPIKE-001
- **Description:** Completare il lavoro operativo. L'operatore ha autorizzato una sola prova pubblica controllata con il rischio residuo dei log del proxy documentato in REQ-NFR-002; l'audit completo è stato separato nel debito non assegnato TEC-008. Restano obbligatori le mitigazioni disponibili e il divieto di streaming remoto di REQ-NFR-004; la prova non autorizza l'uso continuativo.
- **Requirements:** REQ-OPS-001, REQ-OPS-002, REQ-OPS-003, REQ-NFR-002, REQ-NFR-004
- **Design references:** TECHNICAL-DESIGN §1, §2, §5, §7, §8, §9
- **Acceptance criteria:**
  - Una procedura documentata installa e aggiorna intenzionalmente l'ambiente con versioni fissate su un server Linux predisposto con Docker Compose e HTTPS pubblico.
  - Una prova verifica il funzionamento in produzione e la persistenza dei dati dopo riavvio e aggiornamento.
  - Backup e ripristino vengono eseguiti e verificati con dati di prova; prerequisiti e passaggi sono documentati senza segreti.
  - Sono documentati e verificati stato, disponibilità e consultazione dei log Docker di Hermes e PostgreSQL, con protezioni e prove rispetto a REQ-NFR-002. L'audit completo dei log Cloudflare e dei formati locali del proxy è separato in TEC-008; REQ-NFR-002 resta vincolante e la conformità completa non è dichiarata.
  - La procedura operativa documenta il divieto di avviare lo streaming remoto dei log del tunnel condiviso, dal dashboard o da CLI, e chiarisce che è una regola operativa, non un blocco tecnico (REQ-NFR-004).
- **Outcome:** Procedura operativa, diagnostica a eventi fissi, backup e ripristino isolato verificati; risposta WhatsApp confermata nella sola prova pubblica autorizzata. Sul server operativo sono verificati riavvio, aggiornamento della configurazione PostgreSQL sulla stessa immagine, stato e persistenza; il gateway è stato verificato anche solo su loopback dopo l'aggiornamento e poi fermato. L'upgrade PostgreSQL 17.9→17.10 e Hermes 0.22.6→0.22.7 è stato verificato separatamente in isolamento con dati sintetici. Audit completo del proxy rinviato a TEC-008, senza dichiarare l'accettazione privacy della release. Completato il 2026-11-05.

#### TEC-009 — Avvio locale con un comando

- **Epic:** EPIC-003 — Dati e operatività
- **Type:** Task · **Priority:** P1 · **Status:** Done
- **Branch:** `task/TEC-009-avvio-locale-con-un-comando`
- **Dependencies:** SPIKE-001
- **Requirements:** REQ-AGENT-001, REQ-AGENT-003, REQ-DB-001, REQ-DB-002, REQ-WA-002, REQ-NFR-002, REQ-NFR-004
- **Design references:** TECHNICAL-DESIGN §3, §5, §7, §9, §10
- **Description:** Semplificare il primo avvio e i successivi avvii locali: l'operatore copia e compila `.env` da `.env.example`, quindi usa un solo comando per inizializzare e avviare lo stack. Il port forwarding verso `jarvis` per la callback pubblica resta esterno; non è autorizzata l'esposizione pubblica continuativa.
- **Acceptance criteria:**
  - Con i prerequisiti documentati e `.env` compilato, un solo comando documentato prepara le dipendenze necessarie, inizializza i ruoli e applica le migrazioni, avvia PostgreSQL e Hermes e verifica lo stato dei servizi. Funziona sia da clone pulito sia dopo la rimozione dei volumi Docker, senza ulteriori comandi di inizializzazione manuali.
  - Il comando segnala configurazione mancante o non valida e guasti con esito negativo, senza dichiarare utilizzabile uno stack non sano. Riavvi ripetuti conservano dati e credenziali esistenti; nessun volume viene eliminato automaticamente.
  - `.env.example` documenta le impostazioni necessarie senza valori reali; le credenziali compilate in `.env` restano locali, private e fuori dal repository. Il comando non espone segreti, messaggi o numeri in output o log e mantiene le credenziali amministrative e di migrazione indisponibili all'agente, l'autenticazione webhook e l'allowlist.
  - Test ripetibili con credenziali e dati sintetici verificano il primo avvio su PostgreSQL reale, migrazioni, stato, riavvio e persistenza, gestione degli errori e protezioni pertinenti; le prove reali Meta/OpenRouter restano distinte e richiedono servizi e credenziali esterni.
  - README e istruzioni descrivono prerequisiti, configurazione privata, comando unico, verifica e arresto, il port forwarding esterno e i limiti privacy. Non viene avviato streaming remoto dei log del tunnel condiviso; l'avvio locale non autorizza l'uso pubblico continuativo.
- **Outcome:** Comando locale con configurazione privata, dipendenze da lockfile, bootstrap, migrazioni e healthcheck; credenziali esistenti preservate e output dei sottoprocessi soppresso. Verificati con dati sintetici avvio da copia pulita e dopo rimozione dei volumi isolati, riavvio e persistenza PostgreSQL e Hermes, privilegi ed errori; superati quality gate e test di integrazione. Meta/OpenRouter reali e accettazione privacy non riverificati. Completato il 2026-11-05.

## Dependencies and suggested order

L'ordine non è una pianificazione temporale. TEC-002 precede anche lo spike per rendere disponibile il quality gate.

1. TEC-001.
2. TEC-002.
3. SPIKE-001, che include ricerca e stack locale completo.
4. TEC-005, TEC-006, TEC-007 (quest'ultimo senza dipendenze) e TEC-009.

## Items confluiti

Su richiesta dell'utente, i seguenti item non sono più assegnati separatamente alla v0.1.0: i loro criteri sono confluiti in SPIKE-001 e non sono considerati completati fino alla sua chiusura. Gli ID restano riservati; il dettaglio originario è disponibile nella storia Git.

- TEC-003 — PostgreSQL, migrazioni e privilegi.
- TEC-004 — Ambiente Hermes e accesso ai dati.
- US-001 — Conversazione WhatsApp Business.

## Unassigned backlog

Gli item non assegnati devono essere pianificati prima dell'implementazione; i requisiti applicabili restano vincolanti.

#### TEC-008 — Audit privacy dei log del proxy

- **Epic:** EPIC-003 — Dati e operatività
- **Type:** Task · **Priority:** P1 · **Status:** Todo · **Version:** Non assegnata
- **Dependencies:** TEC-005
- **Description:** Debito tecnico concordato: verificare la conservazione, i campi e la retention dei log Cloudflare e la copertura dei formati locali del proxy, eliminando o mitigando eventuali esposizioni di segreti, messaggi o numeri. La mancata assegnazione a una versione non modifica REQ-NFR-002 né autorizza l'uso continuativo del gateway. Per decisione dell'utente del 2026-11-05, l'accettazione privacy della v0.1.0 è rinviata a questo item.
- **Requirements:** REQ-NFR-002, REQ-NFR-004
- **Design references:** TECHNICAL-DESIGN §7
- **Acceptance criteria:**
  - Sono documentati, con evidenze verificabili e senza riportare dati sensibili, configurazione, campi raccolti, destinazioni e tempi di conservazione dei log pertinenti Cloudflare e locali; le parti non osservabili restano esplicitamente non verificate.
  - Prove ripetibili con soli indicatori sintetici coprono i formati locali individuati e i principali esiti del proxy; non viene avviato lo streaming remoto dei log del tunnel condiviso, come previsto da REQ-NFR-004.
  - Eventuali esposizioni individuate sono rimosse o mitigate con misure documentate e verifiche di regressione, senza compromettere gli altri servizi del tunnel condiviso; le modifiche infrastrutturali richiedono le autorizzazioni pertinenti.
  - Sono documentati l'esito rispetto a REQ-NFR-002, i limiti residui e le eventuali decisioni ancora necessarie per l'accettazione della release, senza dichiarare conformità non dimostrata.
