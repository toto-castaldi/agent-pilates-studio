# REQ-OPS-004 — Ambienti di sviluppo e produzione separati

**State:** Active

Da qualsiasi clone del repository l'operatore deve poter lavorare su un ambiente di sviluppo; la produzione gira su `jarvis`. I due ambienti non condividono progetto Compose, volumi, database, segreti, configurazione o porte. L'avvio di sviluppo deve rifiutare il progetto di produzione, anche se eseguito su `jarvis`. La produzione parte da un progetto nuovo e vuoto, `agent-pilates-prod`; il volume della prova temporanea non è riusato né rimosso implicitamente.
