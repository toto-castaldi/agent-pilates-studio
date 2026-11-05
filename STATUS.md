# Project status

Riepilogo derivato da `BACKLOG.md`, che resta la fonte canonica per stati e dipendenze.

**Last update:** 2026-11-05

## Current version

| Version | State | Phase | Progress |
| ------- | ----- | ----- | -------- |
| v0.1.0 | Open | Operatività bloccata dalla privacy del proxy; CI da realizzare | 3/5 items done (60%) |

| Item state | Count |
| ---------- | ----: |
| Todo | 1 |
| In Progress | 0 |
| Blocked | 1 |
| Done | 3 |

## In progress

None.

## Blocked

| Item | Epic | Reason | Branch |
| ---- | ---- | ------ | ------ |
| TEC-005 | EPIC-003 — Dati e operatività | Il filtro locale del proxy è verificato con 502 sintetici; restano da verificare log e streaming esterni Cloudflare prima di attivare il gateway. | `task/TEC-005-deploy-continuita-operativa` |

## Recently completed

| Item | Epic | Title | Date |
| ---- | ---- | ----- | ---- |
| SPIKE-001 | EPIC-002 — Agente e integrazioni | Verifica delle integrazioni e stack locale completo | 2026-11-05 |
| TEC-002 | EPIC-001 — Fondamenta del progetto | Scaffold TypeScript e quality gate | 2026-11-04 |
| TEC-001 | EPIC-001 — Fondamenta del progetto | Kickoff | 2026-11-04 |

## Next ready items

| Item | Epic | Title | Priority |
| ---- | ---- | ----- | -------- |
| TEC-006 | EPIC-001 — Fondamenta del progetto | Integrazione continua | P1 |

## Closed versions

None.

## Notes

- TEC-003, TEC-004 e US-001 sono confluiti in SPIKE-001. La prova reale WhatsApp/OpenRouter e la verifica SQL tramite il modello sono documentate nel rapporto dello spike.
- La diagnostica sicura resta a TEC-005; il filtro locale del proxy è attivo, i log esterni restano da verificare. I segreti restano esterni e ignorati da Git.
