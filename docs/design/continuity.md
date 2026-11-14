# Continuity

## Backup quiescente e ripristino

L'operatore arresta Hermes, il broker e gli altri scrittori prima di catturare il dump PostgreSQL e il volume Hermes completo. I contesti effimeri delle transazioni sono esclusi dal dump, mentre le impronte anti-replay sono conservate. Gli script creano un backup privato in una directory nuova con somme di controllo e ripristinano solo in un nuovo progetto Compose con porta loopback effimera, senza avviare Hermes. Sono richieste una destinazione cifrata esterna e una copia separata dei segreti, con passphrase conservata a parte: gli script non garantiscono cifratura, autenticità del backup o mutua esclusione contro altri operatori. Dopo un ripristino valgono i tempi di riesposizione del webhook di `webhook-trust`.

Il PostgreSQL di consultazione è pronto solo quando risponde `pg_isready -h 127.0.0.1`: durante initdb l'entrypoint dell'immagine ufficiale avvia un server temporaneo solo su socket Unix, che non deve essere scambiato per quello definitivo, anche con `--network none`. Non si usano ritardi fissi, retry del ripristino o soppressione dei suoi errori.

Procedura e limiti: [continuità](../operations/TEC-005-continuita.md). Le verifiche non garantiscono la compatibilità di versioni diverse da quelle fissate.

## Immagine di migrazione

Per gli host con Docker ma senza Node.js, le migrazioni usano un'immagine costruita da Node.js 24.14.0 fissato per digest e dal lockfile. L'installazione delle dipendenze precede il montaggio del solo segreto di migrazione; l'immagine usa la rete host per raggiungere PostgreSQL su loopback e non è montata in Hermes. Il contesto Docker esclude configurazione locale e segreti.

## Osservabilità

Stato e disponibilità dei servizi si verificano con Compose e healthcheck; i log contengono solo eventi fissi (`security`). Il monitoraggio avanzato è fuori scope.
