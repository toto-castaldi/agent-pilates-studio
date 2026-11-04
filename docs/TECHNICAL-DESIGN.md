# Technical design — `<project-name>`

**Target version:** v0.1.0

This document describes the *how*. Requirements are in `docs/REQUIREMENTS.md`. Sections are numbered so backlog items can reference them (`TECHNICAL-DESIGN §N`). The document grows incrementally with the items that introduce or change design choices; relevant decisions with meaningful alternatives go into `docs/adr/`.

## 1. Initial architectural decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| `<topic>` | `<choice>` | `<why>` |

## 2. Context and main flows

`<System context, external actors and systems, main flows. Diagrams in Mermaid are welcome.>`

## 3. Modules

`<Modules or layers, their responsibilities and allowed dependencies.>`

## 4. Data model

`<Conceptual model first; the physical model is added by the item that creates it.>`

## 5. Invariants and consistency

`<Rules that must always hold and where they are enforced (domain, database, transactions).>`

## 6. Integrations

`<External services, adapters, contracts, failure handling.>`

## 7. Security and observability

`<Authentication, authorization, secrets, logging rules, audit.>`

## 8. Test strategy

`<Test levels, what each level proves, test environments.>`

## 9. Configuration and local runtime

`<Environment variables, local runtime, commands.>`

## 10. Open decisions

Decisions still to be closed and the backlog items that will close them:

- Adattatore, validazione del webhook e gestione dei numeri autorizzati WhatsApp — US-001, informato da SPIKE-001.
- Configurazione concreta di Hermes, del modello e dell'accesso dell'agente ai dati — TEC-004, informato da SPIKE-001.
- Meccanismi di provisioning dei ruoli PostgreSQL e di esecuzione delle migrazioni Prisma — TEC-003, informato da SPIKE-001.
- Versione precisa di Node.js LTS e impostazione di lint, test e build — TEC-002.
- Installazione e versionamento di Hermes; compatibilità con OpenRouter, modello indicato, API WhatsApp Business e accesso sicuro a PostgreSQL — SPIKE-001.
