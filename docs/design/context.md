# Context and main flows

L'operatore configura e avvia l'ambiente locale o di produzione, applica le migrazioni con credenziali dedicate e gestisce aggiornamenti e recupero. L'interlocutore autorizzato invia messaggi tramite WhatsApp Business; il componente di integrazione verifica il webhook e l'autorizzazione, inoltra la richiesta a Hermes e restituisce la risposta. Hermes usa OpenRouter e può accedere a PostgreSQL con il solo ruolo agente.

SPIKE-001 ha realizzato lo stack locale e verificato questo flusso in una prova reale con l'app Meta e OpenRouter; TEC-005 ha documentato e verificato la continuità operativa nei limiti descritti, e TEC-006 ha configurato la CI.
