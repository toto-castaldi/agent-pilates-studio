# Context and main flows

L'operatore configura e avvia l'ambiente locale o di produzione, applica le migrazioni con credenziali dedicate e gestisce aggiornamenti e recupero (`configuration`, `production`, `continuity`).

L'interlocutore autorizzato invia messaggi tramite WhatsApp Business. Il gateway nativo di Hermes riceve il webhook; il broker del progetto ne verifica in modo indipendente firma, account, mittente e tempo (`webhook-trust`). I messaggi gestionali del gestore sono intercettati prima del modello e trattati dal percorso guidato deterministico (`identity`). Gli altri messaggi autorizzati diventano un turno di Hermes, che usa OpenRouter e accede a PostgreSQL tramite il plugin SQL con il solo ruolo agente; l'autore delle scritture è imposto dal database tramite il contesto protetto registrato dal broker. La risposta torna all'interlocutore tramite WhatsApp; avvisi interni di Hermes non sono inoltrati.

La CI costruisce e verifica il progetto e pubblica le immagini di produzione; l'aggiornamento della produzione resta manuale.
