# Project status

Riepilogo derivato da `BACKLOG.md`, che resta la fonte canonica per stati e dipendenze.

**Last update:** 2026-11-06

## Current version

| Version | State | Phase | Progress |
| ------- | ----- | ----- | -------- |
| v0.2.0 | Open | Template Pi dello stato completato; contesto dell'agente da avviare | 6/11 items done (55%) |

I conteggi riguardano la v0.2.0; il debito TEC-008 non è assegnato a una versione.

| Item state | Count |
| ---------- | ----: |
| Todo | 5 |
| In Progress | 0 |
| Blocked | 0 |
| Done | 6 |

## In progress

None.

## Blocked

None.

## Recently completed

| Item | Epic | Title | Date |
| ---- | ---- | ----- | ---- |
| TEC-016 | EPIC-001 — Fondamenta del progetto | Versionamento del template Pi per lo stato del progetto | 2026-11-06 |
| TEC-015 | EPIC-001 — Fondamenta del progetto | Gate di chiusura con soli test di unità in memoria | 2026-11-06 |
| TEC-010 | EPIC-004 — Pianificazione delle lezioni | Schema della pianificazione settimanale | 2026-11-05 |
| TEC-014 | EPIC-001 — Fondamenta del progetto | Allineamento delle verifiche alla configurazione Pi | 2026-11-05 |
| SPIKE-002 | EPIC-004 — Pianificazione delle lezioni | Identità del mittente e contesto dell'agente | 2026-11-05 |
| TEC-013 | EPIC-001 — Fondamenta del progetto | Separazione della configurazione Pi condivisa e personale | 2026-11-05 |
| TEC-009 | EPIC-003 — Dati e operatività | Avvio locale con un comando | 2026-11-05 |
| TEC-005 | EPIC-003 — Dati e operatività | Deploy e continuità operativa | 2026-11-05 |
| TEC-007 | EPIC-001 — Fondamenta del progetto | Allowlist Git per la configurazione Pi | 2026-11-05 |
| TEC-006 | EPIC-001 — Fondamenta del progetto | Integrazione continua | 2026-11-05 |

## Next ready items

| Item | Epic | Title | Priority |
| ---- | ---- | ----- | -------- |
| TEC-011 | EPIC-004 — Pianificazione delle lezioni | Contesto dell'agente dello studio | P0 |
| TEC-008 | EPIC-003 — Dati e operatività | Audit privacy dei log del proxy | P1 |

TEC-008 non è assegnato a una versione: serve pianificarlo prima dell'avvio.

## Closed versions

| Version | Closed | Tag |
| ------- | ------ | --- |
| v0.1.0 | 2026-11-05 | `v0.1.0` |

## Notes

- Le modifiche al gate sono state riportate separatamente nel template `agile-project-template` con commit locale `b4bc15f`, non pubblicato; altri allineamenti restano esclusi.
- Le prove di identità di TEC-010 usano modello e webhook sintetici, non servizi Meta/OpenRouter reali.
- TEC-003, TEC-004 e US-001 sono confluiti in SPIKE-001. La prova reale WhatsApp/OpenRouter e la verifica SQL tramite il modello sono documentate nel rapporto dello spike.
- TEC-005 ha verificato la prova WhatsApp temporanea, il backup reale e il ripristino isolato, il riavvio e la riconfigurazione del database operativo e il successivo healthcheck Hermes solo locale; al termine di TEC-005 Hermes era fermo. Gli upgrade tra versioni specifiche sono stati verificati in isolamento. Il debito non assegnato TEC-008 riguarda l'audit completo del proxy: REQ-NFR-002 resta vincolante, l'accettazione privacy della release non è dimostrata e la prova non autorizza l'uso continuativo. Lo streaming remoto del tunnel condiviso resta vietato.
- Decisione dell'utente (2026-11-05): la v0.1.0 si chiude senza accettazione privacy, rinviata a TEC-008 non assegnato; restano esclusi l'uso continuativo e qualsiasi dichiarazione di conformità a REQ-NFR-002.
- Decisione dell'utente (2026-11-05): nella v0.2.0 sono accettati nomi e cognomi reali nelle prove, con audit rinviato a TEC-008 (REQ-NFR-005); l'uso continuativo resta fuori scope.
