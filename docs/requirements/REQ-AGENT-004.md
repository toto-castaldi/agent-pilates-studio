# REQ-AGENT-004 — Contesto per interlocutore e compattazione

**State:** Active

Ogni interlocutore autorizzato ha un proprio contesto di conversazione con il modello, separato da quello degli altri. Quando il contesto inviato al modello raggiunge il 40% della finestra di contesto del modello configurato, l'agente lo compatta automaticamente, riassumendo la parte meno recente e conservando il contesto dello studio e i turni recenti necessari a proseguire. Il 40% è la soglia di attivazione, non un tetto rigido: sono ammessi superamenti temporanei fino alla compattazione. La soglia segue il modello configurato e non è fissata per un modello specifico.

Quando una conversazione riprende dopo un periodo di inattività configurabile dall'operatore, con valore predefinito di 4 ore, il contesto viene compattato prima di elaborare il nuovo messaggio. La compattazione è silenziosa: gli utilizzatori non ricevono avvisi di sistema sul suo avvio, sul completamento o sugli errori (REQ-WA-003). La compattazione non modifica i dati del database né l'attribuzione dell'autore (REQ-STUDIO-003). Riassunti e cronologia persistono come le sessioni di Hermes, non compaiono nei log e possono transitare verso OpenRouter come le conversazioni (REQ-NFR-002, REQ-NFR-005, REQ-OPS-002).

Se la finestra del modello configurato non è determinabile, il gateway non si avvia. I riassunti usano lo stesso modello configurato e i turni protetti seguono i valori predefiniti di Hermes. Se il riassunto fallisce, il turno prosegue con il contesto completo senza avvisi; alla ripresa non si compatta se non c'è nulla oltre i turni protetti. L'intervallo si configura in secondi con `PILATES_IDLE_COMPACT_SECONDS`.
