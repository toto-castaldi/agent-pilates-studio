# SPIKE-004 — Fonti e punto di misura delle metriche d'uso

- **Date:** 2026-11-26
- **Outcome:** Positive — tutti i dati di REQ-OPS-011 sono misurabili nel gateway con Hermes 0.22.7 e verificati con gateway reale e provider sintetico; il costo si prende da `usage.cost` della risposta OpenRouter; la scrittura passa dal broker con credenziali assenti dal processo dell'agente; Grafana 13.3.2 fissata con provisioning nell'immagine. Restano a TEC-052 e US-020 l'attuazione e le prove con OpenRouter reale.
- **Requirements:** REQ-OPS-011, REQ-OPS-012, REQ-NFR-002, REQ-NFR-005

## Questions

1. Per ogni dato di REQ-OPS-011 (tipo di turno, istanti e tempi complessivi e del modello, modello, livello di thinking, token, contesto in token e in percentuale della finestra, compattazioni, chiamate ai tool, costo OpenRouter, esito dell'invio), qual è la fonte (hook o plugin Hermes, broker, risposta OpenRouter) e il punto di misura, verificati con un gateway reale e un provider sintetico, e quali dati non sono disponibili?
2. Come si confrontano il campo `usage` della risposta OpenRouter e l'endpoint delle generazioni per completezza, ritardo e chiamate aggiuntive, e quale si raccomanda?
3. Quale schema degli eventi e quale modo di scriverli impediscono all'agente di leggerli, modificarli o dichiararne i valori con il proprio accesso SQL o i tool, e dove risiedono le credenziali di scrittura rispetto al processo dell'agente?
4. Quale immagine e versione fissata di Grafana, provisioning versionato di sorgente dati e dashboard, ruolo di sola lettura, credenziali nella configurazione privata e porta solo loopback, con quale impatto su launcher, backup e CI?
5. Misurazione e scrittura aggiungono al log, al modello o alla cronologia numeri di telefono, testi o nomi (REQ-NFR-002)? Quale ritardo aggiungono al turno?

## Metodo e isolamento

L'analisi del codice usa i sorgenti estratti con `docker create` e `docker cp` dall'immagine fissata `nousresearch/hermes-agent:v0.22.7@sha256:e6d81ae52ebf6a43efa529701405509f20054ba818f179ddd748bed4f8af584c`, senza avviarla. I percorsi sotto sono relativi a `/opt/hermes`.

Le prove dinamiche, il 2026-11-26 con Docker 29.9.3, usano progetti Compose temporanei `pilates-spike004-*` su rete interna, con volumi, immagine `<progetto>-hermes` e segreti sintetici propri, PostgreSQL 17.10 con migrazioni reali, broker e gateway reali del branch, identità create dalle funzioni gestionali (`identity-seed`), webhook firmati, sostituto di Meta di `scenarios/` e un modello deterministico derivato da `integration/compaction_stub.py`. Il sostituto restituisce, come OpenRouter, `id` `gen-…`, `provider`, e un `usage` con `cost`, `cost_details`, `prompt_tokens_details` e `completion_tokens_details`, anche nell'ultimo chunk dello streaming; finestra di 200K token e soglia del 40%. Lo stack dello studio non è stato avviato né toccato; al termine container, volumi, reti e immagini dei progetti sono stati rimossi.

La sonda (`metrics_probe.py`, launcher di prova derivato da `scenarios/gateway-launcher.sh` che la installa dopo `pilates_trusted.install()`, driver Node e sostituto del modello) è rimasta nella scratchpad della sessione e non è integrata. Registra solo numeri, enumerazioni, booleani e impronte troncate degli ID sintetici in `/tmp` del container. Scenari: risposta semplice, tre chiamate ai tool (due SQL e una vietata), tre messaggi da ~17K token e ripresa dopo 25 s di inattività, otto messaggi da ~40K token di un altro mittente, `/model` e `/reasoning`, numero non censito, invio dell'agente rifiutato da Meta (131030) e con connessione chiusa, rifiuto fisso non consegnato, `/anagrafica` del gestore.

## Findings

### 1. Fonti e punti di misura

**Involucro per messaggio.** `gateway/platforms/base.py` elabora ogni messaggio in `BasePlatformAdapter._process_message_background(event, session_key)`, che attende il gestore (`_message_handler`) e poi l'invio finale (`_send_final_text` → `WhatsAppCloudAdapter._post_messages`) nello stesso task. Il task nasce dentro la richiesta del webhook, quindi eredita il contesto impostato in `Application._handle`; il turno dell'agente gira in un thread con `copy_context()` (`gateway/run.py`). Un oggetto per messaggio in un `ContextVar` raccoglie quindi i dati di webhook, turno, richieste al modello, tool e invio: verificato in tutti gli scenari, con l'istante di arrivo del webhook disponibile nel turno. Le risposte del broker (percorso guidato e rifiuti) sono inviate dal gateway dentro `Application._handle`, prima e fuori da Hermes.

| Dato | Fonte e punto di misura | Esito della prova |
| --- | --- | --- |
| Tipo di turno | Gateway: `TurnRunner._run_conversation_with_approval` → `agent`; gestori sostituiti di `GatewayModelCommandsMixin` → `rejected_command`; `ACCESS_REFUSAL` restituito per ricevuta superata → `fixed`. Broker: risposte di `management.message` (gestore → `management`, ordinario → `rejected_command`) e `refuse` → `fixed`. | 14 turni `agent`, 2 `rejected_command`, rifiuti e percorso guidato distinti. Il gateway non distingue da solo rifiuto e risposta gestionale: la classificazione deve venire dal broker. |
| Ricezione | Orologio del gateway all'ingresso di `Application._handle`. | Disponibile nell'involucro del messaggio. |
| Invio, tempo complessivo | Fine dell'ultimo POST a Meta: client `httpx` di `pilates_trusted.handle` per le risposte del broker, `_post_messages` per quelle di Hermes. | 113–2420 ms dal webhook all'invio (il primo turno include la prima generazione del titolo). |
| Tempo nel modello | `api_duration` di `post_api_request` (`agent/turn_response_intake.py`), per richiesta principale, streaming incluso; riassunti dalla durata di `run_with_aux_hooks` con `aux_task='compression'`. | Somme coerenti con le richieste del turno. La generazione del titolo (`title_generation`) avviene nel turno ma non precede la risposta: va esclusa dal tempo, inclusa in token e costo. |
| Modello | `response.model` della risposta grezza (anche `response_model` di `post_api_request`). | Presente; può differire da `PILATES_MODEL` se OpenRouter instrada altrove. |
| Livello di thinking | Corpo effettivo della richiesta: `extra_body.reasoning` restituito da `agent.chat_completion_helpers.build_api_kwargs`. `agent.reasoning_config` riporta solo la configurazione. | Configurazione `{'enabled': True, 'effort': 'medium'}`, ma nessun `reasoning` inviato con il catalogo sintetico: il valore configurato non è una misura. Le richieste ausiliarie inviano `{'enabled': False}`. |
| Token | `usage.prompt_tokens` e `usage.completion_tokens` (anche normalizzati in `post_api_request`/`post_auxiliary_call`). | Presenti per richieste principali, titoli e riassunti, streaming incluso (`stream_options.include_usage`). |
| Contesto | `prompt_tokens` dell'ultima richiesta principale; finestra `context_compressor.context_length` (catalogo) e soglia `threshold_tokens`. | 2,4%–83,1% della finestra di 200K, soglia 80K riportata. |
| Compattazioni | Hook `post_compaction` (`agent/compaction_events.py`), solo per compattazioni committate, con `reason` (`idle`, `turn_start_threshold`) e token prima/dopo; conferma da `context_compressor.compression_count`. | Ripresa per inattività (51.573 → 4.346) e soglia (fino a 2 nello stesso turno) contate correttamente. |
| Chiamate ai tool | `assistant_tool_call_count` di `post_api_request`, sommato sulle richieste principali. | 3 chiamate chieste (2 SQL e 1 vietata); `post_tool_call` è scattato una sola volta: non è una fonte affidabile del conteggio. |
| Costo | `usage.cost` della risposta grezza di ogni richiesta, principale e ausiliaria. | Presente in tutte le 24 richieste. Gli hook non lo espongono (`_usage_summary_for_api_request_hook` scarta `raw_usage`); la stima di Hermes (`session_cost_status`) è `unknown`/`none`. |
| Esito dell'invio | `adapter_send` già usato da `pilates_trusted.observe_adapter_sends` per stato HTTP e codice Meta; client del gateway per le risposte del broker. | `400/131030` e rete chiusa rilevati per agente (con ritentativo dell'adattatore) e risposte fisse; righe `whatsapp_send_failed` invariate. |
| Utilizzatore | Broker: ricevuta del messaggio (`teacher`), mai il gateway né il modello; NULL per numeri non censiti. | Ricevuta disponibile per tutti i messaggi ammessi. |

**Hook e punti interni.** Gli hook documentati (`post_api_request`, `post_auxiliary_call`, `post_compaction`, `post_tool_call`) coprono tempi, token, finestra, modello servito, compattazioni e richieste di tool, ma non costo, livello inviato né ID della generazione. Questi richiedono di avvolgere `agent.turn_response_intake._fire_post_api_request_hook` (riceve la risposta grezza ed è chiamata come globale del modulo), `agent.auxiliary_hooks.run_with_aux_hooks` (importata al momento della chiamata da `auxiliary_client`) e `agent.chat_completion_helpers.build_api_kwargs` (usata tramite `_forward`). Sono punti interni come quelli già usati dal progetto; il dispatcher `hermes_cli.lifecycle` invoca gli hook solo se qualcuno li registra (`has_hook`), quindi la registrazione va fatta dal plugin del progetto o da `pilates_trusted`.

**Dati non disponibili o parziali.**

- Livello di thinking quando Hermes non lo invia: resta vuoto (corretto per REQ-OPS-011), non si deriva dalla configurazione.
- Costo di una richiesta interrotta o fallita senza `usage` (errore di stream, ritentativi del provider): il costo del turno resta vuoto; i tentativi falliti fatturati da OpenRouter non sono osservabili senza l'endpoint delle generazioni.
- Esito della consegna successiva all'accettazione di Meta (stati `delivered`/`read` del webhook): non misurato; l'esito è quello della richiesta a Meta.
- Più messaggi uniti da Hermes in un solo turno (accodamento durante un turno, debounce del testo) producono un solo involucro: non osservato nelle prove sequenziali; TEC-052 deve verificare come ripartirli.
- La finestra è quella risolta da Hermes dal catalogo; la percentuale usa i token del provider, non la stima di Hermes che decide la compattazione.

### 2. Costo: `usage` della risposta o endpoint delle generazioni

| | `usage.cost` nella risposta | `GET /api/v1/generation?id=gen-…` |
| --- | --- | --- |
| Completezza | Ogni risposta completata, principale e ausiliaria, anche in streaming (ultimo chunk con `usage`); `cost_details.upstream_inference_cost` solo per BYOK. | Più campi (`total_cost`, token nativi, `latency`, `generation_time`, `provider_name`, tentativi), ma serve l'ID di ogni generazione, che gli hook non espongono. |
| Ritardo | Nessuno: arriva con la risposta. | Una richiesta per generazione dopo il turno; il ritardo di disponibilità non è documentato e richiede ritentativi o un job differito. |
| Chiamate aggiuntive | Nessuna; i parametri `usage: {include: true}` e `stream_options.include_usage` sono deprecati e senza effetto, il dato è sempre incluso. | 2–4 per turno tipico (risposta, tool, titolo, riassunti), con chiave OpenRouter nel componente che le esegue e limiti di frequenza non quantificati. |

La documentazione indica `cost` «in credits» e `total_cost` delle generazioni «in USD»: si registra il valore come riportato, in `numeric`, con unità «credito OpenRouter (USD)». **Raccomandazione:** `usage.cost` della risposta, sommato per turno; nessuna chiamata all'endpoint delle generazioni. Va verificata con OpenRouter reale la presenza di `cost` nell'ultimo chunk dello streaming del modello configurato.

### 3. Schema e scrittura protetta

Proposta registrata in `design/usage-metrics`:

- **Tabella** `studio_private.usage_events`, nello schema privato su cui il ruolo agente non ha USAGE: tipo di turno, istanti e millisecondi, modello, livello, token, contesto, finestra e soglia, compattazioni, chiamate ai tool, richieste al modello, costo, esito con stato e codice, `teacher_id` (FK, NULL per non censiti). Nessun testo libero, telefono, nome o ID dei messaggi; domini con vincoli `CHECK`; trigger che rifiutano UPDATE, DELETE e TRUNCATE; nessuna scadenza.
- **Scrittura:** il gateway invia l'evento al broker con `POST /v1/usage` (token del bridge), in un task separato dopo l'invio a Meta. Il broker ricava l'insegnante dalla propria ricevuta (o, per le risposte del webhook, da un biglietto emesso con la decisione), accetta un solo evento per ricevuta, valida intervalli e scrive con una funzione `SECURITY DEFINER` con `search_path` fisso, eseguibile solo da `studio_broker`.
- **Credenziali:** solo il container del broker possiede la password `db-broker`; nel processo del gateway restano `db_agent` e il token del bridge, come oggi. Il modello dispone soltanto di `studio_sql_query` e `skill_view` (allowlist nei due dispatcher), non esegue codice né richieste HTTP e quindi non può dichiarare valori: questi provengono solo dal codice fidato e dalla ricevuta del broker. Il ruolo agente non ha privilegi sulla tabella né EXECUTE sulla funzione; da verificare su PostgreSQL reale in TEC-052.
- **Fallimento:** un errore del broker o del database non tocca il turno, già concluso; il gateway scrive soltanto l'evento fisso `usage_event_failed` sul descrittore dei log.

Alternative scartate: scrittura diretta dal gateway con un nuovo ruolo (credenziale nel processo che esegue i tool del modello); plugin Hermes che scrive nel database (stesso processo); tabella nello schema `app` con privilegi di colonna (l'agente vedrebbe lo schema e i tentativi falliscono solo per privilegio).

### 4. Grafana

- **Immagine:** `grafana/grafana:13.3.2`, pubblicata il 2026-11-24, fissata per digest dell'indice multi-architettura `sha256:81556409ba48b2b922e0adb69a2511337d8ba7578f11962eefa6149a2d815101` (Docker Hub, consultato il 2026-11-26). Se all'attuazione la release ha meno di due settimane, si fissa l'ultima patch 13.3 che le abbia. Un'immagine del progetto `grafana` la estende copiando sorgente dati e dashboard in `/etc/grafana/provisioning`, pubblicata da `publish-images.sh` come le altre.
- **Provisioning:** sorgente PostgreSQL `editable: false`, password con `$__file{/run/secrets/db_grafana}`; provider delle dashboard con `allowUiUpdates: false` e `disableDeletion: true`. Nessun volume per `/var/lib/grafana`: modifiche dall'interfaccia, utenti e sessioni si perdono alla ricreazione e non entrano nei backup.
- **Ruolo:** `studio_grafana` di login, `NOINHERIT`, `default_transaction_read_only = on`, USAGE sul solo schema `studio_metrics` e SELECT sulle sue viste (eventi con nome e cognome dell'insegnante), possedute dal migratore, senza accesso a `app`, `studio_private` o all'archivio Hermes; limitato in `pg_hba.conf`.
- **Accesso:** porta `127.0.0.1:${GRAFANA_PORT}` in sviluppo e produzione, raggiunta con `ssh -L`; tunnel e hostname pubblico non la instradano. Login anonimo, registrazione, controlli di aggiornamento, statistiche e notizie disabilitati; rete senza accesso a Internet.
- **Credenziali:** `grafana-admin-password` e `db-grafana` come file segreti privati, generati da `init-secrets` in sviluppo e presenti nei segreti di produzione; `GF_SECURITY_ADMIN_PASSWORD__FILE`; l'avvio senza file si arresta senza stamparli.
- **Impatti:** bootstrap dei ruoli con il nuovo ruolo e password ripristinata dal file; `start:local` e `prod.sh` avviano e attendono Grafana e accettano `GRAFANA_PORT`; `update-agent-pilates.sh` e lo script del backup pianificato restano invariati; il dump include la tabella degli eventi senza modifiche agli script, mentre lo stato di Grafana non è da salvare; la CI prepara l'immagine fissata, pubblica `grafana` su `main` ed esegue una suite separata con dati sintetici.

### 5. Privacy e ritardo

- **Log:** durante tutte le prove il log Docker del gateway conteneva solo `hermes_launch` e le righe `whatsapp_send_failed` attese; la sonda non scrive nel log. L'unico evento nuovo proposto è `usage_event_failed`, a formato fisso.
- **Modello e cronologia:** la raccolta legge risposte e argomenti già costruiti senza modificarli; richieste al modello, cronologia SQLite e risposte restano quelle di oggi. Il file della sonda non conteneva numeri sintetici, marcatori, testi o nomi (ricerca di `1555555`, `MARK-`, testo di riempimento, profilo e nomi: zero occorrenze).
- **Evento:** solo ID dell'insegnante, numeri, enumerazioni e l'identificativo del modello del provider con formato vincolato; i nomi compaiono solo nelle viste di Grafana, dalla tabella degli insegnanti.
- **Ritardo:** 103 intercettazioni della sonda sono costate 2,3 ms in totale (circa 0,02 ms ciascuna, 0,1–0,2 ms per turno). Il viaggio gateway → broker misurato dal container è di 0,9 ms di mediana (p95 1,0–1,2 ms) e un INSERT di una riga simile di 3,0 ms di mediana (p95 3,6 ms) dal client sull'host. Scrittura dopo l'invio: nessun ritardo aggiunto alla risposta percepita; costo stimato sotto i 5 ms per turno, fuori dal percorso della risposta.

## Limits, costs and risks

- Prove con provider e Meta sintetici: forma di `usage` e `cost`, streaming e instradamento del modello vanno confermati con OpenRouter reale (prova esterna con credenziali dell'utente).
- Costo, livello inviato e ID dipendono da punti interni di Hermes 0.22.7: ogni aggiornamento richiede la suite delle metriche.
- Unità del costo: la documentazione OpenRouter (consultata il 2026-11-26) chiama `cost` «credits» e `total_cost` «USD».
- Gli eventi delle risposte con ricevuta oltre la durata delle ricevute del broker (900 s) andrebbero persi; turni così lunghi non sono stati osservati.
- **Osservazione fuori scope:** con messaggi da ~40K token il contesto è arrivato al 42,7%, 62,9% e 83,1% della finestra in tre turni consecutivi prima della prima compattazione per soglia (poi due nello stesso turno). Con i messaggi da ~10K di `test:compaction` l'attivazione resta tra il 36% e il 47%. Non indagato; da valutare con l'utente se aprire un item.

## Recommendations

- Registrare le scelte in `design/usage-metrics` e chiudere la decisione aperta del design.
- TEC-052: migrazione della tabella e della funzione, endpoint del broker con biglietti per le risposte del webhook, raccolta in `pilates_trusted.py`, verifica su PostgreSQL reale dei privilegi dell'agente, suite con gateway reale e sostituto con `usage.cost`; verificare l'accorpamento di messaggi in un turno.
- US-020: immagine `grafana` con provisioning, ruolo `studio_grafana` e viste `studio_metrics`, segreti, porta loopback, `start:local`, `prod.sh`, pubblicazione e CI.
- I criteri attuali di TEC-052 e US-020 coprono già queste scelte e non richiedono modifiche. Si propone soltanto, previo accordo con l'utente, di aggiungere `design/usage-metrics` ai riferimenti di design dei due item, perché `backlog docs --for` lo elenchi.

## Sources

- Sorgenti di `nousresearch/hermes-agent:v0.22.7` sopra citati: `hermes_cli/plugins.py` (`VALID_HOOKS`), `hermes_cli/hooks.py` (payload di esempio), `agent/turn_response_intake.py`, `agent/api_request_hooks.py`, `agent/auxiliary_hooks.py`, `agent/compaction_events.py`, `agent/usage_pricing.py`, `agent/turn_usage.py`, `agent/chat_completion_helpers.py`, `gateway/platforms/base.py`, `plugins/platforms/whatsapp_cloud/adapter.py`, `gateway/run.py`.
- https://openrouter.ai/docs/use-cases/usage-accounting (consultato il 2026-11-26)
- https://openrouter.ai/docs/api-reference/get-a-generation (consultato il 2026-11-26)
- https://hub.docker.com/r/grafana/grafana/tags (consultato il 2026-11-26)
