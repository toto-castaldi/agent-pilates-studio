# TEC-005 — Prove preliminari di operatività

**Data:** 2026-11-05

**Stato:** attività bloccata; non costituisce una procedura di produzione completa.

## Installazione parziale

Sul server Linux predisposto è stato inizializzato un nuovo PostgreSQL con ruoli e segreti di database separati e applicata la migrazione iniziale tramite `scripts/migrate-docker.sh`, senza installare Node.js sull'host. Il database è sano ed è pubblicato solo su loopback. Le credenziali esterne autorizzate dall'operatore sono state copiate in una directory privata; il gateway Hermes non è stato avviato. Lo snapshot applicato corrisponde al commit `9ed2de3`.

## Prova isolata di backup e ripristino

Due progetti Compose temporanei con nomi e volumi distinti hanno usato credenziali sintetiche. Nel primo sono stati applicati bootstrap e migrazione e inserito un dato sintetico in PostgreSQL; un volume separato conteneva un database SQLite sintetico, non creato da Hermes. Un dump PostgreSQL in formato custom e un archivio del volume sono stati ripristinati nel secondo progetto, con ruoli inizializzati prima del ripristino. Sono stati verificati il dato SQL ripristinato, il dato SQLite e `PRAGMA integrity_check`. I progetti, i volumi di prova e i file temporanei sono stati rimossi.

Questa prova non sostituisce una procedura operativa documentata, un backup dello stato reale di Hermes o la verifica di persistenza dopo riavvio e aggiornamento.

## Blocco privacy del proxy

Con il gateway spento, una richiesta pubblica con parametro di verifica **sintetico** ha ricevuto 502; il parametro sintetico è stato rilevato nel journal del servizio cloudflared. La ricerca del token reale attuale nel solo journal locale dal 2026-11-03 non ha dato riscontro; non è una verifica dei log esterni o di altre copie. L'accesso alla configurazione del proxy condiviso richiede l'operatore. Prima dell'attivazione occorre concordare una mitigazione che non registri segreti, verificarla nei casi di successo ed errore e valutare l'impatto sugli altri servizi e sui log esterni.

Restano da realizzare e verificare la procedura di deploy e aggiornamento, il ripristino utilizzabile dall'operatore, la diagnostica sicura e le prove di produzione previste dai criteri di TEC-005.
