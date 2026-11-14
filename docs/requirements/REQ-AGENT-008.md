# REQ-AGENT-008 — Contesto dell'agente compatto

**State:** Active

Il contesto sempre presente dell'agente, `SOUL.md`, non deve superare 15.000 caratteri e contiene identità, nome, principi generali, protezioni, limiti delle fasce orarie e indicazioni su quando usare le istruzioni di dettaglio. Le istruzioni di dettaglio di un'area, ad esempio presenze o insegnanti, possono stare in skill versionate nel progetto e caricate su richiesta; le ricostruzioni dei dati complesse e ripetitive possono essere fornite da viste o funzioni del database oppure da tool dedicati, calcolati deterministicamente. Le regole di comportamento restano in `SOUL.md` e nelle skill versionate, senza duplicazioni nel codice; viste, funzioni e tool calcolano dati ma non decidono conferme, chiarimenti o resoconti.

Le skill sono di sola lettura per l'agente: il modello non può crearle, modificarle o installarne altre, e restano incluse nelle immagini pubblicate come `SOUL.md`. Eventuali viste, funzioni o tool rispettano REQ-DB-002, l'attribuzione di REQ-STUDIO-003 e la protezione dei numeri di REQ-NFR-006, senza concedere DDL all'agente. La riduzione non deve modificare i comportamenti richiesti dai requisiti dello studio e dell'agente.

**Decisione dell'utente (2026-11-14):** requisito aggiunto alla v0.3.0 come cambio di scope, da attuare prima di TEC-042 con SPIKE-003 e TEC-046. Fino al completamento dell'implementazione resta valida la regola corrente: le regole di comportamento stanno soltanto in `SOUL.md`.
