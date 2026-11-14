# REQ-STUDIO-003 — Autore delle modifiche

**State:** Active

L'autore di ogni inserimento e disattivazione di clienti, insegnanti, regole di allenamento e regole degli insegnanti, e di ogni registrazione e annullamento di presenze, assenze e indicazioni dell'insegnante, è l'utilizzatore che ha inviato il messaggio. Per le nuove operazioni il sistema registra il numero WhatsApp autenticato e nome e cognome dall'anagrafica unica valida al momento dell'operazione (REQ-STUDIO-015), non il nome del profilo WhatsApp. Anche le operazioni di gestione dell'anagrafica hanno data e autore di sistema.

L'identità non deve poter essere dichiarata o alterata dal modello o dal testo della conversazione. Correggere un nome o cambiare un numero non riscrive gli autori storici. I dati già registrati prima del refactoring, inclusi i nomi di profilo WhatsApp, si conservano come snapshot originali; non si ricollegano per somiglianza del nome o solo perché un numero è stato successivamente assegnato a un'altra persona. I numeri degli autori restano protetti dall'accesso del modello (REQ-NFR-005).
