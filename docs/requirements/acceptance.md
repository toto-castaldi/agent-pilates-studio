# Release acceptance — v0.4.0

- Quando WhatsApp rifiuta l'invio di una risposta fissa o gestionale, il log registra stato HTTP e codice d'errore restituito, senza numeri, testi, nomi o credenziali; la consegna resta best effort. Per le risposte dell'agente vale lo stesso, oppure il limite dell'adattatore è documentato. Un rifiuto simulato, ad esempio di un destinatario non registrato sul numero di test, è verificato in una suite separata con un servizio sostitutivo.
- L'operatore riconosce dai log, seguendo la documentazione operativa, un destinatario non registrato sul numero di test Meta.
- Il menu di `/anagrafica` descrive ciascuna operazione e chiarisce che la correzione cambia solo nome e cognome e il cambio numero il telefono; comandi, passaggi, conferme e controlli restano invariati.
- Un messaggio come «oggi alle 18 si allenerà <nome>», inviato prima della lezione, registra una partecipazione prevista: il cliente compare tra gli attesi della lezione come extra o recupero e conta per «c'erano tutti»; la presenza si registra solo dopo l'inizio e la partecipazione prevista si annulla con storico.
- I log non contengono nomi, messaggi, numeri o credenziali.
- Il quality gate e le suite di integrazione passano in CI.
