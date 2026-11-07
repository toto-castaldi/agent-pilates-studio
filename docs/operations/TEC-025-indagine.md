# TEC-025 — Indagine preliminare

**Stato:** lavoro in corso; non è una prova di accettazione né descrive funzionalità già attive.

Nell'immagine Hermes v0.22.7 fissata dal progetto sono stati esaminati i sorgenti dell'agente e del gateway, senza utilizzare dati delle sessioni reali:

- `agent/context_compressor.py` applica una soglia percentuale minima del 75% alle finestre inferiori a 512K e altri limiti; `threshold_tokens` è un limite superiore assoluto, non una richiesta di usare esattamente quel valore. Occorre verificare il valore effettivo anche dopo cambi di modello e ricalcoli.
- `agent/turn_context_compaction.py` usa `_last_activity_ts` per l'inattività, ma `gateway/run.py` azzera questo timestamp all'inizio del turno di un agente in cache e `agent/turn_facade_lease.py` lo aggiorna all'ingresso del turno. Inoltre la logica nativa può saltare la compattazione sotto un pavimento o durante un cooldown. La sola impostazione `idle_compact_after_seconds` non dimostra il criterio richiesto, in particolare dopo riavvio e ricreazione.
- `gateway/run_turn_runner.py` distingue la cronologia persistita, con timestamp, dalla cronologia passata al modello, da cui i timestamp sono rimossi. Un eventuale adattamento deve considerare concorrenza, turni interrotti e disponibilità dei timestamp, oltre a non confondere le sessioni dei mittenti.
- In `agent/conversation_compression.py` gli avvisi di errore sono emessi anche quando l'avviso di avanzamento è disattivato. Occorre verificare tutte le vie di notifica, inclusi gli errori, attraverso il sostituto Meta, senza eliminare silenziosamente dati della conversazione.
- Il catalogo pubblico OpenRouter era raggiungibile durante l'indagine e riportava una finestra per il modello iniziale. Questo controllo non è una garanzia di disponibilità futura né autorizza un valore fissato come fallback. Occorrono una politica esplicita in caso di metadati mancanti e prove con modelli sintetici.

`scripts/compaction-policy.mjs` e i relativi test in memoria preparano il calcolo intero della soglia, la selezione esatta del modello nel catalogo e la validazione dell'intervallo. Non sono ancora collegati all'avvio o al gateway e non modificano il comportamento dell'agente. Restano da implementare il collegamento al provider e a Hermes, la configurazione effettiva, la compattazione alla ripresa e le prove di integrazione richieste dal backlog.
