# REQ-STUDIO-017 — Ciclo di vita, storico e transizione delle identità

**State:** Active

Una correzione di nome o cognome o un cambio di numero conserva la stessa identità interna. Ogni modifica gestionale registra data e autore ricavati dal sistema. Gli autori delle operazioni già registrate restano snapshot del momento dell'operazione, senza riscrivere dati preesistenti o nomi WhatsApp storici (REQ-STUDIO-003).

La revoca impedisce l'accesso, ma non cancella l'insegnante, non modifica le sue regole, non annulla indicazioni e non altera lezioni o storico. La riabilitazione consente di nuovo l'accesso. Censimento, modifiche e revoche diventano efficaci senza riavvio; nuove richieste e nuove operazioni sui dati dopo la conferma di una revoca o sostituzione del numero non possono riusare un'autorizzazione precedente. Non si annullano retroattivamente operazioni già completate.

Dal nuovo numero la chat riparte senza la conversazione precedente, pur mantenendo i dati dello studio. Un numero riutilizzato per un'altra persona non eredita contesto o cronologia della persona precedente. La revoca impedisce di continuare a usare la chat come canale autorizzato; non elimina le copie storiche conservate per persistenza e backup.

L'aggiornamento conserva ID degli insegnanti, clienti, regole, presenze, indicazioni e autori esistenti. Non importa automaticamente vecchie allowlist, mapping o nomi di profilo WhatsApp. Il gestore completa manualmente i telefoni degli insegnanti preesistenti, incluso il proprio censimento se necessario, senza duplicare le persone. Solo le anagrafiche preesistenti possono restare temporaneamente senza telefono: restano utilizzabili nelle lezioni, ma non possono accedere finché non sono completate. I nuovi censimenti richiedono tutti i dati. Questa eccezione non è una funzionalità ordinaria per creare nuovi insegnanti senza telefono.
