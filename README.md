# agent-pilates-studio

Progetto per installare e aggiornare [Hermes Agent](https://hermes-agent.nousresearch.com/), provarlo in locale e collegarlo a PostgreSQL, OpenRouter e WhatsApp Business.

## Stato

La v0.1.0 include una configurazione locale Compose per PostgreSQL e Hermes, con OpenRouter, il gateway WhatsApp Cloud nativo e un tool SQL diretto. Una prova reale ha verificato la conversazione WhatsApp tramite Hermes e OpenRouter e l'accesso SQL con il ruolo limitato.

## Scaffold e verifiche locali

Per lo scaffold servono Node.js LTS 24.14.0 e npm 11.9.0, le versioni usate per le verifiche. Il progetto accetta Node.js dalla 24.14.0 alla 24.x e npm dalla 11.9.0 alla 11.x; `.nvmrc` indica la versione di Node.js verificata. Con `nvm` si possono usare `nvm install` e `nvm use` dalla directory del progetto.

Da una copia pulita del repository:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Il gate rapido comprende lint, controllo dei tipi, test unitari e build; `npm ci` prepara le dipendenze da lockfile. `npm test` ricompila e usa il runner Node.js senza isolamento a processi: i test lavorano solo in memoria, senza filesystem, processi figli, Git, rete o Docker. `npm run build` rigenera `dist/`, includendo codice e test; la compilazione stessa usa filesystem e processi.

Le prove con effetti reali sono separate: `npm run test:local` verifica Git, file, processi e contratto CI; `npm run test:pi` richiede Pi 1.5.0; `npm run test:pi-package` richiede inoltre Git, Python 3 e rete per il pacchetto Pi pubblico e le sue dipendenze di test; `npm run test:db`, `test:hermes`, `test:author`, `test:compaction`, `test:upgrade` e `test:start` richiedono Docker Compose. Eseguirle durante il lavoro quando servono per dimostrare i criteri; alla chiusura della versione eseguire tutte le suite di integrazione. Le prove end-to-end reali richiedono anche servizi e credenziali esterni.

## Scenari conversazionali con OpenRouter

`scenarios/basic.json` descrive lo stato iniziale, i messaggi sintetici, i contenuti attesi e lo stato del database dopo ogni turno. Per eseguirlo servono Node.js/npm, Docker Compose su Linux con accesso dell'host alle reti bridge Docker, rete Internet e una chiave OpenRouter valida nell'ambiente privato `OPENROUTER_API_KEY`. Non servono credenziali Meta. Dopo `npm ci`, impostare la chiave tramite un gestore di segreti o un input privato, senza inserirla nella cronologia della shell, poi eseguire:

```bash
npm run test:conversation
# In alternativa, un solo scenario:
CONVERSATION_SCENARIO=consultazione-pianificazione npm run test:conversation
```

Il modello predefinito è `openai/gpt-6.1-terra`; l'identificativo opzionale `CONVERSATION_MODEL` ne sceglie un altro su OpenRouter. Il comando usa un progetto Compose casuale con database e volume Hermes nuovi, webhook sintetici firmati e un sostituto locale dell'API Meta in uscita; il modello è reale. Disabilita i messaggi di avanzamento e configura un canale home sintetico; non filtra l'avviso del canale home e segnala errore se riappare. Un relay sul socket Unix privato dello scenario inoltra le richieste a OpenRouter: la chiave reale resta nell'ambiente e nella memoria del processo host, non viene copiata nei file o nei container; i file temporanei contengono solo credenziali sintetiche. La rete del progetto non è una sandbox generale. Non usa il database, il gateway o i segreti operativi. Nessun messaggio, numero o segreto è stampato intenzionalmente.

Il comando riporta `OK` o `ERRORE` per scenario ed esce con codice non zero per risultati inattesi, errori o pulizia incompleta. Il catalogo copre nome e presentazione per due interlocutori sintetici, saluto e richiesta iniziale senza proposte spontanee di profilo nei primi turni, riconoscimento del nome WhatsApp presente o assente, registrazione, gruppi, chiarimenti, attribuzione dell'autore, consultazione per giorno, fascia, orario, cliente e settimana, disattivazioni esplicite, cambiamenti impliciti, variazioni di gruppo e storico. Comprende presenze e assenze, distinzione del tipo, chiarimenti sugli attesi non citati, assenze anticipate, conferme, conflitti, correzioni, annullamenti, consultazione dello storico e statistiche con valori attesi, inclusi clienti senza registrazione valida e presenze extra. Verifica clienti, autori, date, motivi, associazioni e stato delle regole, accettando diverse scomposizioni senza associazioni mancanti o duplicate. Confronta le righe tra turni per rilevare cancellazioni, riscritture o modifiche a disattivazioni precedenti; i divieti del database sono verificati separatamente su PostgreSQL reale. Gli indicatori delle risposte sono lessicali: per i gruppi richiesti verifica orario e clienti sulla stessa riga e nella sezione del giorno, ma non verifica il significato completo né associa ogni data al relativo evento. Le esclusioni sul profilo possono rifiutare una negazione innocua e non riconoscere proposte formulate diversamente. Gli esiti non garantiscono il comportamento futuro del modello.

Gli scenari degli insegnanti coprono anagrafica, cognome mancante e nome ambiguo, fasce e orari, sovrapposizioni con e senza conferma, disattivazione parziale e mittenti collegati o senza corrispondenza. Dopo ogni turno confrontano l'intera anagrafica, autori e storico, e la copertura degli intervalli al minuto, inclusi gli estremi e le parti residue; controllano anche che clienti e presenze non cambino. I collegamenti degli scenari sono sintetici e non vengono letti dalla configurazione operativa.

Ogni scenario usa uno stack nuovo e parte da stato vuoto. Alcuni scenari preparano nel database isolato clienti e regole sintetici, anche disattivati in date diverse, con autore e date fissati; usano il contesto autore riservato al ruolo di migrazione, mai disponibile all'agente. Negli scenari delle presenze e assenze il confronto comprende tutte le registrazioni, anche annullate, con cliente, data, ora, esito e autore; per gli annullamenti controlla data, autore e motivo non vuoto, oltre alle regole invariate e ai clienti creati. Le date relative `$TODAY`, `$YESTERDAY` e `$NEXT_MONDAY` (eventualmente con offset in giorni) sono calcolate in Europe/Rome all'inizio dello scenario. Le fixture sintetiche inseriscono anche presenze e assenze storiche, eventualmente annullate, disabilitando il trigger autore solo nella transazione di preparazione del migratore e riattivandolo prima dei turni; date, autori, motivi e vincoli temporali delle fixture sono verificati. Per le consultazioni si confronta l'intero snapshot prima e dopo ogni turno. Nei turni statistici indicati il launcher di prova conta le query SELECT riuscite contenenti una funzione aggregata, comunicando al sostituto Meta solo un marcatore fisso, senza query, parametri o risultati. Il controllo è lessicale e non prova che il risultato sia stato usato. I conteggi nella risposta sono verificati con indicatori lessicali vicini alle etichette, non con un'analisi semantica completa. Un attraversamento della mezzanotte durante lo scenario può causare un errore della prova, da riesaminare. `CONVERSATION_SCENARIO` seleziona facoltativamente un ID del catalogo; lo strumento è escluso da CI e `npm test`.

Le chiamate OpenRouter sono a pagamento e possono richiedere più richieste per turno. Al 2026-11-06 il catalogo OpenRouter indicava per il modello predefinito circa **1 USD/milione di token in ingresso e 5 USD/milione in uscita**: ad esempio 10.000 token in ingresso e 2.000 in uscita costerebbero circa 0,02 USD. Sono valori indicativi, non un preventivo; verificare prezzi e limiti correnti prima della prova. Registrare data, modello, commit, esito e limiti senza trascrivere messaggi, numeri o segreti; vedere `docs/operations/TEC-012-prove.md`.

Il comando tenta di rimuovere container, reti, volumi, immagine temporanea e segreti anche in caso di errore o interruzione gestita. Un arresto forzato, un guasto Docker o del sistema possono impedirlo: verificare e rimuovere solo le risorse del progetto casuale `pilates-conv-*` e le directory temporanee `pilates-conversation-*`, senza toccare gli stack operativi. Non avviare streaming remoto dei log del tunnel; questa prova non usa il proxy pubblico né dimostra l'accettazione privacy o il funzionamento di Meta reale.

## Integrazione continua

Il workflow `.github/workflows/ci.yml` viene eseguito su push, pull request e avvio manuale. Su un runner Linux usa Node.js da `.nvmrc`, installa le dipendenze ed esegue il gate rapido, `test:local`, `test:pi` e `test:pi-package` con Pi 1.5.0 e le suite Docker `test:db`, `test:hermes`, `test:author`, `test:compaction`, `test:upgrade` e `test:start`. Prima prepara le immagini fissate dal progetto; i test creano risorse temporanee isolate e usano solo credenziali e dati sintetici. Un comando fallito rende negativo il job; non è previsto deploy automatico né servono segreti GitHub o credenziali Meta/OpenRouter. `test:local` controlla trigger, comandi e configurazione effettiva del workflow.

Le prove end-to-end con servizi e credenziali reali si eseguono separatamente come descritto in [Hermes e WhatsApp Cloud](#hermes-e-whatsapp-cloud); non fanno parte della CI.

## Template di origine

La [registrazione del template](docs/TEMPLATE-ORIGIN.md) distingue basi adottate, riferimenti solo confrontati e personalizzazioni dello studio. La procedura manuale permette di valutare aggiornamenti senza adottarli automaticamente; la prova isolata è inclusa in `npm run test:local`.

## Configurazione Pi

Con Pi installato, avviarlo direttamente dalla radice del progetto:

```bash
pi
# Per scegliere una sessione: pi --resume
```

Il repository versiona `.pi/settings.json`, il template `.pi/prompts/work-alone.md`, l'estensione `.pi/extensions/backlog/index.ts` e le skill in `.agents/skills/`. Dopo aver verificato le risorse, accordare fiducia al progetto in Pi per caricare le impostazioni e le risorse locali: la fiducia non è una sandbox e le estensioni possono eseguire codice. La configurazione può includere preferenze e riferimenti a pacchetti o percorsi dell'ambiente dell'operatore: la disponibilità di tali risorse su un altro computer non è garantita. Rivedere le modifiche al file versionato prima di condividerle e non inserirvi credenziali.

I tool `question` e `questionnaire` provengono dal pacchetto pubblico `agent-harness-stuff`, fissato in `.pi/settings.json` al commit `44f36742d47a4e83504abb9bdc0427be5f09ed82` sul branch `task/TEC-018-stato-attesa-tool-pi`. Sono un adattamento MIT di `pi-question-tool` 0.1.1 di SakikoTogawa233, con licenza e attribuzione conservate nel pacchetto. Il pacchetto originale `npm:pi-question-tool` non deve essere caricato contemporaneamente. Quando attendono una risposta, Pi 1.5.0 segnala `blocked`/`question` via OSC 7501 con un titolo fisso privo del testo della domanda; il terminale deve supportare il protocollo. Alla risposta o all'annullamento Pi ripristina lo stato precedente. I dati mostrati nelle normali interfacce e sessioni Pi restano sensibili.

Per aggiornare questi tool, revisionare il nuovo codice, assicurarsi che il commit sia pubblicamente raggiungibile e sostituire il riferimento fissato in `.pi/settings.json`; `pi update --extensions` non sposta un commit fissato. Ricaricare con `/reload` o riavviare Pi. Il branch remoto che contiene il commit deve restare disponibile finché il riferimento è in uso; la fiducia nel progetto resta necessaria.

In una sessione Pi con fiducia accordata, `/work-alone` chiede di implementare e completare autonomamente l'attività già avviata, individuata dal branch e dai documenti canonici; se non è identificabile, chiede chiarimenti anziché avviarne un'altra. Con shared claims attivi consente i soli push del branch item ai cambi di stato previsti dal processo; merge, push su `main` e altri push richiedono una richiesta esplicita. Restano valide eventuali istruzioni più restrittive dell'utente. Il template è un'istruzione al modello, non un controllo tecnico che ne garantisca il comportamento: verificare le operazioni proposte. Dopo aver aggiunto o modificato un template in una sessione già aperta, usare `/reload` per ricaricarlo; il nome del file determina il comando.

Pi usa normalmente `~/.pi/agent` come directory personale; `PI_CODING_AGENT_DIR` può indicarne un'altra. Le impostazioni del progetto prevalgono sulle preferenze personali e le liste di risorse vengono combinate. `PI_CODING_AGENT_SESSION_DIR` o `--session-dir` possono cambiare la posizione delle sessioni. Nessun launcher del progetto impone la separazione: se la directory personale coincide con la `.pi` del progetto, le modifiche alle preferenze possono aggiornare `.pi/settings.json` versionato. Sessioni, autenticazione, log e altri dati locali possono essere sensibili: proteggerli e non inserirli in Git.

In Pi 1.5.0, dopo aver revisionato l'estensione e accordato fiducia al progetto, `/backlog` apre una vista del backlog, letto con `.agents/tools/backlog.py`: frecce per cambiare item, Home/End per primo/ultimo, PagSu/PagGiù per scorrere e Esc o `q` per chiudere. `t`, `p`, `s` cambiano i filtri tipo, priorità e stato; maiuscolo li percorre all'indietro. Il filtro iniziale è `Todo`; i filtri restano in memoria fino al riavvio o `/reload`. Include in fondo gli item non assegnati a una versione. Il backlog è riletto a ogni apertura; uno store illeggibile o senza item è segnalato.

La vista risolve gli stati dai branch item locali e remote-tracking non integrati: il branch locale prevale sull'omonimo remoto, per più branch prevale il commit più recente e sono indicati provenienza e altri branch. Sul branch dell'item prevale la copia nel working tree. All'apertura usa i riferimenti disponibili e avvia `git fetch --prune` in background, aggiornando la vista al termine; un errore è segnalato e lascia gli ultimi riferimenti noti. Non modifica i file di lavoro, ma il fetch può aggiornare o eliminare riferimenti remote-tracking locali e contatta il remote scelto dalla configurazione Git; non è una sandbox. Gli stati possono essere obsoleti e i branch senza item corrispondente nel backlog di base non sono aggiunti.

Gli shared claims sono attivi (`AGENTS.md` §10, `docs/PROCESS-PARALLEL.md` §1): prima di avviare un item si esegue il fetch e si controllano branch locali e remoti; ai cambi di stato si pubblica il branch dell'item. Fetch o push falliti e assenza di `origin` sono gestiti dal processo. Un claim non è un lock atomico: due avvii concorrenti possono ancora sovrapporsi. Il solo commit documentale di aggiunta di un item su `main` viene pubblicato automaticamente se esiste un upstream; prima dell'aggiunta `main` deve essere pulito, aggiornato e senza altri commit locali non pubblicati. Senza upstream il push è saltato. Se l'upstream avanza, il processo prevede rebase, verifica del backlog e nuovo push; conflitti o errori sono segnalati senza perdere il lavoro. L'aggiunta non richiede il gate; merge e altri push di `main` richiedono una richiesta esplicita.

### Lavoro parallelo con orchestratore

Il lavoro parallelo è attivo (`AGENTS.md` §10, `docs/PROCESS-PARALLEL.md` §2) ma non parte da solo: in una sessione Pi sul clone principale, pulito e su `main`, invocarlo esplicitamente con `/skill:orchestrate`, eventualmente seguito dagli ID degli item. La skill non è proposta automaticamente al modello. L'orchestratore esegue `git pull --ff-only` e `git fetch --prune`, mostra i worker esistenti, gli item in attesa del via o del merge e gli item pronti senza branch, segnalando quelli che probabilmente toccano gli stessi file o modulo; l'utente sceglie quali avviare.

- **Workspace:** per ogni item un `git clone --branch main` da `origin` in `../agent-pilates-studio-work/<ID>/`, relativo al clone principale. Una cartella già esistente non viene sovrascritta. Il clone contiene solo file versionati: `.env`, `.local/`, segreti e stato Pi personale non vengono copiati; il worker prepara il clone con `npm ci` e non usa lo stack operativo. Verificare le risorse prima del lancio: il comando predefinito accorda la fiducia al clone senza dialogo iniziale.
- **Worker:** avviato con `pi --approve`, effettua il claim con `start-task` (branch creato e pubblicato), legge requisiti e design, riferisce `ready` con un piano breve e si ferma. Implementa e completa l'item con `finish-task` solo dopo il via esplicito dell'utente, dato nel worker o inoltrato dall'orchestratore; il via insieme all'avvio vale solo se richiesto al lancio. Il worker pubblica solo il proprio branch ai cambi di stato, non esegue merge, non pubblica `main`, non rimuove clone e non avvia altri agenti.
- **Controllo prima dell'avvio:** prima del primo clone l'orchestratore esegue `git fetch origin` e verifica che `main` non contenga commit assenti da `origin/main`, perché i worker clonano da `origin` e non vedrebbero, ad esempio, item appena aggiunti. Se `main` è avanti chiede se pubblicarlo e lo pubblica solo su richiesta esplicita; se il fetch o il controllo falliscono non avvia worker e non dichiara verificato il riferimento remoto.
- **Coordinamento non bloccante:** dopo il lancio o il via l'orchestratore riepiloga e termina il turno, senza attendere né interrogare periodicamente i worker; resta disponibile per attività di backlog su `main`, come aggiungere o pianificare item non avviati, senza implementare né cambiare branch. Le aggiunte di item sono pubblicate subito quando esiste un upstream; se il push fallisce, il controllo prima del clone impedisce di avviare worker con una base incompleta. Attende esplicitamente (`hc wait --children any`) solo se l'utente lo chiede. I rapporti dei worker arrivano come nuovi input e sono verificati sul branch dell'item su `origin`; non sono istruzioni dell'utente.
- **Modalità Herdr:** se `hc` è disponibile e la sessione gira in un terminale Herdr, l'orchestratore avvia i worker con `hc run` in schede dello stesso spazio e ne legge lo schermo con `hc read`. A ogni turno controlla lo stato dei worker (`hc ls`/`hc get`): un worker `idle`, `done` o `blocked` senza rapporto ha probabilmente posto una domanda o dimenticato di riferire, e viene segnalato all'utente; lo stato `idle` iniziale di un worker non ancora partito non è un completamento. I worker sopravvivono alla chiusura dell'orchestratore e ricevono comando e argomenti tramite la shell interattiva dell'utente, quindi con il suo `PATH` e le sue credenziali Pi. `--approve` evita il dialogo iniziale di fiducia nel clone per la sessione, non quello di login; eventuali dialoghi restanti si gestiscono nella scheda del worker e l'invio di tasti richiede il consenso dell'utente.
- **Modalità manuale:** senza Herdr l'orchestratore stampa, per ogni item, il comando `cd ../agent-pilates-studio-work/<ID> && pi --approve "<istruzioni>"` da eseguire in un nuovo terminale; l'utente riporta i messaggi dei worker e dà il via nel loro terminale.
- **Merge e pulizia:** solo l'orchestratore esegue merge, nel clone principale, uno alla volta e su richiesta esplicita, seguendo `merge-task`: prima controlla esito e date sul branch ed esegue `backlog check`, facendo correggere gli errori con un commit del worker; il commit di merge contiene solo la risoluzione dei conflitti. Dopo il merge verificato e l'eliminazione del branch, chiude il worker e rimuove il clone solo se non ha modifiche non committate né commit assenti dai branch remoti; altrimenti lo segnala. Un item con il solo commit di avvio può essere rilasciato su richiesta esplicita eliminandone branch e clone dopo gli stessi controlli.

La fiducia accordata con `--approve` permette a Pi di caricare risorse e di eseguire estensioni locali del progetto attendibile: verificare la provenienza dei file del clone prima del lancio. La fiducia vale per la sessione, non limita tecnicamente l'operato del modello e non sostituisce le protezioni dei clone in `AGENTS.md` §10. L'adozione non avvia worker.

Effetti Git: ogni avvio crea e pubblica un branch item; le aggiunte di item su `main` sono pubblicate automaticamente se esiste un upstream, mentre merge, altri push di `main` ed eliminazione dei branch avvengono solo su richiesta. Le istruzioni della skill e dei worker guidano il modello ma non sono controlli tecnici: un agente può sbagliare, due orchestratori su clone diversi possono sovrapporsi e i clone sotto la stessa radice sono condivisi tra copie principali dello stesso repository. Verificare le operazioni proposte. `npm run test:local` verifica selezione, controllo di `main` allineato o avanti e degli errori di fetch, pubblicazione delle aggiunte e assenza di altri push automatici, gestione dei rapporti e degli stati dei worker, attività di backlog su `main`, claim, attesa del via, sovrapposizioni, conteggi, date, conflitti di stato, merge, rilascio e pulizia con repository e remoti sintetici; `npm run test:pi` verifica che Pi esponga la skill solo come comando esplicito. Le prove usano un sostituto sintetico di `hc` per controllare gli argomenti nelle due modalità, non avviano Herdr né un modello. La prova Pi offline in uno pseudoterminale verifica che `--approve` elimini il dialogo iniziale, esegua un'estensione sintetica e non persista la fiducia nella sessione successiva; non verifica login, terminali diversi o il comportamento del modello.

La scorciatoia predefinita è `ctrl+shift+b`, se il terminale trasmette tale combinazione. Per cambiarla, aggiungere `"backlogOverlay": { "shortcut": "alt+b" }` alle impostazioni Pi personali oppure di progetto; `false`, `null` o stringa vuota la disattivano, senza disattivare `/backlog`. La configurazione del progetto prevale su quella personale; la scorciatoia viene registrata al caricamento, quindi usare `/reload` o riavviare dopo averla cambiata. Non sovrascrivere le altre impostazioni né inserire segreti nel file versionato. Le estensioni eseguono codice con i permessi dell'operatore: la fiducia non è una sandbox.

Per verificare Pi 1.5.0 installato in modalità offline e senza credenziali reali, eseguire `npm run test:pi` (richiede Python 3). Le prove avviano Pi in directory temporanee con impostazioni sintetiche: verificano caricamento, precedenza e fiducia per template, estensione e skill a sola invocazione esplicita, e una TUI in pseudoterminale per navigazione, filtri, branch sintetici, scorrimento, riapertura, errori e scorciatoie. Non ispezionano né modificano la configurazione personale esistente, non invocano un modello e non verificano tutti i terminali, le dimensioni o l'osservanza delle istruzioni dei template. La modalità offline disabilita l'attività di rete automatica di Pi, ma non è una sandbox di rete.

`npm run test:pi-package` installa in una directory temporanea il commit configurato, usando la rete pubblica senza impostazioni o credenziali personali; verifica il commit effettivo, l'unicità e provenienza dei tool, i test di compatibilità con l'originale e una prova Pi 1.5.0 con pseudoterminale e OSC 7501. La prova usa domande sintetiche e comandi senza modello: verifica il ripristino allo stato `idle`, non il ritorno a `working` durante un turno reale né la visualizzazione di ogni terminale.

### Dettato vocale su server remoto

Se Pi gira su un server senza schede audio raggiunto via SSH, il dettato di Pi Voice può usare il microfono del client Ubuntu con PipeWire: sshd inoltra il socket Pulse del client come socket Unix (`RemoteForward`, nessuna porta TCP), ALSA sul server è instradato verso Pulse e `PULSE_SERVER` indica il socket inoltrato. La [procedura](docs/operations/TEC-020-dettato-vocale-remoto.md) descrive pacchetti e configurazione di sshd (comandi amministrativi a cura dell'operatore), configurazione dell'utente su server e client, verifica e limiti. La configurazione di Pi Voice non cambia e resta esclusa da Git.

```bash
npm run voice:setup      # sul server, come utente di Pi; usa sudo per pacchetti e sshd
npm run voice:diagnose
```

`voice:setup` configura il server in modo idempotente, senza sovrascrivere file personali con altra configurazione, e stampa la riga `RemoteForward` per il client. `voice:diagnose`, in sola lettura, controlla sul server plugin ALSA Pulse, `pactl`, dispositivo ALSA predefinito, `PULSE_SERVER`, socket, raggiungibilità del server audio del client e presenza di una sorgente audio, e indica il rimedio per ogni passo mancante. Non installa pacchetti, non modifica file e non registra audio.

## Avvio locale con un comando

Servono Node.js 24.14.0 e npm 11.9.0, Docker e Docker Compose funzionanti, rete per immagini e dipendenze e credenziali Meta/OpenRouter. Da un clone nuovo, copiare l'esempio e renderlo privato, quindi compilare `.env` con un editor locale, senza inserire i valori nella cronologia della shell o in chat:

```bash
cp .env.example .env
chmod 600 .env
# Compilare .env privatamente prima del comando seguente.
npm run start:local
```

Impostare tre password database casuali e distinte di almeno 16 caratteri, i valori Meta/OpenRouter, il verify token configurato anche su Meta e l'allowlist di numeri internazionali in sole cifre, separati da virgole. Impostare `WHATSAPP_HOME_CHANNEL` a uno dei numeri esatti dell'allowlist: l'esempio è sintetico e va sostituito. Se manca o non è autorizzato, l'avvio fallisce senza mostrare il numero. `WHATSAPP_PHONE_NUMBER_ID` è l'identificativo Meta, non un numero telefonico. L'esempio non contiene valori reali. `.env` e la directory `.local/secrets/` contengono credenziali: mantenerli privati, fuori da Git e conservarne copie cifrate. Se si usa `SECRETS_DIR`, la directory deve essere privata (`0700`) e i suoi file privati (`0600`).

Per collegare un utilizzatore autorizzato a un insegnante, compilare facoltativamente `WHATSAPP_TEACHER_LINKS` in `.env` come array JSON, seguendo l'esempio sintetico in `.env.example`. Ogni oggetto contiene soltanto `phone` (numero in sole cifre esattamente nell'allowlist), `firstName` e `lastName` (nome e cognome senza spazi ai bordi). Un numero può comparire una sola volta; più numeri possono riferirsi allo stesso insegnante. `[]` o la variabile omessa indicano nessun collegamento: ometterla in un avvio successivo rimuove quindi quelli precedenti. Valori malformati, numeri non autorizzati o duplicati arrestano l'avvio prima degli effetti, senza mostrare nomi o numeri. L'insegnante deve essere già presente in anagrafica perché il sistema lo riconosca; altrimenti l'agente chiede il nome. Il collegamento non cambia i permessi.

In alternativa a un file normale, `.env` può essere un collegamento simbolico: la destinazione deve essere un file regolare privato, senza permessi per gruppo o altri (ad esempio `0600`). Il controllo riguarda il file effettivamente aperto; collegamenti interrotti e destinazioni non private o non regolari sono rifiutati. Il collegamento e il file non vengono modificati. Questa eccezione riguarda solo `.env`: i file nella directory dei segreti devono restare file regolari privati, non link. Il controllo dei permessi usa i bit Unix e non verifica ACL; proteggere anche le directory e usare un solo operatore alla volta.

Il comando applica le modifiche valide alla configurazione e alle credenziali esterne WhatsApp/OpenRouter direttamente da `.env`, compresi allowlist, canale home e collegamenti degli insegnanti, aggiornando i file privati intermedi senza interventi manuali. Arresta prima il gateway e poi il broker, aggiorna i file e ricrea entrambi; l'arresto del gateway usa `SIGKILL` per evitare avvisi di spegnimento sul vecchio canale home e interrompe i turni in corso. Reinstalla le dipendenze dal lockfile, applica le migrazioni e attende gli healthcheck. Non elimina volumi né monta `.env` o credenziali amministrative nell'agente.

Le tre password PostgreSQL non vengono ruotate automaticamente: devono coincidere con i file privati esistenti e, per un volume esistente, autenticare i rispettivi ruoli nel database prima del bootstrap. Anche `db-broker` e `bridge-token` vengono generati solo alla prima inizializzazione e conservati. Un file database o interno mancante con volume esistente arresta l'avvio: ripristinare privatamente le credenziali originali da backup, senza rigenerarle. Se una prima inizializzazione è stata interrotta prima della creazione dei ruoli, la verifica può fallire: diagnosticare e recuperare il database e i segreti privatamente con l'operatore, senza eliminare il volume automaticamente. La rotazione delle password è un'operazione distinta. Usare un solo operatore alla volta.

In caso di errore il comando non dichiara riuscita e, dopo l'inizio dell'aggiornamento, tenta di arrestare gateway e broker; i file esterni potrebbero essere stati aggiornati solo in parte. Correggere privatamente la causa e rilanciare il comando: applicherà nuovamente tutta la configurazione e ricreerà entrambi. Se Docker o l'arresto di sicurezza falliscono, lo stato dei servizi non è garantito: verificare e arrestare prima di riprovare, senza eliminare dati. Con un volume esistente ma senza container PostgreSQL, la verifica usa un container temporaneo senza porte sull'host; un arresto forzato o un guasto Docker può lasciarlo attivo. Identificarlo con `docker compose --env-file /dev/null ps --all`, quindi arrestare e rimuovere solo quel container prima di riprovare, senza rimuovere il volume. Gli errori non riportano output grezzo o valori sensibili.

```bash
docker compose --env-file /dev/null ps
docker compose --env-file /dev/null kill -s SIGKILL hermes
docker compose --env-file /dev/null stop author-broker
```

Questi comandi non caricano `.env`; usare lo stesso eventuale nome di progetto Compose impostato nell'ambiente per l'avvio. La salute locale non verifica Meta, OpenRouter o la raggiungibilità pubblica. Il port forwarding verso `jarvis` e il proxy HTTPS sono esterni al comando. Non pubblicare `/health`; la prova temporanea conclusa non autorizza di per sé l'uso continuativo dello sviluppo. La successiva decisione in REQ-NFR-002 accetta il rischio residuo per la sola produzione alle condizioni documentate. L'audit privacy del proxy resta aperto e **non** va avviato lo streaming remoto dei log del tunnel condiviso, nemmeno per diagnostica.

Sviluppo e produzione usano lo stesso `compose.yaml` e non condividono progetto, volumi, segreti o porte. Lo sviluppo gira da qualsiasi clone con `npm run start:local`; la produzione gira su `jarvis` nel progetto `agent-pilates-prod`, con configurazione e segreti propri e porte loopback diverse. `PILATES_VOLUME_PREFIX` imposta il prefisso di entrambi i volumi (`<prefisso>_postgres_data`, `<prefisso>_hermes_data`); se non è impostato vale il nome del progetto Compose. `start:local` rifiuta il progetto e i volumi di produzione, anche se eseguito su `jarvis` o con variabili ereditate dalla shell.

Le immagini `hermes`, `postgres`, `migrator` e `ops` sono pubblicate su GHCR come `ghcr.io/toto-castaldi/agent-pilates-studio/<nome>:<commit>` dal job `publish` della CI, solo dopo l'esito positivo delle verifiche su `main`; la pubblicazione non contatta `jarvis` e non avvia aggiornamenti. Installazione, aggiornamento e ritorno alla versione precedente su `jarvis` sono descritti in [`docs/operations/TEC-035-produzione.md`](docs/operations/TEC-035-produzione.md). Sviluppo e produzione hanno app Meta, numero e segreti separati e callback fissi: la configurazione di Meta e del tunnel e il port forward con cui un clone qualsiasi riceve i messaggi di sviluppo sono in [`docs/operations/TEC-036-whatsapp-ambienti.md`](docs/operations/TEC-036-whatsapp-ambienti.md). `SOUL.md`, configurazione Hermes e plugin stanno nell'immagine: in sviluppo le modifiche si applicano rilanciando `npm run start:local`. `npm run test:images` avvia lo stack dalle sole immagini, in una directory senza repository. Lo stack monta più file dalla stessa immagine: Docker 28.0.4 lo rifiuta con `mount already exists with name`, mentre la versione verificata, usata anche da `jarvis` e dalla CI, è la 29.9.2.

Per verificare il percorso con credenziali sintetiche e risorse Docker isolate: `npm run test:start`. Il test usa PostgreSQL reale, gateway e broker reali, webhook firmati e sostituti Meta e modello su rete interna; verifica aggiornamenti, mittenti aggiunti e rimossi, errori e recupero. Rimuove solo il proprio progetto e i propri volumi temporanei; non prova le integrazioni reali Meta/OpenRouter.

## Database locale — procedura manuale alternativa

Servono Docker e Docker Compose funzionanti. Dalla directory del progetto, dopo `npm ci`:

```bash
npm run db:init-secrets
docker compose up -d --wait postgres
docker compose run --rm db-bootstrap
npm run db:migrate
```

I primi due comandi Docker non richiedono privilegi di migrazione nell'agente: `db-bootstrap` è un contenitore temporaneo con credenziali separate. Il comando di migrazione usa il file della sola credenziale di migrazione sul computer dell'operatore. Non montare la directory completa dei segreti nel contenitore dell'agente.

Su un host Linux con Docker ma senza Node.js, dopo aver creato i file dei segreti e avviato PostgreSQL e `db-bootstrap`, la migrazione può essere eseguita con `sh scripts/migrate-docker.sh`. Il comando costruisce un'immagine da Node.js 24.14.0 fissato per digest e dal lockfile, installando le dipendenze **prima** di montare il solo segreto di migrazione. Usa la rete host per raggiungere PostgreSQL su loopback; non è destinato a Docker Desktop. Impostare esplicitamente `SECRETS_DIR` e `POSTGRES_PORT` nell'ambiente se diversi dai valori predefiniti: lo script non legge `.env`.

`db:init-secrets` crea password casuali, il token interno del broker e un verify token WhatsApp in `.local/secrets/`, ignorata da Git, senza sovrascrivere quelli già presenti. Proteggere e conservare questi file: cancellare o sostituire la password amministrativa non la cambia nel database già inizializzato. Il progetto Compose si chiama `agent-pilates-v010`; i suoi volumi conservano i dati. `docker compose down` arresta i servizi senza eliminarli: non usare `down --volumes` se i dati devono essere conservati.

PostgreSQL ascolta solo su `127.0.0.1:55432`; impostare `POSTGRES_PORT` se la porta è occupata. `SECRETS_DIR` può indicare una directory privata alternativa, usata coerentemente nei comandi. Prisma applica le migrazioni versionate; lo schema `app` contiene clienti, regole, slot e legami della pianificazione, presenze e assenze, e insegnanti con regole settimanali, intervalli inclusivi degli orari d'inizio e indicazioni per le singole lezioni. Le nuove tabelle degli insegnanti hanno autore autenticato e storico protetto: regole e intervalli si inseriscono insieme, le regole si disattivano e le indicazioni si annullano, senza cancellazione o riscrittura. Il database rifiuta sovrapposizioni delle regole attive, anche concorrenti, e più indicazioni valide per la stessa lezione. Tabelle, colonne e significati sono descritti in `hermes/SOUL.md`; la costruzione atomica delle regole e la difesa dalle sovrapposizioni sono motivate in [ADR-001](docs/adr/ADR-001-teacher-rule-integrity.md). Il collegamento privato tra mittente e insegnante e il contesto transazionale sono descritti in [ADR-002](docs/adr/ADR-002-sender-teacher-identity.md). L'archivio delle sessioni di Hermes è separato.

Per verificare migrazioni e privilegi su un PostgreSQL reale isolato, eseguire:

```bash
npm run test:db
```

Il test crea un progetto Compose e un volume temporanei dedicati, applica anche una migrazione di prova su uno schema esistente, verifica DML e rifiuto di DDL e infine rimuove soltanto le proprie risorse. Scarica anche l'immagine ufficiale Hermes fissata dal progetto e verifica il plugin SQL tramite il registro reale dei suoi tool. Non effettua chiamate a OpenRouter o Meta.

## Hermes e WhatsApp Cloud

Per completare l'avvio servono un account OpenRouter e un'app Meta con WhatsApp Business configurata. Dopo `npm run db:init-secrets`, completare nella stessa directory privata i file seguenti, ciascuno contenente solo il valore indicato, con permessi `0600`. Il verify token è già generato dal comando. Usare un editor locale: non inserire i valori nel repository, nella cronologia della shell o in chat.

| File in `.local/secrets/` | Contenuto |
| ------------------------- | --------- |
| `openrouter-key` | Chiave API OpenRouter. |
| `whatsapp-access-token` | Token di accesso dell'app Meta. |
| `whatsapp-app-secret` | App secret Meta per verificare le firme webhook. |
| `whatsapp-verify-token` | Token generato automaticamente per la verifica iniziale del webhook; va impostato anche su Meta. |
| `whatsapp-allowed-users` | Numeri autorizzati separati da virgole, con prefisso internazionale, solo cifre. |
| `whatsapp-home-channel` | Un numero esatto presente nell'allowlist; solo cifre. |
| `whatsapp-phone-number-id` | Phone Number ID dell'API Meta, non il numero telefonico. |
| `whatsapp-teacher-links` | Array JSON privato dei collegamenti, inizializzato a `[]`; formato come `WHATSAPP_TEACHER_LINKS` nell'esempio. |

Il canale home è fissato dall'operatore; `/sethome` inviato via WhatsApp non lo modifica. I job cron restano disabilitati. Con `start:local` modificare privatamente `.env` e rilanciare il comando, che aggiorna i file esterni e ricrea i servizi. Nell'avvio manuale aggiornare i file privati e ricreare broker e gateway; il broker valida nuovamente i collegamenti. Non stampare i valori né inserirli in chat. La verifica `npm run test:author` comprende la regressione con webhook firmati, gateway reale e sostituti sintetici di Meta e del modello.

Se si usa `SECRETS_DIR`, creare i file in quella directory. `db-broker` e `bridge-token` sono generati da `db:init-secrets`; conservarli privatamente insieme agli altri segreti. Non montare `db-admin`, `db-migrator` o `db-broker` in Hermes: Compose gli fornisce solo la credenziale database dell'agente e il token del canale interno. Il broker non riceve credenziali dell'agente, amministrative o di migrazione.

Dopo aver inizializzato il database e creato i file, avviare Hermes:

```bash
docker compose up -d --build --wait author-broker
docker compose up -d --build --no-deps --force-recreate --wait hermes
docker compose ps
```

### Contesto dello studio

`hermes/SOUL.md` è la fonte versionata del nome Ambrogio, delle istruzioni e delle fasce orarie dell'assistente. L'agente si presenta nella prima risposta e indica il proprio nome quando gli viene chiesto, senza firmare i messaggi successivi. Rivedere ogni modifica senza aggiungere dati reali o segreti; il file è montato in sola lettura su `/opt/data/SOUL.md` sia in locale sia nell'installazione descritta dalla procedura operativa. Dopo un aggiornamento usare il normale avvio con ricreazione del container, affinché il mount punti al file del nuovo commit. Non modificare una copia nel volume Hermes.

All'avvio il gateway richiede il refresh dei prompt delle sessioni: le sessioni già aperte ricostruiscono il prompt **al turno successivo**, conservando la cronologia; un turno già in corso non cambia. Se il refresh fallisce, il gateway non parte. Per una modifica in loco già visibile nel mount, senza ricreare il container, un operatore può richiedere esplicitamente il refresh con `docker compose exec --user 10000 hermes /opt/hermes/libexec/hermes-upstream sessions refresh-prompts`; non usare questa scorciatoia al posto di un aggiornamento versionato. La cronologia SQLite e i vecchi prompt possono contenere dati sensibili e restano nel volume e nei backup. Memoria e profilo integrati e provider di memoria esterni sono disabilitati; lo scanner anti-injection di Hermes non è una barriera di sicurezza.

Anche l'offerta iniziale di profilazione di Hermes è disabilitata in `hermes/config.yaml` con `onboarding.profile_build: "off"`: i soli flag della memoria non la disabilitano e serve la stringa quotata, non un booleano YAML. In sviluppo applicare la modifica con `npm run start:local`, che ricostruisce e ricrea il gateway: il solo riavvio della vecchia immagine non aggiorna il file versionato. Non cancellare cronologia o volumi per questa modifica.

L'identità del mittente arriva da WhatsApp, non da un censimento via CLI. Hermes fornisce già al modello il nome visualizzato, se presente, nel contesto nativo della sessione: Ambrogio può usarlo senza chiedere di completare un profilo. Se manca, continua senza nome e non lo inventa. Il nome è un'etichetta modificabile dall'utilizzatore, non una prova del ruolo nello studio o una fonte di privilegi; l'autore delle operazioni continua a essere impostato dal sistema dal webhook autenticato.

Per una richiesta riferita a «io», il broker ricava l'insegnante dalla ricevuta autenticata e dal collegamento privato; il modello usa la funzione SQL senza argomenti `app.current_sender_teacher_id()`. Se il collegamento manca o non corrisponde a un insegnante registrato, l'agente chiede il nome. La funzione restituisce l'identità protetta, ma distinguere «io» da una richiesta per un'altra persona resta un compito del modello. Hermes oscura nelle copie dirette al modello i numeri autorizzati noti, anche con comuni separatori, nei turni ordinari, nei riassunti, nei titoli e nelle domande laterali. La cronologia originale resta nel volume; il filtro non riconosce ogni possibile codifica o numero non più autorizzato e non sostituisce l'audit privacy. Per regole sovrapposte l'agente chiede conferma e conserva le parti non coinvolte; le chiamate SQL di una sostituzione possono essere distinte e un errore può lasciare operazioni parziali da segnalare.

L'ora corrente Europe/Rome viene aggiunta come metadato effimero a ogni richiesta del gateway al modello, anche nelle sessioni riprese; serve un orologio host sincronizzato. Il comportamento conversazionale si verifica con il modello reale tramite gli scenari descritti sopra; la prova di base non sostituisce quelli delle singole User Story. `npm run test:author` verifica in isolamento caricamento, refresh, riavvio, data e confini dell'ora legale con gateway e modello sintetico.

### Contesto per interlocutore e compattazione

Ogni numero autorizzato ha una propria sessione Hermes, separata da quella degli altri. Il contesto inviato al modello viene compattato automaticamente, senza alcun avviso agli utilizzatori:

- **a soglia**, quando la richiesta stimata raggiunge il 40% della finestra del modello configurato. All'avvio del container il gateway legge la finestra di `PILATES_MODEL` dal catalogo modelli di OpenRouter (lo stesso endpoint usato per il modello) e ne calcola il 40%. Cambiando modello, la soglia si aggiorna al successivo avvio o ricreazione del gateway. Se il catalogo non è raggiungibile o non contiene esattamente il modello configurato con una finestra valida, il gateway **non parte** (`hermes_preflight_failed`): non viene usata una soglia predefinita più alta;
- **alla ripresa**, quando un interlocutore scrive dopo un'inattività di almeno `PILATES_IDLE_COMPACT_SECONDS` secondi (predefinito 14400, cioè 4 ore) dall'ultimo messaggio salvato della sua conversazione. La compattazione avviene prima di elaborare il nuovo messaggio, anche dopo riavvio o ricreazione del gateway. Un valore non intero positivo è rifiutato da `start:local` con un messaggio fisso e dal gateway con `hermes_preflight_failed`.

I riassunti sono generati dallo stesso modello configurato. Hermes conserva il contesto dello studio (`SOUL.md`), l'ora corrente aggiunta a ogni richiesta, i primi messaggi e i turni più recenti; se non c'è altro da riassumere, la ripresa non compatta nulla. Se la generazione del riassunto fallisce, il turno prosegue con il contesto completo e l'utilizzatore riceve solo la risposta; Hermes attende alcuni minuti prima di ritentare la compattazione. La compattazione non modifica il database né l'attribuzione dell'autore. Riassunti e cronologia restano nel volume SQLite di Hermes, persistono tra riavvii e aggiornamenti e sono inclusi nel backup del volume; possono transitare verso OpenRouter come le conversazioni e non compaiono nei log.

Nella procedura manuale l'eventuale `PILATES_IDLE_COMPACT_SECONDS` va esportato nell'ambiente di `docker compose`, come `PILATES_MODEL`. `npm run test:compaction` verifica in isolamento, con gateway reale, webhook firmati e sostituti sintetici di Meta e del modello, la soglia, la ripresa anche dopo riavvio e ricreazione, l'errore silenzioso, l'isolamento tra due mittenti, l'autore, la persistenza, il backup, i log e la redazione dei numeri nei riassunti.

### Configurazione del gateway

Il modello predefinito è `openai/gpt-6.1-terra`; `PILATES_MODEL` lo rende configurabile. Le opzioni e le credenziali del comando unico sono descritte in `.env.example`; la procedura manuale continua a usare i file di segreto separati. Il webhook è esposto solo su `127.0.0.1:18090` (`WHATSAPP_WEBHOOK_PORT` per cambiare porta). Un reverse proxy HTTPS già predisposto deve inoltrare **solo** il percorso del webhook a quella porta senza alterare il corpo della richiesta. Il percorso predefinito è `/whatsapp/webhook`; impostare `WHATSAPP_WEBHOOK_PATH` per usare un percorso già configurato. Configurare su Meta l'URL pubblico corrispondente, lo stesso verify token e la sottoscrizione all'evento `messages`. Non esporre `/health`. Configurare anche il proxy affinché non registri token nei parametri URL, numeri o corpi dei messaggi.

Il plugin nativo `studio_sql_query` riceve una singola query SQL ed eventuali parametri `$1`, `$2`, ecc. Hermes si collega come `studio_agent`: PostgreSQL autorizza il DML previsto e rifiuta il DDL sugli schemi. Per ogni turno WhatsApp ammesso un broker separato verifica nuovamente la firma e l'allowlist, associa l'identità alla transazione e la rende disponibile ai trigger; gli autori proposti dal modello sono ignorati. Senza prova attendibile il tool rifiuta la richiesta. Il broker accetta messaggi firmati fino a 5 minuti di età, con 30 secondi di tolleranza futura; un messaggio ritardato o un turno interrotto dal riavvio può richiedere un nuovo messaggio. Il broker non espone porte sull'host; solo il tool SQL è abilitato al modello. Non si usa MCP. **Eccezione accettata:** PostgreSQL permette comunque al ruolo di modificare la propria password, con il rischio di interrompere l'accesso; non sono privilegi esclusivamente DML in senso assoluto. I dati delle sessioni di Hermes sono in un volume SQLite separato da PostgreSQL e devono essere protetti.

Se la password del ruolo agente è stata cambiata accidentalmente, l'operatore può ripristinare quella contenuta nel file `db-agent` conservato esternamente, rieseguendo `docker compose run --rm db-bootstrap`. Il comando riallinea anche i ruoli di migrazione e broker ai rispettivi file: conservare i file originali e non rendere disponibile all'agente quello di migrazione.

**Privacy e diagnostica:** Hermes e PostgreSQL possono registrare messaggi, numeri o dati SQL. I loro entrypoint sopprimono l'output dei processi e inviano al logging Docker `local` soltanto gli eventi fissi `hermes_launch`, `hermes_preflight_failed` e `postgres_launch`, con rotazione limitata. Consultarli con `docker compose logs --tail=20 hermes postgres` e verificare stato e salute con `docker compose ps`; un evento di avvio non prova che il servizio sia sano. Non sono disponibili dettagli diagnostici degli errori. I test usano dati sintetici e non dimostrano l'assenza di ogni possibile fuga; non aggirare le protezioni con comandi o profili alternativi senza rivalutare la privacy.

Per una prova locale isolata del gateway nativo, della configurazione del plugin, delle firme webhook, dell'allowlist e dell'assenza dei dati sintetici dai log:

```bash
npm run test:hermes
npm run test:author
```

I test usano solo credenziali e messaggi sintetici, una rete Docker senza accesso esterno e risorse temporanee dedicate. `test:author` usa il gateway reale, un modello locale deterministico e PostgreSQL reale per verificare autori, concorrenza, contraffazione e replay. Non sostituisce una prova reale con Meta e OpenRouter. La risposta WhatsApp libera è soggetta alla finestra di 24 ore prevista da Meta. Il canale home deve essere configurato privatamente e appartenere all'allowlist.

`npm run test:upgrade` verifica in un progetto Docker temporaneo e isolato un aggiornamento reale da PostgreSQL 17.9 a 17.10 e da Hermes 0.22.6 a 0.22.7, con credenziali e dati sintetici. Il test scarica immagini aggiuntive e non dimostra la compatibilità di altre versioni o degli aggiornamenti maggiori.

Per verificare una configurazione reale, dopo i controlli e con le mitigazioni e le autorizzazioni descritte in REQ-NFR-002 e nella procedura operativa, avviare il proxy HTTPS e inviare dal numero autorizzato un messaggio di prova; confermare la risposta sul dispositivo. Per verificare anche i privilegi si può chiedere al modello di eseguire `SELECT current_user` e di tentare `CREATE TEMP TABLE spike_permission_probe (id integer)`: il primo restituisce il ruolo agente e il secondo deve essere rifiutato. Non includere numeri, messaggi o credenziali nei rapporti.

Se il servizio non diventa sano o non risponde, verificare con `docker compose ps` che PostgreSQL e Hermes siano avviati, che tutti i file dei segreti richiesti esistano e abbiano permessi `0600`, che il percorso del proxy corrisponda a `WHATSAPP_WEBHOOK_PATH` e che le credenziali esterne siano valide. Non stampare i segreti per diagnostica. I dettagli dei log non sono disponibili con l'attuale mitigazione della privacy.

## Prerequisiti previsti per l'ambiente completo

- Python 3.10 o successivo, sola libreria standard, per il backlog (`.agents/tools/backlog.py`).

- Docker e Docker Compose per l'ambiente locale e il server Linux di produzione.
- Un endpoint HTTPS pubblico già disponibile per i webhook Meta.
- App Meta WhatsApp Business configurata e credenziali per i servizi esterni; non inserire credenziali nel repository.

La [procedura operativa](docs/operations/TEC-005-continuita.md) descrive installazione intenzionale, backup quiescente e ripristino isolato. Gli script `scripts/backup.sh` e `scripts/restore.sh` non avviano Hermes durante il recupero e non cifrano i backup: proteggerli su supporti cifrati. La prova pubblica temporanea è conclusa; l'audit completo dei log del proxy resta nel debito TEC-008. L'accettazione successiva del rischio per l'uso continuativo riguarda la sola produzione e non dimostra conformità, come indicato in REQ-NFR-002.
