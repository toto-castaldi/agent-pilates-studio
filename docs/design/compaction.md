# Per-interlocutor context and compaction

Hermes mantiene una sessione SQLite per ogni chat WhatsApp diretta, legata all'insegnante che la possiede: una chat precedente al passaggio o di un numero passato a un'altra persona viene azzerata prima del primo turno (`identity`), quindi la compattazione non riassume mai la conversazione di un'altra identità.

## Soglia

All'avvio l'entrypoint esegue con Node.js dell'immagine `hermes/compaction-settings.mjs`, che usa la politica pura `scripts/compaction-policy.mjs`: legge `${OPENROUTER_BASE_URL}/models` (predefinito il catalogo OpenRouter), richiede una sola voce con l'ID esatto di `PILATES_MODEL` e una `context_length` intera, calcola per difetto il 40% ed esporta `PILATES_COMPACTION_THRESHOLD_TOKENS`, usata in `compression.threshold_tokens`. Hermes 0.22.7 adotta il minore tra questo limite e la propria soglia percentuale, alzata al 75% sotto 512K token; la soglia resta quindi al 40% e non viene mai alzata in silenzio. Catalogo irraggiungibile, modello assente o ambiguo e intervallo non valido arrestano l'avvio con `hermes_preflight_failed`. La stima dei token è quella approssimata di Hermes: il 40% è una soglia di attivazione, non un limite rigido; se Hermes risolve una finestra minore, la soglia effettiva può essere più bassa, mai più alta. Cambiando `PILATES_MODEL` la soglia si aggiorna al successivo avvio.

## Ripresa dopo inattività

`PILATES_IDLE_COMPACT_SECONDS` (predefinito 14400) è validato dallo stesso modulo, anche in `start:local`. L'inattività nativa di Hermes (`idle_compact_after_seconds`) è disabilitata: il suo orologio riparte all'inizio di ogni turno dell'agente in cache, si perde al riavvio e ignora le conversazioni sotto l'8% della finestra.

`pilates_trusted.py` calcola invece l'inattività dal timestamp dell'ultima riga persistita della trascrizione (`gateway.run._last_transcript_timestamp`) nel wrapper di `TurnRunner._run_conversation_with_approval` e sostituisce `agent.turn_context_compaction._idle_compaction`: oltre l'intervallo, una volta per turno, chiama il compressore integrato (`_compress_context` con `trigger='idle'`) prima della richiesta al modello e riallinea la cronologia con `conversation_history_after_compression` e `_reanchor`, senza emettere stati. Sono rispettati il blocco di Hermes dopo un errore del riassunto e l'attesa dell'uso reale dopo una compattazione; righe prive di timestamp interpretabile non attivano la ripresa.

## Riassunti

Il compressore protegge le prime tre righe e la coda recente (modalità `lean`, valori predefiniti di Hermes), conserva estratti dei messaggi utente nel riassunto e non fa nulla se non resta altro da riassumere. I riassunti usano il modello principale (`auxiliary.compression` in `auto`); `auxiliary.openrouter_model` è fissato a `PILATES_MODEL` perché la corsia di ripiego OpenRouter non usi un altro modello a pagamento. `auxiliary.free_only` non è utilizzabile perché rifiuterebbe anche il modello principale. Con `abort_on_summary_failure` un riassunto fallito lascia il contesto invariato e il turno prosegue.

`display.suppress_warning_notifications` impedisce l'invio su WhatsApp degli avvisi del motore, inclusi gli errori di compattazione; gli stati di avanzamento restano filtrati da `progress_notices: false`. Riassunti e cronologia compattata restano nel volume SQLite, inclusi nel backup, transitano verso OpenRouter per la generazione del riassunto e non compaiono nei log (`security`).

Gli adattamenti usano punti interni dell'immagine fissata (wrapper del turno, `_idle_compaction`, `_preflight_request_tokens`, `_compress_context`, `_reanchor`, `_last_transcript_timestamp`) e la semantica di `threshold_tokens`: ogni aggiornamento di Hermes richiede la ripetizione di `test:compaction`. Prove e limiti: [prove](../operations/TEC-025-prove.md).
