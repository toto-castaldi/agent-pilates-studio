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

Su richiesta dell'operatore è stata adottata una mitigazione circoscritta, senza abbassare il livello di log degli altri servizi: `LogFilterPatterns` di systemd scarta dal journal le righe di cloudflared che contengono l'hostname del webhook. Il server usa systemd 259; `systemd-analyze verify` ha accettato la sintassi e un confronto ERE su righe sintetiche ha distinto l'hostname interessato da un altro. L'operatore ha provato il filtro su un'unità systemd temporanea e lo ha installato su cloudflared. Dopo il riavvio, due richieste sintetiche con hostname in minuscolo e maiuscolo hanno ricevuto 502 e i loro valori non sono stati rilevati nel journal; un evento sintetico precedente al filtro è presente come controllo di leggibilità. Un sito pubblico preesistente ha risposto HTTP 200.

L'operatore ha rilevato assenza di `logfile`, `log-directory` e `trace-output` nella configurazione. Lo script di applicazione ha controllato la configurazione e l'ambiente del servizio prima dell'installazione, rifiutando debug, file, trace o valori di livello non previsti. Template e script con rollback sono nel repository `self-hosting`; sintassi, confronto ERE e percorsi di successo, collisione, perdita sintetica e rollback sono stati verificati anche in un container isolato con comandi di sistema simulati.

Il filtro elimina l'intera riga corrispondente, quindi anche la relativa diagnostica; può scartare righe di altri servizi che menzionino lo stesso hostname. I messaggi del manager systemd relativi all'unità non sono filtrati: nella prova, il messaggio `Started` riportava il comando con la riga sintetica. Non inserire mai token o altri segreti negli argomenti dei processi. Il filtro non protegge log su file, trace, streaming remoto, log Cloudflare o eventuali righe sensibili senza hostname. Restano da verificare i sistemi esterni e gli altri formati di log; la prova locale non dimostra l'assenza di ogni possibile fuga. Le modifiche al servizio condiviso richiedono l'operatore e comportano un riavvio del tunnel; il gateway resta spento.

### Verifica Cloudflare con dati sintetici

L'operatore ha verificato dal dashboard che il tunnel usato dal webhook è condiviso e che su `jarvis` è attivo `cloudflared`; il container Hermes di produzione non risulta avviato. Una nuova richiesta GET con un token di verifica sintetico ha ricevuto 502. Nel Log Explorer la riga corrispondente mostrava il percorso e altri metadati, ma non il valore sintetico nei campi visualizzati; il selettore non proponeva un campo URI completo o query string. Questo non dimostra che la query non sia conservata o disponibile altrove.

La pagina OpenTelemetry dell'account non mostrava destinazioni configurate; la pagina Logpush proponeva la sottoscrizione senza mostrare una lista di job. Queste osservazioni non escludono esportazioni o log in altri ambiti. La pagina Live logs del tunnel offre l'avvio dello streaming, ma non è stata avviata: REQ-NFR-004 lo vieta operativamente anche tramite CLI. Il divieto non è un blocco tecnico e non dimostra l'assenza di log sensibili negli altri sistemi.

Restano da realizzare e verificare la procedura di deploy e aggiornamento, il ripristino utilizzabile dall'operatore, la diagnostica sicura e le prove di produzione previste dai criteri di TEC-005. Restano inoltre da verificare i formati di log locali e gli altri log esterni prima dell'attivazione del gateway.
