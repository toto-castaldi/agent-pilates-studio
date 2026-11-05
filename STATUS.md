# Project status

Riepilogo derivato da `BACKLOG.md`, che resta la fonte canonica per stati e dipendenze.

**Last update:** 2026-11-05

## Current version

| Version | State | Phase | Progress |
| ------- | ----- | ----- | -------- |
| v0.2.0 | Open | Allineamento quality gate Pi in corso; schema della pianificazione avviato su branch | 2/9 items done (22%) |

I conteggi riguardano la v0.2.0; il debito TEC-008 non è assegnato a una versione.

| Item state | Count |
| ---------- | ----: |
| Todo | 6 |
| In Progress | 1 |
| Blocked | 0 |
| Done | 2 |

## In progress

| Item | Epic | Title | Branch |
| ---- | ---- | ----- | ------ |
| TEC-014 | EPIC-001 — Fondamenta del progetto | Allineamento delle verifiche alla configurazione Pi | `task/TEC-014-allineamento-verifiche-configurazione-pi` |

## Blocked

None.

## Recently completed

| Item | Epic | Title | Date |
| ---- | ---- | ----- | ---- |
| SPIKE-002 | EPIC-004 — Pianificazione delle lezioni | Identità del mittente e contesto dell'agente | 2026-11-05 |
| TEC-013 | EPIC-001 — Fondamenta del progetto | Separazione della configurazione Pi condivisa e personale | 2026-11-05 |
| TEC-009 | EPIC-003 — Dati e operatività | Avvio locale con un comando | 2026-11-05 |
| TEC-005 | EPIC-003 — Dati e operatività | Deploy e continuità operativa | 2026-11-05 |
| TEC-007 | EPIC-001 — Fondamenta del progetto | Allowlist Git per la configurazione Pi | 2026-11-05 |
| TEC-006 | EPIC-001 — Fondamenta del progetto | Integrazione continua | 2026-11-05 |
| SPIKE-001 | EPIC-002 — Agente e integrazioni | Verifica delle integrazioni e stack locale completo | 2026-11-05 |
| TEC-002 | EPIC-001 — Fondamenta del progetto | Scaffold TypeScript e quality gate | 2026-11-04 |
| TEC-001 | EPIC-001 — Fondamenta del progetto | Kickoff | 2026-11-04 |

## Next ready items

| Item | Epic | Title | Priority |
| ---- | ---- | ----- | -------- |
| TEC-010 | EPIC-004 — Pianificazione delle lezioni | Schema della pianificazione settimanale | P0 |
| TEC-008 | EPIC-003 — Dati e operatività | Audit privacy dei log del proxy | P1 |

TEC-008 non è assegnato a una versione: serve pianificarlo prima dell'avvio.

## Closed versions

| Version | Closed | Tag |
| ------- | ------ | --- |
| v0.1.0 | 2026-11-05 | `v0.1.0` |

## Notes

- Su `main`, TEC-010 risulta `Todo`; l'avvio e il lavoro parziale sono nel branch non integrato `task/TEC-010-schema-pianificazione-settimanale`, dove risulta `In Progress`. Il quality gate richiede l'allineamento Pi di TEC-014.
- TEC-003, TEC-004 e US-001 sono confluiti in SPIKE-001. La prova reale WhatsApp/OpenRouter e la verifica SQL tramite il modello sono documentate nel rapporto dello spike.
- TEC-005 ha verificato la prova WhatsApp temporanea, il backup reale e il ripristino isolato, il riavvio e la riconfigurazione del database operativo e il successivo healthcheck Hermes solo locale; al termine di TEC-005 Hermes era fermo. Gli upgrade tra versioni specifiche sono stati verificati in isolamento. Il debito non assegnato TEC-008 riguarda l'audit completo del proxy: REQ-NFR-002 resta vincolante, l'accettazione privacy della release non è dimostrata e la prova non autorizza l'uso continuativo. Lo streaming remoto del tunnel condiviso resta vietato.
- Decisione dell'utente (2026-11-05): la v0.1.0 si chiude senza accettazione privacy, rinviata a TEC-008 non assegnato; restano esclusi l'uso continuativo e qualsiasi dichiarazione di conformità a REQ-NFR-002.
- Decisione dell'utente (2026-11-05): nella v0.2.0 sono accettati nomi e cognomi reali nelle prove, con audit rinviato a TEC-008 (REQ-NFR-005); l'uso continuativo resta fuori scope.
