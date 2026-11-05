# SPIKE-002 — Identità del mittente e contesto dell'agente

- **Date:** 2026-11-05
- **Outcome:** Positive — identità, contesto e alternative studiati con prove locali sintetiche; l'integrazione definitiva e le sue verifiche restano a TEC-010 e TEC-011.
- **Requirements:** REQ-STUDIO-003, REQ-STUDIO-004, REQ-NFR-002, REQ-NFR-005

## Questions

1. Come arrivano numero e nome del profilo dal webhook autenticato al plugin SQL di Hermes 0.22.7?
2. Come vincolare l'autore al mittente senza permettere al modello di falsificarlo, neppure con SQL costruito ad arte?
3. Come caricare e aggiornare `SOUL.md`, data e fuso orario nelle sessioni Hermes, considerando memoria, SQLite e protezione dalle injection?
4. Quali prove e decisioni servono per TEC-010, TEC-011 e US-002?

## Findings

### 1. Webhook, identità e tool

Analisi dell'immagine `nousresearch/hermes-agent:v0.22.7` fissata dal progetto. Il gateway WhatsApp Cloud verifica HMAC-SHA256 sul corpo grezzo prima di interpretare il JSON. Nel payload verificato associa `messages[].from` a `contacts[].wa_id` e ricava `profile.name`, se presente. Dopo il controllo della provenienza dell'account e la policy dell'adattatore costruisce un `MessageEvent` con `source.user_id` e `source.user_name`. Il nome del profilo è un attributo fornito tramite WhatsApp, non una prova indipendente dell'identità anagrafica. La firma prova l'integrità e l'origine del webhook rispetto al segreto Meta, non che il nome del profilo sia legalmente verificato.

Il gateway porta l'autore nel turno come `turn_author` e l'agente lo normalizza in `_turn_author`; il percorso osservato di invocazione dei tool passa invece al registro `task_id`, `session_id` e `user_task`, non numero o nome. `hermes/plugins/pilates-postgres/__init__.py` non ricava l'identità e apre una connessione nuova con lo stesso ruolo `studio_agent` per ogni chiamata. **Il plugin attuale non garantisce l'autore richiesto.** Le informazioni nel testo, negli argomenti del tool o nel nome di sessione non sono una fonte affidabile di autorizzazione.

Prova esplorativa offline il 2026-11-05: nell'immagine fissata, con rete Docker `none`, un server aiohttp temporaneo ha invocato l'handler webhook reale. Con soli valori sintetici ha verificato rifiuto di firma assente o errata, mancata consegna di un mittente fuori allowlist, identificativo e nome nel `MessageEvent` autorizzato e nome `None` quando assente. Un invio diagnostico separato al dispatcher `model_tools.handle_function_call`, usando i parametri espliciti del percorso nativo, ha osservato `task_id` e `session_id` nel tool ma non i campi dell'autore. Il callback di cattura ha sostituito l'elaborazione completa del gateway: questa prima prova non dimostra da sola il percorso completo né verifica i log dello stack.

Una seconda prova temporanea, con gateway e runtime Hermes reali in una rete Docker interna e con un sostituto locale deterministico del modello, ha inviato due webhook firmati contemporaneamente, da due mittenti e profili sintetici distinti. Un adattamento esplorativo del dispatcher ha prelevato l'autore per turno da `_turn_author` e lo ha immesso in un `ContextVar` durante l'esecuzione del tool; un plugin esplorativo ha verificato la corrispondenza tra ciascun mittente e profilo e ignorato un parametro `author` falsificato fornito dal modello simulato. Entrambe le chiamate hanno raggiunto il plugin con l'identità attesa. Il log Docker del gateway conteneva solo l'evento fisso previsto e nei file di log Hermes non sono comparsi gli indicatori sintetici di numeri, nomi, messaggio o segreto campionati. Container, rete e volume temporanei sono stati rimossi.

Una prova successiva ha confrontato, mediante impronte effimere in memoria, l'identità dell'evento in ingresso con quella ricevuta dal plugin per due turni concorrenti. Un primo tentativo ha prodotto due mancate corrispondenze perché la sonda era applicata a un'altra istanza del modulo dell'adattatore; spostata la sonda sul metodo condiviso di consegna dell'evento, entrambe le corrispondenze sono riuscite. Nessun numero o nome è stato scritto dal plugin esplorativo. Anche in questa prova i log Docker e Hermes campionati erano privi degli indicatori sintetici e le risorse Docker temporanee sono state eliminate.

I test dimostrano la fattibilità del percorso **con l'adattamento esplorativo**, non che il plugin di produzione riceva già l'identità. Non provano tutti i percorsi di esecuzione, la sicurezza del contesto in ogni caso concorrente o l'impostazione dell'autore nel database. Per riprodurli servono l'immagine Hermes fissata, una rete Docker interna, un endpoint locale compatibile con l'API del modello, un webhook sintetico firmato e un plugin di sonda; la sonda deve ricevere l'autore dal dispatcher, mai dagli argomenti del modello. Il codice esplorativo resta temporaneo e non viene integrato.

### 2. Vincolo dell'autore nel database

Un semplice `SET LOCAL` o `set_config` su un parametro personalizzato non è un confine di sicurezza: il ruolo che esegue SQL arbitrario può cambiare il valore nella stessa istruzione. Prova su PostgreSQL 17.10 reale, isolato con rete `none` e senza volumi persistenti, eseguita il 2026-11-05: dopo l'impostazione di un autore sintetico affidabile, un `INSERT ... SELECT` con CTE ha invocato `set_config('spike.author', 'synthetic-forged-sender', true)` e la colonna con default `current_setting('spike.author', true)` ha ricevuto l'autore falsificato. La transazione è stata annullata. Un trigger che si fidi solo dello stesso parametro resta soggetto allo stesso problema; la prova non implementa ancora tale trigger.

Alternative da approfondire:

- **Contesto custodito fuori dal ruolo SQL dell'agente:** un componente fidato associa identità autenticata, connessione e transazione in una tabella protetta; un trigger controlla tale associazione e fallisce in sua assenza. Il componente che registra l'associazione deve avere privilegi e interfaccia distinti dal modello e dal ruolo agente, che non deve poter scrivere o sostituire il contesto. Vanno progettati autenticazione del componente, concorrenza, ciclo di vita, transazioni e ripulitura; l'associazione non deve poter essere riutilizzata da un'altra transazione.
- **Ruoli PostgreSQL separati per mittente:** associare a ogni numero autorizzato un login distinto e usare `session_user` in un trigger, con credenziali selezionate solo dal codice fidato. Richiede gestione sicura di ruoli e segreti, revoca e rotazione; il nome del profilo deve comunque arrivare tramite un canale fidato, non un parametro SQL alterabile dal modello. La compatibilità con i privilegi richiesti va verificata.
- **Parametri del modello o solo GUC:** più semplici ma non sufficienti. Anche una funzione `SECURITY DEFINER` non rende affidabile un autore che il modello può liberamente scegliere come argomento.

Un prototipo separato su PostgreSQL 17.10 reale, in una rete Docker interna temporanea, ha usato un ruolo agente e un ruolo broker distinti. Il broker ha registrato in una tabella inaccessibile all'agente mittente e profilo sintetici associati a PID della connessione e ID della transazione; un trigger `SECURITY DEFINER` ha sovrascritto i valori forniti dall'`INSERT` con quelli della tabella. Una singola istruzione con valori e GUC falsificati ha registrato l'autore fidato; scrittura senza contesto o con il contesto della transazione precedente, accesso diretto alla tabella di contesto, `SET ROLE` verso il broker e scrittura da un'altra connessione sono stati rifiutati. Risorse isolate eliminate al termine.

**Proposta per TEC-010:** privilegiare il contesto protetto con broker. Il gateway, dopo firma e allowlist, associa al singolo turno l'identità autenticata; il dispatcher la passa al plugin tramite un canale interno non dichiarato nello schema del tool, che rifiuta turni senza identità WhatsApp attendibile. Il plugin apre una transazione agente e ne rileva PID e `txid_current()`; un broker separato, invocabile solo dal percorso fidato del gateway, registra in una tabella protetta PID, transazione, numero e nome. Il trigger, con proprietario dedicato, `SECURITY DEFINER` e `search_path` sicuro, legge quella associazione e imposta o sovrascrive l'autore per inserimento e disattivazione, rifiutando contesto assente o incoerente. Il ruolo agente non può scrivere la tabella, assumere il ruolo broker, né chiamare una funzione di registrazione privilegiata; le credenziali di migrazione non sono disponibili a gateway, plugin o broker.

Il broker non deve esporre un'API raggiungibile dai tool controllati dal modello: servono isolamento e autenticazione del canale, privilegi minimi, strumenti di rete/file non necessari disabilitati, timeout e rimozione dei contesti a commit, rollback, disconnessione o scadenza. L'associazione deve essere vincolata alla stessa connessione e transazione, isolata tra turni concorrenti e non riutilizzabile; non si deve fidare di ID di sessione o autore dichiarati dal modello. La soluzione comporta un componente e credenziali aggiuntivi e una modifica del gateway/dispatcher da mantenere sugli upgrade. I ruoli per mittente evitano il broker per il numero ma impongono gestione di molti login e non risolvono da soli il profilo; GUC e argomenti del modello sono respinti perché falsificabili.

Il prototipo è una prova di fattibilità del confine SQL, non una soluzione integrata: non dimostra l'autenticazione presso il broker, l'integrazione con il gateway, la sicurezza di disattivazioni e aggiornamenti, la gestione completa della concorrenza o la ripulitura del contesto. TEC-010 deve dimostrare queste proprietà su PostgreSQL reale, inclusi SQL avversario in una sola istruzione, riuso del contesto e assenza dell'identità. La raccomandazione è condizionata al superamento di tali prove, non una dichiarazione di sicurezza della configurazione attuale.

### 3. Contesto, sessioni e data

Hermes cerca `SOUL.md` nella `HERMES_HOME` attiva; il Compose del progetto monta il volume persistente su `/opt/data`. Per TEC-011 si raccomanda di montare il file versionato del progetto in sola lettura su `/opt/data/SOUL.md`, sia in locale sia sul server, mantenendo un'unica fonte versionata; il normale aggiornamento deve aggiornare il file e ricreare il container. Il file sul repository/host e il mount persistono indipendentemente dal volume tra riavvii e aggiornamenti, purché la procedura di rilascio li mantenga. L'immagine attuale non lo include né lo monta.

Il codice del loader sottopone il file a controlli anti-injection, ma un `SOUL.md` considerato dell'utente può essere **caricato anche dopo un avviso**: lo scanner non è una garanzia di blocco. Servono revisione del contenuto, montaggio in sola lettura, disabilitazione dei tool non necessari e protezione del volume e delle fonti di memoria; istruzioni e dati della conversazione restano distinguibili, senza considerare lo scanner una barriera assoluta.

Il prompt viene conservato nella cache e in SQLite. In una prova con quattro turni sintetici su una stessa sessione, cambiando il file montato in sola lettura il turno successivo ha mantenuto il prompt precedente; `hermes sessions refresh-prompts`, eseguito nel container come utente Hermes, ha fatto caricare la nuova versione al turno successivo. Dopo il riavvio dello stesso container, con volume SQLite e file montati mantenuti, il quarto turno ha usato la nuova versione. Il comando richiede il profilo corretto, conserva la cronologia e opera sul turno successivo; TEC-011 deve includerlo nella procedura di aggiornamento e verificarlo nella configurazione definitiva. La prova non copre upgrade di immagine o ogni profilo.

Memoria e profilo utente possono contribuire al prompt e persistono separatamente dal file: per TEC-011 si raccomanda di disabilitarli per questo assistente salvo una decisione esplicita diversa, verificando anche eventuali provider esterni. La cronologia SQLite e vecchi prompt non vengono cancellati dal refresh, possono contenere dati sensibili e richiedono protezione e backup; non devono diventare una fonte prevalente di regole rispetto a `SOUL.md`.

Hermes supporta `HERMES_TIMEZONE` o la configurazione `timezone`. Nel codice, la data è inclusa nel prompt come data d'inizio e, a una ricostruzione successiva, come data di ricostruzione; un prompt mantenuto in cache non garantisce la data corrente a ogni turno. La prova offline del loader con `HERMES_TIMEZONE=Europe/Rome` ha incluso il fuso nella riga di data. Per TEC-011 si propone di configurare `Europe/Rome` e fornire data e ora affidabili come metadato effimero generato dal gateway per ogni chiamata al modello, ad esempio tramite `ephemeral_system_prompt`, senza memorizzare una data fissa in `SOUL.md`. Le regole di comportamento e i limiti delle fasce restano solo nel file. L'iniezione deve funzionare anche nelle sessioni riprese e nei turni attraverso mezzanotte; la proposta non è ancora implementata né verificata per transizioni di ora legale.

## Verification

Il 2026-11-05 il quality gate è stato inizialmente eseguito su una copia isolata del commit di partenza, senza la modifica locale dell'operatore a `.pi/settings.json`: `npm ci`, lint e typecheck sono passati; `npm test` ha fallito due test Pi perché `scripts/pi.sh` era assente e `.pi/settings.json` conteneva una preferenza personale. `npm run build` è passato. La situazione risaliva al commit preesistente `376c2eb`, che aveva eliminato anche `.pi/prompts/avvio.md`.

Su richiesta dell'operatore sono stati ripristinati i due file mancanti e le estensioni condivise precedenti; le preferenze duplicate, già identiche nella configurazione personale, sono state rimosse dal file condiviso preservando le modifiche locali alle altre risorse. Una verifica intermedia ha riportato 6 test su 7 prima del ripristino delle estensioni. Il successivo quality gate sul working tree con Node.js 24.14.0 e npm 11.9.0 ha superato `npm ci`, `npm run lint`, `npm run typecheck`, `npm test` (7/7) e `npm run build`. Gli stessi comandi sono passati anche su una copia isolata del contenuto candidato al commit, con le risorse Pi condivise della versione precedente. Le modifiche locali dell'operatore alle altre risorse Pi non sono incluse nel commit dello spike.

## Limits, costs and risks

- L'esplorazione è parziale: la prova gateway usa una modifica temporanea del dispatcher e un modello simulato; non verifica l'integrazione definitiva, tutte le condizioni di concorrenza né il vincolo di autore sullo schema di dominio. Il prototipo PostgreSQL non implementa il broker applicativo né le migrazioni di TEC-010.
- Le prove dello spike sono locali con modello simulato, senza nuove chiamate dell'agente a Meta o OpenRouter reali. L'operatore ha riferito che il giro reale dello stack riavviato funziona; non è stato verificato indipendentemente in questa sessione e non sostituisce la prova sintetica. Il codice temporaneo non è integrato.
- Il controllo dei privilegi PostgreSQL e l'isolamento dei segreti richiedono test su database reale. L'accesso SQL arbitrario rende insufficiente affidarsi a istruzioni del modello o parametri di sessione modificabili.
- L'audit completo dei log del proxy rimane TEC-008; non è stato eseguito streaming remoto dei log del tunnel condiviso. Non si dichiara conformità privacy complessiva.
- Il costo operativo delle alternative dipende da gestione delle credenziali, integrazione con Hermes e manutenzione a ogni aggiornamento della release; non è ancora stimato.

## Recommendations

- Per **TEC-010**, progettare e verificare il broker con contesto protetto descritto sopra; non usare un GUC impostabile dal ruolo agente come unica fonte dell'autore. Verificare SQL avversario, disattivazioni, isolamento, concorrenza e ripulitura su PostgreSQL reale.
- Per **TEC-011**, montare `SOUL.md` versionato in sola lettura, applicare il refresh dei prompt alle sessioni esistenti e verificare memoria e data corrente effimera nella configurazione finale.
- Per **US-002**, non accettare autore fornito dall'agente, usare il percorso autenticato una volta implementato e provare gli scenari con modello reale e dati sintetici.

## Sources

- [Adattatore WhatsApp Cloud v0.22.7](https://github.com/NousResearch/hermes-agent/blob/v0.22.7/plugins/platforms/whatsapp_cloud/adapter.py)
- [Dispatcher dei tool v0.22.7](https://github.com/NousResearch/hermes-agent/blob/v0.22.7/model_tools.py)
- [Costruzione del prompt v0.22.7](https://github.com/NousResearch/hermes-agent/blob/v0.22.7/agent/system_prompt.py)
- [Loader dei file di contesto v0.22.7](https://github.com/NousResearch/hermes-agent/blob/v0.22.7/agent/prompt_builder.py)
- [Ripristino del prompt v0.22.7](https://github.com/NousResearch/hermes-agent/blob/v0.22.7/agent/conversation_loop.py)
- [Sessioni Hermes v0.22.7](https://github.com/NousResearch/hermes-agent/blob/v0.22.7/website/docs/user-guide/sessions.md)
