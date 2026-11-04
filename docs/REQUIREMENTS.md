# Requirements — `<project-name>`

**Target version:** v0.1.0

**State:** `<draft | baseline>`

This document is the reference for the *what*. The *how* is in `docs/TECHNICAL-DESIGN.md`. Every change of scope or behavior is recorded here before updating backlog and implementation (`docs/PROCESS.md` §3, §5).

## 1. Goal

`<What problem the project solves, for whom, and what success looks like for v0.1.0.>`

## 2. Actors

- **`<Actor>`:** `<who they are, what they can do>`

## 3. Glossary

- **`<Term>`:** `<definition used consistently in requirements, backlog and code>`

## 4. Scope

### In scope for v0.1.0

- Database relazionale con migrazioni versionate e permessi distinti per agente e gestione dello schema.
- Ambiente locale Hermes con accesso a OpenRouter e al database.
- Conversazione WhatsApp Business riservata ai numeri autorizzati.
- Installazione e aggiornamento in produzione, persistenza, backup e ripristino, osservabilità essenziale.
- Verifiche automatiche del progetto con GitHub Actions.

### Out of scope for v0.1.0

Do not introduce these without first updating this document and the backlog:

- `<excluded capability>`

## 5. Functional requirements

Requirement IDs: `REQ-<AREA>-NNN`. Areas used in this project:

| Area | Meaning |
| ---- | ------- |
| DB | Database e migrazioni |
| AGENT | Ambiente agente e modello |
| WA | Comunicazione WhatsApp Business |
| OPS | Operatività e continuità |

### Database e migrazioni

#### REQ-DB-001 — Migrazioni versionate

L'operatore deve poter inizializzare e aggiornare lo schema tramite migrazioni versionate; non sono richieste tabelle di dominio iniziali.

#### REQ-DB-002 — Privilegi dell'agente

L'agente deve poter eseguire operazioni DML sui dati, ma non DDL; le credenziali per le migrazioni devono essere distinte e non disponibili all'agente.

### Ambiente agente

#### REQ-AGENT-001 — Ambiente locale

L'operatore deve poter avviare localmente Hermes e il database con Docker Compose, usando versioni fissate e configurazione esterna.

#### REQ-AGENT-002 — Modello e dati

Hermes deve poter ottenere risposte tramite OpenRouter e accedere al database con i privilegi dell'agente definiti in REQ-DB-002. L'identificativo iniziale del modello proposto è `gpt-6.1-terra`, soggetto a verifica.

### Comunicazione WhatsApp Business

#### REQ-WA-001 — Conversazione

Un interlocutore autorizzato deve poter inviare un messaggio tramite WhatsApp Business e ricevere una risposta generata dall'agente attraverso OpenRouter, usando l'app Meta già configurata.

#### REQ-WA-002 — Accesso e webhook

Solo i numeri presenti nella configurazione di autorizzazione possono interagire con l'agente. Le richieste del webhook devono essere autenticate e quelle non valide rifiutate.

### Operatività

#### REQ-OPS-001 — Installazione e aggiornamento

L'operatore deve poter installare e aggiornare intenzionalmente l'ambiente di produzione su un server Linux predisposto, con versioni fissate e procedura riproducibile.

#### REQ-OPS-002 — Persistenza e recupero

I dati del database devono persistere tra riavvii e aggiornamenti; l'operatore deve poter eseguire e verificare un backup e un ripristino.

#### REQ-OPS-003 — Osservabilità essenziale

L'operatore deve poter verificare stato e disponibilità dei servizi e consultare i log nel rispetto di REQ-NFR-002.

## 6. Non-functional requirements

#### REQ-NFR-001 — Quality gate riproducibile

Il progetto deve offrire installazione delle dipendenze da lockfile e comandi per lint, controllo dei tipi, test e build; l'esecuzione da ambiente pulito deve essere verificabile.

#### REQ-NFR-002 — Segreti e dati nei log

Credenziali e segreti non devono essere inclusi nel repository; i log non devono contenere credenziali, messaggi o numeri di telefono. La configurazione di esempio non deve contenere segreti reali.

#### REQ-NFR-003 — Integrazione continua

GitHub Actions deve eseguire il quality gate, compresi i test di integrazione su PostgreSQL reale, senza deploy automatico. Le prove che richiedono servizi esterni e credenziali reali devono essere documentate separatamente.

## 7. Release acceptance — v0.1.0

The version can be closed only when:

- `<end-to-end scenario or verifiable criterion>`

## 8. Withdrawn requirements

None.
