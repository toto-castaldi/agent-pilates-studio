# TEC-057 — Metriche d'uso con OpenRouter reale

Prova esterna del 2026-11-26 nel branch `task/TEC-057-verifica-metriche-openrouter-reale`, sullo stack locale e con soli dati sintetici. Conferma con OpenRouter reale la forma di `usage.cost`, il modello servito e il livello di thinking che TEC-052 aveva lasciato da verificare (`design/usage-metrics`, Limiti). Nessuna esecuzione in produzione, nessun deploy, merge o push di `main`.

## Ambiente e configurazione

- Stack avviato con `npm run start:local` in un progetto Compose separato (`COMPOSE_PROJECT_NAME=agent-pilates-tec057`, `PILATES_VOLUME_PREFIX=agent-pilates-tec057`) e su porte proprie: PostgreSQL 55457, webhook 18357, Grafana 13057. Lo stack di sviluppo del clone principale non è stato toccato: i suoi container e volumi sono rimasti attivi e invariati per tutta la prova.
- `.env` privato (0600, ignorato da Git) preparato dall'orchestratore. Solo `OPENROUTER_API_KEY` e `PILATES_MODEL` sono reali; modello `z-ai/glm-5.2`. Tutto il resto è sintetico o nuovo: token WhatsApp fittizio, app secret, verify token e phone number ID sintetici, gestore `+390000000057`, password database e Grafana nuove. `PILATES_REASONING_EFFORT` non è impostato, quindi vale il predefinito `medium`; per i messaggi 13–16 il gateway è stato ricreato con `none`. Per provocare la ripresa dopo inattività, dal sesto messaggio `PILATES_IDLE_COMPACT_SECONDS` vale 60.
- Hermes v0.22.7 dell'immagine fissata, con il codice del branch.
- Mittenti sintetici: il gestore `Alpha Synthetic` (+390000000057), censito con il percorso fidato del broker (`manage_teacher_identity`, `bootstrap`), e `Beta Synthetic` (+390000000058), iscritta dal gestore (`enroll`). Webhook firmati con l'app secret sintetico e inviati al gateway locale.
- Meta non è stato raggiunto con credenziali reali: con il token fittizio le risposte sono rifiutate (`refused`, HTTP 401, codice 190), come previsto. L'esito dell'invio non è oggetto di questa prova.
- Osservazione del traffico verso il modello: dal secondo messaggio il gateway passa per un proxy locale trasparente, usato solo per questa prova (`OPENROUTER_BASE_URL=http://proxy.openrouter.ai:8088/api/v1` in un override Compose temporaneo, non versionato). Il proxy inoltra a `https://openrouter.ai` senza modificare nulla e registra soltanto metadati: modello richiesto, `stream`, `stream_options`, `reasoning`, numero di tool e di messaggi, modello della risposta, blocchi con `usage` e loro posizione. Non registra prompt, messaggi, risposte o intestazioni. Per ogni generazione il valore riportato da OpenRouter è stato poi letto in sola lettura da `GET /api/v1/generation`. Gli ID delle generazioni non sono riportati qui.
- Il totale d'uso della chiave (`GET /api/v1/key`) non è utilizzabile come riscontro: la chiave è condivisa e nello stesso intervallo è cresciuto più del costo della prova.
- Al termine sono stati rimossi container, rete, volumi e immagini del solo progetto `agent-pilates-tec057`: per il rapporto non servono. Gli eventi rilevanti sono riportati sotto.

## Esecuzione

18 messaggi, 18 eventi: 15 turni dell'agente, un `/new` (`fixed`, senza modello) e due messaggi ricevuti subito dopo una ricreazione del gateway (vedere [Scostamento](#scostamento-messaggi-allavvio-del-gateway)). 37 richieste al modello passate dal proxy: 36 in streaming e una non in streaming, per un costo di 0,18000354 USD.

| Eventi | Contenuto | Richieste osservate |
| --- | --- | --- |
| 1 | Primo turno, prima del proxy | 3 (non osservate) |
| 2, 3, 5 | Turni brevi con una consultazione SQL | 2 principali ciascuno |
| 6, 7 | Ripresa dopo inattività: riassunto tentato ma non applicato | 1 riassunto + 2 e 4 principali |
| 8–10 | Turni lunghi per allungare la trascrizione | 2, 1, 1 principali |
| 11 | Ripresa dopo inattività con **compattazione applicata** (`compactions` = 1, 30 messaggi compattati in Hermes) | 1 riassunto + 2 principali |
| 12 | Prima chat di Beta: **generazione del titolo** | 1 titolo + 4 principali |
| 14, 16 | `PILATES_REASONING_EFFORT=none` | 2 principali ciascuno |
| 13, 15 | Ricevuti nei primi secondi dopo la ricreazione del gateway, prima della correzione | 2 principali ciascuno, **non attribuite** |
| 17, 18 | Come 13 e 15, dopo la correzione | 2 e 1 principali |

## Esiti

Per ogni evento dal 2 in poi le richieste osservate sono state confrontate con l'evento registrato e con i dati OpenRouter della generazione.

| Verifica | Esito |
| --- | --- |
| `model_requests` = richieste del turno | Corrisponde in tutti gli eventi osservati, salvo 13 e 15 |
| Token in ingresso e in uscita = somma di `usage.prompt_tokens` e `usage.completion_tokens` | Corrisponde, salvo 13 e 15 |
| `cost_usd` = somma di `usage.cost` delle risposte | Corrisponde al picodollaro, salvo 13 e 15 |
| `usage.cost` = `total_cost` di OpenRouter per ogni generazione | Corrisponde per tutte le generazioni lette |
| Riassunto di compattazione e titolo inclusi in costo e token | Sì (eventi 6, 7, 11, 12) |
| `context_tokens` = `prompt_tokens` dell'ultima richiesta principale | Sì |
| `compactions` | 1 solo nell'evento 11, l'unico riassunto applicato; 0 per i riassunti scartati da Hermes (eventi 6 e 7), come previsto dall'hook `post_compaction` |
| `reasoning_effort` = livello inviato nelle richieste principali | Sì: `high` con `medium` configurato, `none` con `none` |

Il totale degli eventi è 0,17361184 USD. Togliendo il primo turno, non osservato, restano 0,16746822 USD. La differenza dal totale osservato (0,01253532 USD) è esattamente il costo delle quattro richieste non attribuite degli eventi 13 e 15.

### Forma di `usage.cost`

- **Streaming** (turni principali e riassunti di compattazione): `stream: true` con `stream_options.include_usage: true`. `usage`, con `cost`, compare in un solo blocco SSE per risposta, l'ultimo prima di `[DONE]`, e quel blocco contiene ancora `choices`. Non sono stati osservati blocchi intermedi con `usage`.
- **Non streaming**: la sola generazione del titolo, con `max_tokens` 512 e `reasoning: {"enabled": false}`. `usage.cost` è nel corpo JSON.
- `usage` contiene anche `cost_details` (`upstream_inference_cost` e le sue parti per prompt e completamento), `is_byok` e i dettagli dei token in cache e di ragionamento. Non sono usati.
- Il campo `streamed` del record di OpenRouter vale `true` per tutte le generazioni, anche per il titolo non in streaming: non distingue la modalità della richiesta del client.

### Modello servito

- Il campo `model` delle risposte, in streaming e non, è sempre `z-ai/glm-5.2`, uguale al modello richiesto. È il valore registrato.
- Il record di OpenRouter riporta lo slug con versione `z-ai/glm-5.2-20260616` e il fornitore. Non è stato osservato nessun instradamento verso un modello diverso.
- Scostamento di granularità, senza correzione: l'evento non distingue la versione datata né il fornitore. Ottenerli richiederebbe una chiamata a `/api/v1/generation` per ogni richiesta, esclusa dal design (il modello non fa richieste HTTP; il gateway non aggiunge chiamate esterne per le metriche).

### Livello di thinking inviato

- Con `medium` configurato Hermes invia `reasoning: {"enabled": true, "effort": "high"}`: per GLM-5.2 riduce i livelli a quelli del modello (`high` e `max`, `GLM52_EFFORTS` in `agent/reasoning_effort.py`). L'evento registra `high`, cioè il valore inviato e non quello configurato, come richiesto dal design.
- Con `none` Hermes invia `reasoning: {"enabled": false}` e l'evento registra `none`.
- Le richieste ausiliarie non entrano nel livello dell'evento: il riassunto di compattazione non invia `reasoning`, il titolo lo disattiva.
- OpenRouter non riporta il livello ricevuto. I token di ragionamento del record (`native_tokens_reasoning`, maggiori di zero nella maggior parte delle richieste con `high`) indicano che il ragionamento era attivo.

### Token

I token registrati sono quelli di `usage` della risposta, che coincidono con i token nativi del record di OpenRouter (`native_tokens_prompt`, `native_tokens_completion`). Differiscono dai token normalizzati dello stesso record (`tokens_prompt`, `tokens_completion`), di pochi punti percentuali. Il design prevedeva già `usage`; la natura dei token è ora documentata.

## Scostamento: messaggi all'avvio del gateway

**Osservato.** Per due volte, un messaggio inviato appena il gateway ricreato risultava healthy (eventi 13 e 15) ha prodotto un evento `fixed` con esito `none`, zero richieste e registrazione 0,4 s dopo la ricezione. Circa 5 s dopo è però partito il turno dell'agente, con due richieste al modello e la risposta: costo, token e richieste di quel turno non sono entrati in alcun evento. Con una pausa di 30 s dopo l'healthcheck (evento 16) il problema non si ripresenta.

**Causa.** Finché la porta d'ingresso dell'avvio di Hermes è chiusa (ripristino delle sessioni all'avvio e riscaldamento, limitati da Hermes a 30 s e 20 s), il gestore dei messaggi del runner mette l'evento nella coda di ripristino (`_queue_startup_restore_event`) e termina il task senza turno. All'apertura la coda viene svuotata (`_drain_startup_restore_queue`): lo stesso evento ripassa per un nuovo `_process_message_background`. La raccolta aveva chiuso il record alla fine del primo passaggio; nel secondo non poteva più rivendicarlo, quindi il turno girava senza contesto di misura.

**Correzione.** In `hermes/pilates_trusted.py` (`usage_parked`, `observe_usage_processing`), se alla fine del task l'evento è nella coda di ripristino del runner, il record torna disponibile (`claimed` → `new`). Il passaggio successivo lo rivendica e misura il turno; un evento mai ripassato è chiuso come gli altri record scaduti (`usage_admit`). Test di regressione in `test:usage` (punto 2b): esegue la raccolta reale nel container del gateway, con un adattatore sostitutivo che parcheggia e ripassa l'evento come il runner, dopo aver verificato che il runner dell'immagine fissata esponga quel contratto. La porta d'avvio reale non si può tenere chiusa in modo deterministico in un test. Senza la correzione il test fallisce (evento chiuso subito, turno ripassato senza misura). Dopo la ricostruzione dell'immagine, due ripetizioni reali (eventi 17 e 18, messaggio inviato appena il gateway è healthy, primo turno circa 5 s dopo la ricezione) registrano `agent` con richieste, token e costo corrispondenti al traffico osservato.

## Dati personali e segreti

Nel rapporto, nei log e negli eventi compaiono solo numeri e nomi sintetici. Gli eventi contengono soltanto numeri, enumerazioni e l'identificativo del modello. Il proxy non ha registrato testi o intestazioni, e i suoi file sono rimasti nella directory temporanea della sessione, fuori dal repository. La chiave OpenRouter è rimasta in `.env` e nei file privati del clone, ignorati da Git, e non è stata stampata. Non sono riportati ID delle generazioni né totali d'uso della chiave.

## Limiti della prova

- Un solo modello (`z-ai/glm-5.2`) e un solo fornitore servito. Per altri modelli, la mappatura del livello di Hermes e la forma di `usage` possono differire.
- Il primo turno (evento 1) è precedente al proxy: è coerente nella forma (3 richieste, titolo incluso), ma non è stato confrontato richiesta per richiesta.
- Meta reale non è stato usato. Compattazione applicata e generazione del titolo sono state osservate una volta ciascuna, oltre ai due riassunti scartati.
