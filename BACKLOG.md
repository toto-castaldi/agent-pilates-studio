# Product Backlog — agent-pilates-studio

## Management

- Process: `docs/PROCESS.md` (versioni, epic, item, stati e branch).
- Requirements: `docs/REQUIREMENTS.md` · Technical design: `docs/TECHNICAL-DESIGN.md`.
- `STATUS.md` viene aggiornato insieme al backlog per ogni transizione.
- States: `Todo`, `In Progress`, `Blocked`, `Done`.
- Priorities: **P0** fondamenta e vincoli, **P1** funzionalità essenziali, **P2** completamento e rifiniture.
- Nessuno sprint o stima temporale.

## Version v0.1.0

**State:** Closed (2026-11-05)

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
- **Nota successiva:** l'operatore ha intenzionalmente rimosso il template; l'allineamento della documentazione e delle verifiche è affidato a TEC-014 (REQ-NFR-007).

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

## Version v0.2.0

**State:** Closed (2026-11-07)

**Goal:** Il titolare e i collaboratori registrano, consultano e aggiornano via WhatsApp le abitudini settimanali di allenamento dei clienti, salvate come regole in linguaggio naturale con autore e storico.

**Scope change (2026-11-06):** su accordo dell'utente, TEC-017 è aggiunto alla v0.2.0 per il template Pi `/work-alone`.

**Scope change (2026-11-06):** su accordo dell'utente, BUG-001 è aggiunto alla v0.2.0 per configurare il canale home e non inviare agli utilizzatori l'avviso di Hermes.

**Scope change (2026-11-06):** su accordo dell'utente, TEC-018 è aggiunto alla v0.2.0 per segnalare l'attesa dell'utente nei tool Pi di domanda.

**Scope change (2026-11-06):** su accordo dell'utente, TEC-020 è aggiunto alla v0.2.0 per il dettato vocale Pi su server remoto.

**Scope change (2026-11-07):** su accordo dell'utente, TEC-021 è aggiunto alla v0.2.0 per l'avvio locale con `.env` come collegamento simbolico privato.

**Scope change (2026-11-07):** su accordo dell'utente, TEC-022 è aggiunto alla v0.2.0 per tracciare il template di origine e preparare futuri aggiornamenti, senza adottarli ora.

**Scope change (2026-11-07):** su accordo dell'utente, TEC-023 è aggiunto alla v0.2.0 per adottare il template v1.4.0, il visualizzatore Pi del backlog e il modulo architetturale Agente.

**Scope change (2026-11-07):** su accordo dell'utente, TEC-024 è aggiunto alla v0.2.0 per adottare il template v1.5.0 e attivare gli shared claims, consentendo i relativi push dei branch item anche con `/work-alone`.

**Scope change (2026-11-07):** su accordo dell'utente, TEC-025 è aggiunto alla v0.2.0 per separare il contesto del modello per interlocutore e compattarlo automaticamente al 40% della finestra e dopo inattività.

**Scope change (2026-11-07):** su accordo dell'utente, US-005 è aggiunto alla v0.2.0 per dare all'agente un nome, definito in `SOUL.md`, con cui si presenta e risponde.

**Scope change (2026-11-07):** su accordo dell'utente, TEC-026 è aggiunto alla v0.2.0 per applicare all'avvio le modifiche di configurazione e credenziali esterne da `.env`, senza rotazione automatica delle password PostgreSQL.

### EPIC-001 — Fondamenta del progetto

#### TEC-013 — Separazione della configurazione Pi condivisa e personale

- **Epic:** EPIC-001 — Fondamenta del progetto
- **Type:** Task · **Priority:** P2 · **Status:** Done
- **Branch:** `task/TEC-013-separazione-configurazione-pi`
- **Dependencies:** TEC-007
- **Design references:** PROCESS §3, §6; AGENTS §9
- **Description:** Separare le risorse Pi condivise dalle preferenze e dallo stato personali, mantenendo l'isolamento per progetto senza sporcare il file versionato durante l'uso ordinario.
- **Acceptance criteria:**
  - Le risorse condivise approvate, inclusi tool ed estensioni configurati, restano versionate e caricabili; preferenze e stato modificati dall'uso di Pi sono mantenuti separatamente e ignorati da Git.
  - L'avvio usa directory distinte per impostazioni personali e di progetto; una prova ripetibile con Pi verifica che modifiche di preferenze personali non cambino `.pi/settings.json` versionato e che le risorse condivise restino disponibili.
  - Sessioni, autenticazione, configurazione privata e altri dati locali esistenti non sono persi o esposti; la procedura di migrazione è reversibile, non include credenziali e non elimina automaticamente i dati originali.
  - README documenta avvio, precedenza delle impostazioni, migrazione e limiti di portabilità; test ripetibili verificano separazione e regole Git usando dati sintetici.
- **Outcome:** Avvio Pi con directory personale ignorata, risorse condivise mantenute e preferenze separate; migrazione reversibile documentata. Verificati quality gate, regole Git, scrittura personale e caricamento di estensione e tool sintetici con Pi reale offline; verificata anche la presenza dei tool esterni configurati nell'ambiente originale. I percorsi di skill esterne mancanti rimangono un limite preesistente. Completato il 2026-11-05.
- **Nota successiva:** l'operatore ha intenzionalmente modificato la configurazione e rimosso il launcher; i criteri sopra descrivono l'assetto storico. TEC-014 deve allineare verifiche e documentazione alla decisione successiva (REQ-NFR-007).

#### TEC-014 — Allineamento delle verifiche alla configurazione Pi

- **Epic:** EPIC-001 — Fondamenta del progetto
- **Type:** Task · **Priority:** P0 · **Status:** Done
- **Branch:** `task/TEC-014-allineamento-verifiche-configurazione-pi`
- **Dependencies:** TEC-013
- **Requirements:** REQ-NFR-001, REQ-NFR-002, REQ-NFR-003, REQ-NFR-007
- **Design references:** PROCESS §3, §6; AGENTS §6, §9
- **Description:** Allineare test e documentazione alle modifiche intenzionali dell'operatore alla configurazione Pi, senza ripristinare il launcher e il template rimossi né modificare impostazioni e dati personali senza accordo.
- **Acceptance criteria:**
  - I test automatici Pi e la prova con Pi reale offline non richiedono `scripts/pi.sh` né il template `/avvio` rimossi; verificano in modo ripetibile, con dati sintetici, l'assetto effettivamente concordato senza limitarsi a sopprimere i controlli falliti.
  - Le verifiche Git continuano a proteggere sessioni, autenticazione, log, credenziali e dati locali; nessun segreto o dato personale è inserito nel repository o esposto nei risultati. Impostazioni e dati personali esistenti non sono modificati senza accordo.
  - Il README e la documentazione pertinente descrivono l'avvio e le risorse Pi effettive senza indicare procedure o file rimossi; le eventuali limitazioni non verificate sono esplicite.
  - Da ambiente pulito passano `npm ci`, `npm run lint`, `npm run typecheck`, `npm test` e `npm run build`; la CI continua a eseguire il quality gate senza deploy automatico.
- **Outcome:** Test e README allineati all'avvio diretto Pi, senza ripristinare i file rimossi o leggere le impostazioni personali. Verificati regole Git, contratto CI e quality gate da clone pulito; Pi 1.5.0 offline ha superato due prove sintetiche con directory distinte e coincidenti. L'esecuzione remota GitHub e la disponibilità delle risorse personali esterne non sono state verificate. Completato il 2026-11-05.

#### TEC-015 — Gate di chiusura con soli test di unità in memoria

- **Epic:** EPIC-001 — Fondamenta del progetto
- **Type:** Task · **Priority:** P0 · **Status:** Done
- **Branch:** `task/TEC-015-gate-chiusura-test-unita-memoria`
- **Dependencies:** none
- **Requirements:** REQ-NFR-001, REQ-NFR-003, REQ-NFR-008
- **Design references:** PROCESS §8, §9; AGENTS §6, §7; TECHNICAL-DESIGN §8
- **Description:** Rendere rapidi i gate di chiusura (`finish-task`, `merge-task` e push su `main`) limitandoli a test di unità in memoria, in ottica TDD. I test di integrazione ed end-to-end restano, ma si eseguono solo quando servono, item per item, nella chiusura di una versione e nella CI GitHub. Dopo questo item la stessa modifica va riportata, separatamente e senza altri allineamenti, nel template `agile-project-template`.
- **Acceptance criteria:**
  - `docs/PROCESS.md` (Definition of Done e chiusura della versione), `AGENTS.md` §6–§7 e le skill `finish-task`, `merge-task` e `close-version` stabiliscono che i gate di chiusura eseguono solo lint, controllo dei tipi, build e test di unità in memoria; integrazione ed end-to-end si eseguono durante l'item quando servono come prova, mentre `close-version` esegue anche tutte le suite di integrazione.
  - `npm test` esegue solo test di unità in memoria, senza processi figli, file system, git, rete o Docker; i test attuali `pi-gitignore`, `pi-launch`, `secrets` e `start-local` sono riscritti in memoria senza perdere i comportamenti verificati, separando la logica dagli effetti sul sistema dove serve.
  - Le verifiche che non si possono riscrivere in memoria senza perdere ciò che provano sono spostate in una suite separata `npm run test:local`, esclusa dai gate di chiusura; la CI GitHub continua a eseguire tutte le suite, inclusa questa, e il test del contratto della CI è aggiornato.
  - `docs/TECHNICAL-DESIGN.md` §8 e README descrivono i livelli di test, i relativi comandi e quando eseguirli; gli script `npm test` e `build` mantengono il comportamento attuale.
  - Passano `npm ci`, `npm run lint`, `npm run typecheck`, `npm test` e `npm run build`, e tutte le suite separate interessate dalle modifiche, inclusa `npm run test:local`.
- **Outcome:** Gate rapido, unità in memoria e prove locali separate; CI e documentazione aggiornate. Superati `npm ci`, lint, typecheck, unità, build, `test:local`, `test:pi` e tutte le suite Docker (`test:db`, `test:hermes`, `test:author`, `test:upgrade`, `test:start`); workflow GitHub verificato come contratto ma non eseguito da remoto. Gate riportato separatamente nel template con commit locale `b4bc15f`, senza altri allineamenti né push. Completato il 2026-11-06.
- **Nota successiva:** TEC-022 ha verificato che `b4bc15f3a5944330826d9379fef6d60987ec1798` è pubblicato ed è antenato del tag `v1.4.0` del template; gli altri aggiornamenti non sono adottati.

#### TEC-016 — Versionamento del template Pi per lo stato del progetto

- **Epic:** EPIC-001 — Fondamenta del progetto
- **Type:** Task · **Priority:** P2 · **Status:** Done
- **Branch:** `task/TEC-016-versionamento-template-pi-stato-progetto`
- **Dependencies:** TEC-007, TEC-014
- **Requirements:** REQ-NFR-002, REQ-NFR-007, REQ-NFR-009
- **Design references:** PROCESS §3, §6; AGENTS §6, §9; TECHNICAL-DESIGN §8
- **Description:** Rendere condivisibile il template Pi locale `/start`, attualmente ignorato da Git, senza ripristinare il template `/avvio` rimosso né includere dati locali privati.
- **Acceptance criteria:**
  - `.pi/prompts/start.md`, previa revisione del contenuto, è versionato senza segreti o dati personali; il comando `/start` richiede un riepilogo dello stato e delle prossime attività basato sui documenti canonici e un controllo Git in sola lettura, senza avviare lavoro, test, commit, merge o push senza una successiva richiesta esplicita.
  - `.gitignore` consente il versionamento selettivo di `.pi/prompts/start.md` senza includere indiscriminatamente altri prompt, estensioni, sessioni, autenticazione, log, credenziali o dati locali. Il template `/avvio` non viene ripristinato.
  - Verifiche ripetibili con dati sintetici controllano le regole di inclusione ed esclusione usando Git reale e la presenza del template in un checkout pulito; i test pertinenti sono aggiornati e non leggono o modificano impostazioni personali. Il gate rapido resta limitato ai test in memoria; le prove con Git sono nella suite separata.
  - Il README descrive l'uso di `/start`, la fiducia nel progetto e il caricamento o ricaricamento della risorsa in Pi, senza esporre dati personali; l'eventuale prova con Pi reale e i suoi limiti sono documentati.
- **Outcome:** Template `/start` revisionato e versionato con allowlist selettiva, senza ripristinare `/avvio`; documentazione e test aggiornati. Verificati Git reale e clone pulito, caricamento con Pi 1.5.0 offline con e senza fiducia, `npm ci` e gate rapido. La prova Pi non invoca un modello e non verifica l'osservanza delle istruzioni o il ricaricamento interattivo. Completato il 2026-11-06.

#### TEC-017 — Template Pi per lavorare in autonomia

- **Epic:** EPIC-001 — Fondamenta del progetto
- **Type:** Task · **Priority:** P2 · **Status:** Done
- **Branch:** `task/TEC-017-template-pi-lavorare-in-autonomia`
- **Dependencies:** none
- **Requirements:** REQ-NFR-002, REQ-NFR-007, REQ-NFR-010
- **Design references:** PROCESS §3, §6, §8; AGENTS §6, §9; TECHNICAL-DESIGN §8
- **Description:** Aggiungere il template Pi condiviso `/work-alone` per l'attività già avviata: «Implementa l'attività in autonomia. Fermati solo se hai bisogno».
- **Acceptance criteria:**
  - `.pi/prompts/work-alone.md` è versionato e disponibile come `/work-alone`, senza segreti o dati personali; il testo richiede di implementare autonomamente l'attività già avviata e di fermarsi solo quando serve l'intervento dell'utente.
  - Il template richiede di identificare l'item dal branch e dai documenti canonici, rispettandone criteri, processo, verifiche e Definition of Done fino alla chiusura. In assenza di un'attività avviata identificabile univocamente, chiede chiarimenti senza sceglierne o avviarne un'altra; chiede intervento per blocchi, decisioni necessarie e autorizzazioni richieste. Non autorizza merge o push senza richiesta esplicita.
  - `.gitignore` consente selettivamente il nuovo template, mantenendo le esclusioni degli altri dati locali Pi. Verifiche ripetibili con dati sintetici controllano contenuto, regole Git e presenza in un checkout pulito; una prova Pi offline verifica il caricamento del comando senza invocare un modello. Le prove con Git e Pi restano separate dal gate rapido in memoria.
  - README e documentazione pertinente descrivono uso e ricaricamento del comando, fiducia nel progetto e limiti: il template è un'istruzione, non un controllo tecnico che garantisca il comportamento del modello. Test e documentazione non leggono né modificano impostazioni personali o espongono segreti.
- **Outcome:** Template `/work-alone` e allowlist selettiva, con istruzioni di autonomia, richiesta di chiarimenti e divieto di merge o push non autorizzati; documentazione e test aggiornati. Verificati gate rapido, Git reale e clone pulito, caricamento Pi 1.5.0 offline con e senza fiducia. La prova non invoca un modello né verifica l'osservanza delle istruzioni o il ricaricamento interattivo. Completato il 2026-11-06.

#### TEC-018 — Stato di attesa nei tool Pi di domanda

- **Epic:** EPIC-001 — Fondamenta del progetto
- **Type:** Task · **Priority:** P2 · **Status:** Done
- **Branch:** `task/TEC-018-stato-attesa-tool-pi-domanda`
- **Dependencies:** none
- **Requirements:** REQ-NFR-002, REQ-NFR-007, REQ-NFR-011
- **Design references:** PROCESS §3, §6; AGENTS §6, §9; TECHNICAL-DESIGN §8
- **Description:** I tool `question` e `questionnaire` del pacchetto esterno `npm:pi-question-tool@0.1.1` aprono la propria interfaccia con `ctx.ui.custom()` senza l'opzione `blocked`. Pi 1.5.0 continua quindi a segnalare `working` tramite OSC 7501 mentre attende la risposta, e i terminali come Herdr mostrano l'agente al lavoro anziché in attesa. Si sostituisce il pacchetto con un fork adattato, con licenza MIT e attribuzione, nel pacchetto condiviso `git:github.com/toto-castaldi/agent-harness-stuff`.
- **Acceptance criteria:**
  - Il pacchetto `agent-harness-stuff` fornisce i tool `question` e `questionnaire` con nomi, parametri, risultati e comportamento dell'interfaccia di `pi-question-tool@0.1.1`. Mentre attendono la risposta, l'interfaccia è aperta con `blocked: { kind: "question", message }`, dove il messaggio è la domanda o un titolo sintetico senza dati sensibili. Licenza e attribuzione del codice d'origine sono conservate.
  - `.pi/settings.json` rimuove `npm:pi-question-tool`, evitando tool duplicati, e referenzia `agent-harness-stuff` con un tag o commit fissato che contiene la modifica. Commit, tag e push sul repository `agent-harness-stuff` avvengono solo previa autorizzazione esplicita dell'utente.
  - Test ripetibili verificano che entrambi i tool richiedano lo stato `blocked`, tipo `question`, e che lo stato precedente sia ripristinato alla risposta e all'annullamento. Una prova con Pi 1.5.0, documentata con i suoi limiti, verifica il caricamento dei tool senza duplicati e, se possibile, la sequenza OSC 7501 `blocked` emessa durante l'attesa. Le prove con processi, Git o Pi restano separate dal gate rapido in memoria.
  - README e documentazione pertinente descrivono la provenienza dei tool, il riferimento fissato, il relativo aggiornamento e la visualizzazione dell'attesa nei terminali compatibili. Test e documentazione non leggono né modificano impostazioni personali e non espongono segreti.
- **Outcome:** Fork MIT nel pacchetto condiviso al commit `44f36742d47a4e83504abb9bdc0427be5f09ed82`, pubblicato su branch dedicato; configurazione fissata senza tool duplicati e documentazione aggiornata. Superati gate rapido, `test:local`, `test:pi` e `test:pi-package`: confronti con l'originale, ripristino simulato e prova Pi 1.5.0 OSC con risposta e annullamento. La prova reale ripristina `idle` da comandi sintetici, non verifica un turno del modello né ogni terminale. Completato il 2026-11-06.

#### TEC-020 — Dettato vocale Pi su server remoto

- **Epic:** EPIC-001 — Fondamenta del progetto
- **Type:** Task · **Priority:** P2 · **Status:** Done
- **Branch:** `task/TEC-020-dettato-vocale-pi-su-server-remoto`
- **Dependencies:** none
- **Requirements:** REQ-NFR-002, REQ-NFR-007, REQ-NFR-012
- **Design references:** PROCESS §3, §6; AGENTS §6, §9; TECHNICAL-DESIGN §8
- **Description:** Pi Voice registra l'audio sul server dove gira Pi. Su un server remoto senza schede audio, come quello usato via SSH e Herdr, il dettato fallisce con `DeviceUnavailable: no input device is available`. Si inoltra il socket Pulse del client Ubuntu (PipeWire con `pipewire-pulse`) come socket Unix tramite `RemoteForward`. Sul server ALSA è instradato verso Pulse (`libasound2-plugins`, `~/.asoundrc`) e `PULSE_SERVER` punta al socket inoltrato. Si aggiungono procedura documentata e script di diagnosi.
- **Acceptance criteria:**
  - La documentazione descrive, per server e client Ubuntu:
    - pacchetti di sistema (`libasound2-plugins`, `pulseaudio-utils`);
    - `StreamLocalBindUnlink yes` in `sshd` per i socket rimasti da connessioni interrotte;
    - `~/.asoundrc` con dispositivo predefinito Pulse e `PULSE_SERVER` sul socket inoltrato in un percorso stabile;
    - `RemoteForward` in `~/.ssh/config` del client;
    - verifica con `pactl info` e una breve registrazione.

    Sono documentati anche i limiti: tunnel legato alla connessione SSH, riavvio dei processi Pi già aperti in Herdr, nessuna porta TCP e accesso al socket limitato all'utente. I comandi amministrativi sono indicati come tali e li esegue l'operatore.
  - Uno script versionato, in sola lettura, controlla sul server:
    - presenza del plugin ALSA Pulse e di `pactl`;
    - configurazione ALSA predefinita;
    - `PULSE_SERVER` impostato;
    - esistenza e raggiungibilità del socket;
    - presenza di una sorgente audio.

    Per ogni passo mancante indica il rimedio, senza installare pacchetti, modificare file o registrare audio. L'output non riporta segreti, dati personali o nomi di dispositivi oltre al necessario.
  - La logica di valutazione dello script è separata dagli effetti sul sistema e coperta da test di unità in memoria con esiti sintetici, inclusi i casi di successo e di ciascun passo mancante. Eventuali prove con processi o file system restano fuori dal gate rapido.
  - Prova reale sull'ambiente dell'operatore, documentata senza dati personali: con il tunnel attivo, lo script segnala tutti i passi soddisfatti e il dettato Pi Voice (`Ctrl+Space`) trascrive in una sessione Pi dentro Herdr. Dopo una riconnessione SSH il dettato funziona di nuovo senza interventi manuali sul socket.
  - I file personali di Pi Voice (`.pi/pi-voice.json`, log) restano esclusi da Git e non vengono modificati per la soluzione. Passano `npm run lint`, `npm run typecheck`, `npm test` e `npm run build`.
- **Outcome:** Procedura in `docs/operations/TEC-020-dettato-vocale-remoto.md`, `npm run voice:diagnose` in sola lettura con valutazione separata e coperta da test unitari in memoria, e `npm run voice:setup` idempotente per la configurazione del server con `sudo` solo per pacchetti e sshd. Verificato che il registratore di Pi Voice apre il dispositivo tramite ALSA e accetta solo `PULSE_SERVER` di forma `unix:`; la diagnosi evita la creazione del cookie Pulse. Prova simulata con PulseAudio estratto e sorgente sintetica; prova reale dell'operatore con PipeWire e Herdr: diagnosi tutta soddisfatta, dettato riuscito in Pi e di nuovo dopo la riconnessione SSH senza riavvio. Superati gate rapido e `test:local`. Completato il 2026-11-07.

#### TEC-021 — Avvio locale con configurazione collegata

- **Epic:** EPIC-001 — Fondamenta del progetto
- **Type:** Task · **Priority:** P1 · **Status:** Done
- **Branch:** `task/TEC-021-avvio-configurazione-collegata`
- **Dependencies:** TEC-009
- **Requirements:** REQ-AGENT-003, REQ-NFR-002
- **Design references:** TECHNICAL-DESIGN §7, §9
- **Description:** Consentire l'avvio locale quando `.env` è un collegamento simbolico a una configurazione privata, senza sostituire il collegamento né indebolire la protezione dei segreti.
- **Acceptance criteria:**
  - L'avvio accetta `.env` come file regolare o collegamento simbolico a un file regolare privato, verificando il file effettivamente letto; rifiuta destinazioni mancanti, non regolari o accessibili a gruppo o altri senza esporre dati sensibili.
  - La protezione degli altri file segreti resta invariata; configurazione, collegamento, dati e credenziali esistenti non vengono modificati o eliminati dall'avvio.
  - Test in memoria e prove separate con file e collegamenti sintetici verificano successo, destinazioni non valide e permessi; la documentazione descrive il comportamento e i suoi limiti.
- **Outcome:** `.env` può essere un link a un file regolare privato, verificato e letto dallo stesso descrittore; i segreti separati continuano a rifiutare link. Superati gate rapido, `test:local` con file sintetici e `test:start` su stack Docker isolato con link, persistenza e migrazioni. Le ACL e modifiche concorrenti in loco restano fuori dai controlli; nessuna prova con servizi Meta/OpenRouter reali. Completato il 2026-11-07.

#### TEC-022 — Tracciabilità e aggiornamento dal template

- **Epic:** EPIC-001 — Fondamenta del progetto
- **Type:** Task · **Priority:** P2 · **Status:** Done
- **Branch:** `task/TEC-022-tracciabilita-aggiornamento-template`
- **Dependencies:** none
- **Requirements:** REQ-NFR-002, REQ-NFR-013
- **Design references:** PROCESS §3, §6; TECHNICAL-DESIGN §10
- **Description:** Rendere esplicita e verificabile l'origine da `https://github.com/toto-castaldi/agile-project-template` e predisporre una procedura manuale per valutare futuri aggiornamenti. L'adozione delle novità del template è esclusa da questa attività e richiede una decisione separata.
- **Acceptance criteria:**
  - Una registrazione versionata nel progetto indica URL e riferimenti pertinenti del template con commit completi e, se disponibili, tag; distingue per risorsa o gruppo la base effettivamente adottata dall'ultima versione solo confrontata. Le basi non ricostruibili e i riferimenti non verificabili sono esplicitamente dichiarati, senza attribuire al progetto una versione non dimostrata; un clone pulito conserva tali informazioni senza dipendere da remote Git locali.
  - Un inventario distingue risorse condivise dal template, risorse personalizzate dello studio e relative divergenze, incluse `docs/PROCESS.md` e le skill. Il confronto considera anche il ritorno parziale di TEC-015 e segnala l'eventuale disallineamento del processo rispetto alla regola nell'introduzione di `PROCESS`, proponendo come risolverlo senza modificarlo silenziosamente.
  - Una procedura documentata spiega come reperire un riferimento preciso del template, confrontarlo con le basi note e con il progetto, gestire basi sconosciute e divergenze, valutare gli aggiornamenti e registrare separatamente confronto e adozione. Non prevede sovrascritture o merge automatici; l'eventuale adozione segue il processo del progetto e richiede una decisione separata.
  - Una prova ripetibile in un ambiente isolato, con un clone pulito e riferimenti di prova, verifica la reperibilità delle informazioni versionate e il confronto, anche in presenza di personalizzazioni e di una base sconosciuta; non modifica il working tree o i dati personali dell'operatore. Le prove con Git, filesystem o rete restano separate dai test unitari in memoria del gate rapido.
  - La documentazione e le evidenze non contengono segreti o dati personali; non vengono adottate novità del template né modificati o pubblicati il repository del template o le configurazioni personali. Il riferimento alla modifica TEC-015 non è presentato come pubblicato senza verifica.
- **Outcome:** Registrazione delle basi verificabili, inventario delle divergenze e procedura manuale senza adozione automatica; verificati pubblicazione del riporto TEC-015 e riferimento `v1.4.0`, con basi sconosciute esplicite. Superati `test:local` con clone pulito e confronti sintetici, lint, typecheck, unità e build. Nessuna modifica o pubblicazione del template; l'eventuale allineamento del processo richiede decisione separata. Completato il 2026-11-07.

#### TEC-023 — Adozione del template v1.4.0

- **Epic:** EPIC-001 — Fondamenta del progetto
- **Type:** Task · **Priority:** P2 · **Status:** Done
- **Branch:** `task/TEC-023-adozione-template-v1-4-0`
- **Dependencies:** TEC-022
- **Requirements:** REQ-NFR-002, REQ-NFR-007, REQ-NFR-008, REQ-NFR-013, REQ-NFR-014
- **Design references:** PROCESS §3, §4, §6, §7, §8; TECHNICAL-DESIGN §3, §8, §10; `docs/TEMPLATE-ORIGIN.md`
- **Description:** Adottare il processo, le skill e il visualizzatore Pi dal template `agile-project-template` tag `v1.4.0`, commit `e16bbec69c067bc9432bc588acd0d232716f3dbf`, con un solo modulo architetturale Agente. TEC-022 ha preparato il confronto ma non ha adottato gli aggiornamenti. Se si intende scegliere un riferimento più recente, concordarlo prima con l'utente.
- **Acceptance criteria:**
  - `docs/PROCESS.md` e le skill condivise sono confrontati e allineati al riferimento fissato, incluse le regole sui moduli; i requisiti, le protezioni e il gate rapido dello studio restano validi. Eventuali conflitti o deroghe sono sottoposti all'utente e registrati esplicitamente, senza sovrascrivere le personalizzazioni di progetto o modificarle silenziosamente.
  - `docs/TECHNICAL-DESIGN.md` §3 documenta il solo `MOD-001 — Agente`: soluzione dell'assistente dello studio, con componenti applicativi, dati e integrazioni nel repository corrente. `US-003`, `US-004` e `TEC-019` riportano tale modulo; `TEC-020`, `TEC-008` e `TEC-023` restano senza modulo in quanto trasversali. Gli item `Done` non sono riclassificati; `STATUS.md` riflette i moduli degli item visualizzati secondo il processo adottato.
  - L'estensione Pi del template è revisionata e disponibile in un progetto attendibile come `/backlog` e con la scorciatoia predefinita; permette di navigare gli item, anche non assegnati, scorrerne il contenuto e chiudere la vista. La scorciatoia può essere configurata o disattivata; la vista ricarica il backlog all'apertura e non modifica file. Casi di backlog assente o vuoto sono segnalati chiaramente.
  - `.gitignore` consente selettivamente il versionamento dell'estensione revisionata, senza includere indiscriminatamente altre estensioni, impostazioni personali, sessioni, autenticazione, log o segreti. Le personalizzazioni e le risorse Pi esistenti non sono sostituite o modificate senza accordo.
  - Test ripetibili con dati e configurazioni sintetici verificano struttura e navigazione del backlog, aggiornamento alla riapertura, errori, scorciatoia e sola lettura; una prova Pi 1.5.0 isolata verifica caricamento e uso dell'estensione in TUI, documentandone i limiti. Le prove con file, processi o Pi restano separate dal gate in memoria e non leggono né modificano impostazioni personali; sono aggiornati i controlli Git e CI pertinenti.
  - README e documentazione pertinente descrivono uso, fiducia nel progetto, ricaricamento, configurazione della scorciatoia e limiti. `docs/TEMPLATE-ORIGIN.md` registra per risorsa il riferimento effettivamente adottato e le eventuali divergenze o basi ignote, distinguendolo dai confronti; non si modificano né pubblicano il repository del template o dati personali.
- **Decision:** Su accordo dell'utente (2026-11-07), «unassigned» nella regola del modulo di PROCESS v1.4.0 significa privo di modulo, non privo di versione: TEC-019 può avere `MOD-001` senza essere assegnato a una versione. L'interpretazione è coerente con la skill `add-item` del template.
- **Outcome:** Adottati processo e skill v1.4.0 senza divergenze, modulo Agente e visualizzatore Pi revisionato con adattamenti documentati. Superati confronto dei file, `test:local`, `test:pi` con TUI Pi 1.5.0 isolata e gate rapido; la prova TUI non copre ogni terminale o dimensione né un turno reale del modello. Completato il 2026-11-07.

#### TEC-024 — Adozione del template v1.5.0

- **Epic:** EPIC-001 — Fondamenta del progetto
- **Module:** MOD-001 — Agente
- **Type:** Task · **Priority:** P2 · **Status:** Done
- **Branch:** `task/TEC-024-adozione-template-v1-5-0`
- **Dependencies:** TEC-023
- **Requirements:** REQ-NFR-002, REQ-NFR-007, REQ-NFR-008, REQ-NFR-010, REQ-NFR-013, REQ-NFR-014, REQ-NFR-015
- **Design references:** PROCESS §3, §4, §6, §7, §8; TECHNICAL-DESIGN §3, §8, §10; `docs/TEMPLATE-ORIGIN.md`
- **Description:** Adottare processo, skill e visualizzatore Pi del template `agile-project-template` tag `v1.5.0`, commit `0cea2fd0ee138edbb845a01aa6bced2872145d2a`, a partire dalla base adottata con TEC-023. Attivare gli shared claims e mantenere le personalizzazioni e le protezioni dello studio; non aggiornare il template indiscriminatamente.
- **Acceptance criteria:**
  - Processo e skill condivise sono confrontati e allineati al riferimento fissato; eventuali conflitti o deroghe sono concordati e registrati, senza sovrascrivere le personalizzazioni dello studio. `AGENTS.md` attiva gli shared claims secondo il processo adottato, mantenendo invariati sicurezza e gate rapido.
  - Prima di avviare un item `Todo` si controllano i branch locali e remoti dopo il fetch previsto; un branch corrispondente o un errore di fetch sono segnalati e gestiti secondo il processo. Il branch item è pubblicato ai cambi di stato previsti; un push fallito e l'assenza di `origin` sono gestiti e segnalati secondo il processo. I claim non costituiscono un blocco atomico tra avvii concorrenti. Merge e push su `main` non sono automatici.
  - `/work-alone` e la documentazione pertinente sono allineati a REQ-NFR-010: sono consentiti solo i push del branch item previsti dagli shared claims ai cambi di stato; gli altri push e i merge richiedono una richiesta esplicita. I template restano istruzioni, non garanzie tecniche.
  - Il visualizzatore Pi aggiornato mantiene gli item non assegnati, inclusi quelli su una riga, e i metadati epic già supportati; consente filtri per tipo, priorità e stato, navigazione tra risultati e consultazione degli stati dai branch locali e remote-tracking non integrati, con indicazione della provenienza e dei conflitti. All'apertura usa i riferimenti disponibili e aggiorna la vista dopo il fetch in background; errori e limiti sono visibili. Non modifica i file di lavoro; il fetch può aggiornare o rimuovere riferimenti remoti locali.
  - Test ripetibili con repository, branch e remoti sintetici verificano risoluzione degli stati, precedenza e branch multipli, filtri e navigazione, fetch riuscito o fallito e assenza di modifiche ai file di lavoro, oltre alle personalizzazioni già esistenti. Una prova Pi isolata verifica caricamento e uso dell'estensione e documenta i limiti. Le prove con Git, rete locale, processi o Pi restano separate dal gate in memoria e non leggono né modificano configurazioni personali.
  - Test o prove isolate con remoti sintetici verificano il flusso degli shared claims, inclusi branch esistente, fetch o push fallito e assenza di `origin`, senza pubblicare branch reali. README e documentazione pertinente descrivono filtri, fetch, gestione dei claim, effetti sui riferimenti Git e limiti; `docs/TEMPLATE-ORIGIN.md` distingue le risorse effettivamente adottate dalle divergenze e dai confronti. Non si modificano né pubblicano il repository del template o dati personali.
- **Outcome:** Adottati processo e skill v1.5.0, shared claims e visualizzatore con filtri e stati dai branch, preservando gli adattamenti dello studio. Superati confronto del riferimento fissato, gate rapido, `test:local` con remoti sintetici e `test:pi` con TUI isolata; i claim non sono atomici e la prova Pi non copre tutti i terminali né un turno del modello. Completato il 2026-11-07.

### EPIC-002 — Agente e integrazioni

#### BUG-001 — Avviso del canale home inviato agli utilizzatori

- **Epic:** EPIC-002 — Agente e integrazioni
- **Type:** Bug · **Priority:** P0 · **Status:** Done
- **Branch:** `fix/BUG-001-avviso-canale-home`
- **Dependencies:** none
- **Requirements:** REQ-WA-001, REQ-WA-002, REQ-WA-003, REQ-NFR-002, REQ-NFR-005
- **Design references:** TECHNICAL-DESIGN §3, §6, §7, §9
- **Found in:** v0.2.0 (sviluppo, dopo TEC-012)
- **Steps to reproduce:** con lo stack avviato e un numero autorizzato, inviare via WhatsApp un messaggio qualsiasi (ad esempio «ciao») senza canale home impostato.
- **Expected:** l'utilizzatore riceve solo la risposta dell'agente; il canale home è già definito dalla configurazione.
- **Actual:** Hermes invia anche «📬 No home channel is set for Whatsapp_Cloud… Type /sethome to make this chat your home channel», invitando a un comando con cui qualunque utilizzatore potrebbe dirottare i messaggi del canale home. L'harness di TEC-012 filtra l'avviso, mascherando il difetto.
- **Acceptance criteria:**
  - L'operatore imposta il canale home WhatsApp nella configurazione esterna (`.env`) con un numero dell'elenco autorizzato; `.env.example` contiene solo un valore sintetico e README spiega l'impostazione. La soluzione usa il meccanismo supportato da Hermes 0.22.7 (variabile o `home_channel` di configurazione); eventuali adattamenti a punti interni sono documentati e richiedono nuova verifica agli aggiornamenti.
  - L'avvio locale fallisce con un messaggio fisso, senza riportare il numero, se il canale home manca o non è nell'elenco autorizzato.
  - Con il canale configurato nessun utilizzatore riceve l'avviso né suggerimenti di `/sethome`, alla prima conversazione e dopo riavvio o ricreazione del gateway; `/sethome` inviato da un utilizzatore non modifica il canale home configurato. I job cron restano disabilitati fino a TEC-019.
  - Un test di regressione con gateway reale, webhook firmato e dati sintetici verifica che i messaggi inviati al sostituto Meta non contengano l'avviso e che `/sethome` non cambi il canale; il filtro dell'avviso nell'harness di TEC-012 è rimosso, così gli scenari falliscono se riappare.
  - Log e output rispettano REQ-NFR-002; `docs/TECHNICAL-DESIGN.md` descrive la scelta.
- **Outcome:** Canale home privato e validato, `/sethome` bloccato, cron del gateway disabilitati e filtro dell'harness rimosso. Verificati gateway reale con webhook firmati, sostituti Meta e modello sintetici, riavvio e ricreazione, cron scaduto, privacy dei log, avvio e upgrade isolati; nessuna nuova prova Meta/OpenRouter reale né accettazione privacy. Completato il 2026-11-06.

#### TEC-025 — Contesto per interlocutore e compattazione automatica

- **Epic:** EPIC-002 — Agente e integrazioni
- **Module:** MOD-001 — Agente
- **Type:** Task · **Priority:** P1 · **Status:** Done
- **Branch:** `task/TEC-025-contesto-interlocutore-compattazione`
- **Dependencies:** TEC-011, BUG-001
- **Requirements:** REQ-AGENT-004, REQ-WA-003, REQ-STUDIO-003, REQ-OPS-002, REQ-NFR-002, REQ-NFR-005
- **Design references:** TECHNICAL-DESIGN §6, §7, §10
- **Description:** Ogni interlocutore deve avere un contesto separato con il modello, compattato automaticamente quando raggiunge il 40% della finestra del modello configurato e quando la conversazione riprende dopo un'inattività configurabile, con valore predefinito di 4 ore. Hermes v0.22.7 offre la compressione del contesto (`compression` in `config.yaml`), ma per le finestre inferiori a 512K token alza la soglia percentuale ad almeno 0.75 e invia sempre agli utilizzatori gli avvisi di errore. Occorre quindi ricavare la soglia dal modello effettivo con un meccanismo supportato, come `threshold_tokens`, e mantenere la compattazione silenziosa.
- **Acceptance criteria:**
  - Ogni numero autorizzato ha una sessione distinta: una prova con due mittenti sintetici verifica che i contenuti di uno non entrino nel contesto dell'altro, anche dopo la compattazione.
  - La compattazione automatica si attiva quando il contesto raggiunge il 40% della finestra del modello configurato, anche per le finestre inferiori a 512K token. La finestra è ricavata per il modello effettivo, senza valori fissati per un modello; cambiando `PILATES_MODEL` la soglia si aggiorna al successivo avvio. Se la finestra non è determinabile, il comportamento è documentato e non adotta silenziosamente una soglia superiore al 40%.
  - L'intervallo di inattività è configurabile nella configurazione esterna, con valore predefinito di 4 ore; `.env.example` e README lo documentano e l'avvio rifiuta valori non validi con un messaggio fisso. Alla ripresa oltre l'intervallo, il contesto è compattato prima di elaborare il nuovo messaggio.
  - Dopo la compattazione l'agente conserva `SOUL.md`, data e ora per richiesta e i turni recenti necessari, e prosegue correttamente: la compattazione non modifica il database e le registrazioni successive mantengono l'autore ricavato dal sistema.
  - Gli utilizzatori non ricevono avvisi di avvio, completamento o errore della compattazione. Una prova di regressione con gateway reale, webhook firmato, sostituto Meta e dati sintetici lo verifica anche forzando un errore; il comportamento del turno in caso di errore è documentato.
  - Riassunti e cronologia restano nel volume SQLite di Hermes, persistono a riavvio e ricreazione, sono inclusi nel backup e non compaiono nei log (REQ-NFR-002).
  - Test in memoria coprono il calcolo della soglia e la validazione della configurazione. Una prova di integrazione con gateway reale, modello sintetico con finestra ridotta e inattività simulata verifica entrambe le attivazioni. Gli eventuali adattamenti a punti interni di Hermes sono documentati in `docs/TECHNICAL-DESIGN.md` e richiedono nuove verifiche agli aggiornamenti.
- **Decision:** Su accordo dell'utente (2026-11-07): l'avvio fallisce se la finestra del modello non è determinabile; i riassunti usano lo stesso modello; i turni protetti seguono i valori predefiniti di Hermes; se il riassunto fallisce il turno prosegue senza avvisi; alla ripresa non si compatta se non c'è nulla da riassumere; l'intervallo è `PILATES_IDLE_COMPACT_SECONDS` in secondi.
- **Outcome:** Soglia del 40% ricavata all'avvio dal catalogo del modello configurato, con blocco se non determinabile, e compattazione alla ripresa misurata dalla trascrizione persistita; riassunti con lo stesso modello e senza avvisi agli utilizzatori. Superati gate rapido, `test:compaction` (soglia, ripresa dopo riavvio e ricreazione, errore forzato, isolamento, autore, persistenza, backup, log) e le suite `test:local`, `test:db`, `test:hermes`, `test:author`, `test:upgrade` e `test:start`. Sullo stack reale la soglia ricavata coincide con il 40% della finestra del modello configurato; non è stata provocata una compattazione con il modello reale. Completato il 2026-11-07.

#### US-005 — Nome dell'agente

- **Epic:** EPIC-002 — Agente e integrazioni
- **Module:** MOD-001 — Agente
- **Type:** User Story · **Priority:** P1 · **Status:** Done
- **Branch:** `us/US-005-nome-agente`
- **Dependencies:** TEC-011, TEC-012
- **Requirements:** REQ-AGENT-005, REQ-STUDIO-003, REQ-NFR-002, REQ-NFR-005, REQ-NFR-006
- **Design references:** TECHNICAL-DESIGN §6, §8
- **Description:** Come titolare o collaboratore, voglio che l'agente abbia un nome con cui si presenta e risponde, così da riconoscerlo e rivolgermi a lui in modo naturale. Oggi, alla domanda «come ti chiami tu?», l'agente risponde di essere l'assistente dello studio Pilates, di non avere un nome specifico e di poter essere chiamato come si preferisce.
- **Acceptance criteria:**
  - All'avvio dell'item il nome è concordato con l'utente e registrato in REQ-AGENT-005. È definito solo in `hermes/SOUL.md`, senza duplicazioni nel codice né in altre configurazioni (AGENTS §5).
  - Alle domande sul nome o sull'identità, ad esempio «come ti chiami?» o «chi sei?», l'agente risponde con il proprio nome. Non dice di non averne uno e non invita a sceglierne un altro. Il nome è lo stesso per mittenti diversi e nei turni successivi.
  - Nella prima risposta di una conversazione senza turni precedenti l'agente si presenta brevemente con il nome e risponde comunque alla richiesta. Nei messaggi successivi della stessa conversazione non si ripresenta e non firma i messaggi.
  - Il nome non modifica ruolo, regole di comportamento, privilegi né attribuzione dell'autore. I comportamenti degli scenari esistenti restano invariati.
  - Le modifiche a `SOUL.md` raggiungono le sessioni già aperte secondo il meccanismo documentato di TEC-011, senza intervento manuale sulle sessioni.
  - Gli scenari con la domanda sul nome, il primo messaggio di una conversazione nuova e un messaggio successivo senza ripresentazione sono aggiunti al catalogo di TEC-012. Vengono eseguiti con il modello reale e l'esito viene registrato. La verifica locale di `SOUL.md` controlla la presenza del nome e l'assenza di segreti e dati reali.
  - Il nome visualizzato del profilo WhatsApp Business su Meta resta fuori scope e non viene modificato.
- **Outcome:** Nome Ambrogio e istruzioni di presentazione in `SOUL.md`; scenari per due interlocutori sintetici e controlli locali aggiornati. Superati gate rapido, `test:local`, `test:author`, `test:start` e i 14 scenari con OpenRouter reale e sostituto Meta; refresh delle sessioni verificato con modello sintetico. I controlli conversazionali sono lessicali e i due interlocutori sono provati in stack separati; nessuna nuova prova Meta reale o accettazione privacy. Completato il 2026-11-07.

### EPIC-003 — Dati e operatività

#### TEC-026 — Applicare la configurazione locale da `.env`

- **Epic:** EPIC-003 — Dati e operatività
- **Module:** MOD-001 — Agente
- **Type:** Task · **Priority:** P1 · **Status:** Done
- **Branch:** `task/TEC-026-applicare-configurazione-locale`
- **Dependencies:** TEC-009, TEC-021, TEC-010, BUG-001
- **Requirements:** REQ-AGENT-003, REQ-AGENT-006, REQ-DB-002, REQ-WA-002, REQ-WA-003, REQ-NFR-002
- **Design references:** TECHNICAL-DESIGN §3, §5, §7, §9, §10
- **Description:** Usare `.env` privato come unica fonte operativa per configurazione e credenziali esterne dello stack locale, senza richiedere all'operatore di aggiornare copie o file di segreti. La rotazione delle password PostgreSQL resta fuori scope e viene segnalata se necessaria.
- **Acceptance criteria:**
  - Modificando solo `.env` e rilanciando `npm run start:local`, aggiunte e rimozioni di numeri autorizzati, cambio del canale home e modifiche valide alle credenziali e impostazioni WhatsApp/OpenRouter vengono applicati senza modifiche manuali a file intermedi. Broker e gateway usano entrambi i valori aggiornati, anche dopo riavvio o ricreazione e sostituzione del file di configurazione; il canale home deve restare nella lista autorizzata. L'avvio non modifica le impostazioni presso Meta o OpenRouter né dichiara verificata la validità esterna dei token.
  - Una configurazione assente, non valida o non privata è rifiutata senza esporne i valori. Una differenza nelle password PostgreSQL esistenti arresta l'avvio prima di applicare le altre modifiche, senza cambiare password nel database o nei file; credenziali interne generate, dati e volumi sono conservati. Non vengono esposte all'agente credenziali amministrative o di migrazione, né montato l'intero `.env` nell'agente.
  - Su errori o aggiornamenti parziali il comando non dichiara riuscita e non lascia gateway e broker attivi con liste di autorizzazione discordanti; l'eventuale indisponibilità e il recupero sono documentati. Gli accessi, l'autenticazione webhook e le protezioni di REQ-NFR-002 rimangono applicati; segreti, messaggi e numeri non compaiono nei log o nell'output.
  - Test unitari in memoria verificano configurazione, applicazione e casi di errore con dati sintetici. Prove separate con Docker e PostgreSQL reale verificano primo avvio, modifiche, riavvio, persistenza, configurazione `.env` anche tramite link privato, password database discordante e fallimenti; con gateway e broker reali, webhook firmati e sostituti sintetici verificano che un mittente aggiunto sia ammesso, uno rimosso sia respinto e i valori applicati siano coerenti in entrambi i servizi. Non servono credenziali o chiamate reali Meta/OpenRouter.
  - README, eventuali esempi e design spiegano la fonte unica, le modifiche applicabili, i limiti della rotazione PostgreSQL, il comportamento in caso di errore e l'eventuale interruzione dei turni; le prove non leggono né modificano configurazioni reali dell'operatore.
- **Outcome:** Configurazione esterna applicata da `.env`, con arresto e ricreazione coordinati di gateway e broker, senza rotazione delle credenziali database o interne. Verificati unità, `test:local`, `test:start` su PostgreSQL e gateway/broker reali con webhook firmati e sostituti sintetici, `test:author` e gate rapido; le prove coprono aggiornamenti, mittenti aggiunti e rimossi, divergenze database, errore e recupero. Un guasto Docker può richiedere arresto manuale; validità esterna dei token e Meta/OpenRouter reali non sono verificate. Completato il 2026-11-07.

### EPIC-004 — Pianificazione delle lezioni

**Scope:** regole di allenamento settimanali dei clienti, anagrafica minima dei clienti, consultazione della pianificazione, contesto dell'agente e verifica del comportamento conversazionale.

#### SPIKE-002 — Identità del mittente e contesto dell'agente

- **Epic:** EPIC-004 — Pianificazione delle lezioni
- **Type:** Spike · **Priority:** P0 · **Status:** Done
- **Branch:** `spike/SPIKE-002-identita-mittente-contesto-agente`
- **Dependencies:** none
- **Requirements:** REQ-STUDIO-003, REQ-STUDIO-004, REQ-NFR-002, REQ-NFR-005
- **Design references:** TECHNICAL-DESIGN §3, §5, §6, §7, §10
- **Description:** Stabilire come l'autore delle modifiche venga ricavato dal mittente WhatsApp senza che il modello possa dichiararlo o alterarlo, e come fornire all'agente un contesto versionato.
- **Acceptance criteria:**
  - Un rapporto in `docs/spikes/` documenta, per Hermes 0.22.7 e il gateway WhatsApp Cloud nativo, se e come il numero del mittente e il nome del profilo WhatsApp siano disponibili ai tool del plugin, e se derivino dal messaggio autenticato.
  - Il rapporto propone un meccanismo con cui l'autore registrato nel database è ricavato dal sistema e non è falsificabile dal modello, neppure con SQL costruito ad arte nella singola istruzione (ad esempio tramite impostazioni di sessione, trigger o parametri iniettati dal plugin); confronta le alternative con rischi e costi, incluse eventuali modifiche al gateway.
  - Il rapporto indica come Hermes carichi il file `SOUL.md` versionato nel progetto (posizione in `HERMES_HOME`, copia nell'immagine o montaggio in sola lettura, controlli anti-injection), come fornire data corrente e fuso orario Europe/Rome, come le modifiche raggiungano le sessioni già aperte e come il file interagisca con la memoria e le sessioni SQLite di Hermes; il file deve persistere tra riavvii e aggiornamenti.
  - Una prova locale con webhook e dati sintetici dimostra la propagazione dell'identità fino al plugin e verifica che numeri, nomi e messaggi non compaiano nei log (REQ-NFR-002).
  - Il rapporto contiene raccomandazioni per TEC-010, TEC-011 e US-002 e non include segreti né dati reali; il codice esplorativo non viene integrato.
- **Outcome:** Rapporto su identità autenticata, contesto database protetto, `SOUL.md` e sessioni; prove sintetiche del gateway e su PostgreSQL reale, con limiti e raccomandazioni per gli item successivi. Quality gate superato dopo il ripristino delle risorse Pi condivise. Completato il 2026-11-05.

#### TEC-010 — Schema della pianificazione settimanale

- **Epic:** EPIC-004 — Pianificazione delle lezioni
- **Type:** Task · **Priority:** P0 · **Status:** Done
- **Branch:** `task/TEC-010-schema-pianificazione-settimanale`
- **Dependencies:** SPIKE-002
- **Requirements:** REQ-DB-001, REQ-DB-002, REQ-STUDIO-001, REQ-STUDIO-002, REQ-STUDIO-003, REQ-STUDIO-005, REQ-NFR-005
- **Design references:** TECHNICAL-DESIGN §4, §5, §8, §10
- **Description:** Introdurre con migrazioni Prisma le tabelle di dominio per clienti e regole di allenamento, con privilegi dell'agente che impediscono cancellazione e riscrittura delle regole e un autore non falsificabile secondo il meccanismo raccomandato da SPIKE-002.
- **Acceptance criteria:**
  - Una migrazione versionata crea nello schema `app` i clienti (nome, cognome, univoci senza distinzione tra maiuscole e minuscole, data e autore di creazione), le regole (testo pulito, data di inserimento, autore, data, autore e motivo di disattivazione), gli slot settimanali della regola (giorno ISO 1–7 e ora di inizio) e il legame N:N tra regole e clienti; vincoli e controlli impediscono giorni non validi e stati di disattivazione incoerenti.
  - L'autore è composto dal numero WhatsApp del mittente e dal nome del profilo, facoltativo, ed è impostato dal sistema secondo SPIKE-002; un valore fornito dal modello non viene accettato.
  - Il ruolo dell'agente può leggere e inserire clienti, regole, slot e legami; sulla tabella delle regole non ha `DELETE` e può aggiornare solo i campi di disattivazione, una sola volta; sulle altre tabelle mantiene il DML previsto da REQ-DB-002 e il DDL resta rifiutato.
  - Test su PostgreSQL reale verificano migrazione da uno stato pulito e dallo schema della v0.1.0, vincoli, unicità dei clienti, rifiuto di `DELETE` e di riscrittura delle regole, autore non falsificabile e rifiuto del DDL, con soli dati sintetici.
  - `docs/TECHNICAL-DESIGN.md` §4 descrive il modello dati e §5 le invarianti introdotte.
- **Outcome:** Migrazione, vincoli e privilegi per clienti, regole, slot e legami; broker isolato e propagazione dell'autore da webhook WhatsApp firmati, con rifiuto di falsificazioni e replay. Verificati upgrade dalla v0.1.0, PostgreSQL reale, turni concorrenti con gateway reale e modello sintetico, avvio, recupero e quality gate; nessuna nuova prova Meta/OpenRouter reale. Completato il 2026-11-05.

#### TEC-011 — Contesto dell'agente dello studio

- **Epic:** EPIC-004 — Pianificazione delle lezioni
- **Type:** Task · **Priority:** P0 · **Status:** Done
- **Branch:** `task/TEC-011-contesto-agente-studio`
- **Dependencies:** SPIKE-002, TEC-010
- **Requirements:** REQ-STUDIO-001, REQ-STUDIO-002, REQ-STUDIO-004, REQ-STUDIO-005, REQ-NFR-002, REQ-NFR-005
- **Design references:** TECHNICAL-DESIGN §3, §6, §7, §9, §10
- **Description:** Fornire all'agente un file `SOUL.md` versionato nel progetto (ad esempio `hermes/SOUL.md`) e usato da Hermes, che lo renda l'assistente dello studio Pilates. Le regole di comportamento, come i limiti delle fasce orarie, stanno in questo file.
- **Acceptance criteria:**
  - Il file `SOUL.md` è versionato nel repository, senza segreti né dati reali, ed è quello caricato da Hermes in locale e in produzione, senza copie modificate a mano; persiste tra riavvii e aggiornamenti, le sue modifiche si applicano con il normale aggiornamento e la documentazione indica quando raggiungono le sessioni già aperte.
  - `SOUL.md` definisce il ruolo di assistente per titolare e collaboratori, la lingua italiana, risposte brevi adatte a WhatsApp, la data corrente con fuso orario Europe/Rome e le fasce orarie fisse: mattina dalle 06:00 alle 12:59, pomeriggio dalle 13:00 alle 17:59, sera dalle 18:00 in poi, salvo diversa decisione registrata.
  - `SOUL.md` descrive lo schema di TEC-010 e le politiche: testo delle regole pulito e comprensibile, derivazione dei dati strutturati, scomposizione decisa dall'agente, riconoscimento dei clienti per nome con richiesta del cognome se ambiguo o mancante, conferma solo in caso di ambiguità, disattivazione autonoma comunicata con motivo, nessuna cancellazione o riscrittura, risposte basate sulle sole regole attive.
  - I toolset non necessari restano disabilitati e l'agente non riporta numeri di telefono nelle risposte se non richiesto.
  - Le regole di comportamento, inclusi i limiti delle fasce, non sono duplicate nel codice o nella configurazione. Un test automatico verifica che `SOUL.md` sia incluso nell'immagine o nel volume Hermes previsto, che citi tabelle e colonne esistenti nella migrazione e che non contenga segreti; README e design descrivono come modificarlo.
- **Outcome:** `SOUL.md` versionato e montato in sola lettura, refresh delle sessioni all'avvio, orologio Europe/Rome effimero per richiesta e memoria disabilitata; avvio locale ricrea il solo gateway. Verificati schema e mount, refresh e ricreazione con gateway Hermes e modello sintetico, transizioni di mezzanotte e ora legale, persistenza e quality gate. Nessuna nuova prova con Meta/OpenRouter reali; comportamento conversazionale demandato a TEC-012 e alle User Story. Completato il 2026-11-06.

#### TEC-012 — Scenari conversazionali e harness

- **Epic:** EPIC-004 — Pianificazione delle lezioni
- **Type:** Task · **Priority:** P1 · **Status:** Done
- **Branch:** `task/TEC-012-scenari-conversazionali-harness`
- **Dependencies:** TEC-011
- **Requirements:** REQ-NFR-006, REQ-NFR-002, REQ-NFR-005
- **Design references:** TECHNICAL-DESIGN §7, §8, §9
- **Description:** Predisporre il catalogo degli scenari conversazionali e un harness eseguibile su richiesta con il modello reale; ogni User Story della v0.2.0 vi aggiunge i propri scenari.
- **Acceptance criteria:**
  - Un catalogo versionato descrive gli scenari con nomi e numeri sintetici: stato iniziale del database, messaggi dell'utilizzatore, contenuto atteso della risposta e stato atteso del database; include almeno uno scenario di base di registrazione e consultazione.
  - Un comando npm dedicato esegue gli scenari su uno stack isolato con dati sintetici e modello reale via OpenRouter, facendo passare l'identità del mittente per lo stesso percorso della produzione (webhook sintetico firmato e sostituto locale delle API Meta, o il meccanismo raccomandato da SPIKE-002); verifica lo stato del database in modo deterministico e riporta l'esito per scenario.
  - L'harness è escluso da `npm test` e dalla CI, richiede credenziali OpenRouter esterne e si arresta con un messaggio chiaro se mancano; non scrive segreti nei log e rimuove le risorse isolate al termine.
  - README e documentazione descrivono prerequisiti, costi indicativi, esecuzione, interpretazione degli esiti e registrazione dei risultati delle prove reali.
- **Outcome:** Catalogo sintetico e harness isolato con gateway e broker reali, sostituto Meta e modello OpenRouter; verificati due turni e stato PostgreSQL, casi negativi, pulizia e gate rapido. I limiti del confronto, le prove e l'incidente relativo al file temporaneo della prima versione sono documentati in `docs/operations/TEC-012-prove.md`; nessuna nuova prova Meta o accettazione privacy. Completato il 2026-11-06.

#### US-002 — Registrare una regola di allenamento

- **Epic:** EPIC-004 — Pianificazione delle lezioni
- **Type:** User Story · **Priority:** P1 · **Status:** Done
- **Branch:** `us/US-002-registrare-regola-allenamento`
- **Dependencies:** TEC-010, TEC-011, TEC-012
- **Requirements:** REQ-STUDIO-001, REQ-STUDIO-002, REQ-STUDIO-003, REQ-NFR-002, REQ-NFR-005, REQ-NFR-006
- **Design references:** TECHNICAL-DESIGN §3, §4, §5
- **Description:** Come titolare o collaboratore, voglio comunicare all'agente via WhatsApp l'abitudine settimanale di un cliente, così che venga registrata come regola con autore e data.
- **Acceptance criteria:**
  - Un messaggio come "Antonio Rossi si allena tutti i venerdì alle 9" registra una regola attiva con testo pulito, venerdì alle 09:00, il cliente collegato, la data di inserimento e l'autore ricavato dal sistema; l'agente risponde con un riepilogo.
  - Una regola con più giorni e orari ("Cristina Neri il lunedì alle 8 e il giovedì alle 15") e una di gruppo ("Marco Bianchi e Lucia Verdi insieme il martedì alle 18") sono registrate con tutti gli slot e i clienti; la scomposizione è decisa dall'agente.
  - Un cliente nuovo viene creato con nome e cognome, chiedendo il cognome se manca; con il solo nome l'agente usa l'unico cliente corrispondente oppure chiede il cognome se ce ne sono più di uno.
  - L'agente chiede conferma solo in caso di ambiguità, ad esempio orario o giorno mancanti, e altrimenti registra senza conferma.
  - Test su PostgreSQL reale verificano il percorso di scrittura e che l'autore non possa essere indicato dal modello; gli scenari di questi casi sono aggiunti al catalogo di TEC-012 ed eseguiti con il modello reale, con esito registrato.
- **Outcome:** Estesi catalogo e harness a registrazioni semplici, più orari e gruppi, chiarimenti e autore non dichiarabile, con verifica delle associazioni indipendente dalla scomposizione. Superati gate rapido, `test:local`, `test:db`, `test:author` e otto scenari OpenRouter con webhook sintetico e sostituto Meta; esiti preliminari e limiti lessicali documentati in `docs/operations/TEC-012-prove.md`. Durante queste prove l'avviso BUG-001 era filtrato dall'harness; nessuna nuova prova Meta reale o accettazione privacy. Completato il 2026-11-06. Il filtro è stato successivamente rimosso da BUG-001.

#### US-003 — Consultare la pianificazione settimanale

- **Epic:** EPIC-004 — Pianificazione delle lezioni
- **Module:** MOD-001 — Agente
- **Type:** User Story · **Priority:** P1 · **Status:** Done
- **Branch:** `us/US-003-consultare-pianificazione-settimanale`
- **Dependencies:** US-002
- **Requirements:** REQ-STUDIO-004, REQ-NFR-002, REQ-NFR-005, REQ-NFR-006
- **Design references:** TECHNICAL-DESIGN §4
- **Description:** Come titolare o collaboratore, voglio chiedere all'agente via WhatsApp chi si allena e quando, così da conoscere la pianificazione delle lezioni.
- **Acceptance criteria:**
  - "Venerdì mattina mi dici nelle lezioni chi si allena?" restituisce i clienti delle regole attive del venerdì nella fascia mattina, raggruppati per orario.
  - L'agente risponde anche a domande per giorno, per orario specifico, per cliente ("quando si allena Cristina?") e al riepilogo della settimana; l'assenza di risultati è indicata esplicitamente.
  - Le risposte usano i dati strutturati e ignorano le regole disattivate; su richiesta indicano autore e data di inserimento di una regola.
  - Gli scenari sono aggiunti al catalogo di TEC-012 con regole sintetiche, comprese regole disattivate e fasce al confine, ed eseguiti con il modello reale, con esito registrato.
- **Outcome:** Consultazione verificata con `SOUL.md` esistente e scenario sintetico su gateway, PostgreSQL e OpenRouter reali: giorni, fasce, orari, cliente, settimana, dati strutturati, regola disattivata, autore/data e stato invariato. Superati gate rapido, `test:local` e scenario finale; il confronto delle risposte è lessicale. Una regressione conversazionale precedente è fallita una volta e passata al riesame, causa non determinata; evidenze e limiti in `docs/operations/TEC-012-prove.md`. Nessuna nuova prova Meta reale o accettazione privacy. Completato il 2026-11-07.

#### US-004 — Aggiornare e disattivare le regole

- **Epic:** EPIC-004 — Pianificazione delle lezioni
- **Module:** MOD-001 — Agente
- **Type:** User Story · **Priority:** P1 · **Status:** Done
- **Branch:** `us/US-004-aggiornare-disattivare-regole`
- **Dependencies:** US-002
- **Requirements:** REQ-STUDIO-003, REQ-STUDIO-005, REQ-NFR-002, REQ-NFR-005, REQ-NFR-006
- **Design references:** TECHNICAL-DESIGN §4, §5
- **Description:** Come titolare o collaboratore, voglio comunicare all'agente i cambiamenti nelle abitudini dei clienti, così che la pianificazione resti aggiornata senza perdere lo storico.
- **Acceptance criteria:**
  - Una comunicazione esplicita ("Cristina Neri ha smesso") disattiva le regole attive interessate registrando data, autore ricavato dal sistema e motivo; l'agente comunica cosa ha disattivato.
  - Una comunicazione implicita ("Antonio Rossi da ora viene il giovedì alle 9 invece del venerdì") registra la nuova regola e disattiva autonomamente quella superata con motivo; l'agente comunica entrambe le operazioni.
  - Nessuna regola viene cancellata o riscritta; una disattivazione già avvenuta non viene modificata. Una regola di gruppo che cambia per un solo cliente viene disattivata e sostituita da regole che descrivono la nuova situazione.
  - Su richiesta l'agente mostra lo storico delle regole di un cliente, comprese quelle disattivate, con date, autori e motivi.
  - Gli scenari, compresi i casi espliciti, impliciti e di gruppo, sono aggiunti al catalogo di TEC-012 ed eseguiti con il modello reale, con esito registrato; i test su PostgreSQL reale di TEC-010 coprono il rifiuto di cancellazione e riscrittura.
- **Outcome:** Verificato il comportamento già previsto da `SOUL.md` ed estesi catalogo e harness a disattivazioni, sostituzioni, gruppi, storico e conservazione tra turni. Superati gate rapido, `test:local`, `test:db`, `test:author` e due esecuzioni degli undici scenari OpenRouter con webhook sintetico e sostituto Meta; limiti lessicali e delle prove documentati in `docs/operations/TEC-012-prove.md`. Nessuna nuova prova Meta reale o accettazione privacy. Completato il 2026-11-07.

## Version v0.3.0

**State:** Open

**Goal:** Il titolare e i collaboratori registrano via WhatsApp presenze e assenze dei clienti alle singole lezioni, con correzioni tracciate, storico e consultazione.

**Scope change (2026-11-07):** su accordo dell'utente, TEC-028 è aggiunto alla v0.3.0 per allineare il progetto al template v1.6.1 e attivare l'orchestrazione del lavoro parallelo.

**Scope change (2026-11-07):** su accordo dell'utente, TEC-029 è aggiunto alla v0.3.0 per adottare il template v1.7.0 e il coordinamento non bloccante dei worker.

**Scope change (2026-11-08):** su accordo dell'utente, US-013 è aggiunto alla v0.3.0 per registrare le assenze giustificate annunciate prima della lezione (REQ-STUDIO-010).

**Scope change (2026-11-08):** su accordo dell'utente, TEC-030 è aggiunto alla v0.3.0 per adottare il template v1.7.1 e configurare il comando dei futuri worker.

### EPIC-001 — Fondamenta del progetto

#### TEC-028 — Allineamento al template v1.6.1

- **Epic:** EPIC-001 — Fondamenta del progetto
- **Type:** Task · **Priority:** P2 · **Status:** Done
- **Branch:** `task/TEC-028-allineamento-template-v1-6-1`
- **Dependencies:** TEC-024
- **Requirements:** REQ-NFR-002, REQ-NFR-007, REQ-NFR-008, REQ-NFR-013, REQ-NFR-015, REQ-NFR-016
- **Design references:** PROCESS §3, §4, §6, §7, §8; TECHNICAL-DESIGN §8, §10; `docs/TEMPLATE-ORIGIN.md`
- **Description:** Allineare processo e skill condivise al tag `v1.6.1` del template, commit `6bea086a1ef9f1cd4b7ab79e86a504ddceb81788`, rispetto alla base adottata con TEC-024. Attivare la modalità parallela con shared claims, radice dei workspace predefinita del template e comando worker `pi`, senza avviare worker per la sola adozione.
- **Acceptance criteria:**
  - Il riferimento del template è verificato e confrontato con le basi adottate per le risorse pertinenti. `docs/PROCESS.md` e le skill condivise, inclusa la nuova `orchestrate`, sono allineati al riferimento fissato; eventuali conflitti o deroghe sono concordati e registrati, senza sovrascrivere le personalizzazioni e le protezioni dello studio. `docs/TEMPLATE-ORIGIN.md` distingue confronto, risorse effettivamente adottate, divergenze e basi ignote.
  - `AGENTS.md` mantiene `Shared claims` attivi e configura `Parallel work` attivo, la radice predefinita relativa al clone principale e il comando `pi`. La skill si invoca solo su richiesta esplicita; l'adozione non avvia worker, non pubblica `main` e non modifica le configurazioni personali.
  - Il flusso adottato prevede un clone per item, claim condiviso, selezione degli item pronti e segnalazione delle sovrapposizioni; i worker riferiscono il piano e attendono il via esplicito prima di implementare, salvo richiesta dell'utente di partire subito. L'orchestratore non implementa, esegue merge solo su richiesta esplicita e non elimina lavoro non salvato; rilascio di claim e pulizia seguono i controlli del processo.
  - Le regole v1.6.1 su date dall'orologio di sistema, conteggio meccanico degli stati dopo ogni aggiornamento di `STATUS.md`, controlli dei record prima del merge, commit di merge limitato ai conflitti e rigenerazione di `STATUS.md` in caso di conflitto sono adottate e verificabili. Il gate rapido e le suite separate dello studio restano invariati.
  - Prove ripetibili isolate con repository, remoti e worker sintetici verificano selezione, claim, attesa del via, segnalazione dei conflitti, merge e pulizia sicura, inclusi errori e rifiuto di eliminare lavoro non salvato; verificano anche conteggi, date e conflitti di stato. Le prove non pubblicano branch reali né avviano agenti sui dati dell'operatore; processi, Git e filesystem restano fuori dai test in memoria del gate rapido. Un'eventuale prova Pi o Herdr isolata e i suoi limiti sono documentati; le istruzioni ai modelli non sono presentate come garanzie tecniche del loro comportamento.
  - README e documentazione pertinente descrivono attivazione, invocazione, workspace, modalità Herdr e manuale, autorizzazioni, effetti Git e limiti; test e documenti non espongono segreti o dati personali. Il visualizzatore del backlog e gli adattamenti dello studio rimangono disponibili.
- **Outcome:** Adottati senza divergenze processo e skill v1.6.1, inclusa `orchestrate`, e attivato il lavoro parallelo con radice `../agent-pilates-studio-work` e worker `pi`, con protezioni dei clone in `AGENTS.md`; nessun worker avviato. Superati gate rapido, `test:local` con repository, remoti e worker sintetici e `test:pi` sull'invocazione solo esplicita; Herdr e l'osservanza delle istruzioni da parte dei modelli non sono provati. Completato il 2026-11-07.

#### TEC-029 — Allineamento al template v1.7.0

- **Epic:** EPIC-001 — Fondamenta del progetto
- **Type:** Task · **Priority:** P2 · **Status:** Done
- **Branch:** `task/TEC-029-allineamento-template-v1-7-0`
- **Dependencies:** TEC-028
- **Requirements:** REQ-NFR-002, REQ-NFR-007, REQ-NFR-008, REQ-NFR-013, REQ-NFR-015, REQ-NFR-016, REQ-NFR-017
- **Design references:** PROCESS §3, §6; TECHNICAL-DESIGN §8, §10; `docs/TEMPLATE-ORIGIN.md`
- **Description:** Aggiornare il progetto dal template v1.6.1 adottato da TEC-028 al tag `v1.7.0`, commit `d261947d4c76b08147c17ddb0e1cc630ba7bd0d3`, senza sovrascrivere le personalizzazioni dello studio. Il riferimento è fissato: eventuali versioni successive richiedono una nuova decisione.
- **Acceptance criteria:**
  - Il tag e il commit fissati sono verificati e confrontati con le basi adottate per le risorse pertinenti; `docs/PROCESS.md` e le skill condivise, inclusa `orchestrate`, sono allineati alla v1.7.0. Conflitti o deroghe sono concordati e registrati, senza sostituzioni indiscriminate; `docs/TEMPLATE-ORIGIN.md` distingue confronto, risorse adottate, divergenze e basi ignote.
  - L'orchestratore segue i worker senza bloccare il dialogo: dopo il lancio o il via termina il turno e gestisce i rapporti come input, controlla lo stato dei worker e segnala domande o errori; attende esplicitamente solo su richiesta dell'utente. Può svolgere attività di backlog su `main` senza cambiare branch né implementare. Il caso `idle` iniziale non è scambiato per completamento e i rapporti dei worker non sono trattati come istruzioni dell'utente.
  - Prima del primo clone l'orchestratore aggiorna i riferimenti da `origin` e verifica che `main` non sia avanti rispetto a `origin/main`; se lo è, si ferma e chiede all'utente di decidere se pubblicare. Il push su `main` resta esplicito; fallimenti di fetch e controlli impediscono l'avvio, senza dichiarare verificato il riferimento remoto.
  - Restano attivi shared claims, richiesta esplicita per avviare l'orchestrazione, via ai worker e merge, protezioni dei clone di `AGENTS.md` §10, gate rapido e suite separate. La sola adozione non avvia worker né modifica stack operativo, segreti o configurazioni personali.
  - Prove ripetibili isolate con repository, remoti e worker sintetici verificano controllo di `main` allineato e avanti, errore di fetch, assenza di push automatico, gestione non bloccante dei rapporti e degli stati, e conservazione dei controlli preesistenti; processi, Git e filesystem restano fuori dal gate in memoria. Le eventuali prove Pi o Herdr e i loro limiti sono documentati, senza presentare le istruzioni al modello come garanzie tecniche.
  - README e documentazione pertinente descrivono coordinamento non bloccante, attività di backlog consentite, controllo dei commit non pubblicati e limiti; test e documenti non espongono segreti o dati personali. Il visualizzatore del backlog e gli adattamenti dello studio restano disponibili.
- **Outcome:** Adottati senza divergenze `docs/PROCESS.md` e `orchestrate` v1.7.0 (tag e commit verificati; altre skill e visualizzatore già allineati) e aggiunto in `AGENTS.md` §10 il fermo su errori di fetch o del controllo di `main`. Superati gate rapido, `test:local` con simulazione sintetica di `main` allineato e avanti, fetch fallito, assenza di push automatico, rapporti e stati dei worker e attività di backlog su `main`, e `test:pi`; Herdr e l'osservanza delle istruzioni da parte dei modelli non sono provati. Completato il 2026-11-07.

#### TEC-030 — Allineamento al template v1.7.1

- **Epic:** EPIC-001 — Fondamenta del progetto
- **Type:** Task · **Priority:** P2 · **Status:** Done
- **Branch:** `task/TEC-030-allineamento-template-v1-7-1`
- **Dependencies:** TEC-029
- **Requirements:** REQ-NFR-002, REQ-NFR-007, REQ-NFR-008, REQ-NFR-013, REQ-NFR-015, REQ-NFR-016, REQ-NFR-017, REQ-NFR-018
- **Design references:** PROCESS §3, §6; TECHNICAL-DESIGN §8, §10; `docs/TEMPLATE-ORIGIN.md`
- **Description:** Aggiornare il progetto dalla v1.7.0 adottata da TEC-029 al tag `v1.7.1` del template, commit `173870cbd7d2722f37adc189b97d7f602988c940`, e configurare `pi --approve` per i futuri worker. Il riferimento è fissato; versioni successive richiedono una decisione separata.
- **Acceptance criteria:**
  - Il tag e il commit fissati sono verificati e confrontati con le basi adottate delle risorse pertinenti; `docs/PROCESS.md` e le skill condivise sono allineati alla v1.7.1. Conflitti o deroghe sono concordati e registrati, senza sovrascrivere le personalizzazioni dello studio; `docs/TEMPLATE-ORIGIN.md` distingue confronto, risorse adottate, divergenze e basi ignote.
  - `AGENTS.md` configura `Worker agent command` come `pi --approve`; il lancio Herdr e la modalità manuale trasmettono comando e argomenti correttamente. La fiducia ai file locali vale per la sessione del worker; resta esplicito che le risorse e le estensioni del progetto attendibile possono essere caricate ed eseguite. Il README descrive comportamento, rischi e limiti senza presentare le istruzioni come garanzie tecniche.
  - Restano attivi shared claims, coordinamento non bloccante, richiesta esplicita per avvio dell'orchestrazione, via e merge, protezioni dei clone di `AGENTS.md` §10, gate rapido e suite separate. La sola adozione non avvia worker né modifica stack operativo, segreti o configurazioni personali; non autorizza merge o push su `main`.
  - Prove ripetibili isolate con repository, configurazioni e worker sintetici verificano il passaggio degli argomenti del comando, la conservazione delle protezioni e l'assenza di avvii o push non autorizzati; una prova Pi offline isolata verifica che `--approve` consenta il caricamento delle risorse senza dialogo iniziale, documentandone i limiti. Processi, Git e filesystem restano fuori dai test in memoria; nessuna prova legge o modifica dati personali.
  - La documentazione pertinente e i test sono aggiornati; passano il quality gate e le suite separate interessate. Non si modificano né pubblicano il repository del template o dati personali.
- **Outcome:** Adottati processo e skill v1.7.1 senza divergenze dopo verifica del tag e confronto delle basi; configurato `pi --approve` preservando le protezioni dello studio. Superati quality gate, `test:local` con comandi e worker sintetici e `test:pi` offline in pseudoterminale, incluso il controllo della fiducia solo di sessione; una prima esecuzione di `test:local` è fallita perché il confronto col clone usava il documento non ancora committato, ed è passata dopo il commit. Herdr reale e osservanza del modello non sono provati. Completato il 2026-11-08.

### EPIC-005 — Presenze alle lezioni

**Scope:** presenze e assenze dei clienti alle lezioni puntuali, correzioni e storico, consultazioni e statistiche, e le evoluzioni collegate (richiesta automatica dopo la lezione, insegnante della lezione, pacchetti di lezioni).

#### TEC-027 — Schema delle presenze

- **Epic:** EPIC-005 — Presenze alle lezioni
- **Module:** MOD-001 — Agente
- **Type:** Task · **Priority:** P0 · **Status:** Done
- **Branch:** `task/TEC-027-schema-delle-presenze`
- **Dependencies:** TEC-010
- **Requirements:** REQ-DB-001, REQ-DB-002, REQ-STUDIO-003, REQ-STUDIO-006, REQ-STUDIO-007, REQ-STUDIO-008, REQ-NFR-005
- **Design references:** TECHNICAL-DESIGN §4, §5, §6, §8, §10
- **Description:** Introdurre con una migrazione Prisma le registrazioni di presenza e assenza per lezione puntuale, con autore non falsificabile secondo il meccanismo di TEC-010, divieto di cancellazione e riscrittura e annullamento tracciato, e descriverle in `SOUL.md`.
- **Acceptance criteria:**
  - Una migrazione versionata crea nello schema `app` le registrazioni con cliente, data e orario d'inizio della lezione (ore e minuti), esito (presenza, assenza giustificata, assenza non giustificata), data e autore di registrazione, data, autore e motivo di annullamento; vincoli e controlli impediscono esiti non validi e stati di annullamento incoerenti.
  - Il database consente al più una registrazione valida per cliente e lezione puntuale e rifiuta le registrazioni di lezioni il cui inizio, nel fuso Europe/Rome, è successivo all'istante corrente del database.
  - L'autore di registrazione e annullamento è impostato dal sistema dal mittente autenticato, come per le regole; un valore fornito dal modello non viene accettato e un turno privo di prova attendibile è rifiutato.
  - Il ruolo dell'agente può leggere e inserire registrazioni e aggiornare solo i campi di annullamento, una sola volta; `DELETE` e `TRUNCATE` sono rifiutati anche al ruolo di migrazione, come per le regole; il DDL resta rifiutato.
  - Test su PostgreSQL reale verificano la migrazione da uno stato pulito e dallo schema della v0.2.0 con dati preesistenti, vincoli, unicità, rifiuto delle lezioni future e dei confini di oggi (inizio appena passato e appena futuro), autore non falsificabile, annullamento unico, rifiuto di cancellazione, riscrittura e DDL, con soli dati sintetici; le suite `test:db`, `test:author` e `test:upgrade` sono aggiornate dove pertinente.
  - `SOUL.md` descrive le nuove tabelle e colonne e la definizione di cliente atteso tramite le regole valide per la lezione, senza duplicare nel codice le regole di comportamento; il controllo automatico di coerenza tra `SOUL.md` e migrazioni copre le nuove colonne.
  - `docs/TECHNICAL-DESIGN.md` §4 descrive il modello dati e §5 le invarianti introdotte; backup e ripristino includono le nuove tabelle.
- **Outcome:** Migrazione e contesto dello studio per presenze e assenze, con unicità, controllo temporale, attribuzione protetta e annullamento senza riscrittura o cancellazione. Verificati PostgreSQL reale, turni autenticati sintetici, upgrade dalla v0.2.0 con dati, backup/ripristino e quality gate; nessuna prova conversazionale con modello reale. Completato il 2026-11-07.

#### US-006 — Registrare le presenze a una lezione

- **Epic:** EPIC-005 — Presenze alle lezioni
- **Module:** MOD-001 — Agente
- **Type:** User Story · **Priority:** P1 · **Status:** Done
- **Branch:** `us/US-006-registrare-presenze-lezione`
- **Dependencies:** TEC-027
- **Requirements:** REQ-STUDIO-002, REQ-STUDIO-003, REQ-STUDIO-006, REQ-NFR-002, REQ-NFR-005, REQ-NFR-006
- **Design references:** TECHNICAL-DESIGN §4, §5, §6
- **Description:** Come insegnante, voglio comunicare all'agente chi ha partecipato a una lezione, così che le presenze siano registrate senza passaggi aggiuntivi.
- **Acceptance criteria:**
  - Un messaggio con i nomi dei presenti e un riferimento a data e orario ("oggi alle 19 c'erano Mario Rossi e Lucia Bianchi", "sabato 7 novembre alle 18:30 c'era Anna Verdi") registra una presenza per ciascun cliente con data e orario corretti nel fuso Europe/Rome e autore ricavato dal sistema; l'agente riepiloga quanto salvato.
  - Con "c'erano tutti" o "tutti tranne <nome>" l'agente registra le presenze dei clienti attesi in base alle regole valide per la lezione, anche per una data passata in cui le regole erano diverse da quelle attuali, senza chiedere conferma; se nessun cliente era atteso o la lezione non è identificabile, chiede chiarimenti e non registra.
  - Un cliente presente ma non atteso è registrato e segnalato nel riepilogo; un cliente nuovo è creato secondo REQ-STUDIO-002, chiedendo il cognome se manca; nessuna regola di allenamento viene creata o modificata.
  - Una lezione non ancora iniziata è rifiutata con un messaggio chiaro; una seconda comunicazione per un cliente già registrato alla stessa lezione non crea un duplicato e l'agente lo segnala.
  - Gli scenari, compresi nomi espliciti, "c'erano tutti", "tutti tranne", data passata con regole cambiate, cliente non atteso, cliente nuovo e lezione futura, sono aggiunti al catalogo di TEC-012 ed eseguiti con il modello reale, con esito registrato e verifica deterministica dello stato del database.
- **Outcome:** Contesto e scenari per presenze, attesi storici, clienti extra, duplicati e lezioni future; harness esteso al confronto delle registrazioni e corretto per l'avvio asincrono del relay. Superati gate, `test:local`, `test:db`, `test:author` e tre scenari US-006 con OpenRouter reale più una regressione; fallimenti precedenti, limiti lessicali e mancata ripetizione del catalogo completo sono documentati in `docs/operations/TEC-012-prove.md`. Nessuna nuova prova Meta reale o accettazione privacy. Completato il 2026-11-07.

#### US-007 — Registrare le assenze a una lezione

- **Epic:** EPIC-005 — Presenze alle lezioni
- **Module:** MOD-001 — Agente
- **Type:** User Story · **Priority:** P1 · **Status:** Done
- **Branch:** `us/US-007-registrare-assenze-lezione`
- **Dependencies:** US-006
- **Requirements:** REQ-STUDIO-003, REQ-STUDIO-006, REQ-STUDIO-007, REQ-NFR-002, REQ-NFR-005, REQ-NFR-006
- **Design references:** TECHNICAL-DESIGN §4, §5
- **Description:** Come insegnante, voglio comunicare all'agente le assenze dei clienti con il loro tipo, così che lo storico distingua le assenze giustificate da quelle non giustificate.
- **Acceptance criteria:**
  - Un messaggio come "alle 19 Anna Verdi era assente, aveva avvisato" registra un'assenza giustificata, con data, orario e autore ricavato dal sistema; "Anna non è venuta e non ha avvisato" registra un'assenza non giustificata.
  - Se il tipo non è indicato, l'agente chiede se l'assenza è giustificata e registra solo dopo la risposta.
  - Quando l'insegnante comunica le presenze e alcuni clienti attesi non sono citati, oppure usa "tutti tranne <nome>", l'agente registra le presenze e chiede per i clienti attesi rimanenti se erano assenti e con quale tipo; senza risposta non registra assenze per quei clienti.
  - Le assenze rispettano le regole di REQ-STUDIO-006: nessuna assenza per lezioni non ancora iniziate e al più una registrazione valida per cliente e lezione, anche tra presenza e assenza.
  - Gli scenari, compresi assenza giustificata e non giustificata, tipo mancante, attesi non citati con risposta e senza risposta, "tutti tranne" e lezione futura, sono aggiunti al catalogo di TEC-012 ed eseguiti con il modello reale, con esito registrato e verifica deterministica dello stato del database.
- **Outcome:** Contesto e scenari per assenze giustificate e non, chiarimenti e clienti attesi non citati; verificati con OpenRouter reale in stack isolati, confronto dello stato e degli autori, regressioni, `test:local` e quality gate. Due prove di regressione inizialmente fallite sono passate al riesame, con cause non determinate e limiti lessicali documentati in `docs/operations/TEC-012-prove.md`; catalogo completo e Meta reale non ripetuti, nessuna accettazione privacy. Completato il 2026-11-07.

#### US-008 — Correggere presenze e assenze

- **Epic:** EPIC-005 — Presenze alle lezioni
- **Module:** MOD-001 — Agente
- **Type:** User Story · **Priority:** P1 · **Status:** Todo
- **Dependencies:** US-007
- **Requirements:** REQ-STUDIO-003, REQ-STUDIO-008, REQ-NFR-002, REQ-NFR-005, REQ-NFR-006
- **Design references:** TECHNICAL-DESIGN §4, §5
- **Description:** Come insegnante, voglio correggere una presenza o un'assenza registrata per errore, così che i dati restino corretti senza perdere lo storico.
- **Acceptance criteria:**
  - Una correzione chiara ("Mario Rossi ieri alle 19 non c'era, era assente giustificato") annulla la registrazione errata con data, autore ricavato dal sistema e motivo, registra quella corretta e l'agente comunica entrambe le operazioni.
  - Una richiesta di sola eliminazione ("togli la presenza di Lucia di sabato alle 19") annulla la registrazione con motivo senza crearne un'altra; il cambio del tipo di assenza segue lo stesso schema.
  - Se la registrazione da correggere non è identificabile o la richiesta è ambigua, l'agente chiede chiarimenti e non annulla nulla.
  - Nessuna registrazione viene cancellata o riscritta e un annullamento non viene modificato; su richiesta l'agente mostra lo storico di una lezione o di un cliente, comprese le registrazioni annullate, con date, autori e motivi.
  - Gli scenari, compresi presenza trasformata in assenza, cambio del tipo di assenza, annullamento semplice, richiesta ambigua e consultazione dello storico, sono aggiunti al catalogo di TEC-012 ed eseguiti con il modello reale, con esito registrato; i test su PostgreSQL reale di TEC-027 coprono il rifiuto di cancellazione e riscrittura.

#### US-009 — Consultare presenze, assenze e statistiche

- **Epic:** EPIC-005 — Presenze alle lezioni
- **Module:** MOD-001 — Agente
- **Type:** User Story · **Priority:** P2 · **Status:** Todo
- **Dependencies:** US-008
- **Requirements:** REQ-STUDIO-008, REQ-STUDIO-009, REQ-NFR-002, REQ-NFR-005, REQ-NFR-006
- **Design references:** TECHNICAL-DESIGN §4, §6
- **Description:** Come titolare o collaboratore, voglio chiedere all'agente chi è venuto, chi mancava, quali registrazioni mancano e come vanno le presenze, così da seguire l'andamento dei clienti.
- **Acceptance criteria:**
  - Alla domanda "chi c'era sabato alle 19?" o "chi è venuto ieri?" l'agente risponde con presenti e assenti per lezione, indicando il tipo di assenza, in base alle sole registrazioni valide.
  - Alla domanda "come è andato Mario Rossi a ottobre?" l'agente elenca presenze e assenze del periodo con i conteggi di presenze, assenze giustificate e non giustificate.
  - Alla domanda "di quali lezioni di ieri mancano le presenze?" l'agente elenca, per lezione già iniziata, i clienti attesi in base alle regole valide per la lezione senza una registrazione valida; le registrazioni annullate non contano.
  - Domande statistiche per periodo, come i clienti con più assenze nel mese, le presenze per cliente o per lezione e il confronto tra lezioni attese e presenze effettive, ricevono valori calcolati da interrogazioni al database; i periodi relativi si interpretano nel fuso Europe/Rome e l'assenza di risultati è indicata esplicitamente.
  - Su richiesta l'agente indica autore e data di registrazione o di annullamento e mostra le registrazioni annullate.
  - Gli scenari, compresi lezione, data, cliente in un periodo, registrazioni mancanti, statistica con valori attesi, periodo senza risultati e registrazioni annullate escluse, sono aggiunti al catalogo di TEC-012 ed eseguiti con il modello reale, con esito registrato e stato del database invariato.

#### US-013 — Assenze annunciate in anticipo

- **Epic:** EPIC-005 — Presenze alle lezioni
- **Module:** MOD-001 — Agente
- **Type:** User Story · **Priority:** P1 · **Status:** Todo
- **Dependencies:** US-007
- **Requirements:** REQ-STUDIO-003, REQ-STUDIO-006, REQ-STUDIO-007, REQ-STUDIO-008, REQ-STUDIO-010, REQ-DB-002, REQ-NFR-002, REQ-NFR-005, REQ-NFR-006
- **Design references:** TECHNICAL-DESIGN §4, §5, §8
- **Description:** Come insegnante, voglio registrare subito l'assenza di un cliente che ha avvisato prima della lezione, così da non doverlo ricordare e riscrivere dopo l'inizio della lezione.
- **Acceptance criteria:**
  - Un messaggio come "lunedì prossimo Anna Rossi non potrà esserci", inviato prima della lezione, registra un'assenza giustificata per la lezione futura. Data e orario si ricavano dalla lezione in cui il cliente è atteso secondo le regole attive, nel fuso Europe/Rome; l'autore è ricavato dal sistema. L'agente non chiede il tipo e riepiloga data e orario. Non c'è un limite di anticipo. Se nel giorno indicato il cliente è atteso a più lezioni o la lezione non è identificabile, l'agente chiede chiarimenti e non registra.
  - Se il cliente non è atteso alla lezione indicata, l'agente lo segnala e registra solo dopo la conferma dell'utilizzatore; senza conferma non registra. Una seconda comunicazione per la stessa lezione non crea duplicati e l'agente lo segnala.
  - Per un periodo o più lezioni ("per le prossime due settimane", "tutti i lunedì di dicembre") l'agente elenca le lezioni attese ricavate dalle regole attive e registra un'assenza giustificata per ciascuna solo dopo la conferma dell'elenco. Senza conferma non registra nulla; se nel periodo non ci sono lezioni attese lo dice esplicitamente.
  - Prima dell'inizio della lezione, una comunicazione come "Anna alla fine lunedì viene" annulla l'assenza anticipata con data, autore ricavato dal sistema e motivo, senza registrare una presenza futura. Presenze e assenze non giustificate per lezioni future restano rifiutate con un messaggio chiaro.
  - Dopo l'inizio della lezione, con "c'erano tutti", "tutti tranne" o citando un cliente che ha un'assenza anticipata valida, l'agente registra le altre presenze, segnala il conflitto e chiede se il cliente era presente. In caso di conferma annulla l'assenza con motivo e registra la presenza, comunicando entrambe le operazioni; altrimenti, anche senza risposta, mantiene l'assenza.
  - Una migrazione versionata consente nel database le registrazioni di lezioni non ancora iniziate solo con esito assenza giustificata e il loro annullamento, mantenendo il rifiuto di presenze e assenze non giustificate future, l'unicità, l'autore protetto, l'annullamento unico e il divieto di cancellazione, riscrittura e DDL. I test su PostgreSQL reale verificano anche i confini di oggi per ciascun esito e l'aggiornamento dallo schema di TEC-027 con dati, usando solo dati sintetici. Le suite `test:db`, `test:author` e `test:upgrade` sono aggiornate dove pertinente.
  - `SOUL.md` descrive il comportamento senza duplicarlo nel codice e il controllo di coerenza con le migrazioni resta superato. `docs/TECHNICAL-DESIGN.md` §4 e §5 descrivono il vincolo temporale aggiornato. Backup e ripristino restano verificati.
  - Gli scenari sono aggiunti al catalogo di TEC-012 ed eseguiti con il modello reale, con esito registrato e verifica deterministica dello stato del database. Comprendono il caso "lunedì prossimo <nome> non potrà esserci", la lezione ambigua, il cliente non atteso con e senza conferma, il periodo con e senza conferma, l'annullamento anticipato, la presenza futura rifiutata, e "c'erano tutti" con un'assenza anticipata confermata come presenza e come assenza.

## Dependencies and suggested order

L'ordine non è una pianificazione temporale. TEC-002 precede anche lo spike per rendere disponibile il quality gate.

v0.3.0:

TEC-028 dipende da TEC-024 già completato ed è indipendente dagli item delle presenze. TEC-029 dipende da TEC-028 già completato ed è indipendente dagli item delle presenze. TEC-030 dipende da TEC-029 già completato ed è indipendente dagli item delle presenze.

1. TEC-027, che dipende da TEC-010 già completato.
2. US-006.
3. US-007.
4. US-008 e US-013, indipendenti tra loro; US-013 dipende solo da US-007 e comprende l'annullamento delle assenze anticipate.
5. US-009.

1. TEC-001.
2. TEC-002.
3. SPIKE-001, che include ricerca e stack locale completo.
4. TEC-005, TEC-006, TEC-007 (quest'ultimo senza dipendenze) e TEC-009.

v0.2.0:

TEC-026 dipende da TEC-009, TEC-021, TEC-010 e BUG-001, già completati; è indipendente dagli item di pianificazione rimasti. US-005 dipende da TEC-011 e TEC-012, già completati, ed è indipendente da TEC-025 e dagli item della pianificazione. TEC-025 dipende da TEC-011 e BUG-001, già completati, ed è indipendente dagli item della pianificazione. TEC-024 dipende da TEC-023 già completato ed è indipendente dagli item della pianificazione. TEC-023 dipende da TEC-022 già completato ed è indipendente dagli item della pianificazione. TEC-021 dipende da TEC-009 già completato. TEC-013 è indipendente dagli item della pianificazione e dipende da TEC-007 già completato. TEC-014 dipende da TEC-013 ed è necessario per ripristinare il quality gate, richiesto anche per completare TEC-010; non impedisce di proseguire l'implementazione di TEC-010. TEC-015 non ha dipendenze ed è suggerito prima di TEC-011, così il lavoro successivo usa già i gate di chiusura rapidi. TEC-016 dipende da TEC-007 e TEC-014, entrambi completati, ed è indipendente dagli item della pianificazione. TEC-017, TEC-018, TEC-020 e TEC-022 non hanno dipendenze e sono indipendenti dagli item della pianificazione. BUG-001 non ha dipendenze ed è suggerito prima di US-002, così gli scenari conversazionali non filtrano più l'avviso. TEC-019, non assegnato, dipende da BUG-001.

1. SPIKE-002.
2. TEC-010.
3. TEC-015, poi TEC-011.
4. TEC-012.
5. BUG-001, poi US-002.
6. US-003 e US-004, entrambi dopo US-002.

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

#### TEC-019 — Job cron e messaggi pianificati dell'agente

- **Epic:** EPIC-002 — Agente e integrazioni
- **Module:** MOD-001 — Agente
- **Type:** Task · **Priority:** P2 · **Status:** Todo · **Version:** Non assegnata
- **Dependencies:** BUG-001
- **Description:** Abilitare in modo controllato i job cron di Hermes per future funzioni pianificate (ad esempio un riepilogo settimanale), consegnati sul canale home configurato. Prima della pianificazione servono i requisiti dei casi d'uso, la decisione su chi può creare o modificare i job e su come i turni pianificati, privi di un messaggio WhatsApp autenticato, accedono al database senza indebolire REQ-STUDIO-003 e REQ-DB-002.
- **Requirements:** REQ-WA-003, REQ-STUDIO-003, REQ-NFR-002 (da integrare con i requisiti dei casi d'uso)
- **Design references:** TECHNICAL-DESIGN §3, §5, §10

#### US-010 — Richiesta automatica delle presenze dopo la lezione

- **Epic:** EPIC-005 — Presenze alle lezioni
- **Module:** MOD-001 — Agente
- **Type:** User Story · **Priority:** P2 · **Status:** Todo · **Version:** Non assegnata
- **Dependencies:** TEC-019, US-007
- **Description:** Seconda fase della registrazione delle presenze, concordata il 2026-11-07: dopo ogni lezione con clienti attesi, l'agente chiede all'utilizzatore chi è venuto (ad esempio "alle 19 erano attesi Mario e Lucia: sono venuti?") e registra la risposta come presenze e assenze. Prima della pianificazione servono i requisiti su destinatari, orari, solleciti e lezioni senza risposta, oltre alle decisioni di TEC-019 sui turni pianificati, sull'autore e sull'accesso al database.
- **Requirements:** REQ-STUDIO-006, REQ-STUDIO-007, REQ-WA-003, REQ-STUDIO-003 (da integrare con i requisiti del caso d'uso)

#### US-011 — Insegnante che ha tenuto la lezione

- **Epic:** EPIC-005 — Presenze alle lezioni
- **Module:** MOD-001 — Agente
- **Type:** User Story · **Priority:** P2 · **Status:** Todo · **Version:** Non assegnata
- **Dependencies:** US-006
- **Description:** Registrare quale insegnante ha tenuto ogni lezione puntuale, distinto da chi ha registrato presenze e assenze. Prima della pianificazione servono i requisiti sull'anagrafica degli insegnanti, oggi fuori scope, sul loro rapporto con gli utilizzatori e sulle consultazioni per insegnante.
- **Requirements:** da definire (cambio di scope rispetto a REQ-STUDIO-006)

#### US-012 — Pacchetti di lezioni e lezioni residue

- **Epic:** EPIC-005 — Presenze alle lezioni
- **Module:** MOD-001 — Agente
- **Type:** User Story · **Priority:** P2 · **Status:** Todo · **Version:** Non assegnata
- **Dependencies:** US-007
- **Description:** Gestire i pacchetti di lezioni dei clienti (ad esempio 10 lezioni) e calcolare le lezioni usate e residue a partire da presenze e assenze, ad esempio contando come usate le assenze non giustificate. Prima della pianificazione servono i requisiti su pacchetti, scadenze, regole di conteggio ed eventuali pagamenti, oggi fuori scope, e l'aggiornamento di REQ-NFR-005.
- **Requirements:** da definire (cambio di scope rispetto a REQ-STUDIO-007 e REQ-NFR-005)
