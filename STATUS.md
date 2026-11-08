# Project status

Riepilogo derivato da `BACKLOG.md`, che resta la fonte canonica per stati e dipendenze.

**Last update:** 2026-11-08

## Current version

| Version | State | Phase | Progress |
| ------- | ----- | ----- | -------- |
| v0.3.0 | Open | Pronto: Assenze annunciate in anticipo | 7/9 items done (78%) |

I conteggi riguardano la v0.3.0; gli item del backlog non assegnato non sono inclusi.

| Item state | Count |
| ---------- | ----: |
| Todo | 2 |
| In Progress | 0 |
| Blocked | 0 |
| Done | 7 |

## In progress

None.

## Blocked

None.

## Recently completed

| Item | Epic | Module | Title | Date |
| ---- | ---- | ------ | ----- | ---- |
| TEC-030 | EPIC-001 — Fondamenta del progetto | — | Allineamento al template v1.7.1 | 2026-11-08 |
| US-008 | EPIC-005 — Presenze alle lezioni | MOD-001 | Correggere presenze e assenze | 2026-11-08 |
| US-007 | EPIC-005 — Presenze alle lezioni | MOD-001 | Registrare le assenze a una lezione | 2026-11-07 |
| TEC-029 | EPIC-001 — Fondamenta del progetto | — | Allineamento al template v1.7.0 | 2026-11-07 |
| US-006 | EPIC-005 — Presenze alle lezioni | MOD-001 | Registrare le presenze a una lezione | 2026-11-07 |
| TEC-028 | EPIC-001 — Fondamenta del progetto | — | Allineamento al template v1.6.1 | 2026-11-07 |
| TEC-027 | EPIC-005 — Presenze alle lezioni | MOD-001 | Schema delle presenze | 2026-11-07 |
| TEC-020 | EPIC-001 — Fondamenta del progetto | — | Dettato vocale Pi su server remoto | 2026-11-07 |
| TEC-025 | EPIC-002 — Agente e integrazioni | MOD-001 | Contesto per interlocutore e compattazione automatica | 2026-11-07 |
| US-005 | EPIC-002 — Agente e integrazioni | MOD-001 | Nome dell'agente | 2026-11-07 |

## Next ready items

| Item | Epic | Module | Title | Priority |
| ---- | ---- | ------ | ----- | -------- |
| US-013 | EPIC-005 — Presenze alle lezioni | MOD-001 | Assenze annunciate in anticipo | P1 |
| TEC-008 | EPIC-003 — Dati e operatività | — | Audit privacy dei log del proxy | P1 |
| US-009 | EPIC-005 — Presenze alle lezioni | MOD-001 | Consultare presenze, assenze e statistiche | P2 |
| TEC-019 | EPIC-002 — Agente e integrazioni | MOD-001 | Job cron e messaggi pianificati dell'agente | P2 |
| US-011 | EPIC-005 — Presenze alle lezioni | MOD-001 | Insegnante che ha tenuto la lezione | P2 |
| US-012 | EPIC-005 — Presenze alle lezioni | MOD-001 | Pacchetti di lezioni e lezioni residue | P2 |

TEC-008, TEC-019, US-011 e US-012 non sono assegnati a una versione: serve pianificarli prima dell’avvio; TEC-019 richiede anche requisiti e decisioni, US-011 e US-012 richiedono requisiti e un cambio di scope concordato.

## Closed versions

| Version | Closed | Tag |
| ------- | ------ | --- |
| v0.2.0 | 2026-11-07 | `v0.2.0` |
| v0.1.0 | 2026-11-05 | `v0.1.0` |

## Notes

- 2026-11-07: su accordo dell'utente, TEC-028 è aggiunto alla v0.3.0 per allineare il progetto al template v1.6.1 e attivare l'orchestrazione del lavoro parallelo.
- 2026-11-07: su accordo dell'utente, TEC-029 è aggiunto alla v0.3.0 per adottare il template v1.7.0 e il coordinamento non bloccante dei worker.
- 2026-11-08: su accordo dell'utente, US-013 è aggiunto alla v0.3.0 per registrare le assenze giustificate annunciate prima della lezione (REQ-STUDIO-010).
- 2026-11-08: su accordo dell'utente, TEC-030 è aggiunto alla v0.3.0 per adottare il template v1.7.1 e configurare il comando dei futuri worker.
- TEC-008 resta non assegnato: l’audit privacy completo del proxy e l’accettazione privacy non sono dimostrati; la prova temporanea non autorizza l’uso continuativo. Lo streaming remoto del tunnel condiviso resta vietato.
