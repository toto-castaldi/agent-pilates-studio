# Requirements — agent-pilates-studio

**Target version:** v0.5.0

**State:** baseline

Il *cosa* del progetto, un file per requisito (`docs/process/docs.md` §1). Il *come* è in `docs/design/`. Ogni cambiamento di scope o di comportamento si registra qui prima di aggiornare backlog e implementazione (`docs/PROCESS.md` §3, `docs/process/docs.md`). L'elenco dei requisiti si ottiene con `python3 .agents/tools/backlog.py docs`; `docs --for <ID>` elenca i file necessari per un item.

| File | Contenuto |
| --- | --- |
| `README.md` | obiettivo, attori, scope della versione aperta, aree dei requisiti |
| `glossary.md` | termini usati in requisiti, backlog e codice |
| `acceptance.md` | accettazione della release della versione aperta |
| `REQ-<AREA>-NNN.md` | un requisito; copiare `_TEMPLATE.md` |

## Goal

Un assistente WhatsApp dello studio Pilates per il titolare e i collaboratori, basato su Hermes con database relazionale, modello tramite OpenRouter e comunicazione WhatsApp Business; installazione, aggiornamento e prova sono riproducibili.

Gli utilizzatori registrano, consultano e aggiornano via WhatsApp le abitudini settimanali di allenamento dei clienti, salvate come regole in linguaggio naturale con autore e storico; le partecipazioni previste fuori dalle regole, come lezioni extra e recuperi; le presenze e le assenze effettive dei clienti alle singole lezioni, comprese le assenze giustificate annunciate prima della lezione; gli insegnanti dello studio, le loro regole settimanali e i cambi puntuali, come le sostituzioni, per ricavare chi ha tenuto ogni lezione. Le registrazioni hanno autore e storico, si correggono senza cancellazioni e sono consultabili con riepiloghi e statistiche. L'anagrafica degli insegnanti è l'unica fonte dell'identità degli utilizzatori: telefono, nome e cognome nel database, gestione guidata riservata a un solo gestore e accesso revocabile senza modificare lo storico.

## Actors

- **Operatore:** ruolo generico che configura, installa, aggiorna e gestisce l'ambiente.
- **Interlocutore autorizzato (utilizzatore):** insegnante censito nel database con un numero WhatsApp univoco e accesso abilitato, che comunica con l'agente. Gli utilizzatori hanno gli stessi permessi sulle normali operazioni dello studio, anche relative agli altri insegnanti; solo il gestore mantiene l'anagrafica. Non esiste un'anagrafica separata degli utilizzatori e i clienti non usano l'agente.
- **Gestore:** unico utilizzatore il cui numero è indicato nella configurazione privata. Può censire e mantenere gli insegnanti tramite un percorso guidato nella chat. Se non ancora censito, accede soltanto al percorso iniziale per completare la propria identità, prima di usare i dati dello studio.
- **Insegnante:** persona che tiene le lezioni dello studio, registrata nell'anagrafica unica (REQ-STUDIO-011 e REQ-STUDIO-015). Ogni nuovo insegnante ha un numero di telefono; quelli preesistenti senza numero restano nelle lezioni come eccezione transitoria, senza accesso all'agente. Revocare l'accesso non disattiva l'insegnante dalle lezioni.
- **Cliente:** persona che si allena nello studio; non interagisce con l'agente.
- **Agente:** Hermes, che elabora le richieste tramite il modello e accede ai dati con i privilegi assegnati.

## Scope

### In scope for v0.5.0

- Metriche d'uso dell'agente per ogni messaggio autenticato, in produzione e in sviluppo: utilizzatore come insegnante censito, tipo di turno, tempi di risposta complessivi e del modello, modello e livello di thinking, token, contesto inviato rispetto alla finestra, compattazioni, chiamate ai tool, costo riportato da OpenRouter ed esito dell'invio; registrate nel database senza dati personali, non modificabili né leggibili dall'agente e conservate senza limite (REQ-OPS-011).
- Dashboard Grafana delle metriche per l'operatore, filtrabile per periodo e utilizzatore, raggiungibile solo dal server tramite tunnel SSH, con credenziali nella configurazione privata, sola lettura sulle metriche e su nome e cognome degli insegnanti, e provisioning versionato incluso nelle immagini (REQ-OPS-012).
- CI GitHub limitata al gate rapido, con tutte le suite di integrazione eseguite in locale durante gli item e alla chiusura della versione (REQ-NFR-003, REQ-NFR-008).
- Le capacità delle versioni precedenti restano disponibili e i loro requisiti restano vincolanti.

### Out of scope for v0.5.0

Non introdurre queste capacità senza concordare e registrare un cambio di scope:

- Richiesta automatica delle presenze da parte dell'agente dopo la lezione, job cron e messaggi pianificati diversi dal backup di REQ-OPS-010; copia dei backup fuori dal server.
- Disattivazione degli insegnanti dalla pianificazione, dati di profilo oltre a nome, cognome e telefono, compensi e ore lavorate, permessi differenziati sulle operazioni dello studio; sale, attrezzature e capienza. La sola revoca dell'accesso e la gestione dell'anagrafica riservata al gestore sono invece in scope.
- Pacchetti di lezioni, conteggio delle lezioni residue e pagamenti.
- Presenze future, assenze future non giustificate, collegamento tra un recupero e l'assenza che compensa, chiusure e altre eccezioni della pianificazione settimanale diverse dalle partecipazioni previste di REQ-STUDIO-018.
- Anagrafica degli utilizzatori separata dagli insegnanti, più gestori, ruoli configurabili e uso dell'agente da parte di clienti o altre categorie di persone.
- Dati dei clienti oltre a nome, cognome, regole di allenamento, presenze e assenze.
- Modifica del nome visualizzato del profilo WhatsApp Business su Meta, creazione del server e installazione dei suoi prerequisiti Docker/Compose, DNS, certificati e deploy automatico.
- Avvisi automatici e monitoraggio oltre alle metriche d'uso di REQ-OPS-011; accesso alla dashboard dall'hostname pubblico; ricostruzione dello storico delle metriche precedente alla loro attivazione.

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
