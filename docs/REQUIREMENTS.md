# Requirements — agent-pilates-studio

**Target version:** v0.1.0

**State:** baseline

Questo documento definisce il comportamento richiesto; le scelte tecniche sono in `docs/TECHNICAL-DESIGN.md`.

## 1. Goal

Rendere riproducibili l'installazione, la prova locale e l'aggiornamento in produzione di un ambiente agentico Hermes, con database relazionale, modello tramite OpenRouter e comunicazione WhatsApp Business. Il successo della v0.1.0 è dimostrato dagli scenari di accettazione della release.

## 2. Actors

- **Operatore:** ruolo generico che configura, installa, aggiorna e gestisce l'ambiente; l'identità concreta è da definire.
- **Interlocutore autorizzato:** ruolo generico associato a un numero configurato, che comunica con l'agente tramite WhatsApp; l'identità concreta è da definire.
- **Agente:** Hermes, che elabora le richieste tramite il modello e accede ai dati con i privilegi assegnati.

## 3. Glossary

- **Hermes:** software agentico da installare e configurare.
- **DML:** operazioni di lettura e modifica dei dati, incluse selezione, inserimento, aggiornamento ed eliminazione.
- **DDL:** operazioni di definizione o modifica degli oggetti dello schema, inclusi creazione, alterazione ed eliminazione.
- **Migrazione:** modifica versionata e riproducibile dello schema, eseguita con credenziali diverse da quelle dell'agente.
- **Numero autorizzato:** numero presente nella configurazione di accesso a WhatsApp.

## 4. Scope

### In scope for v0.1.0

- Ambiente locale Hermes e PostgreSQL con accesso a OpenRouter e al database.
- Migrazioni versionate e permessi distinti per agente e gestione dello schema.
- Conversazione WhatsApp Business riservata ai numeri autorizzati.
- Installazione e aggiornamento intenzionale in produzione, persistenza, backup e ripristino, osservabilità essenziale.
- Verifiche automatiche con GitHub Actions.

### Out of scope for v0.1.0

Non introdurre queste capacità senza concordare e registrare un cambio di scope:

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

### Database e migrazioni

#### REQ-DB-001 — Migrazioni versionate

L'operatore deve poter inizializzare e aggiornare lo schema tramite migrazioni versionate; non sono richieste tabelle di dominio iniziali.

#### REQ-DB-002 — Privilegi dell'agente

L'agente deve poter eseguire operazioni DML sui dati, ma non DDL sugli oggetti dello schema; le credenziali per le migrazioni devono essere distinte e non disponibili all'agente. È accettata l'eccezione standard PostgreSQL per cui il ruolo di login può modificare la propria password: l'operatore deve poterla ripristinare senza esporre all'agente credenziali amministrative o di migrazione.

### Ambiente agente

#### REQ-AGENT-001 — Ambiente locale

L'operatore deve poter avviare localmente Hermes e il database con Docker Compose, usando versioni fissate e configurazione esterna.

#### REQ-AGENT-002 — Modello e dati

Hermes deve poter ottenere risposte tramite OpenRouter e accedere al database con i privilegi dell'agente definiti in REQ-DB-002. L'identificativo iniziale del modello proposto è `gpt-6.1-terra`, soggetto a verifica.

### Comunicazione WhatsApp Business

#### REQ-WA-001 — Conversazione

Un interlocutore autorizzato deve poter inviare un messaggio tramite WhatsApp Business e ricevere una risposta generata dall'agente attraverso OpenRouter, usando l'app Meta già configurata.

#### REQ-WA-002 — Accesso e webhook

Solo i numeri presenti nella configurazione di autorizzazione possono interagire con l'agente. Le richieste del webhook devono essere autenticate e quelle non valide rifiutate.

### Operatività

#### REQ-OPS-001 — Installazione e aggiornamento

L'operatore deve poter installare e aggiornare intenzionalmente l'ambiente di produzione su un server Linux predisposto, con versioni fissate e procedura riproducibile.

#### REQ-OPS-002 — Persistenza e recupero

I dati del database devono persistere tra riavvii e aggiornamenti; l'operatore deve poter eseguire e verificare un backup e un ripristino.

#### REQ-OPS-003 — Osservabilità essenziale

L'operatore deve poter verificare stato e disponibilità dei servizi e consultare i log nel rispetto di REQ-NFR-002.

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

## 7. Release acceptance — v0.1.0

- Da un ambiente pulito l'operatore avvia localmente Hermes e PostgreSQL, applica le migrazioni e verifica il quality gate.
- Su PostgreSQL reale l'agente può eseguire DML e non DDL; le credenziali di migrazione non sono disponibili all'agente.
- Con l'app Meta configurata, HTTPS pubblico e credenziali valide, un numero autorizzato invia un messaggio WhatsApp e riceve una risposta tramite Hermes e OpenRouter; numeri non autorizzati e webhook non autenticati sono respinti.
- Sul server di produzione predisposto l'operatore installa e aggiorna l'ambiente; i dati persistono dopo riavvio e aggiornamento. Un backup viene ripristinato e verificato con dati di prova.
- Stato, disponibilità e log dei servizi sono consultabili nel rispetto della sicurezza; la procedura documenta il divieto operativo di streaming dei log del tunnel condiviso; GitHub Actions esegue le verifiche previste senza deploy automatico.

Le prove reali dipendono da accesso ai servizi esterni, rete, configurazione e credenziali Meta e OpenRouter. SPIKE-001 ha verificato il modello effettivo e le integrazioni in una prova reale; eventuali cambi di scope richiedono accordo. La chiusura di TEC-005 e il rinvio dell'audit a TEC-008 non dimostrano l'accettazione privacy della release né autorizzano l'uso continuativo.

## 8. Withdrawn requirements

None.
