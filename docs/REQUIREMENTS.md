# Requirements — agent-pilates-studio

**Target version:** v0.2.0

**State:** baseline

Questo documento definisce il comportamento richiesto; le scelte tecniche sono in `docs/TECHNICAL-DESIGN.md`.

## 1. Goal

Rendere riproducibili l'installazione, la prova locale e l'aggiornamento in produzione di un ambiente agentico Hermes, con database relazionale, modello tramite OpenRouter e comunicazione WhatsApp Business. Il successo della v0.1.0 è dimostrato dagli scenari di accettazione della release.

Con la v0.2.0 l'agente diventa l'assistente dello studio Pilates: il titolare e i collaboratori registrano, consultano e aggiornano via WhatsApp le abitudini settimanali di allenamento dei clienti, salvate come regole in linguaggio naturale con autore e storico.

## 2. Actors

- **Operatore:** ruolo generico che configura, installa, aggiorna e gestisce l'ambiente; l'identità concreta è da definire.
- **Interlocutore autorizzato (utilizzatore):** il titolare dello studio o un suo collaboratore, associato a un numero configurato, che comunica con l'agente tramite WhatsApp. Nella v0.2.0 chiunque possa conversare con l'agente è un utilizzatore e tutti hanno gli stessi permessi; non esiste un'anagrafica degli utilizzatori. I clienti dello studio non usano l'agente.
- **Cliente:** persona che si allena nello studio; non interagisce con l'agente.
- **Agente:** Hermes, che elabora le richieste tramite il modello e accede ai dati con i privilegi assegnati.

## 3. Glossary

- **Hermes:** software agentico da installare e configurare.
- **DML:** operazioni di lettura e modifica dei dati, incluse selezione, inserimento, aggiornamento ed eliminazione.
- **DDL:** operazioni di definizione o modifica degli oggetti dello schema, inclusi creazione, alterazione ed eliminazione.
- **Migrazione:** modifica versionata e riproducibile dello schema, eseguita con credenziali diverse da quelle dell'agente.
- **Numero autorizzato:** numero presente nella configurazione di accesso a WhatsApp.
- **Lezione:** lezione di Pilates di un'ora, individuale o di gruppo, tenuta in qualsiasi giorno della settimana.
- **Regola di allenamento:** abitudine settimanale ricorrente di uno o più clienti, ad esempio "Antonio Rossi si allena tutti i venerdì alle 9", espressa in un testo in linguaggio naturale pulito e comprensibile, con i giorni, gli orari e i clienti derivati dal testo.
- **Regola attiva:** regola non disattivata; solo le regole attive determinano la pianificazione.
- **Fascia oraria:** parte della giornata (mattina, pomeriggio, sera) con limiti fissi definiti nel file `SOUL.md` dell'agente.

## 4. Scope

### In scope for v0.2.0

- Registrazione conversazionale delle regole di allenamento, con anagrafica minima dei clienti, autore e data di inserimento.
- Consultazione della pianificazione settimanale per giorno, fascia oraria, orario e cliente.
- Aggiornamento delle regole tramite disattivazione, senza cancellazione, con storico consultabile.
- Contesto dell'agente versionato e verifiche del comportamento conversazionale.
- Template Pi condiviso per lavorare autonomamente su un'attività già avviata (REQ-NFR-010).
- Stato di attesa dell'utente segnalato al terminale dai tool Pi di domanda (REQ-NFR-011).
- Dettato vocale Pi su server remoto tramite il microfono del client inoltrato via SSH (REQ-NFR-012).
- Tracciabilità del template di origine e procedura per valutarne futuri aggiornamenti (REQ-NFR-013).
- Adozione del processo e degli strumenti condivisi del template v1.4.0, con modulo architetturale e consultazione Pi del backlog (REQ-NFR-014), aggiornati alla v1.5.0 con filtri, stati dai branch e shared claims attivi (REQ-NFR-015).
- Gate di chiusura dello sviluppo basati su soli test di unità in memoria (REQ-NFR-008).
- Canale home fissato in configurazione e nessun avviso di sistema di Hermes inviato agli utilizzatori (REQ-WA-003).
- Contesto del modello separato per interlocutore e compattato automaticamente a soglia e dopo inattività (REQ-AGENT-004).
- Nome dell'agente definito in `SOUL.md`, usato quando si presenta e quando gli viene chiesto (REQ-AGENT-005).
- Le capacità della v0.1.0 restano disponibili e i loro requisiti restano vincolanti.

### Out of scope for v0.2.0

Non introdurre queste capacità senza concordare e registrare un cambio di scope:

- Eccezioni puntuali (assenze, recuperi, chiusure), capienza delle lezioni, istruttori, sale e attrezzature.
- Anagrafica, ruoli e permessi differenziati degli utilizzatori; uso dell'agente da parte dei clienti.
- Dati dei clienti oltre a nome, cognome e regole di allenamento.
- Job cron e messaggi pianificati dell'agente (previsti in un item non assegnato, TEC-019).
- Modifica del nome visualizzato del profilo WhatsApp Business su Meta, che resta gestito manualmente dall'operatore.
- Messa in esercizio continuativa del gateway pubblico.
- Creazione del server, installazione dei suoi prerequisiti Docker/Compose, gestione di DNS o certificati HTTPS.
- Deploy automatico e piattaforme di monitoraggio avanzato.

### In scope for v0.1.0 (closed)

- Ambiente locale Hermes e PostgreSQL con accesso a OpenRouter e al database.
- Migrazioni versionate e permessi distinti per agente e gestione dello schema.
- Conversazione WhatsApp Business riservata ai numeri autorizzati.
- Installazione e aggiornamento intenzionale in produzione, persistenza, backup e ripristino, osservabilità essenziale.
- Verifiche automatiche con GitHub Actions.

### Out of scope for v0.1.0 (closed)

- Funzionalità specifiche dello studio Pilates e tabelle di dominio non richieste.
- Creazione del server, installazione dei suoi prerequisiti Docker/Compose, gestione di DNS o certificati HTTPS.
- Deploy automatico e piattaforme di monitoraggio avanzato.

## 5. Functional requirements

| Area | Meaning |
| ---- | ------- |
| DB | Database e migrazioni |
| AGENT | Ambiente agente e modello |
| WA | Comunicazione WhatsApp Business |
| OPS | Operatività e continuità |
| STUDIO | Pianificazione delle lezioni dello studio |

### Database e migrazioni

#### REQ-DB-001 — Migrazioni versionate

L'operatore deve poter inizializzare e aggiornare lo schema tramite migrazioni versionate. Le tabelle di dominio sono introdotte solo per i requisiti STUDIO.

#### REQ-DB-002 — Privilegi dell'agente

L'agente deve poter eseguire operazioni DML sui dati, ma non DDL sugli oggetti dello schema; le credenziali per le migrazioni devono essere distinte e non disponibili all'agente. È accettata l'eccezione standard PostgreSQL per cui il ruolo di login può modificare la propria password: l'operatore deve poterla ripristinare senza esporre all'agente credenziali amministrative o di migrazione.

### Ambiente agente

#### REQ-AGENT-001 — Ambiente locale

L'operatore deve poter avviare localmente Hermes e il database con Docker Compose, usando versioni fissate e configurazione esterna.

#### REQ-AGENT-002 — Modello e dati

Hermes deve poter ottenere risposte tramite OpenRouter e accedere al database con i privilegi dell'agente definiti in REQ-DB-002. L'identificativo iniziale proposto è `gpt-6.1-terra`; SPIKE-001 ha verificato nella prova documentata l'ID OpenRouter completo `openai/gpt-6.1-terra`. Il modello resta configurabile.

#### REQ-AGENT-003 — Avvio locale con un comando

Da un repository appena clonato o con volumi Docker rimossi, l'operatore, dopo aver copiato `.env.example` in `.env` e compilato localmente configurazione e credenziali, deve poter avviare con un solo comando lo stack locale utilizzabile. Il comando deve provvedere alle inizializzazioni necessarie, incluse le migrazioni del database, e indicare l'esito senza esporre dati sensibili. Docker, Compose, runtime e servizi esterni necessari restano prerequisiti; il port forwarding verso `jarvis` per la callback pubblica resta esterno al comando. La raggiungibilità pubblica e la conversazione reale dipendono dalla configurazione esterna e non sono implicite nell'avvio locale.

La configurazione locale contenente credenziali deve restare privata e fuori dal repository; l'esempio non contiene valori reali. `.env` può essere un collegamento simbolico a un file regolare privato: l'avvio deve verificare il file effettivamente letto e rifiutare destinazioni mancanti, non regolari o non private senza esporre i dati. L'avvio deve preservare dati e credenziali esistenti e mantenere le separazioni e le protezioni richieste da REQ-DB-002, REQ-WA-002 e REQ-NFR-002. La sola prova pubblica temporanea precedente non autorizza l'uso continuativo.

#### REQ-AGENT-004 — Contesto per interlocutore e compattazione

Ogni interlocutore autorizzato ha un proprio contesto di conversazione con il modello, separato da quello degli altri. Quando il contesto inviato al modello raggiunge il 40% della finestra di contesto del modello configurato, l'agente lo compatta automaticamente, riassumendo la parte meno recente e conservando il contesto dello studio e i turni recenti necessari a proseguire. Il 40% è la soglia di attivazione, non un tetto rigido: sono ammessi superamenti temporanei fino alla compattazione. La soglia segue il modello configurato e non è fissata per un modello specifico.

Quando una conversazione riprende dopo un periodo di inattività configurabile dall'operatore, con valore predefinito di 4 ore, il contesto viene compattato prima di elaborare il nuovo messaggio. La compattazione è silenziosa: gli utilizzatori non ricevono avvisi di sistema sul suo avvio, sul completamento o sugli errori (REQ-WA-003). La compattazione non modifica i dati del database né l'attribuzione dell'autore (REQ-STUDIO-003). Riassunti e cronologia persistono come le sessioni di Hermes, non compaiono nei log e possono transitare verso OpenRouter come le conversazioni (REQ-NFR-002, REQ-NFR-005, REQ-OPS-002).

#### REQ-AGENT-005 — Nome dell'agente

L'agente ha un nome proprio, unico e stabile, definito nel file `SOUL.md` versionato come unica fonte, senza duplicazioni nel codice. Il nome viene concordato con l'utente all'avvio dell'item che lo introduce e registrato in questo requisito. Quando un interlocutore chiede il suo nome o chi è, l'agente risponde con il proprio nome, senza dire di non averne uno né invitare a sceglierne uno. Nella prima risposta di una conversazione senza turni precedenti, l'agente si presenta brevemente con il nome e risponde comunque alla richiesta; nei messaggi successivi non si ripresenta e non firma i messaggi. Il nome è lo stesso per tutti gli interlocutori e non modifica ruolo, regole di comportamento, privilegi o attribuzione dell'autore (REQ-STUDIO-003). Il nome visualizzato del profilo WhatsApp Business su Meta è fuori scope.

### Comunicazione WhatsApp Business

#### REQ-WA-001 — Conversazione

Un interlocutore autorizzato deve poter inviare un messaggio tramite WhatsApp Business e ricevere una risposta generata dall'agente attraverso OpenRouter, usando l'app Meta già configurata.

#### REQ-WA-002 — Accesso e webhook

Solo i numeri presenti nella configurazione di autorizzazione possono interagire con l'agente. Le richieste del webhook devono essere autenticate e quelle non valide rifiutate.

#### REQ-WA-003 — Canale home configurato e nessun avviso di sistema

Gli utilizzatori ricevono via WhatsApp solo le risposte dell'agente e, quando previsti, i messaggi inviati sul canale home. Avvisi e suggerimenti interni di Hermes non pertinenti allo studio, come la richiesta di impostare un canale home con `/sethome`, non devono essere inviati. Il canale home, destinazione dei risultati dei job cron e dei messaggi da altre piattaforme, è un numero dell'elenco autorizzato fissato dall'operatore nella configurazione esterna; gli utilizzatori non possono impostarlo o cambiarlo tramite la conversazione. Un valore mancante o non autorizzato è segnalato all'avvio senza esporre il numero.

### Operatività

#### REQ-OPS-001 — Installazione e aggiornamento

L'operatore deve poter installare e aggiornare intenzionalmente l'ambiente di produzione su un server Linux predisposto, con versioni fissate e procedura riproducibile.

#### REQ-OPS-002 — Persistenza e recupero

I dati del database devono persistere tra riavvii e aggiornamenti; l'operatore deve poter eseguire e verificare un backup e un ripristino.

#### REQ-OPS-003 — Osservabilità essenziale

L'operatore deve poter verificare stato e disponibilità dei servizi e consultare i log nel rispetto di REQ-NFR-002.

### Pianificazione delle lezioni

#### REQ-STUDIO-001 — Registrazione delle regole di allenamento

Un utilizzatore deve poter descrivere conversando via WhatsApp l'abitudine settimanale di uno o più clienti; l'agente la registra come regola in una tabella dedicata. La regola contiene un testo in linguaggio naturale pulito e comprensibile, la data di inserimento, l'autore (REQ-STUDIO-003) e i dati strutturati derivati automaticamente dal modello: giorni della settimana, orari e clienti coinvolti. L'agente decide come strutturare la richiesta in una o più regole; una regola può riguardare più giorni e orari e più clienti che si allenano insieme. L'agente chiede conferma solo in caso di ambiguità; altrimenti registra e riepiloga quanto salvato.

#### REQ-STUDIO-002 — Anagrafica dei clienti

I clienti sono identificati da nome e cognome, univoci nello studio, senza ulteriori dati. L'agente crea un cliente quando una regola ne cita uno non ancora registrato, chiedendo il cognome se manca. Se l'utilizzatore indica solo il nome e esiste un solo cliente con quel nome, l'agente lo usa; se ne esistono più di uno chiede il cognome.

#### REQ-STUDIO-003 — Autore delle modifiche

L'autore di ogni inserimento e disattivazione è l'utilizzatore che ha inviato il messaggio, registrato con il numero WhatsApp del mittente e, se disponibile, il nome del profilo WhatsApp. L'identità è ricavata dal sistema a partire dal messaggio autenticato e non deve poter essere dichiarata o alterata dal modello o dal testo della conversazione.

#### REQ-STUDIO-004 — Consultazione della pianificazione

Un utilizzatore deve poter chiedere conversando chi si allena in un giorno, una fascia oraria o un orario (ad esempio "venerdì mattina mi dici nelle lezioni chi si allena?"), quando si allena un cliente e il riepilogo della settimana. Le risposte si basano sulle sole regole attive e sui dati strutturati, raggruppate per giorno e orario; l'assenza di risultati è indicata esplicitamente. Le fasce orarie hanno limiti fissi definiti nel file `SOUL.md` versionato nel progetto e usato da Hermes; le regole di comportamento dell'agente stanno in quel file e non sono duplicate nel codice. Su richiesta l'agente indica autore e data di inserimento o disattivazione di una regola.

#### REQ-STUDIO-005 — Aggiornamento e storico delle regole

Le regole non vengono mai cancellate né riscritte. Quando, da una richiesta esplicita (ad esempio "Cristina ha smesso") o implicita (ad esempio una nuova abitudine che sostituisce la precedente), l'agente valuta che una regola non sia più valida, la disattiva autonomamente registrando data, autore (REQ-STUDIO-003) e motivo, e lo comunica all'utilizzatore. Un cambiamento si esprime disattivando la regola precedente e registrandone una nuova. Lo storico delle regole, incluse quelle disattivate, resta consultabile. Il divieto di cancellazione è imposto anche dal database per la tabella delle regole.

## 6. Non-functional requirements

#### REQ-NFR-001 — Quality gate riproducibile

Il progetto deve offrire installazione delle dipendenze da lockfile e comandi per lint, controllo dei tipi, test e build; l'esecuzione da ambiente pulito deve essere verificabile.

#### REQ-NFR-002 — Segreti e dati nei log

Credenziali e segreti non devono essere inclusi nel repository; i log non devono contenere credenziali, messaggi o numeri di telefono. La configurazione di esempio non deve contenere segreti reali.

Per la sola prova pubblica controllata di TEC-005, l'operatore ha autorizzato temporaneamente il rischio residuo dovuto all'audit incompleto dei log Cloudflare e di alcuni formati locali del proxy. Restano obbligatori il filtro locale verificato, la soppressione dell'output sensibile dei servizi, l'assenza di esportazioni Cloudflare e il divieto di streaming di REQ-NFR-004. Non registrare intenzionalmente dati sensibili; in caso di esposizione rilevata, interrompere la prova e coordinare la rotazione dei segreti coinvolti. L'autorizzazione non dimostra la conformità completa né autorizza un uso continuativo senza una decisione separata; l'approfondimento va tracciato come debito tecnico.

#### REQ-NFR-003 — Integrazione continua

GitHub Actions deve eseguire il quality gate, compresi i test di integrazione su PostgreSQL reale, senza deploy automatico. Le prove che richiedono servizi esterni e credenziali reali devono essere documentate separatamente.

#### REQ-NFR-004 — Divieto operativo di streaming dei log del tunnel

Gli operatori non devono avviare lo streaming remoto dei log del tunnel Cloudflare condiviso, né dal dashboard Live logs né tramite `cloudflared tail` o strumenti equivalenti. Il divieto è una regola operativa, non un blocco tecnico; non sostituisce i requisiti di protezione degli altri log e dei dati previsti da REQ-NFR-002.

#### REQ-NFR-005 — Dati personali dello studio nella v0.2.0

I dati di dominio sono limitati a nome e cognome dei clienti, alle loro regole di allenamento e agli autori delle modifiche (numero WhatsApp e nome del profilo). Questi dati possono stare nel database e transitare verso OpenRouter e WhatsApp per le conversazioni, ma non devono comparire nei log (REQ-NFR-002). Test automatici, CI ed esempi usano solo dati sintetici.

**Decisione dell'utente (2026-11-05):** per la v0.2.0 l'uso di nomi e cognomi reali nelle prove è accettato rinviando l'audit privacy a TEC-008. La decisione non dichiara la conformità a REQ-NFR-002, non autorizza l'uso continuativo del gateway, che è fuori scope per la v0.2.0, e non modifica REQ-NFR-004.

#### REQ-NFR-006 — Verifica del comportamento conversazionale

Il comportamento dell'agente nei casi d'uso STUDIO deve essere verificato con scenari conversazionali documentati con dati sintetici, che indicano richiesta, risposta attesa e stato atteso del database, e con un harness automatico eseguibile su richiesta con il modello reale tramite OpenRouter. L'harness non fa parte della CI né del quality gate e richiede credenziali esterne; vincoli e privilegi del database restano verificati da test automatici su PostgreSQL reale.

#### REQ-NFR-007 — Configurazione Pi e verifiche coerenti

La documentazione e i test dello sviluppo devono descrivere e verificare la configurazione Pi effettivamente voluta dall'operatore, senza ripristinare il launcher `scripts/pi.sh` o il template `/avvio` che l'operatore ha intenzionalmente rimosso. Le impostazioni esistenti e i dati personali non vengono modificati senza accordo; sessioni, autenticazione, log e segreti restano esclusi da Git. Le prove automatiche usano dati sintetici e il quality gate resta obbligatorio (REQ-NFR-001 e REQ-NFR-002).

#### REQ-NFR-008 — Gate di chiusura con soli test di unità in memoria

I gate di chiusura dello sviluppo (completamento di un item, merge e push su `main`) devono eseguire soltanto test di unità in memoria, veloci e privi di processi, file system, git, rete o Docker, oltre a lint, controllo dei tipi e build. I test di integrazione ed end-to-end restano disponibili come comandi separati: si eseguono durante il lavoro sull'item quando servono come prova dei criteri di accettazione o delle verifiche richieste da `AGENTS.md`, nella chiusura di una versione e nella CI GitHub, che continua a eseguire tutte le suite (REQ-NFR-003). La regola è documentata, senza controlli automatici dedicati.

#### REQ-NFR-009 — Template Pi condiviso per lo stato del progetto

Il repository deve includere il template Pi `/start`, utilizzabile per ottenere un riepilogo dello stato del progetto e delle prossime attività a partire dai documenti canonici. Il template deve richiedere un controllo del branch e del working tree in sola lettura e non deve avviare modifiche, test, commit, merge o push senza una successiva richiesta esplicita. Il suo contenuto deve essere privo di segreti e dati personali; gli altri dati locali Pi restano esclusi da Git secondo REQ-NFR-002 e REQ-NFR-007. Questo requisito non ripristina il template `/avvio` rimosso.

#### REQ-NFR-010 — Template Pi per lavorare in autonomia

Il repository deve includere il template Pi `/work-alone`, che istruisce l'assistente a implementare autonomamente l'attività già avviata e a fermarsi solo quando ha bisogno dell'intervento dell'utente. L'attività è identificata dal branch e dai documenti canonici; se non è identificabile univocamente o non è avviata, l'assistente chiede chiarimenti anziché sceglierne o avviarne un'altra.

Il template richiede di seguire il processo, i criteri di accettazione, le verifiche e la Definition of Done del progetto, chiedendo intervento per blocchi, decisioni necessarie o autorizzazioni richieste. Con l'adozione di REQ-NFR-015 (TEC-024), sono consentiti i soli push del branch dell'item previsti dagli shared claims attivi ai cambi di stato; merge, push su `main` e altri push restano soggetti a richiesta esplicita. Fino all'adozione resta valido il divieto di push senza richiesta esplicita. Il template è un'istruzione al modello, non una garanzia tecnica; deve essere privo di segreti e dati personali, nel rispetto di REQ-NFR-002 e REQ-NFR-007.

#### REQ-NFR-011 — Stato di attesa dei tool Pi di domanda

Quando l'assistente Pi del progetto pone domande all'utente con i tool `question` o `questionnaire` e attende la risposta, deve segnalarlo al terminale come attesa dell'utente (`blocked`, tipo `question`, del Program Status Protocol OSC 7501 supportato da Pi), non come lavoro in corso. Alla risposta o all'annullamento lo stato torna a quello dell'esecuzione in corso. I tool mantengono nomi, parametri e comportamento attuali; sono forniti dal pacchetto Pi condiviso `agent-harness-stuff`, referenziato con un riferimento fissato, nel rispetto della licenza del codice d'origine. Il pacchetto e la configurazione restano privi di segreti e dati personali (REQ-NFR-002, REQ-NFR-007).

#### REQ-NFR-012 — Dettato vocale Pi su server remoto

Quando l'operatore usa Pi su un server remoto senza dispositivi audio, collegato via SSH da un client Linux con PipeWire o PulseAudio, il dettato del pacchetto Pi Voice deve poter acquisire il microfono del client. L'audio passa dal socket Pulse del client inoltrato via SSH come socket Unix, senza aprire porte TCP e senza modificare la configurazione di Pi Voice. Il repository documenta la procedura per server e client, con verifica e limiti, e fornisce uno script di diagnosi in sola lettura che indica i passi mancanti. Documentazione, script e output non contengono segreti, dati personali o audio, e i dati personali di Pi restano esclusi da Git (REQ-NFR-002, REQ-NFR-007). L'installazione dei pacchetti di sistema e la configurazione di `sshd` richiedono privilegi amministrativi e restano a cura dell'operatore.

#### REQ-NFR-013 — Tracciabilità del template di origine

Il repository deve rendere riconoscibile il template da cui è nato e conservare riferimenti verificabili alle versioni o ai commit pertinenti, distinguendo ciò che è stato adottato da ciò che è stato solo confrontato e dichiarando eventuali basi storiche sconosciute. L'operatore deve poter valutare futuri aggiornamenti tramite una procedura riproducibile che distingua le risorse condivise dalle personalizzazioni del progetto, senza sovrascritture o merge automatici. L'effettiva adozione degli aggiornamenti richiede una decisione separata e il rispetto del processo e dei vincoli di sicurezza del progetto (REQ-NFR-002).

#### REQ-NFR-014 — Aggiornamento dal template e consultazione del backlog

Il progetto deve adottare il processo, le skill e il visualizzatore Pi del backlog del template `agile-project-template` v1.4.0, preservando le personalizzazioni, i requisiti e le protezioni propri dello studio. Eventuali conflitti o deroghe devono essere concordati e documentati, non risolti con sovrascritture indiscriminate. La provenienza e le risorse effettivamente adottate devono essere registrate secondo REQ-NFR-013.

Il progetto deve definire un solo modulo architetturale, `MOD-001 — Agente`, per la soluzione dell'assistente dello studio nel repository corrente. Gli item aperti pertinenti possono riferirsi al modulo; il lavoro trasversale e lo storico completato non richiedono una classificazione retroattiva.

In Pi l'operatore deve poter consultare gli item di `BACKLOG.md` senza modificarli, navigando tra gli item e scorrendone il contenuto; il visualizzatore si apre con `/backlog` e dispone di una scorciatoia configurabile o disattivabile. Gli strumenti rispettano REQ-NFR-002, REQ-NFR-007 e il gate di REQ-NFR-008; le prove non leggono né modificano impostazioni personali.

#### REQ-NFR-015 — Template v1.5.0 e coordinamento del lavoro parallelo

Il progetto deve aggiornare processo, skill e visualizzatore Pi del backlog al template `agile-project-template` v1.5.0, preservando le personalizzazioni e le protezioni dello studio e registrando risorse adottate e divergenze secondo REQ-NFR-013. Il visualizzatore deve permettere di filtrare gli item per tipo, priorità e stato e mostrare anche gli stati risultanti dai branch degli item; le personalizzazioni del visualizzatore previste da REQ-NFR-014 restano disponibili. La consultazione non modifica i file di lavoro; l'aggiornamento dei riferimenti Git tramite fetch in background e i suoi limiti devono essere documentati.

Gli shared claims della v1.5.0 devono essere attivati per il coordinamento tra copie del progetto: prima di avviare un item si controllano i branch esistenti e, ai cambi di stato, si pubblica il branch dell'item secondo il processo adottato. Un errore di fetch o push e l'assenza di `origin` sono gestiti e segnalati secondo tale processo. Non è autorizzato il push automatico di `main`, né il merge automatico. La compatibilità con `/work-alone` segue REQ-NFR-010; gli altri vincoli di sicurezza e del gate rimangono invariati (REQ-NFR-002, REQ-NFR-007, REQ-NFR-008).

## 7. Release acceptance — v0.2.0

- Un utilizzatore registra via WhatsApp regole individuali, di gruppo e con più giorni; il database contiene il testo pulito, i dati strutturati, la data e l'autore ricavato dal sistema, e crea o riconosce i clienti per nome e cognome.
- Un utilizzatore chiede chi si allena in un giorno, una fascia o un orario e quando si allena un cliente, e riceve risposte coerenti con le regole attive.
- Un utilizzatore comunica cambiamenti espliciti o impliciti; l'agente disattiva le regole superate con motivo, data e autore, lo comunica e mantiene lo storico; il database rifiuta la cancellazione delle regole.
- Gli scenari conversazionali documentati sono eseguiti con il modello reale e i risultati registrati; il quality gate e i test su PostgreSQL reale passano in CI.
- Processo e strumenti del template v1.5.0 sono adottati e verificati con le personalizzazioni dello studio; il backlog è consultabile in Pi con filtri e stati dai branch, gli shared claims sono attivi e il modulo concordato è documentato.
- Il contesto di ciascun utilizzatore è separato e viene compattato automaticamente al 40% della finestra del modello configurato e alla ripresa dopo l'inattività configurata, senza avvisi agli utilizzatori.
- L'agente risponde con il proprio nome quando gli viene chiesto e si presenta con il nome nella prima risposta di una conversazione nuova, senza ripresentarsi nei messaggi successivi.
- I log non contengono nomi, messaggi, numeri o credenziali; l'uso continuativo resta escluso.

Le prove reali dipendono da accesso ai servizi esterni e credenziali Meta e OpenRouter.

### Previous version — v0.1.0

- Da un ambiente pulito l'operatore avvia localmente Hermes e PostgreSQL, applica le migrazioni e verifica il quality gate.
- Su PostgreSQL reale l'agente può eseguire DML e non DDL; le credenziali di migrazione non sono disponibili all'agente.
- Con l'app Meta configurata, HTTPS pubblico e credenziali valide, un numero autorizzato invia un messaggio WhatsApp e riceve una risposta tramite Hermes e OpenRouter; numeri non autorizzati e webhook non autenticati sono respinti.
- Sul server di produzione predisposto l'operatore installa e aggiorna l'ambiente; i dati persistono dopo riavvio e aggiornamento. Un backup viene ripristinato e verificato con dati di prova.
- Stato, disponibilità e log dei servizi sono consultabili nel rispetto della sicurezza; la procedura documenta il divieto operativo di streaming dei log del tunnel condiviso; GitHub Actions esegue le verifiche previste senza deploy automatico.

Le prove reali dipendono da accesso ai servizi esterni, rete, configurazione e credenziali Meta e OpenRouter. SPIKE-001 ha verificato il modello effettivo e le integrazioni in una prova reale; eventuali cambi di scope richiedono accordo. La chiusura di TEC-005 e il rinvio dell'audit a TEC-008 non dimostrano l'accettazione privacy della release né autorizzano l'uso continuativo.

**Decisione dell'utente (2026-11-05):** la v0.1.0 viene chiusa senza l'accettazione privacy dei log del proxy, che è rinviata a TEC-008, non assegnato a una versione. La chiusura non dichiara la conformità a REQ-NFR-002 né autorizza l'uso continuativo del gateway; REQ-NFR-002 e REQ-NFR-004 restano vincolanti.

## 8. Withdrawn requirements

None.
