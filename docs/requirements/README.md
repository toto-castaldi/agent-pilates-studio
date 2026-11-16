# Requirements — agent-pilates-studio

**Target version:** v0.3.0

**State:** baseline

Il *cosa* del progetto, un file per requisito (`docs/PROCESS.md` §5.1). Il *come* è in `docs/design/`. Ogni cambiamento di scope o di comportamento si registra qui prima di aggiornare backlog e implementazione (`docs/PROCESS.md` §3, §5). L'elenco dei requisiti si ottiene con `python3 .agents/tools/backlog.py docs`; leggere solo i file necessari.

| File | Contenuto |
| --- | --- |
| `README.md` | obiettivo, attori, scope della versione aperta, aree dei requisiti |
| `glossary.md` | termini usati in requisiti, backlog e codice |
| `acceptance.md` | accettazione della release della versione aperta |
| `REQ-<AREA>-NNN.md` | un requisito; copiare `_TEMPLATE.md` |

Il modello di identità unica degli insegnanti (REQ-STUDIO-015–017) è concordato ma non ancora attivo nel runtime: fino alla transizione coordinata descritta in `docs/design/identity.md` restano in esercizio il riconoscimento tramite allowlist e collegamento numero–insegnante in configurazione. La transizione è una decisione aperta in `docs/design/README.md`.

## Goal

Un assistente WhatsApp dello studio Pilates per il titolare e i collaboratori, basato su Hermes con database relazionale, modello tramite OpenRouter e comunicazione WhatsApp Business; installazione, aggiornamento e prova sono riproducibili.

Gli utilizzatori registrano, consultano e aggiornano via WhatsApp le abitudini settimanali di allenamento dei clienti, salvate come regole in linguaggio naturale con autore e storico; le presenze e le assenze effettive dei clienti alle singole lezioni, comprese le assenze giustificate annunciate prima della lezione; gli insegnanti dello studio, le loro regole settimanali e i cambi puntuali, come le sostituzioni, per ricavare chi ha tenuto ogni lezione. Le registrazioni hanno autore e storico, si correggono senza cancellazioni e sono consultabili con riepiloghi e statistiche. L'anagrafica degli insegnanti è l'unica fonte dell'identità degli utilizzatori: telefono, nome e cognome nel database, gestione guidata riservata a un solo gestore e accesso revocabile senza modificare lo storico.

## Actors

- **Operatore:** ruolo generico che configura, installa, aggiorna e gestisce l'ambiente.
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
- Anagrafica degli insegnanti (REQ-STUDIO-011), regole settimanali degli insegnanti (REQ-STUDIO-012), indicazioni puntuali e sostituzioni con correzione tramite annullamento (REQ-STUDIO-013) e consultazioni per insegnante (REQ-STUDIO-014).
- Identità unica degli insegnanti nel database con telefono, nome e cognome; accesso deciso dal censimento, gestione guidata riservata all'unico gestore configurato, correzioni, cambio numero, revoca e riabilitazione, transizione manuale e numeri esclusi dal modello (REQ-STUDIO-015–017). Nessuna anagrafica separata degli utilizzatori.
- Contesto dell'agente compatto, con `SOUL.md` entro 15.000 caratteri, skill versionate di sola lettura caricate su richiesta soltanto dall'agente, comandi WhatsApp di caricamento delle skill rifiutati dal sistema e ricostruzioni dei dati in viste, funzioni o tool dedicati, a comportamenti invariati (REQ-AGENT-008).
- L'agente non propone spontaneamente la creazione di un profilo dell'utilizzatore (REQ-AGENT-007).
- Ambiente di produzione su `jarvis`, separato dallo sviluppo (REQ-OPS-004), aggiornato manualmente con una procedura precisa (REQ-OPS-005) e un launcher con commit parametrico (REQ-OPS-009), con immagini pubblicate dalla pipeline e senza codice sul server (REQ-OPS-007), collegato a una propria app Meta con callback stabile (REQ-OPS-006); uso continuativo del gateway pubblico di produzione nei limiti di REQ-NFR-002.
- Backup a caldo del solo database di produzione con un comando `ops`, senza fermare gateway e broker (REQ-OPS-008).
- Audit privacy dei log del proxy Cloudflare e locali, con evidenze verificabili, prove sintetiche e limiti non osservabili espliciti (REQ-NFR-002, REQ-NFR-004); nessuna dichiarazione di conformità né autorizzazione implicita a modifiche infrastrutturali.
- Manifest versionato del workflow Pi e `settings.json` effettivo locale e ignorato, preparato prima dell'avvio anche nei clone dei worker (REQ-NFR-022).
- Processo e strumenti condivisi del template di origine, con requisiti e design suddivisi in file indirizzabili; l'adozione di una versione del template è un'attività di processo, non un requisito (REQ-NFR-013).
- Le capacità delle versioni precedenti restano disponibili e i loro requisiti restano vincolanti.

### Out of scope for v0.3.0

Non introdurre queste capacità senza concordare e registrare un cambio di scope:

- Richiesta automatica delle presenze da parte dell'agente dopo la lezione, job cron e messaggi pianificati.
- Disattivazione degli insegnanti dalla pianificazione, dati di profilo oltre a nome, cognome e telefono, compensi e ore lavorate, permessi differenziati sulle operazioni dello studio; sale, attrezzature e capienza. La sola revoca dell'accesso e la gestione dell'anagrafica riservata al gestore sono invece in scope.
- Pacchetti di lezioni, conteggio delle lezioni residue e pagamenti.
- Presenze future, assenze future non giustificate, collegamento tra un recupero e l'assenza che compensa, chiusure e altre eccezioni della pianificazione settimanale.
- Anagrafica degli utilizzatori separata dagli insegnanti, più gestori, ruoli configurabili e uso dell'agente da parte di clienti o altre categorie di persone.
- Dati dei clienti oltre a nome, cognome, regole di allenamento, presenze e assenze.
- Modifica del nome visualizzato del profilo WhatsApp Business su Meta, creazione del server e installazione dei suoi prerequisiti Docker/Compose, DNS, certificati, deploy automatico e monitoraggio avanzato.

## Areas

Requisiti funzionali: `REQ-<AREA>-NNN`; non funzionali: `REQ-NFR-NNN`. Aree usate nel progetto:

| Area | Meaning |
| ---- | ------- |
| `DB` | database e migrazioni |
| `AGENT` | ambiente agente e modello |
| `WA` | comunicazione WhatsApp Business |
| `OPS` | operatività e continuità |
| `STUDIO` | pianificazione, presenze e identità degli insegnanti dello studio |
| `NFR` | requisiti non funzionali |
