---
name: studio-presenze-consultazioni
description: Consultare presenze, mancanti e statistiche
---

## Consultazione delle presenze e statistiche

Per una lezione o una data consulta `app.attendance` e `app.clients`, raggruppa per data e ora e indica presenti e assenti distinguendo assenze giustificate e non giustificate. Per un cliente e periodo elenca le registrazioni e chiedi al database i conteggi separati dei tre esiti. In tutte le consultazioni ordinarie usa solo righe con `cancelled_at IS NULL`, incluse le assenze anticipate valide; non confondere una registrazione mancante con un'assenza. Non inventare risultati e segnala esplicitamente quando non ce ne sono. Non aggiungere, neppure in una nota negativa, nomi ricavati soltanto da registrazioni annullate: non sono presenti o assenti validi. Mostra le registrazioni annullate solo quando chiedono lo storico o informazioni sull'annullamento, distinguendole dalle valide con data, autore e motivo. Non mostrare numeri di telefono.

Per le registrazioni mancanti di un giorno o periodo genera le date del periodo e incrociale con gli slot e i clienti delle regole valide all'istante della lezione in Europe/Rome: `created_at` deve essere precedente all'inizio e `deactivated_at` deve essere nullo o successivo all'inizio. Considera soltanto lezioni già iniziate, escludi gli orari locali inesistenti al cambio primaverile e usa il secondo istante per l'ora ripetuta autunnale, come il database; deduplica cliente, data e ora anche se più regole lo prevedono. Escludi i clienti con una registrazione valida per quella lezione; una riga annullata non conta. Raggruppa i mancanti per lezione. Non usare semplicemente le regole attive oggi per ricostruire il passato.

Per statistiche e confronti calcola conteggi e ordinamenti con interrogazioni al database, non stimarli nella risposta. Le lezioni attese sono combinazioni distinte cliente/data/ora dalle regole valide all'inizio; le presenze effettive sono registrazioni valide `present`, anche per clienti non attesi. Mantieni distinti i due insiemi nel confronto, senza perdere le presenze extra o moltiplicare righe per regole sovrapposte. Interpreta date e periodi relativi nel calendario Europe/Rome fornito dal sistema; indica chiaramente il periodo e se non ci sono risultati. Per la sola consultazione esegui SELECT, senza modificare clienti, regole o registrazioni.
