# Changelog

Le modifiche rilevanti del progetto sono documentate qui.

Il formato segue [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) e il progetto usa [Semantic Versioning](https://semver.org/). Ogni voce riporta l'ID dell'item.

## [Unreleased]

## [0.4.0] - 2026-11-25

### Changed

- Il livello di thinking dell'assistente si sceglie con `PILATES_REASONING_EFFORT` accanto a `PILATES_MODEL`, in `.env` e in `prod.env` (predefinito `medium`); un valore non valido arresta l'avvio e il cambio vale al successivo riavvio del gateway, senza ricostruire le immagini. Da WhatsApp `/model`, `/reasoning`, `/fast` e `/codex-runtime` ricevono un rifiuto fisso, anche per il gestore (TEC-051).
- Il menu di `/anagrafica` descrive brevemente ogni operazione e chiarisce che «correggi» cambia solo nome e cognome mentre «numero» cambia il telefono; comandi, passaggi e conferme restano invariati (US-018).
- Processo e strumenti allineati al template v4.2.0: nel lavoro parallelo il lancio di un worker vale come via, il worker implementa subito e si ferma in attesa solo se ha domande aperte o se si chiede al lancio di rivedere i piani; in modalità Herdr l'orchestratore conferma da solo la finestra di fiducia dei worker Claude Code nei clone appena creati. Le viste `/backlog` di Pi e Claude Code attenuano le dipendenze già completate e l'ID degli item con dipendenze non completate (TEC-054).

### Added

- Partecipazioni previste di lezioni extra e recuperi: un messaggio come «oggi alle 18 si allenerà Mario Rossi» programma, anche in anticipo, la partecipazione di un cliente fuori dalle sue regole; il cliente risulta atteso solo a quella lezione, distinto dagli attesi per regola, conta per «c'erano tutti», per le registrazioni mancanti e le statistiche, e la partecipazione si annulla una sola volta con storico, senza registrare presenze prima dell'inizio (US-019).
- Il log del gateway registra con la riga fissa `whatsapp_send_failed` ogni invio WhatsApp rifiutato da Meta o rimasto senza risposta, per le risposte fisse, gestionali e dell'agente, con il solo stato HTTP e il codice d'errore Meta e senza numeri, testi, nomi o credenziali. La guida di produzione spiega come riconoscere un destinatario assente dall'elenco del numero di test (codice 131030) (TEC-049).
- Backup a caldo pianificato della produzione: lo script `backup-agent-pilates.sh`, installato a mano su `jarvis` e avviato dalla crontab dell'operatore alle 14:30 e alle 22:30 (Europe/Rome), esegue la copia a caldo con l'immagine `ops` della release in esercizio, impedisce esecuzioni sovrapposte, registra l'esito in un log locale senza dati sensibili e conserva per 30 giorni le sole copie pianificate complete, senza toccare backup manuali, quiescenti o incompleti (TEC-050).

### Fixed

- Dopo un riavvio del server il gateway di produzione riparte da solo con PostgreSQL e broker, sulla stessa release e con gli stessi dati: `SOUL.md`, configurazione, plugin e skill non sono più montati dall'immagine con mount `type: image`, che Docker non risolveva al riavvio del container, ma esposti in sola lettura dall'immagine con collegamenti che l'agente non può sostituire. La guida di produzione descrive il ripristino manuale per le release precedenti (BUG-004).
- PostgreSQL risulta sano solo quando il server definitivo accetta connessioni TCP: la configurazione dei ruoli non fallisce più in modo intermittente con «Database role setup failed.» al primo avvio di un volume vuoto, dopo un ripristino o con più progetti di prova in parallelo (BUG-005).

## [0.3.0] - 2026-11-17

### Added

- Procedura operativa per trasferire la funzione di gestore a un'altra persona già censita o per cambiare il numero della stessa persona, con recupero verificabile e allineamento di configurazione e anagrafica. Il recupero segue l'identità precedente e non chi ha riutilizzato il numero; un errore di scrittura non annulla un cambiamento più vecchio. I tentativi equivalenti in chat restano vietati. L'aggiornamento non importa allowlist, mapping o nomi WhatsApp; censire un destinatario non lo preregistra sul numero di test Meta e i backup precedenti non diventano anonimi (TEC-043).

- Riconoscimento unico del mittente dal database: solo gli insegnanti censiti e abilitati accedono all'agente, con nome e cognome censiti al posto del nome WhatsApp anche per «io» e per l'autore delle nuove operazioni; i numeri non abilitati ricevono un rifiuto fisso senza modello. Il gestore mantiene l'anagrafica in chat con `/anagrafica`; censimenti, revoche e cambi di numero hanno effetto senza riavvio, con chat vuota per un nuovo numero o un numero riassegnato e sessioni precedenti azzerate. Telefoni dell'anagrafica e numeri degli autori non sono più leggibili dal modello e l'agente non crea insegnanti (TEC-042).

- Contesto dell'assistente suddiviso in un nucleo `SOUL.md` entro 15.000 caratteri e sei skill interne versionate di sola lettura, con ricostruzioni delle lezioni affidate a funzioni SQL. Le skill si caricano solo tramite `skill_view`: i comandi WhatsApp di caricamento e le relative varianti sono rifiutati dal gateway, senza cambiare gli altri comandi slash. Restano limiti conversazionali e incertezze di causalità/stabilità accettati esplicitamente dall'utente per la sola chiusura dell'item, non dichiarati risolti; esiti completi e deroga nel [rapporto delle prove](docs/operations/TEC-046-prove.md) (TEC-046).
- Consultazioni conversazionali per insegnante: chi ha tenuto o terrà una lezione distinguendo insegnante atteso, indicazione e sostituzione, lezioni tenute, in sostituzione e sostituite da altri con i presenti e conteggi dal database, lezioni senza insegnante, regole attive e storico, verificate con scenari sintetici e fixture storiche (US-015).
- Audit privacy ripetibile dei log del proxy con `npm run proxy:audit`: marcatori sintetici su produzione e sviluppo, controlli in sola lettura di tunnel, journal e syslog e metadati Cloudflare in sola lettura. È documentato che Cloudflare conserva per 31-32 giorni la query string, compreso il verify token delle verifiche Meta, insieme ai limiti residui; adottata la procedura del verify token monouso per le verifiche future (TEC-008).
- Manifest `.pi/workflow.json` e launcher `node scripts/start-pi.mjs` per Pi e futuri worker: settings locale persistente con modello, thinking, temi e preferenze preservati, transizione privata e verifiche sintetiche (TEC-045).
- Componente di gestione guidata dell'anagrafica via WhatsApp, con bootstrap del gestore, conferme monouso, dati esclusi dal modello e verifiche su PostgreSQL e webhook firmati; pronto ma non attivato negli avvii operativi, in attesa del passaggio coordinato dell'accesso ordinario (US-017).
- Pannello `/backlog` di sola lettura per Claude Code, con filtri di sessione, navigazione, scorrimento, aggiornamento e gli stessi stati e avvisi della CLI e di Pi (TEC-044).
- Base dati additiva dell'identità unica degli insegnanti, con telefoni privati, funzioni fidate di censimento e gestione, accesso revocabile e audit protetto; conserva la compatibilità del runtime precedente senza attivare ancora il nuovo riconoscimento (TEC-041).
- Launcher manuale `update-agent-pilates.sh <commit>` senza versione cablata, con validazione dello SHA e istruzioni per scegliere l'ultimo commit con immagini pubblicate (TEC-040).
- Comando manuale `ops backup-hot` per copiare il solo PostgreSQL di produzione senza fermare gateway e broker, con verifica e ripristino isolato per consultazione (TEC-039).
- Indicazioni e sostituzioni conversazionali degli insegnanti per lezioni passate e future, con conferma per più lezioni, identità del mittente collegato, correzioni tramite annullamento e storico verificati con scenari sintetici (US-014).
- Registrazione conversazionale degli insegnanti e delle regole settimanali, con conferma delle sovrapposizioni, conservazione delle parti residue e collegamento privato degli utilizzatori autorizzati (US-011).
- Schema versionato degli insegnanti, con regole settimanali e intervalli, indicazioni per le lezioni passate e future, autore autenticato e storico protetto; il database impedisce sovrapposizioni attive anche concorrenti e indicazioni valide duplicate (TEC-033).
- Produzione su `jarvis` collegata a WhatsApp con app Meta, numero e segreti propri e callback stabile `agent-pilates-studio.toto-castaldi.com`, indipendente dal clone di sviluppo collegato (TEC-036).
- Comando `ops` per installare, aggiornare e riportare alla versione precedente la produzione su `jarvis`, lanciato a mano e senza codice sul server (TEC-035).
- Immagini di produzione pubblicate su GHCR dalla CI su `main`, marcate con il commit, e stack eseguibile senza codice sul server; `SOUL.md`, configurazione e plugin sono montati in sola lettura dall'immagine (TEC-037).
- Ambienti di sviluppo e produzione separati sullo stesso `compose.yaml`: volumi parametrici con `PILATES_VOLUME_PREFIX` e rifiuto del progetto di produzione in `start:local` (TEC-034).
- Consultazione conversazionale di presenze, assenze, registrazioni mancanti e statistiche per periodo, con storico e attesi ricostruiti per la lezione (US-009).
- Registrazione e annullamento delle assenze giustificate anticipate, con conferme per più lezioni e gestione dei conflitti con le presenze (US-013).
- Correzione conversazionale di presenze e assenze tramite annullamento tracciato e consultazione dello storico (US-008).
- Registrazione conversazionale delle assenze giustificate e non giustificate, con chiarimenti per il tipo e per i clienti attesi non citati (US-007).
- Registrazione conversazionale delle presenze, anche per clienti attesi in date passate, con segnalazione di duplicati e clienti non attesi (US-006).
- Schema versionato per presenze e assenze con autore autenticato, annullamento tracciato e storico protetto (TEC-027).
- Lavoro parallelo opzionale con la skill `orchestrate`: un worker Pi per item in un clone separato, claim condiviso, attesa del via dell'utente e merge solo su richiesta (TEC-028).

### Changed

- Template v4.0.0 adottato: processo con nucleo e guide su richiesta in `docs/process/`, riferimenti migrati, `backlog docs --for <ID>` e validazione delle sezioni, orchestrazione suddivisa per modalità e nomi Herdr con prefisso del repository; preservate le personalizzazioni dello studio (TEC-048).
- Processo, skill e CLI del backlog allineati al template v3.0.0: requisiti e design suddivisi in file indirizzabili (`docs/requirements/`, `docs/design/`) e condensati allo stato attuale, comando `backlog docs` e orchestrazione con worker Claude Code (TEC-047).
- Documentate, con prove sintetiche isolate, le opzioni per un contesto dell'agente compatto: skill Hermes di sola lettura, funzioni SQL di sola lettura per lezioni, insegnanti e attesi, e ripartizione di `SOUL.md` sotto 15.000 caratteri (SPIKE-003).
- Template v2.2.1 adottato: risoluzione unica dei branch nella CLI per `status`, `list`, `ready`, `show` ed `export`, con provenienza, concorrenza, cache e fetch limitato; preservati dati del backlog e adattamenti Pi (TEC-044).
- Disabilitata l'offerta iniziale di profilo di Hermes; Ambrogio usa il nome WhatsApp disponibile senza censimento e non propone spontaneamente la profilazione degli utilizzatori (US-016).
- Processo e skill allineati al template v2.1.0: le aggiunte documentali di item su `main` sono pubblicate automaticamente se esiste un upstream, con controlli e recupero degli errori (TEC-038).
- Adozione del template v2.0.0: backlog in `backlog/` gestito con `.agents/tools/backlog.py`, stato calcolato su richiesta e processo ridotto; rimossi `BACKLOG.md` e `STATUS.md` (TEC-031).
- Processo e skill allineati al template v1.7.1; i futuri worker usano `pi --approve` con fiducia al clone per la sola sessione (TEC-030).
- Processo e skill allineati al template v1.7.0: l'orchestratore segue i worker senza bloccarsi, consente attività di backlog su `main` e verifica che `main` sia pubblicato prima di avviare i worker (TEC-029).
- Processo e skill allineati al template v1.6.1: date dall'orologio di sistema, conteggio meccanico degli stati, controlli dei record prima del merge e rigenerazione di `STATUS.md` nei conflitti (TEC-028).

### Fixed

- Nuovi lanci Herdr con `--no-parent`, mantenendo shell, spazio e `pi --approve`; coordinamento tramite rapporti e controlli a inizio turno, attesa esplicita per nome senza rilanciare worker esistenti (TEC-044).
- Il ripristino locale del backup a caldo e la relativa prova CI attendono il PostgreSQL definitivo, evitando il server temporaneo di inizializzazione che interrompeva il ripristino (BUG-003).

### Removed

- `WHATSAPP_ALLOWED_USERS`, `WHATSAPP_HOME_CHANNEL` e `WHATSAPP_TEACHER_LINKS` con i relativi file privati: l'unico numero configurato è `PILATES_MANAGER_PHONE`, da cui deriva il canale home; le vecchie chiavi e i vecchi file sono rifiutati (TEC-042).
- Template Pi `/start`, ritenuto inutile: il riepilogo dello stato resta disponibile con `python3 .agents/tools/backlog.py status` (TEC-032).

## [0.2.0] - 2026-11-07

### Added

- Dettato vocale Pi su server remoto tramite socket Pulse del client inoltrato via SSH, con procedura, configurazione del server `npm run voice:setup` e diagnosi in sola lettura `npm run voice:diagnose` (TEC-020).
- Contesto separato per ogni interlocutore, con compattazione silenziosa al 40% della finestra del modello configurato e alla ripresa dopo un'inattività configurabile (predefinita 4 ore) (TEC-025).
- Visualizzatore Pi `/backlog` in sola lettura con navigazione, scorrimento e scorciatoia configurabile (TEC-023).
- Tracciabilità del template di origine e procedura manuale per confrontare aggiornamenti senza adottarli automaticamente (TEC-022).
- Catalogo e harness isolato per scenari conversazionali con modello OpenRouter reale (TEC-012).
- Contesto versionato dello studio per Hermes, con refresh delle sessioni e data corrente Europe/Rome (TEC-011).
- Template Pi `/work-alone` condiviso per completare autonomamente un'attività già avviata (TEC-017).
- Template Pi `/start` condiviso per riepilogare lo stato e le prossime attività senza avviare lavoro (TEC-016).
- Schema della pianificazione e broker isolato per attribuire inserimenti e disattivazioni ai mittenti WhatsApp autenticati, con prove di concorrenza e replay (TEC-010).

### Fixed

- Canale home WhatsApp fissato dall'operatore, senza avviso o possibilità di modifica tramite `/sethome`; cron disabilitati (BUG-001).

### Changed

- L'assistente si chiama Ambrogio, si presenta all'inizio della conversazione e risponde alle domande sulla propria identità (US-005).
- L'avvio locale applica da `.env` la configurazione esterna, riallinea gateway e broker e preserva le credenziali database e interne (TEC-026).
- Template v1.5.0 adottato con shared claims e vista Pi del backlog con filtri e stati dai branch (TEC-024).
- Verificata la consultazione settimanale con scenari sintetici, regole disattivate e controlli sulle fasce orarie (US-003).
- Scenari e verifiche conversazionali estesi a disattivazioni, cambiamenti di gruppo e storico delle regole (US-004).
- Processo e skill allineati al template v1.4.0 e modulo architetturale Agente documentato (TEC-023).
- L'avvio locale accetta `.env` come link simbolico a un file regolare privato (TEC-021).
- Estesi gli scenari di registrazione e le verifiche dell'harness a gruppi, più orari, chiarimenti e attribuzione dell'autore (US-002).
- I tool Pi di domanda segnalano l'attesa dell'utente nei terminali compatibili, tramite il pacchetto condiviso fissato (TEC-018).
- Gate di chiusura rapido con test in memoria e suite locali e di integrazione separate, mantenute nella CI (TEC-015).
- Allineati documentazione e test all'avvio diretto Pi, preservando le impostazioni personali e verificando il quality gate (TEC-014).
- Documentate le opzioni per identità del mittente, contesto dello studio e sessioni Hermes; ripristinate le risorse Pi condivise (SPIKE-002).
- Separazione della configurazione Pi condivisa dalle preferenze e sessioni personali, con avvio isolato e procedura di migrazione (TEC-013).

## [0.1.0] - 2026-11-05

### Added

- Baseline documentale del progetto, requisiti e piano iniziale (TEC-001).
- Scaffold TypeScript e quality gate locale con lint, controllo dei tipi, test e build (TEC-002).
- Stack locale Compose con PostgreSQL, migrazioni Prisma, Hermes e gateway WhatsApp Cloud nativo; tool SQL diretto e verifiche locali e reali delle integrazioni e dei privilegi (SPIKE-001).
- Migrazioni containerizzate su host Linux Docker senza Node.js installato (TEC-005).
- Backup quiescente e ripristino isolato di PostgreSQL e del volume Hermes, con procedura operativa e verifica anche su dati reali (TEC-005).
- Test isolato di aggiornamento tra versioni di PostgreSQL e Hermes con persistenza dei dati sintetici (TEC-005).
- Workflow GitHub Actions per il quality gate e i test di integrazione PostgreSQL e Hermes, senza deploy automatico (TEC-006).
- Avvio locale con un comando, configurazione privata, migrazioni e healthcheck, con test su PostgreSQL e Hermes isolati (TEC-009).

### Changed

- Diagnostica Docker limitata a eventi fissi per Hermes e PostgreSQL, senza output grezzo dei servizi; documentate prova pubblica temporanea e limitazioni privacy del proxy (TEC-005).
- Versionamento selettivo della configurazione e del template Pi, con esclusione dei dati locali e delle estensioni non approvate (TEC-007).
