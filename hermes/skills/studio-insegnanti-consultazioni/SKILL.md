---
name: studio-insegnanti-consultazioni
description: Consultare lezioni, conteggi e storico insegnanti
---

## Consultazioni per insegnante

Le domande su chi tiene o ha tenuto le lezioni, sulle lezioni di un insegnante, sui presenti, sulle lezioni senza insegnante e sulle regole degli insegnanti sono consultazioni: esegui solo SELECT, senza modificare insegnanti, regole, indicazioni, clienti o registrazioni e senza chiedere conferme. Cerca l'insegnante nominato in `app.teachers` secondo la risoluzione condivisa del nucleo; se non esiste dillo, senza crearlo.

Ricava sempre i dati con `app.lesson_teachers(dal, al)`, non dalla cronologia della conversazione:

1. le **lezioni esistenti** del periodo, come definite sopra, deduplicate per data e ora; le regole degli insegnanti non creano lezioni e gli orari locali inesistenti sono esclusi;
2. l'**insegnante atteso** di ogni lezione, dalla regola con `created_at` precedente all'inizio, `deactivated_at` nullo o successivo all'inizio e un intervallo dello stesso giorno ISO che comprende l'orario. Per il passato non usare `is_active` né le regole attive oggi: una regola inserita dopo l'inizio non vale per quella lezione;
3. l'**indicazione valida**, cioè la riga di `app.teacher_assignments` con la stessa data e ora e `cancelled_at IS NULL`. Le indicazioni annullate non contano mai;
4. l'**insegnante della lezione**: quello dell'indicazione valida, altrimenti l'atteso; senza entrambi la lezione è **senza insegnante**.

- **tenuta come atteso** se `expected_id = X` e non c'è un'indicazione valida di un altro insegnante;
- **tenuta in sostituzione** se `assigned_id = X` e l'atteso è un altro insegnante: indica chi ha sostituito;
- **tenuta su indicazione** se `assigned_id = X` e non c'è un insegnante atteso;
- **sostituita da altri** se `expected_id = X` e l'indicazione valida è di un altro insegnante: indica chi l'ha tenuta.

Per «chi tiene» o «chi ha tenuto» una lezione rispondi con nome e cognome dell'insegnante della lezione e la provenienza: «insegnante atteso dalla regola» oppure «indicazione». Se l'insegnante indicato è diverso dall'atteso scrivi che l'ha tenuta, o la terrà, **in sostituzione di** nome e cognome dell'atteso; un'indicazione uguale all'atteso è una conferma. Cita un'indicazione annullata solo come annullata, mai come insegnante della lezione. Se la lezione non esiste dillo esplicitamente; puoi aggiungere l'insegnante atteso dalle regole per quell'orario.

Per le lezioni di un insegnante in un periodo elenca, ordinate per data e ora, quelle tenute e quelle sostituite da altri, con data completa, orario e ruolo. Calcola i conteggi con COUNT nel database, non contando a mente le righe di un elenco, e riporta sempre: **lezioni tenute** in totale (come atteso, in sostituzione e su indicazione), **di cui in sostituzione**, e **lezioni sostituite da altri**. Su `app.lesson_teachers($1::text::date, $2::text::date)`, con l'ID dell'insegnante in `$3`, usa per esempio `count(*) FILTER (WHERE COALESCE(assigned_id, expected_id) = $3)` per le tenute, `count(*) FILTER (WHERE assigned_id = $3 AND expected_id <> $3)` per quelle in sostituzione e `count(*) FILTER (WHERE expected_id = $3 AND assigned_id <> $3)` per quelle sostituite da altri. Aggiungi i **clienti presenti** alle lezioni tenute, cioè con presenza valida `present` per quella data e ora, e il numero di presenze di ciascuno, calcolato con COUNT e GROUP BY per cliente; non contare assenze, righe annullate o lezioni sostituite da altri. Alla domanda sui soli presenti alle lezioni di un insegnante usa le stesse lezioni tenute e indica le presenze per cliente.

Per le lezioni senza insegnante di un giorno o di un periodo passato elenca soltanto le lezioni esistenti già iniziate senza indicazione valida né insegnante atteso, con data completa, orario e clienti attesi o registrati; non elencare quelle con un insegnante e non aggiungere l'elenco delle altre lezioni.

Per le regole attive degli insegnanti usa `deactivated_at IS NULL` e i relativi intervalli, raggruppati per insegnante e giorno, traducendo le fasce. Per l'insegnante atteso in un giorno della settimana, una fascia o un orario senza una data precisa usa le sole regole attive con un intervallo che comprende l'orario o interseca la fascia; per una data precisa usa le regole valide all'inizio di quella lezione. Non includere regole disattivate se non chiedono lo storico.

Su richiesta dello storico mostra anche le regole disattivate e le indicazioni annullate, distinguendole da quelle valide, con data e autore di inserimento o registrazione e data, autore e motivo di disattivazione o annullamento; non mostrare numeri di telefono. Se nel periodo non ci sono lezioni, regole o indicazioni, o una lezione non ha insegnante atteso, dillo esplicitamente.
