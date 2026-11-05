# Project status

Riepilogo derivato da `BACKLOG.md`, che resta la fonte canonica per stati e dipendenze.

**Last update:** 2026-11-05

## Current version

| Version | State | Phase | Progress |
| ------- | ----- | ----- | -------- |
| v0.1.0 | Open | Avvio locale semplificato in corso; accettazione privacy da verificare | 6/7 items done (86%) |

I conteggi riguardano la v0.1.0; il debito TEC-008 non è assegnato a una versione.

| Item state | Count |
| ---------- | ----: |
| Todo | 0 |
| In Progress | 1 |
| Blocked | 0 |
| Done | 6 |

## In progress

| Item | Epic | Title | Branch |
| ---- | ---- | ----- | ------ |
| TEC-009 | EPIC-003 — Dati e operatività | Avvio locale con un comando | `task/TEC-009-avvio-locale-con-un-comando` |

## Blocked

None.

## Recently completed

| Item | Epic | Title | Date |
| ---- | ---- | ----- | ---- |
| TEC-005 | EPIC-003 — Dati e operatività | Deploy e continuità operativa | 2026-11-05 |
| TEC-007 | EPIC-001 — Fondamenta del progetto | Allowlist Git per la configurazione Pi | 2026-11-05 |
| TEC-006 | EPIC-001 — Fondamenta del progetto | Integrazione continua | 2026-11-05 |
| SPIKE-001 | EPIC-002 — Agente e integrazioni | Verifica delle integrazioni e stack locale completo | 2026-11-05 |
| TEC-002 | EPIC-001 — Fondamenta del progetto | Scaffold TypeScript e quality gate | 2026-11-04 |
| TEC-001 | EPIC-001 — Fondamenta del progetto | Kickoff | 2026-11-04 |

## Next ready items

| Item | Epic | Title | Priority |
| ---- | ---- | ----- | -------- |
| TEC-008 | EPIC-003 — Dati e operatività | Audit privacy dei log del proxy | P1 |

TEC-008 non è assegnato a una versione: serve pianificarlo prima dell'avvio.

## Closed versions

None.

## Notes

- TEC-003, TEC-004 e US-001 sono confluiti in SPIKE-001. La prova reale WhatsApp/OpenRouter e la verifica SQL tramite il modello sono documentate nel rapporto dello spike.
- TEC-005 ha verificato la prova WhatsApp temporanea, il backup reale e il ripristino isolato, il riavvio e la riconfigurazione del database operativo e il successivo healthcheck Hermes solo locale; Hermes è fermo. Gli upgrade tra versioni specifiche sono stati verificati in isolamento. Il debito non assegnato TEC-008 riguarda l'audit completo del proxy: REQ-NFR-002 resta vincolante, l'accettazione privacy della release non è dimostrata e la prova non autorizza l'uso continuativo. Lo streaming remoto del tunnel condiviso resta vietato.
