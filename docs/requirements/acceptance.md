# Release acceptance — v0.5.0

- Ogni messaggio autenticato gestito dal gateway, in produzione e in sviluppo, produce un evento di metrica con i dati di REQ-OPS-011 disponibili, ricavati dal sistema e mai dal modello; i dati non restituiti dal provider restano vuoti. Gli eventi non contengono numeri, testi, riassunti, nomi o credenziali, non si modificano né si cancellano per vincolo del database e il ruolo dell'agente non può leggerli né scriverli, verificato su PostgreSQL reale.
- Se la registrazione di un evento fallisce, il turno si completa con la stessa risposta e il log riporta solo un messaggio fisso senza dati personali; gli eventi persistono tra riavvii e aggiornamenti e sono inclusi in backup e ripristini.
- La dashboard Grafana si apre in sviluppo e in produzione solo tramite tunnel SSH, con le credenziali della configurazione privata; l'hostname pubblico continua a esporre solo il webhook. Filtrabile per periodo e utilizzatore, mostra i pannelli di REQ-OPS-012 con gli utilizzatori indicati per nome e cognome, mai con il telefono; il suo ruolo PostgreSQL è rifiutato su ogni altro dato e su qualsiasi scrittura e le modifiche dall'interfaccia non sopravvivono alla ricreazione del servizio.
- Su `jarvis`, aggiornata con il launcher alla release della versione, la dashboard mostra le metriche dei messaggi reali scambiati dopo l'aggiornamento.
- I log non contengono nomi, messaggi, numeri o credenziali.
- Il quality gate passa in CI e tutte le suite di integrazione passano in locale sul commit della release.
