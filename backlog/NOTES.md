# Notes

- TEC-003, TEC-004 e US-001 sono confluiti in SPIKE-001 e non sono più assegnati separatamente alla v0.1.0; i loro ID restano riservati e il dettaglio originario è nella storia Git di BACKLOG.md.
- Gli item non assegnati devono essere pianificati prima dell'implementazione; i requisiti applicabili restano vincolanti.
- TEC-008 completato il 2026-11-14: Cloudflare conserva per 31-32 giorni la query string con il verify token Meta; per decisione dell'utente (REQ-NFR-002) nessuna rotazione, rischio accettato fino alla scadenza della retention e verify token monouso per il futuro. Logpush, Log Explorer della zona e Logpull restano non verificati, conformità non dichiarata; l'uso continuativo della sola produzione segue la decisione del 2026-11-09 e lo streaming remoto del tunnel resta vietato.
