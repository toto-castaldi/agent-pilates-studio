# REQ-STUDIO-005 — Aggiornamento e storico delle regole

**State:** Active

Le regole non vengono mai cancellate né riscritte. Quando, da una richiesta esplicita (ad esempio "Cristina ha smesso") o implicita (ad esempio una nuova abitudine che sostituisce la precedente), l'agente valuta che una regola non sia più valida, la disattiva autonomamente registrando data, autore (REQ-STUDIO-003) e motivo, e lo comunica all'utilizzatore. Un cambiamento si esprime disattivando la regola precedente e registrandone una nuova. Lo storico delle regole, incluse quelle disattivate, resta consultabile. Il divieto di cancellazione è imposto anche dal database per la tabella delle regole.
