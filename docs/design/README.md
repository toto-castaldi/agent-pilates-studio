# Technical design — agent-pilates-studio

**Target version:** v0.4.0

Il *come* del progetto, un file per argomento (`docs/process/docs.md` §2). I requisiti sono in `docs/requirements/`. Gli item citano un argomento come `design/<topic>` (il file `docs/design/<topic>.md`); le decisioni con alternative rilevanti sono in `docs/adr/`. L'elenco degli argomenti si ottiene con `python3 .agents/tools/backlog.py docs`; `docs --for <ID>` elenca i file necessari per un item.

Per aggiungere un argomento copiare `_TEMPLATE.md` in `<topic>.md` (kebab-case minuscolo); dividere un argomento che tratta più soggetti.

| Argomento | Contenuto |
| --- | --- |
| `context` | flussi principali |
| `modules` | catalogo dei moduli |
| `data-model` | schema PostgreSQL e dati di Hermes |
| `invariants` | vincoli imposti dal database e dai componenti fidati |
| `webhook-trust` | autenticazione del webhook e contesto autore protetto |
| `identity` | riconoscimento del mittente, anagrafica unica e gestione guidata |
| `integrations` | Hermes, OpenRouter, WhatsApp e plugin SQL |
| `agent-context` | nucleo `SOUL.md`, skill interne di sola lettura, prompt di sistema e comportamenti affidati al modello |
| `compaction` | contesto per interlocutore e compattazione |
| `security` | segreti, log e protezione dei dati personali |
| `proxy-logs` | log del tunnel e del proxy, audit e verify token |
| `configuration` | configurazione e avvio locale |
| `production` | ambienti, aggiornamento manuale, launcher, backup a caldo, WhatsApp per ambiente |
| `continuity` | backup quiescente, ripristino e immagine di migrazione |
| `pi-workflow` | configurazione Pi, pacchetti e strumenti dello sviluppo |
| `process-tooling` | CLI del backlog, visualizzatori, orchestrazione e template di origine |
| `test-strategy` | gate, suite separate e CI |
| `conversation-tests` | harness conversazionale con il modello reale |

## Initial architectural decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Runtime locale e produzione | Docker Compose; server Linux già predisposto in produzione | Avvio e gestione coerenti nei due ambienti. |
| Codice del progetto | TypeScript 5.9.3, Node.js LTS 24.14.0 e npm 11.9.0 | Stack e versioni di riferimento; dipendenze fissate nel lockfile. Hermes mantiene i propri prerequisiti. |
| Dati | PostgreSQL e migrazioni Prisma | Database relazionale e schema gestito tramite codice e migrazioni versionate. |
| Agente e modello | Hermes con OpenRouter; modello configurabile, predefinito `openai/gpt-6.1-terra` | Separare l'ambiente agentico dal provider. |
| Contesto dell'agente | Nucleo `SOUL.md` entro 15.000 caratteri e sei skill native di sola lettura caricate solo con `skill_view`; funzioni SQL per le ricostruzioni | Ridurre il contesto stabile senza trasferire regole di comportamento nel codice (ADR-004). |
| Canale | API WhatsApp Business tramite il gateway nativo di Hermes e un'app Meta per ambiente | Usare l'integrazione nativa con autenticazione dei webhook. |
| Rilascio | Versioni fissate, immagini pubblicate dalla CI, aggiornamento avviato esplicitamente | Riproducibilità e controllo operativo, senza deploy automatico. |
| CI | GitHub Actions | Verificare il quality gate e tutte le suite senza deploy automatico. |

## Open decisions

- **Mount `type: image` e riavvio del server** — dopo un reboot di `jarvis` il gateway non riparte perché i mount `subpath` dall'immagine non si risolvono più; da scegliere tra un montaggio dei file dell'agente che non dipenda dai mount `image` e una ricreazione dei servizi all'avvio compatibile con REQ-OPS-005; in carico al BUG della v0.4.0.
- **Job cron e messaggi pianificati** — abilitazione, permessi di creazione e accesso al database dei turni senza mittente autenticato; nessun item pianificato, fuori scope della v0.4.0.
