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

### Mitigazione mirata da verificare

Su richiesta dell'operatore è stata valutata una mitigazione circoscritta, senza abbassare il livello di log degli altri servizi: `LogFilterPatterns` di systemd può scartare dal journal le righe di cloudflared che contengono l'hostname del webhook. Il server usa systemd 259; `systemd-analyze verify` ha accettato la sintassi e un confronto ERE su righe sintetiche ha distinto l'hostname interessato da un altro. L'operatore ha eseguito una prova con un'unità systemd temporanea: l'output di controllo è comparso nel journal e la riga sintetica con l'hostname è stata scartata. **Il filtro non è stato installato né provato su cloudflared.**

Il filtro elimina l'intera riga corrispondente, quindi anche la relativa diagnostica; può scartare righe di altri servizi che menzionino lo stesso hostname. I messaggi del manager systemd relativi all'unità non sono filtrati: nella prova, il messaggio `Started` riportava il comando con la riga sintetica. Non inserire mai token o altri segreti negli argomenti dei processi. Il filtro non protegge log su file, trace, streaming remoto, log Cloudflare o eventuali righe sensibili senza hostname. Sono necessari: verifica delle opzioni effettive di cloudflared, prova con vero 502 sintetico dopo l'eventuale installazione, controllo di log non interessati e verifica dei sistemi esterni. Le modifiche al servizio condiviso richiedono l'operatore e comportano un riavvio del tunnel; il gateway resta spento.

Restano da realizzare e verificare la procedura di deploy e aggiornamento, il ripristino utilizzabile dall'operatore, la diagnostica sicura e le prove di produzione previste dai criteri di TEC-005.
