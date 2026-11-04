# Project status

Riepilogo derivato da `BACKLOG.md`, che resta la fonte canonica per stati e dipendenze.

**Last update:** 2026-11-04

## Current version

| Version | State | Phase | Progress |
| ------- | ----- | ----- | -------- |
| v0.1.0 | Open | Stack in verifica, prove esterne in corso | 2/5 items done (40%) |

| Item state | Count |
| ---------- | ----: |
| Todo | 2 |
| In Progress | 1 |
| Blocked | 0 |
| Done | 2 |

## In progress

| Item | Epic | Title | Branch |
| ---- | ---- | ----- | ------ |
| SPIKE-001 | EPIC-002 — Agente e integrazioni | Verifica delle integrazioni e stack locale completo | `spike/SPIKE-001-verifica-integrazioni-hermes` |

## Blocked

None.

## Recently completed

| Item | Epic | Title | Date |
| ---- | ---- | ----- | ---- |
| TEC-002 | EPIC-001 — Fondamenta del progetto | Scaffold TypeScript e quality gate | 2026-11-04 |
| TEC-001 | EPIC-001 — Fondamenta del progetto | Kickoff | 2026-11-04 |

## Next ready items

None.

## Closed versions

None.

## Notes

- TEC-003, TEC-004 e US-001 sono confluiti in SPIKE-001. La richiesta diretta a OpenRouter con il modello previsto è riuscita; restano la conversazione reale WhatsApp → Hermes → OpenRouter e la chiamata SQL generata dal modello.
- L'utente ha autorizzato il riuso delle credenziali e del callback di sviluppo di `pi-agent-pilates-studio`. PostgreSQL e Hermes sono avviati localmente; il percorso webhook configurato supera l'handshake locale. Nessun tunnel è stato avviato. Riprendere verificando la disponibilità del callback condiviso, poi usare il port-forward `pnpm tunnel 18090` dal progetto precedente e concordare la prova WhatsApp. La allowlist locale contiene un solo destinatario: il secondo registrato su Meta non era presente nel `.env` consultato.
- Configurazione e segreti reali restano locali e ignorati da Git; il branch pubblicato non li contiene.
