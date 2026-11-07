# Project status

Riepilogo derivato da `BACKLOG.md`, che resta la fonte canonica per stati e dipendenze.

**Last update:** 2026-11-07

## Current version

| Version | State | Phase | Progress |
| ------- | ----- | ----- | -------- |
| v0.2.0 | Open | Registrazione e tracciabilità del template verificati; consultazione, aggiornamento, dettato remoto e adozione del template da avviare | 14/18 items done (78%) |

I conteggi riguardano la v0.2.0; TEC-008 e TEC-019 non sono assegnati a una versione.

| Item state | Count |
| ---------- | ----: |
| Todo | 4 |
| In Progress | 0 |
| Blocked | 0 |
| Done | 14 |

## In progress

None.

## Blocked

None.

## Recently completed

| Item | Epic | Title | Date |
| ---- | ---- | ----- | ---- |
| TEC-022 | EPIC-001 — Fondamenta del progetto | Tracciabilità e aggiornamento dal template | 2026-11-07 |
| TEC-021 | EPIC-001 — Fondamenta del progetto | Avvio locale con configurazione collegata | 2026-11-07 |
| BUG-001 | EPIC-002 — Agente e integrazioni | Avviso del canale home inviato agli utilizzatori | 2026-11-06 |
| US-002 | EPIC-004 — Pianificazione delle lezioni | Registrare una regola di allenamento | 2026-11-06 |
| TEC-012 | EPIC-004 — Pianificazione delle lezioni | Scenari conversazionali e harness | 2026-11-06 |
| TEC-018 | EPIC-001 — Fondamenta del progetto | Stato di attesa nei tool Pi di domanda | 2026-11-06 |
| TEC-011 | EPIC-004 — Pianificazione delle lezioni | Contesto dell'agente dello studio | 2026-11-06 |
| TEC-017 | EPIC-001 — Fondamenta del progetto | Template Pi per lavorare in autonomia | 2026-11-06 |
| TEC-016 | EPIC-001 — Fondamenta del progetto | Versionamento del template Pi per lo stato del progetto | 2026-11-06 |
| TEC-015 | EPIC-001 — Fondamenta del progetto | Gate di chiusura con soli test di unità in memoria | 2026-11-06 |

## Next ready items

| Item | Epic | Title | Priority |
| ---- | ---- | ----- | -------- |
| US-003 | EPIC-004 — Pianificazione delle lezioni | Consultare la pianificazione settimanale | P1 |
| US-004 | EPIC-004 — Pianificazione delle lezioni | Aggiornare e disattivare le regole | P1 |
| TEC-008 | EPIC-003 — Dati e operatività | Audit privacy dei log del proxy | P1 |
| TEC-020 | EPIC-001 — Fondamenta del progetto | Dettato vocale Pi su server remoto | P2 |
| TEC-023 | EPIC-001 — Fondamenta del progetto | Adozione del template v1.4.0 | P2 |
| TEC-019 | EPIC-002 — Agente e integrazioni | Job cron e messaggi pianificati dell'agente | P2 |

TEC-008 e TEC-019 non sono assegnati a una versione: serve pianificarli prima dell'avvio; TEC-019 richiede anche requisiti e decisioni.

## Closed versions

| Version | Closed | Tag |
| ------- | ------ | --- |
| v0.1.0 | 2026-11-05 | `v0.1.0` |

## Notes

- Decisione dell'utente (2026-11-07): TEC-023 è aggiunto alla v0.2.0 per adottare il template v1.4.0 e definire il solo modulo architetturale Agente.
- Decisione dell'utente (2026-11-07): TEC-022 è aggiunto alla v0.2.0 per tracciare il template di origine e preparare futuri aggiornamenti, senza adottarli ora.
- Decisione dell'utente (2026-11-07): TEC-021 è aggiunto alla v0.2.0 per consentire `.env` come collegamento simbolico privato.
- Decisione dell'utente (2026-11-06): BUG-001 è aggiunto allo scope della v0.2.0: canale home fissato in configurazione, cron rinviati a TEC-019 non assegnato.
- Decisione dell'utente (2026-11-06): TEC-020 è aggiunto allo scope della v0.2.0 per il dettato vocale Pi su server remoto tramite inoltro audio SSH.
- Decisione dell'utente (2026-11-06): TEC-018 è aggiunto allo scope della v0.2.0 per lo stato `blocked` dei tool Pi di domanda.
- Decisione dell'utente (2026-11-06): TEC-017 è aggiunto allo scope della v0.2.0 per il template Pi `/work-alone`.
- Il riporto parziale del gate TEC-015 nel template è pubblicato e antenato di `v1.4.0`; altri allineamenti non sono adottati (TEC-022).
- Le prove di identità di TEC-010 usano modello e webhook sintetici, non servizi Meta/OpenRouter reali.
- TEC-003, TEC-004 e US-001 sono confluiti in SPIKE-001. La prova reale WhatsApp/OpenRouter e la verifica SQL tramite il modello sono documentate nel rapporto dello spike.
- TEC-005 ha verificato la prova WhatsApp temporanea, il backup reale e il ripristino isolato, il riavvio e la riconfigurazione del database operativo e il successivo healthcheck Hermes solo locale; al termine di TEC-005 Hermes era fermo. Gli upgrade tra versioni specifiche sono stati verificati in isolamento. Il debito non assegnato TEC-008 riguarda l'audit completo del proxy: REQ-NFR-002 resta vincolante, l'accettazione privacy della release non è dimostrata e la prova non autorizza l'uso continuativo. Lo streaming remoto del tunnel condiviso resta vietato.
- Decisione dell'utente (2026-11-05): la v0.1.0 si chiude senza accettazione privacy, rinviata a TEC-008 non assegnato; restano esclusi l'uso continuativo e qualsiasi dichiarazione di conformità a REQ-NFR-002.
- Decisione dell'utente (2026-11-05): nella v0.2.0 sono accettati nomi e cognomi reali nelle prove, con audit rinviato a TEC-008 (REQ-NFR-005); l'uso continuativo resta fuori scope.
