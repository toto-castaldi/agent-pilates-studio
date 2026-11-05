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

**State:** Open

**Goal:** Il titolare e i collaboratori registrano, consultano e aggiornano via WhatsApp le abitudini settimanali di allenamento dei clienti, salvate come regole in linguaggio naturale con autore e storico.

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
- **Type:** Task · **Priority:** P0 · **Status:** Todo
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

#### TEC-011 — Contesto dell'agente dello studio

- **Epic:** EPIC-004 — Pianificazione delle lezioni
- **Type:** Task · **Priority:** P0 · **Status:** Todo
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

#### TEC-012 — Scenari conversazionali e harness

- **Epic:** EPIC-004 — Pianificazione delle lezioni
- **Type:** Task · **Priority:** P1 · **Status:** Todo
- **Dependencies:** TEC-011
- **Requirements:** REQ-NFR-006, REQ-NFR-002, REQ-NFR-005
- **Design references:** TECHNICAL-DESIGN §7, §8, §9
- **Description:** Predisporre il catalogo degli scenari conversazionali e un harness eseguibile su richiesta con il modello reale; ogni User Story della v0.2.0 vi aggiunge i propri scenari.
- **Acceptance criteria:**
  - Un catalogo versionato descrive gli scenari con nomi e numeri sintetici: stato iniziale del database, messaggi dell'utilizzatore, contenuto atteso della risposta e stato atteso del database; include almeno uno scenario di base di registrazione e consultazione.
  - Un comando npm dedicato esegue gli scenari su uno stack isolato con dati sintetici e modello reale via OpenRouter, facendo passare l'identità del mittente per lo stesso percorso della produzione (webhook sintetico firmato e sostituto locale delle API Meta, o il meccanismo raccomandato da SPIKE-002); verifica lo stato del database in modo deterministico e riporta l'esito per scenario.
  - L'harness è escluso da `npm test` e dalla CI, richiede credenziali OpenRouter esterne e si arresta con un messaggio chiaro se mancano; non scrive segreti nei log e rimuove le risorse isolate al termine.
  - README e documentazione descrivono prerequisiti, costi indicativi, esecuzione, interpretazione degli esiti e registrazione dei risultati delle prove reali.

#### US-002 — Registrare una regola di allenamento

- **Epic:** EPIC-004 — Pianificazione delle lezioni
- **Type:** User Story · **Priority:** P1 · **Status:** Todo
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

#### US-003 — Consultare la pianificazione settimanale

- **Epic:** EPIC-004 — Pianificazione delle lezioni
- **Type:** User Story · **Priority:** P1 · **Status:** Todo
- **Dependencies:** US-002
- **Requirements:** REQ-STUDIO-004, REQ-NFR-002, REQ-NFR-005, REQ-NFR-006
- **Design references:** TECHNICAL-DESIGN §4
- **Description:** Come titolare o collaboratore, voglio chiedere all'agente via WhatsApp chi si allena e quando, così da conoscere la pianificazione delle lezioni.
- **Acceptance criteria:**
  - "Venerdì mattina mi dici nelle lezioni chi si allena?" restituisce i clienti delle regole attive del venerdì nella fascia mattina, raggruppati per orario.
  - L'agente risponde anche a domande per giorno, per orario specifico, per cliente ("quando si allena Cristina?") e al riepilogo della settimana; l'assenza di risultati è indicata esplicitamente.
  - Le risposte usano i dati strutturati e ignorano le regole disattivate; su richiesta indicano autore e data di inserimento di una regola.
  - Gli scenari sono aggiunti al catalogo di TEC-012 con regole sintetiche, comprese regole disattivate e fasce al confine, ed eseguiti con il modello reale, con esito registrato.

#### US-004 — Aggiornare e disattivare le regole

- **Epic:** EPIC-004 — Pianificazione delle lezioni
- **Type:** User Story · **Priority:** P1 · **Status:** Todo
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

## Dependencies and suggested order

L'ordine non è una pianificazione temporale. TEC-002 precede anche lo spike per rendere disponibile il quality gate.

1. TEC-001.
2. TEC-002.
3. SPIKE-001, che include ricerca e stack locale completo.
4. TEC-005, TEC-006, TEC-007 (quest'ultimo senza dipendenze) e TEC-009.

v0.2.0:

TEC-013 è indipendente dagli item della pianificazione e dipende da TEC-007 già completato.

1. SPIKE-002.
2. TEC-010.
3. TEC-011.
4. TEC-012.
5. US-002.
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
