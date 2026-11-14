# REQ-WA-002 — Accesso e webhook

**State:** Active

Solo i numeri censiti con accesso abilitato nel database possono interagire con l'agente per le operazioni dello studio (REQ-STUDIO-015). Il solo gestore configurato ha l'eccezione per completare il proprio censimento iniziale. Non esistono allowlist o collegamenti numero–insegnante mantenuti in parallelo nella configurazione. Le richieste del webhook devono essere autenticate e quelle non valide rifiutate; conoscere un nome, dichiarare un ruolo o scrivere un numero nel testo non autentica il mittente.

A un messaggio autentico da un numero non censito, incompleto o revocato il sistema risponde con un testo fisso che indica accesso non abilitato e invita a rivolgersi al gestore, senza divulgarne il numero, chiamare il modello o accedere ai dati dello studio. L'eccezione di censimento iniziale del gestore resta separata. Restano indipendenti i vincoli esterni di Meta.
