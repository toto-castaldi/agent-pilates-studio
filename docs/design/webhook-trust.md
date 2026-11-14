# Webhook authentication and author context

Hermes fornisce l'adattatore WhatsApp Cloud nativo; il progetto aggiunge il plugin SQL e un broker separato. Il webhook autenticato è collegato al turno effettivo e al plugin tramite metadati interni, non tramite argomenti del modello.

## Verifica del webhook

Il gateway inoltra al broker il corpo grezzo prima che l'adattatore lo verifichi a sua volta. Il broker controlla HMAC, Phone Number ID, mittente e timestamp firmato e l'autorizzazione del mittente (`identity`). I messaggi sono accettati solo entro 5 minuti dal timestamp firmato, con 30 secondi di tolleranza futura: un messaggio tardivo o un turno interrotto dal riavvio del broker richiede un nuovo messaggio. L'impronta dell'ID già usato è conservata per 15 minuti in `studio_private.consumed_messages`, anche attraverso i riavvii.

## Contesto autore

Per un turno WhatsApp diretto il broker usa l'ID del messaggio e il mittente forniti dal gateway, insieme a un nonce generato dal codice fidato. Il plugin avvia una transazione, ne invia PID e ID al broker tramite canale autenticato e poi esegue la query; il broker registra il contesto in `studio_private.author_context`, che i trigger usano per imporre l'autore (`invariants`). Il contesto scade dopo 60 secondi ed è rimosso dopo commit o rollback oppure, se il turno si interrompe, dalla pulizia periodica. Le ricevute in memoria hanno durata e numero limitati; in caso di esaurimento, errore del broker o prova assente il tool fallisce senza usare un'identità alternativa. Il plugin rifiuta i turni privi di prova attendibile; l'agente non accede alla tabella privata né assume il ruolo broker.

Il nome dell'autore proviene oggi dal payload firmato; con l'identità unica nome e cognome sono risolti nel database dal numero autenticato (`identity`).

## Isolamento del broker

Il broker non pubblica porte sull'host e riceve una credenziale database propria e un token condiviso solo con il gateway; non riceve credenziali agente, amministrative o di migrazione. Il modello può invocare solo il tool SQL: la configurazione è restrittiva e i due percorsi di esecuzione dei tool applicano un'ulteriore allowlist. I componenti dell'host e i processi con accesso al token restano fidati.

L'adattamento usa metodi interni della versione Hermes fissata e la restituzione del corpo a `aiohttp`: ogni aggiornamento dell'immagine richiede la ripetizione delle prove; non si presume compatibilità con altre versioni.

## Orologio e ripristino

L'orologio dell'host deve essere affidabile e sincronizzato. Un ripristino di backup può riportare indietro anche lo storico delle impronte anti-replay: prima di riesporre il webhook attendere almeno 5 minuti e 30 secondi dall'ultimo webhook ricevuto prima del ripristino, senza accettare nuovi webhook nel frattempo.
