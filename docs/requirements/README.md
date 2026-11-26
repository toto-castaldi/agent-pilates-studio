# Requirements — agent-pilates-studio

**Target version:** nessuna (v0.5.0 rilasciata)

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

Nessuna versione aperta: scope e accettazione della prossima versione si concordano e si registrano qui prima della pianificazione. Le capacità delle versioni rilasciate restano disponibili e i loro requisiti restano vincolanti.

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
