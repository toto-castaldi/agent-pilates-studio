# Project status

Riepilogo derivato da `BACKLOG.md`, che resta la fonte canonica per stati e dipendenze.

**Last update:** 2026-11-06

## Current version

| Version | State | Phase | Progress |
| ------- | ----- | ----- | -------- |
| v0.2.0 | Open | Correzione BUG-001 completata; prossima la registrazione delle regole | 11/14 items done (79%) |

I conteggi riguardano la v0.2.0; TEC-008 e TEC-019 non sono assegnati a una versione.

| Item state | Count |
| ---------- | ----: |
| Todo | 3 |
| In Progress | 0 |
| Blocked | 0 |
| Done | 11 |

## In progress

None.

## Blocked

None.

## Recently completed

| Item | Epic | Title | Date |
| ---- | ---- | ----- | ---- |
| BUG-001 | EPIC-002 — Agente e integrazioni | Avviso del canale home inviato agli utilizzatori | 2026-11-06 |
| TEC-012 | EPIC-004 — Pianificazione delle lezioni | Scenari conversazionali e harness | 2026-11-06 |
| TEC-018 | EPIC-001 — Fondamenta del progetto | Stato di attesa nei tool Pi di domanda | 2026-11-06 |
| TEC-011 | EPIC-004 — Pianificazione delle lezioni | Contesto dell'agente dello studio | 2026-11-06 |
| TEC-017 | EPIC-001 — Fondamenta del progetto | Template Pi per lavorare in autonomia | 2026-11-06 |
| TEC-016 | EPIC-001 — Fondamenta del progetto | Versionamento del template Pi per lo stato del progetto | 2026-11-06 |
| TEC-015 | EPIC-001 — Fondamenta del progetto | Gate di chiusura con soli test di unità in memoria | 2026-11-06 |
| TEC-010 | EPIC-004 — Pianificazione delle lezioni | Schema della pianificazione settimanale | 2026-11-05 |
| TEC-014 | EPIC-001 — Fondamenta del progetto | Allineamento delle verifiche alla configurazione Pi | 2026-11-05 |
| SPIKE-002 | EPIC-004 — Pianificazione delle lezioni | Identità del mittente e contesto dell'agente | 2026-11-05 |

## Next ready items

| Item | Epic | Title | Priority |
| ---- | ---- | ----- | -------- |
| US-002 | EPIC-004 — Pianificazione delle lezioni | Registrare una regola di allenamento | P1 |
| TEC-008 | EPIC-003 — Dati e operatività | Audit privacy dei log del proxy | P1 |
| TEC-019 | EPIC-002 — Agente e integrazioni | Job cron e messaggi pianificati dell'agente | P2 |

TEC-008 e TEC-019 non sono assegnati a una versione: serve pianificarli prima dell'avvio; TEC-019 richiede anche requisiti e decisioni.

## Closed versions

| Version | Closed | Tag |
| ------- | ------ | --- |
| v0.1.0 | 2026-11-05 | `v0.1.0` |

## Notes

- Decisione dell'utente (2026-11-06): BUG-001 è aggiunto allo scope della v0.2.0: canale home fissato in configurazione, cron rinviati a TEC-019 non assegnato.
- Decisione dell'utente (2026-11-06): TEC-018 è aggiunto allo scope della v0.2.0 per lo stato `blocked` dei tool Pi di domanda.
- Decisione dell'utente (2026-11-06): TEC-017 è aggiunto allo scope della v0.2.0 per il template Pi `/work-alone`.
- Le modifiche al gate sono state riportate separatamente nel template `agile-project-template` con commit locale `b4bc15f`, non pubblicato; altri allineamenti restano esclusi.
- Le prove di identità di TEC-010 usano modello e webhook sintetici, non servizi Meta/OpenRouter reali.
- TEC-003, TEC-004 e US-001 sono confluiti in SPIKE-001. La prova reale WhatsApp/OpenRouter e la verifica SQL tramite il modello sono documentate nel rapporto dello spike.
- TEC-005 ha verificato la prova WhatsApp temporanea, il backup reale e il ripristino isolato, il riavvio e la riconfigurazione del database operativo e il successivo healthcheck Hermes solo locale; al termine di TEC-005 Hermes era fermo. Gli upgrade tra versioni specifiche sono stati verificati in isolamento. Il debito non assegnato TEC-008 riguarda l'audit completo del proxy: REQ-NFR-002 resta vincolante, l'accettazione privacy della release non è dimostrata e la prova non autorizza l'uso continuativo. Lo streaming remoto del tunnel condiviso resta vietato.
- Decisione dell'utente (2026-11-05): la v0.1.0 si chiude senza accettazione privacy, rinviata a TEC-008 non assegnato; restano esclusi l'uso continuativo e qualsiasi dichiarazione di conformità a REQ-NFR-002.
- Decisione dell'utente (2026-11-05): nella v0.2.0 sono accettati nomi e cognomi reali nelle prove, con audit rinviato a TEC-008 (REQ-NFR-005); l'uso continuativo resta fuori scope.
