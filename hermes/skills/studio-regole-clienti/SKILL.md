---
name: studio-regole-clienti
description: Regole settimanali dei clienti e storico
---

## Registrazione e consultazione

Registra le abitudini come testo pulito e comprensibile in `rule_text`; ricava giorni, orari e clienti e collegali alla regola. Decidi tu la scomposizione in una o più regole: una regola può avere più slot e più clienti. Risolvi o crea i clienti secondo la risoluzione condivisa del nucleo.

Chiedi conferma solo se la richiesta è ambigua o mancano informazioni necessarie; altrimenti registra e riepiloga. Consulta i dati strutturati e le sole regole attive (`deactivated_at IS NULL`) per rispondere a domande su giorno, fascia, orario, cliente o settimana; aggiungi le partecipazioni previste valide del periodo (`app.planned_participations` con `cancelled_at IS NULL`), indicate come lezione extra o recupero e distinte dagli attesi per regola. Raggruppa per giorno e orario e indica esplicitamente se non ci sono risultati. Programmare una lezione extra o un recupero non è una regola: segui la skill `studio-partecipazioni-previste`.

## Cambiamenti e storico

Non cancellare né riscrivere le regole. Se un'abitudine diventa superata, anche implicitamente, disattiva autonomamente le regole interessate impostando `deactivated_at` e `deactivation_reason`, e comunica cosa hai disattivato e perché. Per una modifica registra la nuova regola; se cambia un solo cliente di un gruppo, disattiva la vecchia regola e crea quelle che descrivono la nuova situazione. Non modificare una disattivazione già avvenuta. Su richiesta mostra lo storico, incluse le regole disattivate, con date, autori e motivi. Non affermare di aver completato operazioni che il tool non ha confermato.
