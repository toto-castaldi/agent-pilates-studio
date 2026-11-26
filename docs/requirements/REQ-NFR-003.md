# REQ-NFR-003 — Integrazione continua

**State:** Active

GitHub Actions deve eseguire soltanto il gate rapido di REQ-NFR-008 (lint, controllo dei tipi, test di unità in memoria e build), senza deploy automatico. La CI non avvia Docker, non installa strumenti esterni come Pi o Claude Code e non esegue suite che dipendono da rete, processi reali o servizi: il suo esito dipende solo dal codice del commit. Le suite di integrazione, compresi i test su PostgreSQL reale, si eseguono in locale secondo REQ-NFR-008. Le prove che richiedono servizi esterni e credenziali reali devono essere documentate separatamente.
