# AGENTS.md

## 0. Process

Seguire [`docs/PROCESS.md`](docs/PROCESS.md), che prevale salvo deroghe esplicite nella sezione 8. All'inizio di ogni sessione leggere `STATUS.md` e le parti pertinenti di `BACKLOG.md`.

## 1. Project

- **Name:** `agent-pilates-studio`
- **Summary:** assistente WhatsApp dello studio Pilates per titolare e collaboratori, basato su Hermes con database relazionale, OpenRouter e WhatsApp Business; installazione, aggiornamento e prova riproducibili.
- **Current version:** v0.3.0 — vedere `STATUS.md`.
- **Requirements:** `docs/REQUIREMENTS.md` · **Design:** `docs/TECHNICAL-DESIGN.md`

## 2. Language

- **Project language:** italiano, secondo `docs/PROCESS.md` §2.
- Identificatori e commenti nel codice: inglese.

## 3. Scope

Lo scope è definito in `docs/REQUIREMENTS.md`; concordare e registrare ogni cambiamento prima dell'implementazione.

- Funzionalità e tabelle di dominio solo per i requisiti STUDIO (regole di allenamento, clienti e, dalla v0.3.0, presenze e assenze alle lezioni puntuali); eccezioni della pianificazione, capienza, istruttori, pacchetti, pagamenti, richiesta automatica delle presenze e anagrafica degli utilizzatori sono fuori scope.
- Il server, Docker/Compose e HTTPS pubblico sono prerequisiti; provisioning, DNS e certificati sono fuori scope.
- Niente deploy automatico, monitoraggio avanzato o messa in esercizio continuativa nella v0.3.0.

## 4. Stack and architecture

- TypeScript, Node.js LTS e npm per il codice del progetto; Hermes mantiene i propri prerequisiti.
- PostgreSQL e migrazioni Prisma; Docker Compose in locale e su server Linux predisposto.
- OpenRouter, API WhatsApp Business e GitHub Actions; le integrazioni Hermes sono state verificate nei limiti documentati da SPIKE-001.
- Framework di test e versioni di riferimento: `docs/TECHNICAL-DESIGN.md` §§1, 8–9.
- Confini dei componenti e decisioni aperte: `docs/TECHNICAL-DESIGN.md` §§1–3, 10.

## 5. Domain rules

- L'agente può eseguire DML ma non DDL sugli schemi; usare credenziali distinte per le migrazioni, non disponibili all'agente. È accettata l'eccezione PostgreSQL che permette al ruolo di cambiare la propria password. Verificare i privilegi su PostgreSQL reale.
- Solo i numeri autorizzati in configurazione possono interagire; i webhook non autenticati devono essere rifiutati.
- I dati devono persistere tra riavvii e aggiornamenti; backup e ripristino devono essere verificabili.
- Le regole di allenamento non si cancellano né si riscrivono: si disattivano con data, autore e motivo; il divieto di cancellazione è imposto dal database.
- Presenze e assenze non si cancellano né si riscrivono: si annullano una sola volta con data, autore e motivo; il divieto è imposto dal database.
- L'autore di inserimenti, disattivazioni e annullamenti è ricavato dal sistema dal mittente WhatsApp, mai dichiarato dal modello.
- Test, CI ed esempi usano solo nomi e numeri sintetici.
- Le regole di comportamento dell'agente, come i limiti delle fasce orarie, stanno nel file `SOUL.md` versionato nel progetto e usato da Hermes, senza duplicarle nel codice.

## 6. Quality gate

Per il solo kickoff documentale TEC-001, prima che lo scaffold esista: verificare la coerenza dei documenti e delle coperture del backlog ed eseguire `git diff --check` e `git diff --cached --check`.

Il gate di chiusura di item, merge e push su `main` comprende solo:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

`npm test` ricompila ed esegue solo test di unità in memoria: i test non avviano processi e non usano filesystem, git, rete o Docker. La compilazione e l'eventuale `npm ci` da lockfile sono preparazione, non comportamento dei test. Le suite separate si eseguono durante l'item quando servono a provarne i criteri o la DoD; alla chiusura di versione e in CI si eseguono tutte le suite di integrazione, inclusi `npm run test:local`, `test:pi`, `test:pi-package`, `test:db`, `test:hermes`, `test:author`, `test:compaction`, `test:upgrade` e `test:start`. Le prove end-to-end reali Meta/OpenRouter richiedono servizi e credenziali esterni e sono documentate e verificate separatamente secondo i criteri di release.

Usare test unitari e integrazione su PostgreSQL reale per migrazioni e privilegi; non usare un database simulato come prova dei privilegi.

## 7. Definition of Done additions

- Quando una modifica introduce configurazione, aggiornare gli esempi senza segreti e le istruzioni necessarie.
- Quando cambia una migrazione o un privilegio, verificarlo durante l'item su PostgreSQL reale; non affidarsi solo a test simulati. Le verifiche separate necessarie ai criteri dell'item sono obbligatorie anche se non fanno parte del gate rapido.

## 8. Process overrides

- Per SPIKE-001, su richiesta dell'utente, lo spike comprende anche l'implementazione dello stack locale e i criteri originariamente assegnati a TEC-003, TEC-004 e US-001, confluiti nello spike. In deroga a `docs/PROCESS.md` §§1, 4.3 e 4.4, l'item può comprendere il lavoro originariamente suddiviso in più item e il suo codice implementativo può essere committato e, previa richiesta esplicita, integrato dal branch dello spike; non è limitato alla sola ricerca. Restano obbligatori il rapporto, tutti i criteri di accettazione, la Definition of Done e le altre regole di sicurezza e di merge.

## 9. Security and configuration

- Non committare segreti; usare configurazione locale esterna e, quando introdotto, un `.env.example` privo di valori reali.
- Non registrare nei log credenziali, messaggi o numeri di telefono.
- Proteggere le credenziali di migrazione dall'agente e limitare l'accesso al database; autenticare i webhook e applicare l'elenco dei numeri consentiti.
- Non avviare lo streaming remoto dei log del tunnel condiviso (REQ-NFR-004). La prova pubblica temporanea non autorizza l'uso continuativo; per l'audit privacy e i limiti residui, vedere TEC-008 e `docs/TECHNICAL-DESIGN.md` §§7, 10.

## 10. Parallel work

- **Shared claims:** `on`
- **Parallel work:** `on`
- **Workspace root:** `../agent-pilates-studio-work`
- **Worker agent command:** `pi`

I branch degli item vengono pubblicati ai cambi di stato secondo `docs/PROCESS.md` §6.4. I claim coordinano le copie ma non costituiscono un blocco atomico tra avvii concorrenti.

Con `Parallel work` attivo, la skill `orchestrate` si usa solo su richiesta esplicita dell'utente e segue `docs/PROCESS.md` §6.5: un clone per item sotto `Workspace root`, relativo al clone principale, e un worker avviato con `Worker agent command`. L'adozione della modalità non avvia worker.

- I clone dei worker contengono solo file versionati: non copiare `.env`, `.local/`, segreti o stato Pi personale senza una richiesta esplicita dell'utente. Il worker prepara il clone con `npm ci` (§6) e non avvia né modifica lo stack operativo dello studio.
- Le suite separate restano quelle del §6 e usano solo dati sintetici; le prove che richiedono credenziali esterne si eseguono solo con configurazione fornita dall'utente.
- Le istruzioni della skill e dei worker non sono garanzie tecniche: l'utente può dare istruzioni più restrittive, che prevalgono.
