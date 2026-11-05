# Project status

Riepilogo derivato da `BACKLOG.md`, che resta la fonte canonica per stati e dipendenze.

**Last update:** 2026-11-05

## Current version

| Version | State | Phase | Progress |
| ------- | ----- | ----- | -------- |
| v0.1.0 | Open | Operatività in corso e valutazione privacy del proxy | 5/6 items done (83%) |

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
- Il filtro locale del proxy è attivo; i log applicativi limitati a eventi fissi e il ripristino di stato Hermes sintetico sono stati verificati in prove isolate, anche su `jarvis`. Un aggiornamento tra versioni specifiche di PostgreSQL e Hermes è stato provato in isolamento, anche su `jarvis`. L'operatore ha confermato che non ci sono esportazioni Cloudflare configurate e non ne verranno configurate; prove proxy sintetiche aggiuntive sono passate. L'operatore ha confermato una risposta WhatsApp nella prova pubblica temporanea; Hermes è fermo. Il backup reale è stato ripristinato e verificato su disco LUKS, ma manca una copia indipendente. L'audit completo dei log è registrato come debito tecnico da riportare nel backlog su `main`. Lo streaming remoto del tunnel condiviso è vietato operativamente; i segreti restano esterni e ignorati da Git.
