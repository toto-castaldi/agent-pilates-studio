# Webhook authentication and author context

Hermes fornisce l'adattatore WhatsApp Cloud nativo; il progetto aggiunge il plugin SQL e un broker separato. Il webhook autenticato e l'identità ammessa sono collegati al turno effettivo e al plugin tramite metadati interni, non tramite argomenti del modello.

## Verifica del webhook

Il gateway inoltra al broker (`/v1/admission`) il corpo grezzo prima dell'adattatore. Il broker controlla HMAC, Phone Number ID, messaggio diretto, ID e timestamp firmato e risolve il mittente nel database (`identity`): restituisce soltanto i messaggi ammessi, con il nome censito al posto del profilo, e le risposte fisse o gestionali da inviare. Il gateway firma nuovamente il corpo filtrato con l'app secret, così l'adattatore lo verifica a sua volta. I messaggi sono accettati solo entro 5 minuti dal timestamp firmato, con 30 secondi di tolleranza futura: un messaggio tardivo o un turno interrotto dal riavvio del broker richiede un nuovo messaggio. L'impronta dell'ID già usato è conservata per 15 minuti in `studio_private.consumed_messages`, anche attraverso i riavvii; le risposte fisse ai numeri non abilitati usano la stessa impronta per non ripetersi.

## Contesto autore

L'ammissione crea nel broker una ricevuta con mittente, ID e revisione dell'insegnante. Prima del turno il gateway ne verifica la validità (`/v1/turn`). Per ogni chiamata del tool SQL il plugin usa l'ID del messaggio e il mittente forniti dal gateway, insieme a un nonce generato dal codice fidato: avvia una transazione, ne invia PID e ID al broker tramite canale autenticato e poi esegue la query; il broker chiama `bind_teacher_identity` con ID e revisione della ricevuta, e la funzione registra il contesto in `studio_private.author_context` solo se la persona è ancora la stessa, abilitata e alla stessa revisione. I trigger lo usano per imporre l'autore (`invariants`); il broker non ha INSERT diretto sul contesto. Il contesto scade dopo 60 secondi ed è rimosso dopo commit o rollback oppure, se il turno si interrompe, dalla pulizia periodica. Le ricevute in memoria hanno durata e numero limitati; in caso di esaurimento, errore del broker o prova assente il tool fallisce senza usare un'identità alternativa. Il plugin rifiuta i turni privi di prova attendibile; l'agente non accede alla tabella privata né assume il ruolo broker.

Nome e cognome dell'autore sono letti dalla riga corrente dell'insegnante a ogni scrittura, mai dal payload o dal modello (`identity`).

## Isolamento del broker

Il broker non pubblica porte sull'host e riceve una credenziale database propria e un token condiviso solo con il gateway; non riceve credenziali agente, amministrative o di migrazione. Il modello può invocare solo il tool SQL: la configurazione è restrittiva e i due percorsi di esecuzione dei tool applicano un'ulteriore allowlist. I componenti dell'host e i processi con accesso al token restano fidati.

L'adattamento usa metodi interni della versione Hermes fissata e la restituzione del corpo a `aiohttp`: ogni aggiornamento dell'immagine richiede la ripetizione delle prove; non si presume compatibilità con altre versioni.

## Orologio e ripristino

L'orologio dell'host deve essere affidabile e sincronizzato. Un ripristino di backup può riportare indietro anche lo storico delle impronte anti-replay: prima di riesporre il webhook attendere almeno 5 minuti e 30 secondi dall'ultimo webhook ricevuto prima del ripristino, senza accettare nuovi webhook nel frattempo.
