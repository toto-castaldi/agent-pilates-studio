# AGENTS.md

## 0. Process

Seguire [`docs/PROCESS.md`](docs/PROCESS.md), che prevale salvo deroghe esplicite nella sezione 8. All'inizio di ogni sessione leggere `STATUS.md` e le parti pertinenti di `BACKLOG.md`.

## 1. Project

- **Name:** `agent-pilates-studio`
- **Summary:** piattaforma per installare, aggiornare e provare Hermes con database relazionale, OpenRouter e WhatsApp Business.
- **Current version:** v0.1.0 — vedere `STATUS.md`.
- **Requirements:** `docs/REQUIREMENTS.md` · **Design:** `docs/TECHNICAL-DESIGN.md`

## 2. Language

- **Project language:** italiano, secondo `docs/PROCESS.md` §2.
- Identificatori e commenti nel codice: inglese.

## 3. Scope

Lo scope è definito in `docs/REQUIREMENTS.md`; concordare e registrare ogni cambiamento prima dell'implementazione.

- Nessuna funzionalità o tabella di dominio dello studio nella v0.1.0 senza nuovi requisiti.
- Il server, Docker/Compose e HTTPS pubblico sono prerequisiti; provisioning, DNS e certificati sono fuori scope.
- Niente deploy automatico o monitoraggio avanzato nella v0.1.0.

## 4. Stack and architecture

- TypeScript, Node.js LTS e npm per il codice del progetto; Hermes mantiene i propri prerequisiti.
- PostgreSQL e migrazioni Prisma; Docker Compose in locale e su server Linux predisposto.
- OpenRouter, API WhatsApp Business e GitHub Actions; compatibilità Hermes da verificare con SPIKE-001.
- Framework di test e versioni precise da definire con TEC-002 e dagli item pertinenti.
- Confini dei componenti e decisioni aperte: `docs/TECHNICAL-DESIGN.md` §§1–3, 10.

## 5. Domain rules

- L'agente può eseguire DML ma non DDL; usare credenziali distinte per le migrazioni, non disponibili all'agente. Verificare i privilegi su PostgreSQL reale.
- Solo i numeri autorizzati in configurazione possono interagire; i webhook non autenticati devono essere rifiutati.
- I dati devono persistere tra riavvii e aggiornamenti; backup e ripristino devono essere verificabili.

## 6. Quality gate

Per il solo kickoff documentale TEC-001, prima che lo scaffold esista: verificare la coerenza dei documenti e delle coperture del backlog ed eseguire `git diff --check` e `git diff --cached --check`.

Da TEC-002 in poi, lo scaffold deve fornire e far passare:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Usare test unitari e integrazione su PostgreSQL reale per migrazioni e privilegi; le prove end-to-end reali Meta/OpenRouter richiedono servizi e credenziali esterni e sono documentate separatamente. Non usare un database simulato come prova dei privilegi. TEC-002 precede gli altri item, così il gate è disponibile.

## 7. Definition of Done additions

- Quando una modifica introduce configurazione, aggiornare gli esempi senza segreti e le istruzioni necessarie.
- Quando cambia una migrazione o un privilegio, verificarlo su PostgreSQL reale; non affidarsi solo a test simulati.

## 8. Process overrides

None.

## 9. Security and configuration

- Non committare segreti; usare configurazione locale esterna e, quando introdotto, un `.env.example` privo di valori reali.
- Non registrare nei log credenziali, messaggi o numeri di telefono.
- Proteggere le credenziali di migrazione dall'agente e limitare l'accesso al database; autenticare i webhook e applicare l'elenco dei numeri consentiti.
