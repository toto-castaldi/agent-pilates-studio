# Requirements — agent-pilates-studio

**Target version:** v0.3.0

**State:** baseline

Questo documento definisce il comportamento richiesto; le scelte tecniche sono in `docs/TECHNICAL-DESIGN.md`.

**Pianificazione del 2026-11-12:** il modello di identità unica di REQ-STUDIO-015–017 è concordato per la v0.3.0, ma non è ancora implementato. Sostituisce, al completamento degli item dedicati, il riconoscimento tramite nome WhatsApp e il collegamento numero–insegnante in configurazione; gli esiti degli item già completati restano lo storico della baseline precedente.

## Goal

Rendere riproducibili l'installazione, la prova locale e l'aggiornamento in produzione di un ambiente agentico Hermes, con database relazionale, modello tramite OpenRouter e comunicazione WhatsApp Business. Il successo della v0.1.0 è dimostrato dagli scenari di accettazione della release.

Con la v0.2.0 l'agente diventa l'assistente dello studio Pilates: il titolare e i collaboratori registrano, consultano e aggiornano via WhatsApp le abitudini settimanali di allenamento dei clienti, salvate come regole in linguaggio naturale con autore e storico.

Con la v0.3.0 l'agente registra le presenze e le assenze effettive dei clienti alle singole lezioni, in una data e un orario precisi, quando un utilizzatore le comunica via WhatsApp, e le assenze giustificate annunciate prima della lezione; le registrazioni hanno autore e storico, si correggono senza cancellazioni e sono consultabili con riepiloghi e statistiche. Con il cambio di scope del 2026-11-08 la v0.3.0 registra anche gli insegnanti dello studio, le loro regole settimanali e i cambi puntuali, come le sostituzioni, per ricavare chi ha tenuto ogni lezione e consultarlo per insegnante. Con il cambio di scope del 2026-11-12 l'anagrafica degli insegnanti diventa anche l'unica fonte dell'identità degli utilizzatori: telefono, nome e cognome nel database, gestione guidata riservata a un solo gestore e accesso revocabile senza modificare lo storico.

## Actors

- **Operatore:** ruolo generico che configura, installa, aggiorna e gestisce l'ambiente; l'identità concreta è da definire.
- **Interlocutore autorizzato (utilizzatore):** insegnante censito nel database con un numero WhatsApp univoco e accesso abilitato, che comunica con l'agente. Gli utilizzatori hanno gli stessi permessi sulle normali operazioni dello studio, anche relative agli altri insegnanti; solo il gestore mantiene l'anagrafica. Non esiste un'anagrafica separata degli utilizzatori e i clienti non usano l'agente.
- **Gestore:** unico utilizzatore il cui numero è indicato nella configurazione privata. Può censire e mantenere gli insegnanti tramite un percorso guidato nella chat. Se non ancora censito, accede soltanto al percorso iniziale per completare la propria identità, prima di usare i dati dello studio.
- **Insegnante:** persona che tiene le lezioni dello studio, registrata nell'anagrafica unica (REQ-STUDIO-011 e REQ-STUDIO-015). Ogni nuovo insegnante ha un numero di telefono; quelli preesistenti senza numero restano nelle lezioni come eccezione transitoria, senza accesso all'agente. Revocare l'accesso non disattiva l'insegnante dalle lezioni.
- **Cliente:** persona che si allena nello studio; non interagisce con l'agente.
- **Agente:** Hermes, che elabora le richieste tramite il modello e accede ai dati con i privilegi assegnati.

## Scope

### In scope for v0.3.0

- Registrazione conversazionale delle presenze dei clienti alle lezioni puntuali, su iniziativa dell'utilizzatore, anche tramite i clienti attesi (REQ-STUDIO-006).
- Registrazione delle assenze giustificate e non giustificate e richiesta all'utilizzatore per i clienti attesi non citati (REQ-STUDIO-007).
- Correzione tramite annullamento, senza cancellazione, con storico consultabile (REQ-STUDIO-008).
- Registrazione anticipata delle assenze giustificate per lezioni future, anche su più lezioni, e annullamento prima della lezione (REQ-STUDIO-010).
- Consultazione di presenze, assenze e registrazioni mancanti, con riepiloghi e statistiche per periodo (REQ-STUDIO-009).
- Cambio di scope del 2026-11-08: anagrafica degli insegnanti (REQ-STUDIO-011), regole settimanali degli insegnanti (REQ-STUDIO-012), indicazioni puntuali e sostituzioni con correzione tramite annullamento (REQ-STUDIO-013) e consultazioni per insegnante (REQ-STUDIO-014). Il collegamento del numero in configurazione introdotto allora è sostituito dal cambio di scope del 2026-11-12.
- Cambio di scope del 2026-11-12: identità unica degli insegnanti nel database con telefono, nome e cognome; accesso deciso dal censimento, gestione guidata riservata all'unico gestore configurato, correzioni, cambio numero, revoca e riabilitazione, transizione manuale e numeri esclusi dal modello (REQ-STUDIO-015–017). Nessuna anagrafica separata degli utilizzatori.
- Allineamento al template v1.6.1 e orchestrazione opzionale del lavoro parallelo, attivata per il progetto (REQ-NFR-016); aggiornamento alla v1.7.0 per il coordinamento non bloccante (REQ-NFR-017) e alla v1.7.1 per il comando dei worker (REQ-NFR-018); aggiornamento alla v2.0.0 per il backlog su file e il processo ridotto (REQ-NFR-019). Cambio di scope del 2026-11-11: aggiornamento alla v2.1.0 e pubblicazione automatica delle aggiunte di item (REQ-NFR-020). Cambio di scope del 2026-11-13: aggiornamento completo alla v2.2.1 con risoluzione condivisa degli stati dai branch, pannello backlog Claude Code e correzione del lancio dei worker Herdr (REQ-NFR-021), adottato con TEC-044.
- Cambio di scope del 2026-11-13: manifest versionato del workflow Pi e generazione del solo `settings.json` effettivo, locale e ignorato, preservando preferenze, temi e stato personale; preparazione prima dell'avvio anche nei clone dei worker (REQ-NFR-022), attuata con TEC-045.
- Cambio di scope del 2026-11-14: aggiornamento al template v3.0.0, inclusa la v2.3.0 con i worker Claude Code di `orchestrate`, con suddivisione di requisiti e design in file indirizzabili e condensazione allo stato attuale; l'adozione di una versione del template non richiede un nuovo requisito (TEC-047).
- Rimozione del template Pi `/start`, ritenuto inutile (ritiro di REQ-NFR-009).
- Cambio di scope del 2026-11-09: ambiente di produzione su `jarvis`, separato dallo sviluppo (REQ-OPS-004), aggiornato manualmente con una procedura precisa (REQ-OPS-005), con immagini pubblicate dalla pipeline e senza codice sul server (REQ-OPS-007), e collegato a una propria app Meta con callback stabile (REQ-OPS-006); messa in esercizio continuativa del gateway pubblico di produzione.
- Cambio di scope del 2026-11-10: l'agente non propone spontaneamente la creazione di un profilo dell'utilizzatore, né al primo contatto né successivamente (REQ-AGENT-007).
- Cambio di scope del 2026-11-12: backup a caldo del solo database di produzione con un comando `ops`, senza fermare gateway e broker, per consultare i dati (REQ-OPS-008).
- Cambio di scope del 2026-11-12: launcher manuale di aggiornamento con commit parametrico e istruzioni per scegliere l'ultimo commit di `main` con immagini pubblicate (REQ-OPS-009).
- Cambio di scope del 2026-11-14: audit privacy dei log del proxy Cloudflare e locali (TEC-008, REQ-NFR-002 e REQ-NFR-004), con evidenze verificabili, prove sintetiche e limiti non osservabili espliciti; nessuna dichiarazione anticipata di conformità né autorizzazione implicita a modifiche infrastrutturali.
- Cambio di scope del 2026-11-14: contesto dell'agente compatto, con `SOUL.md` entro 15.000 caratteri, skill versionate di sola lettura caricate su richiesta e ricostruzioni dei dati in viste, funzioni o tool dedicati, a comportamenti invariati (REQ-AGENT-008).
- Le capacità delle versioni precedenti restano disponibili e i loro requisiti restano vincolanti.

### Out of scope for v0.3.0

Non introdurre queste capacità senza concordare e registrare un cambio di scope:

- Richiesta automatica delle presenze da parte dell'agente dopo la lezione, job cron e messaggi pianificati (TEC-019 e item non assegnati).
- Disattivazione degli insegnanti dalla pianificazione, dati di profilo oltre a nome, cognome e telefono, compensi e ore lavorate, permessi differenziati sulle operazioni dello studio; sale, attrezzature e capienza. La sola revoca dell'accesso e la gestione dell'anagrafica riservata al gestore sono invece in scope.
- Pacchetti di lezioni, conteggio delle lezioni residue e pagamenti.
- Presenze future, assenze future non giustificate, collegamento tra un recupero e l'assenza che compensa, chiusure e altre eccezioni della pianificazione settimanale.
- Anagrafica degli utilizzatori separata dagli insegnanti, più gestori, ruoli configurabili e uso dell'agente da parte di clienti o altre categorie di persone.
- Dati dei clienti oltre a nome, cognome, regole di allenamento, presenze e assenze.
- Modifica del nome visualizzato del profilo WhatsApp Business su Meta, creazione del server, DNS, certificati, deploy automatico e monitoraggio avanzato.

### In scope for v0.2.0 (closed)

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

### Out of scope for v0.2.0 (closed)

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

## Functional requirements

| Area | Meaning |
| ---- | ------- |
| DB | Database e migrazioni |
| AGENT | Ambiente agente e modello |
| WA | Comunicazione WhatsApp Business |
| OPS | Operatività e continuità |
| STUDIO | Pianificazione, presenze e identità degli insegnanti dello studio |

### Insegnanti delle lezioni

**Decisione dell'utente (2026-11-08):** i requisiti REQ-STUDIO-011–014 sono aggiunti alla v0.3.0 come cambio di scope. Gli insegnanti seguono la struttura dei clienti: regole settimanali generali e cambi puntuali.

### Identità e gestione dell'anagrafica

**Decisione dell'utente (2026-11-12):** REQ-STUDIO-015–017 sono aggiunti alla v0.3.0. Il cambiamento sostituisce l'identità basata sul nome del profilo WhatsApp e il collegamento in configurazione di REQ-STUDIO-011; non introduce un'anagrafica degli utilizzatori separata dagli insegnanti.
