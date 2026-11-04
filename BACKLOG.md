# Product Backlog — `<project-name>`

## Management

- Process: `docs/PROCESS.md` (versions, epics, item types, fields, states, priorities, branches).
- Requirements: `docs/REQUIREMENTS.md` · Technical design: `docs/TECHNICAL-DESIGN.md`.
- `STATUS.md` is updated together with this file at every item or version transition.
- States: `Todo`, `In Progress`, `Blocked`, `Done`.
- Priorities: **P0** foundations/invariants, **P1** core functionality, **P2** completion and polish.
- No Sprints, no time estimates.

## Version v0.1.0

**State:** Open

**Goal:** `<one or two sentences describing what v0.1.0 delivers; defined during the kickoff>`

### EPIC-001 — Project foundation

**Scope:** project initialization, scaffold, quality gate, local runtime and process tooling.

#### TEC-001 — Kickoff

- **Epic:** EPIC-001 — Project foundation
- **Type:** Task · **Priority:** P0 · **Status:** Todo
- **Dependencies:** none
- **Design references:** PROCESS §3, §4, §5; AGENTS (all sections)
- **Description:** Initialize the project from the template by interviewing the user. Run the `kickoff` skill.
- **Acceptance criteria:**
  - `AGENTS.md` is filled in (project, language, scope, stack, domain rules, quality gate, DoD additions) and the "template not initialized" notice is removed.
  - `docs/REQUIREMENTS.md` contains goal, actors, glossary, in/out of scope, first functional and non-functional requirements with stable IDs and the release acceptance criteria of v0.1.0.
  - `docs/TECHNICAL-DESIGN.md` contains the initial architectural decisions and the open decisions to be closed by backlog items.
  - `BACKLOG.md` contains the goal of v0.1.0, its epics and its items with dependencies, requirements and acceptance criteria; ideas outside v0.1.0 are in the unassigned backlog.
  - `README.md` presents the project instead of the template; `CHANGELOG.md` and `.gitignore` are adapted to the project.
  - `STATUS.md` is consistent with `BACKLOG.md`.

#### TEC-002 — Scaffold TypeScript e quality gate

- **Epic:** EPIC-001 — Project foundation
- **Type:** Task · **Priority:** P0 · **Status:** Todo
- **Dependencies:** TEC-001
- **Requirements:** REQ-NFR-001
- **Design references:** TECHNICAL-DESIGN §1, §3, §8, §9
- **Acceptance criteria:**
  - Il progetto contiene uno scaffold TypeScript con Node.js LTS, npm e lockfile; le versioni scelte sono documentate.
  - Da un ambiente pulito passano `npm ci`, `npm run lint`, `npm run typecheck`, `npm test` e `npm run build`.
  - È presente almeno un test eseguibile e sono documentati prerequisiti e comandi; non sono introdotte funzionalità di dominio non richieste.

### EPIC-002 — Agente e integrazioni

**Scope:** integrazione di Hermes con database, modello e canali di comunicazione.

#### SPIKE-001 — Verifica delle integrazioni di Hermes

- **Epic:** EPIC-002 — Agente e integrazioni
- **Type:** Spike · **Priority:** P0 · **Status:** Todo
- **Dependencies:** TEC-001
- **Design references:** TECHNICAL-DESIGN §1, §3, §5, §6, §7, §9, §10
- **Description:** Verificare con documentazione ed eventuali prove circoscritte come installare Hermes e integrarlo con i servizi previsti, senza assumere che il supporto esista.
- **Acceptance criteria:**
  - Un rapporto in `docs/spikes/` documenta installazione e versionamento di Hermes, integrazione con OpenRouter e disponibilità dell'identificativo di modello `gpt-6.1-terra`.
  - Il rapporto valuta il collegamento alle API WhatsApp Business tramite l'app Meta esistente, webhook, HTTPS, autorizzazione dei numeri e alternative se non direttamente supportato.
  - Il rapporto valuta accesso DML a PostgreSQL, isolamento delle credenziali di migrazione e impedimento del DDL, con indicazione delle verifiche necessarie.
  - Il rapporto espone prerequisiti, rischi, eventuali costi, raccomandazioni e decisioni ancora da concordare; non include segreti.

#### TEC-004 — Ambiente Hermes e accesso ai dati

- **Epic:** EPIC-002 — Agente e integrazioni
- **Type:** Task · **Priority:** P1 · **Status:** Todo
- **Dependencies:** SPIKE-001, TEC-003
- **Requirements:** REQ-AGENT-001, REQ-AGENT-002, REQ-DB-002, REQ-NFR-002
- **Design references:** TECHNICAL-DESIGN §1, §2, §3, §5, §6, §7, §8, §9
- **Acceptance criteria:**
  - Hermes e PostgreSQL si avviano localmente con Docker Compose, versioni fissate e configurazione documentata senza segreti reali.
  - Con credenziali configurate, una prova documentata ottiene una risposta tramite OpenRouter; il modello è configurabile e l'identificativo effettivo è verificato.
  - Una prova tramite l'agente verifica DML e rifiuto del DDL su PostgreSQL reale; l'agente non riceve credenziali di migrazione.
  - I log e la configurazione rispettano REQ-NFR-002; errori e prerequisiti sono documentati.

### EPIC-003 — Dati e operatività

**Scope:** database, migrazioni, installazione, aggiornamento e continuità operativa.

#### TEC-003 — PostgreSQL, migrazioni e privilegi

- **Epic:** EPIC-003 — Dati e operatività
- **Type:** Task · **Priority:** P0 · **Status:** Todo
- **Dependencies:** TEC-002, SPIKE-001
- **Requirements:** REQ-DB-001, REQ-DB-002
- **Design references:** TECHNICAL-DESIGN §1, §3, §4, §5, §7, §8, §9
- **Acceptance criteria:**
  - PostgreSQL è avviabile localmente e Prisma applica migrazioni versionate da uno stato pulito e su uno schema esistente; non sono introdotte tabelle di dominio non richieste.
  - Le credenziali dell'agente sono separate da quelle delle migrazioni, che non sono disponibili all'agente.
  - Test su PostgreSQL reale verificano le operazioni DML consentite e il rifiuto di DDL con le credenziali dell'agente.
  - Prerequisiti, configurazione senza segreti e comandi per avvio, migrazione e test sono documentati.

## Dependencies and suggested order

The order is not a time plan.

1. TEC-001.
2. SPIKE-001 e TEC-002.
3. TEC-003.
4. TEC-004.

## Unassigned backlog

Ideas not assigned to any version. They need requirements before they can be designed.

- `<idea>`
