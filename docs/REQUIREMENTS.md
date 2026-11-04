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

### Out of scope for v0.1.0

Do not introduce these without first updating this document and the backlog:

- `<excluded capability>`

## 5. Functional requirements

Requirement IDs: `REQ-<AREA>-NNN`. Areas used in this project:

| Area | Meaning |
| ---- | ------- |
| DB | Database e migrazioni |

### Database e migrazioni

#### REQ-DB-001 — Migrazioni versionate

L'operatore deve poter inizializzare e aggiornare lo schema tramite migrazioni versionate; non sono richieste tabelle di dominio iniziali.

#### REQ-DB-002 — Privilegi dell'agente

L'agente deve poter eseguire operazioni DML sui dati, ma non DDL; le credenziali per le migrazioni devono essere distinte e non disponibili all'agente.

## 6. Non-functional requirements

#### REQ-NFR-001 — Quality gate riproducibile

Il progetto deve offrire installazione delle dipendenze da lockfile e comandi per lint, controllo dei tipi, test e build; l'esecuzione da ambiente pulito deve essere verificabile.

## 7. Release acceptance — v0.1.0

The version can be closed only when:

- `<end-to-end scenario or verifiable criterion>`

## 8. Withdrawn requirements

None.
