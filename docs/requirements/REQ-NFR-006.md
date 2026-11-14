# REQ-NFR-006 — Verifica del comportamento conversazionale

**State:** Active

Il comportamento dell'agente nei casi d'uso STUDIO deve essere verificato con scenari conversazionali documentati con dati sintetici, che indicano richiesta, risposta attesa e stato atteso del database, e con un harness automatico eseguibile su richiesta con il modello reale tramite OpenRouter. L'harness non fa parte della CI né del quality gate e richiede credenziali esterne; vincoli e privilegi del database restano verificati da test automatici su PostgreSQL reale.
