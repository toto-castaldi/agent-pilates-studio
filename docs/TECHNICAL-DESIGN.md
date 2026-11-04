# Technical design — agent-pilates-studio

**Target version:** v0.1.0

Questo documento registra le scelte iniziali e le decisioni aperte. Il comportamento richiesto è in `docs/REQUIREMENTS.md`; le sezioni non ancora definite non implicano che le integrazioni siano state verificate.

## 1. Initial architectural decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Runtime locale e produzione | Docker Compose; server Linux già predisposto in produzione | Avvio e gestione coerenti nei due ambienti. |
| Codice del progetto | TypeScript, Node.js LTS e npm | Stack concordato; la versione precisa e lo scaffold saranno definiti da TEC-002. Hermes mantiene i propri prerequisiti. |
| Dati | PostgreSQL e migrazioni Prisma | Database relazionale e schema gestito tramite codice e migrazioni versionate. |
| Agente e modello | Hermes con OpenRouter; modello configurabile | Separare l'ambiente agentico dal provider; il modello proposto `gpt-6.1-terra` e la compatibilità richiedono verifica. |
| Canale | API WhatsApp Business tramite app Meta esistente | Usare la configurazione Meta già disponibile; modalità di collegamento da verificare. |
| Rilascio | Versioni fissate, aggiornamento avviato esplicitamente | Riproducibilità e controllo operativo, senza deploy automatico. |
| CI | GitHub Actions | Verificare il quality gate senza eseguire automaticamente il deploy. |

## 2. Context and main flows

L'operatore configura e avvia l'ambiente locale o di produzione, applica le migrazioni con credenziali dedicate e gestisce aggiornamenti e recupero. L'interlocutore autorizzato invia messaggi tramite WhatsApp Business; il componente di integrazione verifica il webhook e l'autorizzazione, inoltra la richiesta a Hermes e restituisce la risposta. Hermes usa OpenRouter e può accedere a PostgreSQL con il solo ruolo agente.

Il flusso è un obiettivo architetturale, non una dichiarazione di supporto delle integrazioni: SPIKE-001 deve verificarne la fattibilità e proporre eventuali alternative da concordare.

## 3. Modules

- **Runtime e configurazione:** servizi Compose, versioni fissate e configurazione esterna; TEC-002 e TEC-004.
- **Dati e migrazioni:** PostgreSQL, ruoli e migrazioni Prisma; TEC-003.
- **Agente e modello:** installazione Hermes, configurazione OpenRouter e accesso ai dati con ruolo limitato; TEC-004 dopo SPIKE-001.
- **Canale WhatsApp:** integrazione con app Meta, validazione webhook e autorizzazione dei numeri; US-001 dopo SPIKE-001.
- **Operatività e CI:** installazione, aggiornamento, recupero, osservabilità e verifiche automatiche; TEC-005 e TEC-006.

I confini concreti dei componenti, inclusi eventuali adattatori, saranno definiti dagli item indicati; non si assume che Hermes includa già le integrazioni richieste.

## 4. Data model

Il database è PostgreSQL e lo schema è gestito da migrazioni Prisma. Non sono state concordate entità o tabelle di dominio iniziali; eventuali dati di prova per le verifiche non definiscono il modello di dominio. TEC-003 definisce provisioning e migrazioni; futuri requisiti definiranno le entità necessarie.

## 5. Invariants and consistency

- L'agente può eseguire DML, non DDL; il vincolo va applicato e verificato sul database reale, non solo nelle istruzioni all'agente.
- Credenziali e privilegi delle migrazioni sono separati e non disponibili all'agente. SPIKE-001 e TEC-003 devono valutare anche eventuali percorsi indiretti di elevazione dei privilegi.
- Solo numeri configurati possono interagire; le richieste webhook non autentiche sono rifiutate.
- Aggiornamenti e riavvii preservano i dati; una procedura di ripristino deve essere verificata.

## 6. Integrations

- **Hermes:** modalità di installazione, esecuzione e fissaggio delle versioni da verificare con SPIKE-001 e realizzare con TEC-004.
- **OpenRouter:** provider configurato esternamente; SPIKE-001 verifica supporto e disponibilità dell'identificativo di modello indicato. Non assumere che `gpt-6.1-terra` sia valido; concordare una scelta se non lo è.
- **WhatsApp Business:** usare l'app Meta esistente; SPIKE-001 valuta supporto, webhook, prerequisiti e alternative; US-001 realizza il collegamento concordato.
- **PostgreSQL:** SPIKE-001 valuta il meccanismo di accesso dell'agente; TEC-003 e TEC-004 ne applicano e verificano i privilegi.

## 7. Security and observability

Segreti e credenziali restano fuori dal repository; gli esempi di configurazione non contengono valori reali. I log non devono includere messaggi, numeri di telefono o credenziali. L'accesso al database è limitato con ruoli distinti; l'integrazione WhatsApp autentica le richieste e applica la lista dei numeri autorizzati. TEC-005 documenta e verifica stato, disponibilità e consultazione dei log; il monitoraggio avanzato è fuori scope.

I dettagli di isolamento, gestione dei segreti nei processi, validazione Meta e protezione dei backup saranno definiti e verificati da SPIKE-001 e dai rispettivi item. Non assumere che una configurazione predefinita di Hermes soddisfi questi requisiti.

## 8. Test strategy

TEC-002 crea i comandi di installazione, lint, controllo dei tipi, test e build. I test unitari verificano la logica al livello più economico; quelli di integrazione usano PostgreSQL reale per migrazioni e privilegi. I test dei webhook includono autenticazione e accessi negati. Le prove end-to-end reali con Meta e OpenRouter richiedono configurazione, rete e credenziali esterne e sono documentate separatamente; non sostituiscono i test automatici. TEC-005 verifica anche aggiornamento, persistenza e ripristino; TEC-006 configura la CI senza deploy automatico.

## 9. Configuration and local runtime

L'ambiente locale usa Docker Compose; la produzione presume un server Linux con Docker/Compose e un endpoint HTTPS pubblico già disponibili. DNS, certificati e provisioning del server sono fuori scope. I nomi delle variabili, i file di esempio e i comandi operativi saranno definiti dagli item di implementazione; non inserire segreti reali. Le versioni precise di Node.js e degli altri componenti saranno fissate dagli item responsabili.

## 10. Open decisions

- Installazione e versionamento di Hermes; supporto OpenRouter e disponibilità del modello indicato; integrazione WhatsApp Business, webhook e accesso sicuro a PostgreSQL — SPIKE-001. Eventuali alternative o variazioni di scope richiedono accordo con l'utente.
- Versione precisa di Node.js LTS e strumenti di lint, test e build — TEC-002.
- Provisioning dei ruoli PostgreSQL ed esecuzione delle migrazioni Prisma — TEC-003, informato da SPIKE-001.
- Configurazione concreta di Hermes, del modello e dell'accesso dell'agente ai dati — TEC-004, informato da SPIKE-001.
- Adattatore WhatsApp, autenticazione del webhook e gestione dei numeri autorizzati — US-001, informato da SPIKE-001.
- Procedura di deploy, aggiornamento, backup/ripristino e verifica della disponibilità — TEC-005.
- Configurazione CI e separazione delle prove con servizi esterni — TEC-006.
