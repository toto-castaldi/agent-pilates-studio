# REQ-NFR-011 — Stato di attesa dei tool Pi di domanda

**State:** Active

Quando l'assistente Pi del progetto pone domande all'utente con i tool `question` o `questionnaire` e attende la risposta, deve segnalarlo al terminale come attesa dell'utente (`blocked`, tipo `question`, del Program Status Protocol OSC 7501 supportato da Pi), non come lavoro in corso. Alla risposta o all'annullamento lo stato torna a quello dell'esecuzione in corso. I tool mantengono nomi, parametri e comportamento attuali; sono forniti dal pacchetto Pi condiviso `agent-harness-stuff`, referenziato con un riferimento fissato, nel rispetto della licenza del codice d'origine. Il pacchetto e la configurazione restano privi di segreti e dati personali (REQ-NFR-002, REQ-NFR-007).
