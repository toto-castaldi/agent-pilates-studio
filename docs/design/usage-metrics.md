# Usage metrics

Metriche d'uso per messaggio (REQ-OPS-011) e loro consultazione in Grafana (REQ-OPS-012), in produzione e in sviluppo. Le misure sono prese dal codice fidato del gateway, scritte nel database dal broker e lette da Grafana con un ruolo dedicato; l'agente non le vede, non le scrive e non ne fornisce i valori.

## Punti di misura

Un evento per ogni messaggio autenticato gestito, raccolto in un contesto per messaggio e inviato dopo l'ultimo invio a Meta, mai prima della risposta. Un messaggio senza risposta produce un evento con esito `none`.

| Dato | Fonte e punto di misura |
| --- | --- |
| Tipo di turno | `agent` se il messaggio raggiunge `TurnRunner._run_conversation_with_approval`; `rejected_command` dai gestori dei comandi rifiutati del gateway (modello, ragionamento, home, skill) e dai comandi gestionali rifiutati dal broker; `management` per le risposte del percorso guidato del broker; `fixed` per il rifiuto d'accesso (broker o ricevuta superata nel gateway) e per ogni altra risposta senza modello (comandi nativi ammessi come `/new`). Il tipo dei turni del webhook è deciso dal broker, non dal gateway; la precedenza è applicata da `classifyTurn` (`src/usage-event.ts`). |
| Ricezione | Orologio del gateway all'ingresso del webhook firmato (`Application._handle`), prima del broker. |
| Invio e tempo complessivo | Fine dell'ultimo POST a Meta della risposta: client del gateway per le risposte del broker, `WhatsAppCloudAdapter._post_messages` per quelle di Hermes; tempo complessivo = invio − ricezione. |
| Tempo nel modello | Somma di `api_duration` delle richieste principali (`post_api_request`) e dei riassunti di compattazione del turno, comprensiva dello streaming. La generazione del titolo è esclusa dal tempo perché non precede la risposta, ma entra in token e costo. |
| Modello | `model` della risposta del provider dell'ultima richiesta principale; vuoto se manca. |
| Livello di thinking | Parametro `reasoning` effettivamente inviato nella richiesta principale (`build_api_kwargs`); vuoto se Hermes non lo invia. Il valore configurato non è una misura. |
| Token | Somma di `prompt_tokens` e `completion_tokens` di `usage` di tutte le richieste del turno; vuota se una richiesta non li riporta, come il costo. |
| Contesto | `prompt_tokens` dell'ultima richiesta principale; finestra e soglia di compattazione dal compressore di Hermes (`context_length`, `threshold_tokens`), registrate con l'evento; percentuale = contesto / finestra × 100, arrotondata a due decimali e registrata in `context_percent`. |
| Compattazioni | Hook `post_compaction` (solo compattazioni committate) nel turno. |
| Chiamate ai tool | Somma di `assistant_tool_call_count` delle richieste principali: chiamate chieste dal modello, incluse quelle rifiutate dall'allowlist. |
| Costo | `usage.cost` della risposta grezza OpenRouter di ogni richiesta del turno, anche ausiliaria; vuoto se una richiesta non lo riporta. Le stime di prezzo di Hermes non sono usate. |
| Esito dell'invio | `sent`, `refused` con stato HTTP e codice Meta (stesso estrattore di `whatsapp_send_failed`, ultimo tentativo dopo i ritentativi dell'adattatore), `network`, `none` senza risposta. |

Gli hook documentati di Hermes non espongono la risposta grezza: costo e modello servito si leggono avvolgendo `agent.turn_response_intake._fire_post_api_request_hook` e `agent.auxiliary_hooks.run_with_aux_hooks` (e la sua variante asincrona), il livello inviato avvolgendo `agent.chat_completion_helpers.build_api_kwargs`; le compattazioni con l'hook `post_compaction` registrato dal plugin del progetto. Sono punti interni dell'immagine fissata come gli altri adattamenti di `pilates_trusted.py`; ogni aggiornamento di Hermes richiede la ripetizione di `test:usage`. La raccolta osserva soltanto e non modifica richieste, cronologia o risposte.

Il contesto per messaggio è un registro del gateway per ID del messaggio, creato all'ammissione del webhook (con l'istante di ricezione) e attivato come `ContextVar` in `WhatsAppCloudAdapter._ingest_message` e in `BasePlatformAdapter._process_message_background`, che lo propagano ai task e ai thread del turno (`copy_context`, thread del titolo). L'evento parte alla fine del task del messaggio, dopo l'attesa (massimo 60 s) delle richieste ausiliarie ancora in corso, come il titolo; un messaggio risposto o scartato sul percorso d'ingresso (comandi durante un turno occupato) chiude l'evento alla fine dell'ingresso. Se Hermes accorpa un messaggio arrivato durante un turno in un altro messaggio in coda (`merge_pending_message_event`, accorpamento o sostituzione), ciascun messaggio ha il proprio evento con la propria ricezione e la stessa risposta: richieste al modello, token, costo, compattazioni e chiamate ai tool sono attribuiti soltanto al messaggio che ha eseguito il turno, gli altri hanno zero richieste. Un messaggio rimasto senza turno chiude il proprio evento, con esito `none`, prima della scadenza della ricevuta (840 s).

## Scrittura

- Il gateway invia l'evento al broker (`POST /v1/usage`, autenticato con il token del bridge) in un task separato, dopo l'invio della risposta e con timeout breve. Un errore produce soltanto l'evento fisso `usage_event_failed` sul descrittore dei log (`security`); il turno è già concluso.
- Il broker ricava l'insegnante dalla propria ricevuta del messaggio o, per le risposte del webhook, da un biglietto monouso casuale emesso con la decisione insieme al tipo (`management`, `fixed`, `rejected_command`), con la stessa durata delle ricevute. Accetta un solo evento per ricevuta o biglietto (la ricevuta è consumata anche se la scrittura poi fallisce) e rifiuta un tipo dichiarato dal gateway o un insegnante nella richiesta. La misura passa per la politica pura `buildUsageEvent` di `src/usage-event.ts` (eseguita da `usage-event-runner.mjs` come la politica gestionale), che valida campi, tipi e intervalli e calcola tempi, somme e percentuale; il broker scrive la riga con `studio_private.record_usage_event(bigint, jsonb)`, `SECURITY DEFINER` con `search_path` fisso, eseguibile solo dal ruolo broker. Il gateway non fornisce mai l'insegnante. Per un mittente non censito l'insegnante è vuoto; un insegnante revocato resta il proprio ID.
- Le credenziali di scrittura sono soltanto nel container del broker; nel processo del gateway restano la credenziale dell'agente e il token del bridge. Il modello ha solo `studio_sql_query` e `skill_view` e non può fare richieste HTTP.

## Schema

Tabella privata `studio_private.usage_events`, inaccessibile all'agente come il resto dello schema privato:

- `id` identity, `recorded_at` (`clock_timestamp()`), `teacher_id` (FK su `studio_private.teachers`, NULL per mittenti non censiti);
- `turn_kind` (`agent`, `management`, `fixed`, `rejected_command`), `received_at`, `replied_at`, `total_ms`, `model_ms`;
- `model` (identificativo del provider, formato vincolato), `reasoning_effort` (livelli di Hermes);
- `input_tokens`, `output_tokens`, `context_tokens`, `context_window`, `context_percent` (`numeric(8,2)`), `compaction_threshold_tokens`, `compactions`, `tool_calls`, `model_requests`;
- `cost_usd` (`numeric`, vuoto se non riportato), `send_outcome` (`sent`, `refused`, `network`, `none`), `send_http_status`, `send_error_code`.

Vincoli di controllo su domini e intervalli e di coerenza (invio e tempo complessivo presenti insieme e coerenti con la ricezione, stato e codice solo per `refused`, nessun dato del modello per i tipi diversi da `agent`); nessuna colonna di testo libero, telefono, nome o identificativo dei messaggi. Trigger che rifiutano UPDATE, DELETE e TRUNCATE anche al migratore, senza scadenza. Il ruolo agente non ha privilegi sulla tabella, sulla sequenza e sulla funzione; il broker ha soltanto EXECUTE sulla funzione. La tabella è nel dump PostgreSQL e quindi nei backup a caldo e quiescenti e nei ripristini.

## Limiti

- Una richiesta al modello interrotta da Hermes (nuovo messaggio durante il turno) o fallita senza risposta non entra nell'evento: un eventuale addebito OpenRouter non è osservabile senza l'endpoint delle generazioni, e un costo mancante in una richiesta completata rende vuoto il costo del turno.
- Per un messaggio che Hermes inserisce in un turno in corso (steer) o scarta durante un turno, l'evento ha zero richieste e la risposta ricevuta sul percorso d'ingresso, cioè gli avvisi del motore di Hermes per i turni occupati, che il progetto non modifica; il tipo è `fixed`.
- La finestra registrata è quella del compressore di Hermes: con OpenRouter coincide con il catalogo, ma il compressore può risolverne una diversa da quella del catalogo usata per la soglia del 40% (osservato con un host OpenRouter sintetico).
- Un evento la cui ricevuta scade (turni oltre 900 s o broker riavviato durante il turno) è perso con `usage_event_failed`.
- Forma di `usage.cost` in streaming, modello servito e livello inviato vanno confermati con OpenRouter reale (prova esterna).

- Ruolo `studio_grafana` di login, `NOINHERIT`, `default_transaction_read_only`, con USAGE sul solo schema `studio_metrics` e SELECT sulle sue viste, possedute dal migratore: eventi e nome e cognome dell'insegnante, senza telefoni o altri dati dello studio. Nessun accesso a `app`, `studio_private` o all'archivio Hermes; `pg_hba.conf` lo limita al database applicativo.
- Servizio `grafana` dall'immagine del progetto `FROM grafana/grafana:13.3.2@sha256:81556409ba48b2b922e0adb69a2511337d8ba7578f11962eefa6149a2d815101`, con sorgente dati e dashboard copiate in `/etc/grafana/provisioning` (`editable: false`, `allowUiUpdates: false`, `disableDeletion: true`). Senza volume: le modifiche dall'interfaccia, utenti e sessioni non sopravvivono alla ricreazione.
- Porta pubblicata solo su `127.0.0.1` (`GRAFANA_PORT`), raggiunta con `ssh -L`; il tunnel e l'hostname pubblico non la instradano. Login anonimo, registrazione, controlli di aggiornamento, statistiche e notizie disabilitati.
- Credenziali nella configurazione privata: password admin (`grafana-admin-password`) e del ruolo (`db-grafana`) come file segreti montati, letti con `__FILE` e `$__file{}`; l'avvio senza di esse si arresta.
- Impatti: bootstrap dei ruoli e `init-secrets` per i nuovi segreti; `start:local` e `prod.sh` avviano Grafana e ne verificano la salute; `publish-images.sh` pubblica anche l'immagine `grafana`; `update-agent-pilates.sh` resta invariato; i backup non cambiano oltre alla nuova tabella; la CI prepara l'immagine fissata ed esegue la suite di Grafana.
