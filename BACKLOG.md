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
- **Type:** Task · **Priority:** P1 · **Status:** Todo
- **Dependencies:** none
- **Requirements:** REQ-NFR-002
- **Design references:** PROCESS §3, §6; AGENTS §9
- **Description:** Consentire il versionamento selettivo della configurazione e delle risorse Pi approvate, mantenendo esclusi i dati locali personali.
- **Acceptance criteria:**
  - `.gitignore` consente di versionare `.pi/settings.json` e `.pi/prompts/avvio.md`; le eventuali estensioni locali sono ammesse singolarmente dopo revisione, non tramite inclusione indiscriminata di `.pi`.
  - Il template `/avvio` e la configurazione condivisa sono versionati dopo verifica; non contengono segreti o credenziali. Eventuali riferimenti personali nella configurazione sono segnalati prima della condivisione.
  - Le skill esistenti in `.agents/skills/` rimangono versionate senza duplicazioni. Sessioni, autenticazione, log, cache e dipendenze installate di Pi restano esclusi da Git.
  - Le regole di inclusione ed esclusione sono verificate con `git check-ignore` o test equivalenti e l'uso della configurazione condivisa è documentato senza segreti.

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
- **Type:** Task · **Priority:** P1 · **Status:** Todo
- **Dependencies:** SPIKE-001
- **Requirements:** REQ-OPS-001, REQ-OPS-002, REQ-OPS-003, REQ-NFR-002
- **Design references:** TECHNICAL-DESIGN §1, §2, §5, §7, §8, §9
- **Acceptance criteria:**
  - Una procedura documentata installa e aggiorna intenzionalmente l'ambiente con versioni fissate su un server Linux predisposto con Docker Compose e HTTPS pubblico.
  - Una prova verifica il funzionamento in produzione e la persistenza dei dati dopo riavvio e aggiornamento.
  - Backup e ripristino vengono eseguiti e verificati con dati di prova; prerequisiti e passaggi sono documentati senza segreti.
  - Sono documentati e verificati stato e disponibilità dei servizi e consultazione dei log nel rispetto di REQ-NFR-002.

## Dependencies and suggested order

L'ordine non è una pianificazione temporale. TEC-002 precede anche lo spike per rendere disponibile il quality gate.

1. TEC-001.
2. TEC-002.
3. SPIKE-001, che include ricerca e stack locale completo.
4. TEC-005, TEC-006 e TEC-007 (quest'ultimo senza dipendenze).

## Items confluiti

Su richiesta dell'utente, i seguenti item non sono più assegnati separatamente alla v0.1.0: i loro criteri sono confluiti in SPIKE-001 e non sono considerati completati fino alla sua chiusura. Gli ID restano riservati; il dettaglio originario è disponibile nella storia Git.

- TEC-003 — PostgreSQL, migrazioni e privilegi.
- TEC-004 — Ambiente Hermes e accesso ai dati.
- US-001 — Conversazione WhatsApp Business.

## Unassigned backlog

Le idee non assegnate richiedono requisiti prima della progettazione.

Nessuna idea per ora.
