# REQ-OPS-002 — Persistenza e recupero

**State:** Active

I dati del database devono persistere tra riavvii e aggiornamenti; l'operatore deve poter eseguire e verificare un backup e un ripristino. Dopo un riavvio del server, PostgreSQL, broker e gateway di produzione devono ripartire sani senza intervento dell'operatore, con la release e i dati in esercizio prima del riavvio.
