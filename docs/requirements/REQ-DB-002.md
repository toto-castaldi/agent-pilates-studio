# REQ-DB-002 — Privilegi dell'agente

**State:** Active

L'agente deve poter eseguire operazioni DML sui dati, ma non DDL sugli oggetti dello schema; le credenziali per le migrazioni devono essere distinte e non disponibili all'agente. È accettata l'eccezione standard PostgreSQL per cui il ruolo di login può modificare la propria password: l'operatore deve poterla ripristinare senza esporre all'agente credenziali amministrative o di migrazione.
