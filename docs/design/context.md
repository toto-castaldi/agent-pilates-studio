# Context and main flows

L'operatore configura e avvia l'ambiente locale o di produzione, applica le migrazioni con credenziali dedicate e gestisce aggiornamenti e recupero (`configuration`, `production`, `continuity`).

Un insegnante censito e abilitato invia messaggi tramite WhatsApp Business. Il gateway riceve il webhook e lo passa al broker del progetto prima dell'adattatore Hermes: il broker ne verifica firma, account, mittente e tempo (`webhook-trust`) e riconosce il mittente nell'anagrafica del database (`identity`). I messaggi gestionali del gestore sono intercettati e trattati dal percorso guidato deterministico; i numeri non abilitati ricevono un rifiuto fisso. Gli altri messaggi ammessi, con il nome censito, diventano un turno di Hermes, che usa OpenRouter e accede a PostgreSQL tramite il plugin SQL con il solo ruolo agente; l'autore delle scritture è imposto dal database tramite il contesto protetto registrato dal broker. La risposta torna all'interlocutore tramite WhatsApp; avvisi interni di Hermes non sono inoltrati.

La CI esegue il gate rapido, costruisce il progetto e pubblica le immagini di produzione; l'aggiornamento della produzione resta manuale.
