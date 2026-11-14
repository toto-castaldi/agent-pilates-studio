# REQ-STUDIO-009 — Consultazione di presenze e assenze

**State:** Active

Un utilizzatore deve poter chiedere conversando:

- chi era presente e chi assente, con il tipo di assenza, a una lezione puntuale o in una data;
- presenze e assenze di un cliente in un periodo, con i conteggi delle presenze e delle assenze giustificate e non giustificate;
- le registrazioni mancanti di un giorno o di un periodo passato, cioè i clienti attesi a lezioni già iniziate senza una registrazione valida, raggruppati per lezione;
- statistiche per periodo, ad esempio i clienti con più assenze, il numero di presenze per cliente o per lezione, e il confronto tra lezioni attese e presenze effettive.

Le risposte si basano sulle sole registrazioni valide e sui dati strutturati; conteggi e statistiche sono calcolati con interrogazioni al database e non stimati dal modello. I periodi relativi ("questa settimana", "ottobre") si interpretano nel fuso Europe/Rome. L'assenza di risultati è indicata esplicitamente. Su richiesta l'agente indica autore e data di registrazione o di annullamento e mostra anche le registrazioni annullate.
