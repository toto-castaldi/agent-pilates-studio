# REQ-OPS-008 — Backup a caldo del database di produzione

**State:** Active

L'operatore deve poter ottenere a mano, con un comando dell'immagine `ops`, una copia del database PostgreSQL di produzione senza fermare gateway e broker, per consultarla o ripristinarla altrove. La copia è coerente, esclude i dati che il backup quiescente esclude, è privata e verificabile con checksum e non contiene la cronologia di Hermes. Non sostituisce il backup quiescente di aggiornamento e ritorno (REQ-OPS-005) e non è usata dal ritorno alla versione precedente. Oltre al comando manuale, la sola esecuzione automatica è quella pianificata di REQ-OPS-010.
