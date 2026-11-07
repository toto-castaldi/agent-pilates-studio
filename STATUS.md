# Project status

Riepilogo derivato da `BACKLOG.md`, che resta la fonte canonica per stati e dipendenze.

**Last update:** 2026-11-07

## Current version

| Version | State | Phase | Progress |
| ------- | ----- | ----- | -------- |
| v0.3.0 | Open | Schema delle presenze completato; registrazione conversazionale in corso | 2/6 items done (33%) |

I conteggi riguardano la v0.3.0; TEC-008, TEC-019 e US-010–US-012 non sono assegnati a una versione.

| Item state | Count |
| ---------- | ----: |
| Todo | 3 |
| In Progress | 1 |
| Blocked | 0 |
| Done | 2 |

## In progress

| Item | Epic | Module | Title | Branch |
| ---- | ---- | ------ | ----- | ------ |
| US-006 | EPIC-005 — Presenze alle lezioni | MOD-001 | Registrare le presenze a una lezione | `us/US-006-registrare-presenze-lezione` |

## Blocked

None.

## Recently completed

| Item | Epic | Module | Title | Date |
| ---- | ---- | ------ | ----- | ---- |
| TEC-028 | EPIC-001 — Fondamenta del progetto | — | Allineamento al template v1.6.1 | 2026-11-07 |
| TEC-027 | EPIC-005 — Presenze alle lezioni | MOD-001 | Schema delle presenze | 2026-11-07 |
| TEC-020 | EPIC-001 — Fondamenta del progetto | — | Dettato vocale Pi su server remoto | 2026-11-07 |
| TEC-025 | EPIC-002 — Agente e integrazioni | MOD-001 | Contesto per interlocutore e compattazione automatica | 2026-11-07 |
| US-005 | EPIC-002 — Agente e integrazioni | MOD-001 | Nome dell'agente | 2026-11-07 |
| TEC-026 | EPIC-003 — Dati e operatività | MOD-001 | Applicare la configurazione locale da `.env` | 2026-11-07 |
| TEC-024 | EPIC-001 — Fondamenta del progetto | MOD-001 | Adozione del template v1.5.0 | 2026-11-07 |
| US-003 | EPIC-004 — Pianificazione delle lezioni | MOD-001 | Consultare la pianificazione settimanale | 2026-11-07 |
| US-004 | EPIC-004 — Pianificazione delle lezioni | MOD-001 | Aggiornare e disattivare le regole | 2026-11-07 |
| TEC-023 | EPIC-001 — Fondamenta del progetto | — | Adozione del template v1.4.0 | 2026-11-07 |

## Next ready items

| Item | Epic | Module | Title | Priority |
| ---- | ---- | ------ | ----- | -------- |
| TEC-008 | EPIC-003 — Dati e operatività | — | Audit privacy dei log del proxy | P1 |
| TEC-019 | EPIC-002 — Agente e integrazioni | MOD-001 | Job cron e messaggi pianificati dell'agente | P2 |

TEC-008 e TEC-019 non sono assegnati a una versione: serve pianificarli prima dell'avvio; TEC-019 richiede anche requisiti e decisioni.

## Closed versions

| Version | Closed | Tag |
| ------- | ------ | --- |
| v0.2.0 | 2026-11-07 | `v0.2.0` |
| v0.1.0 | 2026-11-05 | `v0.1.0` |

## Notes

- Decisione dell'utente (2026-11-07): TEC-028 è aggiunto alla v0.3.0 per allineare il template alla v1.6.1 e attivare l'orchestrazione parallela, senza avviare worker per la sola adozione.
- Decisione dell'utente (2026-11-07): la v0.2.0 è chiusa con gate, tutte le suite di integrazione e CI superati; oltre agli scenari con OpenRouter reale e sostituto Meta, l'utente dichiara di aver eseguito prove reali via WhatsApp. L'accettazione privacy resta rinviata a TEC-008.
- Decisione dell'utente (2026-11-07): TEC-026 è aggiunto alla v0.2.0 per applicare configurazione e credenziali esterne da `.env`; le password PostgreSQL non vengono ruotate automaticamente.
- Decisione dell'utente (2026-11-07): il nome dell'agente è Ambrogio, definito in `SOUL.md`; il nome del profilo WhatsApp su Meta è fuori scope.
- Decisione dell'utente (2026-11-07): TEC-025 è aggiunto alla v0.2.0 per un contesto del modello separato per interlocutore, con compattazione silenziosa al 40% della finestra del modello configurato e dopo inattività configurabile, con valore predefinito di 4 ore.
- Decisione dell'utente (2026-11-07): TEC-024 è aggiunto alla v0.2.0 per adottare il template v1.5.0 con shared claims attivi e la relativa eccezione ai push in `/work-alone`.
- Decisione dell'utente (2026-11-07): TEC-023 è aggiunto alla v0.2.0 per adottare il template v1.4.0 e definire il solo modulo architetturale Agente.
- Decisione dell'utente (2026-11-07): TEC-022 è aggiunto alla v0.2.0 per tracciare il template di origine e preparare futuri aggiornamenti, senza adottarli in TEC-022.
- Decisione dell'utente (2026-11-07): TEC-021 è aggiunto alla v0.2.0 per consentire `.env` come collegamento simbolico privato.
- Decisione dell'utente (2026-11-06): BUG-001 è aggiunto allo scope della v0.2.0: canale home fissato in configurazione, cron rinviati a TEC-019 non assegnato.
- Decisione dell'utente (2026-11-06): TEC-020 è aggiunto allo scope della v0.2.0 per il dettato vocale Pi su server remoto tramite inoltro audio SSH.
- Decisione dell'utente (2026-11-06): TEC-018 è aggiunto allo scope della v0.2.0 per lo stato `blocked` dei tool Pi di domanda.
- Decisione dell'utente (2026-11-06): TEC-017 è aggiunto allo scope della v0.2.0 per il template Pi `/work-alone`.
- Il riporto parziale del gate TEC-015 nel template è pubblicato e antenato di `v1.4.0`; TEC-023 allinea processo e skill al riferimento fissato.
- Le prove di identità di TEC-010 usano modello e webhook sintetici, non servizi Meta/OpenRouter reali.
- TEC-003, TEC-004 e US-001 sono confluiti in SPIKE-001. La prova reale WhatsApp/OpenRouter e la verifica SQL tramite il modello sono documentate nel rapporto dello spike.
- TEC-005 ha verificato la prova WhatsApp temporanea, il backup reale e il ripristino isolato, il riavvio e la riconfigurazione del database operativo e il successivo healthcheck Hermes solo locale; al termine di TEC-005 Hermes era fermo. Gli upgrade tra versioni specifiche sono stati verificati in isolamento. Il debito non assegnato TEC-008 riguarda l'audit completo del proxy: REQ-NFR-002 resta vincolante, l'accettazione privacy della release non è dimostrata e la prova non autorizza l'uso continuativo. Lo streaming remoto del tunnel condiviso resta vietato.
- Decisione dell'utente (2026-11-05): la v0.1.0 si chiude senza accettazione privacy, rinviata a TEC-008 non assegnato; restano esclusi l'uso continuativo e qualsiasi dichiarazione di conformità a REQ-NFR-002.
- Decisione dell'utente (2026-11-05): nella v0.2.0 sono accettati nomi e cognomi reali nelle prove, con audit rinviato a TEC-008 (REQ-NFR-005); l'uso continuativo resta fuori scope.
