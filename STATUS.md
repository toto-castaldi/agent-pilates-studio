# Project status

Riepilogo derivato da `BACKLOG.md`, che resta la fonte canonica per stati e dipendenze.

**Last update:** 2026-11-05

## Current version

| Version | State | Phase | Progress |
| ------- | ----- | ----- | -------- |
| v0.1.0 | Open | Operatività in corso; verifica dei log prima dell'attivazione | 5/6 items done (83%) |

| Item state | Count |
| ---------- | ----: |
| Todo | 0 |
| In Progress | 1 |
| Blocked | 0 |
| Done | 5 |

## In progress

| Item | Epic | Title | Branch |
| ---- | ---- | ----- | ------ |
| TEC-005 | EPIC-003 — Dati e operatività | Deploy e continuità operativa | `task/TEC-005-deploy-continuita-operativa` |

## Blocked

None.

## Recently completed

| Item | Epic | Title | Date |
| ---- | ---- | ----- | ---- |
| TEC-007 | EPIC-001 — Fondamenta del progetto | Allowlist Git per la configurazione Pi | 2026-11-05 |
| TEC-006 | EPIC-001 — Fondamenta del progetto | Integrazione continua | 2026-11-05 |
| SPIKE-001 | EPIC-002 — Agente e integrazioni | Verifica delle integrazioni e stack locale completo | 2026-11-05 |
| TEC-002 | EPIC-001 — Fondamenta del progetto | Scaffold TypeScript e quality gate | 2026-11-04 |
| TEC-001 | EPIC-001 — Fondamenta del progetto | Kickoff | 2026-11-04 |

## Next ready items

None.

## Closed versions

None.

## Notes

- TEC-003, TEC-004 e US-001 sono confluiti in SPIKE-001. La prova reale WhatsApp/OpenRouter e la verifica SQL tramite il modello sono documentate nel rapporto dello spike.
- Il filtro locale del proxy è attivo; diagnostica sicura e altri log esterni restano da verificare. Lo streaming remoto del tunnel condiviso è vietato operativamente; i segreti restano esterni e ignorati da Git.
