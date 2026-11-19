---
name: studio-partecipazioni-previste
description: Programmare e annullare lezioni extra e recuperi dei clienti
---

## Registrazione

Quando comunicano che un cliente parteciperà a una lezione puntuale fuori dalle sue regole, ad esempio «oggi alle 18 si allenerà Mario Rossi», «giovedì alle 10 Lucia Bianchi recupera» o una lezione extra, registra una partecipazione prevista in `app.planned_participations` con `client_id`, `lesson_date` e `start_time`, anche prima dell'inizio e senza limiti di anticipo. Non dichiarare autore o data di registrazione.

- Identifica data e ora d'inizio al minuto nel fuso Europe/Rome rispetto alla data corrente fornita dal sistema, ricavando dal database giorno della settimana e date relative. Se data o orario mancano o sono ambigui, ad esempio un orario senza giorno, «la prossima settimana» senza giorno o un'ora che può essere del mattino o della sera, chiedi chiarimenti con una domanda esplicita e non registrare nulla. Rifiuta gli orari locali inesistenti al cambio primaverile.
- Risolvi il cliente secondo la risoluzione condivisa del nucleo. Se il nome indicato non corrisponde esattamente ma è simile a un cliente già censito, ad esempio stesso nome con cognome diverso per una lettera o un cognome mancante, chiedi quale cliente intende prima di crearne uno nuovo e non registrare finché non risponde. Crea un nuovo cliente solo quando è chiaro che non è già in anagrafica.
- Prima di registrare controlla con `app.expected_clients($1::text::date, $1::text::date)` se il cliente è già atteso per quella lezione: con `source = 'rule'` è già atteso per regola, con `source = 'planned'` ha già una partecipazione prevista valida. In entrambi i casi segnalalo e non registrare.
- Dopo la conferma del tool riepiloga cliente, data completa e orario salvati, indicando che si tratta di una lezione extra o di un recupero.

Una partecipazione prevista non crea, modifica né disattiva regole di allenamento e non registra presenze o assenze: non inserire righe in `app.attendance` per programmarla. Un recupero non è collegato all'assenza che compensa.

## Annullamento

Quando comunicano che il cliente alla fine non verrà più a una lezione per cui ha una partecipazione prevista, ad esempio «Mario alla fine non viene più», identifica la partecipazione prevista valida (`cancelled_at IS NULL`) per cliente, data e ora; se ce n'è più di una o non è identificabile chiedi chiarimenti senza annullare nulla. Annullala una sola volta impostando `cancelled_at = clock_timestamp()` e un `cancellation_reason` non vuoto che descriva la comunicazione, senza cancellare la riga e senza registrare un'assenza. Comunica l'annullamento. Non riscrivere né annullare di nuovo una partecipazione già annullata; per spostarla annulla quella esistente e registra la nuova lezione, segnalando eventuali operazioni parziali.

Se il cliente è atteso per regola e non verrà, non si tratta di una partecipazione prevista: applica le assenze anticipate della skill delle presenze.

## Consultazione e storico

Le partecipazioni previste valide rendono il cliente atteso solo a quella lezione puntuale e la lezione esistente; nelle consultazioni della pianificazione indicale come lezione extra o recupero, distinte dagli attesi per regola. Su richiesta dello storico mostra anche quelle annullate, distinguendole dalle valide, con data e autore della registrazione e data, autore e motivo dell'annullamento.
