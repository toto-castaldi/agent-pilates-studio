# Changelog

Le modifiche rilevanti del progetto sono documentate qui.

Il formato segue [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) e il progetto usa [Semantic Versioning](https://semver.org/). Ogni voce riporta l'ID dell'item.

## [Unreleased]

### Added

- Correzione conversazionale di presenze e assenze tramite annullamento tracciato e consultazione dello storico (US-008).
- Registrazione conversazionale delle assenze giustificate e non giustificate, con chiarimenti per il tipo e per i clienti attesi non citati (US-007).
- Registrazione conversazionale delle presenze, anche per clienti attesi in date passate, con segnalazione di duplicati e clienti non attesi (US-006).
- Schema versionato per presenze e assenze con autore autenticato, annullamento tracciato e storico protetto (TEC-027).
- Lavoro parallelo opzionale con la skill `orchestrate`: un worker Pi per item in un clone separato, claim condiviso, attesa del via dell'utente e merge solo su richiesta (TEC-028).

### Changed

- Processo e skill allineati al template v1.7.0: l'orchestratore segue i worker senza bloccarsi, consente attività di backlog su `main` e verifica che `main` sia pubblicato prima di avviare i worker (TEC-029).
- Processo e skill allineati al template v1.6.1: date dall'orologio di sistema, conteggio meccanico degli stati, controlli dei record prima del merge e rigenerazione di `STATUS.md` nei conflitti (TEC-028).

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
