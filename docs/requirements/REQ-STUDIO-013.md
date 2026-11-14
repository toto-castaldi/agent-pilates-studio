# REQ-STUDIO-013 — Indicazioni e sostituzioni dell'insegnante

**State:** Active

Un utilizzatore deve poter indicare chi tiene o ha tenuto una lezione puntuale, per lezioni passate e future senza limiti di data (ad esempio "Antonio sostituisce Francesca il prossimo lunedì pomeriggio" o "ieri alle 19 l'ha tenuta Antonio"). L'agente registra un'indicazione dell'insegnante con data e orario d'inizio della lezione, data di registrazione e autore, e riepiloga quanto salvato. Date e orari seguono le regole di REQ-STUDIO-006 per il fuso. Per ogni lezione puntuale può esistere al più un'indicazione valida. Le indicazioni sono indipendenti da presenze e assenze: si possono registrare anche per lezioni senza registrazioni. Una lezione senza clienti attesi né registrazioni è ammessa e l'agente la segnala nel riepilogo. L'indicazione non crea, modifica né disattiva regole.

Per una sostituzione l'agente ricava le lezioni dagli insegnanti attesi del giorno o della fascia indicati. Se è interessata una sola lezione la registra; se sono più lezioni, anche su un periodo (ad esempio "per le prossime due settimane"), le elenca e le registra solo dopo la conferma dell'elenco. Senza conferma non registra nulla. Se l'insegnante sostituito non è atteso alla lezione indicata o la lezione non è identificabile, l'agente lo segnala e chiede chiarimenti. Quando registra le presenze, se l'utilizzatore non nomina un insegnante l'agente non lo chiede.

Le indicazioni non vengono mai cancellate né riscritte. Correzione, annullamento unico con data, autore e motivo, storico consultabile e divieto imposto dal database seguono REQ-STUDIO-008. Un'indicazione annullata non conta, quindi la lezione torna all'insegnante atteso.
