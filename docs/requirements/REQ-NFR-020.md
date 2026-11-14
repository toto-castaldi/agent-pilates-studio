# REQ-NFR-020 — Template v2.1.0 e pubblicazione delle aggiunte al backlog

**State:** Active

Il progetto deve allineare processo e skill condivise al template `agile-project-template` v2.1.0, preservando personalizzazioni, requisiti e protezioni dello studio; il riferimento adottato e le eventuali divergenze sono registrati secondo REQ-NFR-013. Conflitti o deroghe non già concordati richiedono accordo esplicito. Restano validi REQ-NFR-002, REQ-NFR-007 e REQ-NFR-014–019, con la sola eccezione ai push di `main` descritta qui.

Dopo l'adozione, l'aggiunta di un item sul `main` pulito e aggiornato produce un solo commit documentale e, se è configurato un upstream, lo pubblica subito senza eseguire il gate: prima dell'aggiunta non devono esserci altri commit locali non pubblicati. Senza upstream il push è saltato. Se il push è rifiutato perché l'upstream è avanzato, si eseguono rebase, controllo del backlog e nuovo push secondo il processo; conflitti, controllo fallito o altri errori sono segnalati senza perdere il commit. Gli altri push su `main` e i merge continuano a richiedere una richiesta esplicita. La sola adozione non avvia worker e non autorizza merge o push su `main`.

**Decisione dell'utente (2026-11-11):** l'aggiornamento alla v2.1.0 è aggiunto alla v0.3.0; la nuova eccezione per il push automatico sarà applicata dopo l'adozione, non all'aggiunta di questo item.
