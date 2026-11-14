# REQ-STUDIO-015 — Identità unica e accesso degli insegnanti

**State:** Active

Il sistema riconosce chi scrive tramite il numero del mittente del webhook WhatsApp autenticato e lo risolve nell'unica anagrafica degli insegnanti nel database. Ogni nuovo insegnante ha nome, cognome e un solo numero corrente, univoco tra gli insegnanti; nome e cognome restano univoci senza distinzione di maiuscole. Il numero è la chiave di riconoscimento del mittente, ma cambiarlo non crea una nuova persona e non spezza i collegamenti con regole, lezioni e storico. Non si ricava l'identità da nomi WhatsApp, dichiarazioni nel messaggio, argomenti del modello o mapping in configurazione.

Il censimento con accesso abilitato è l'unica fonte applicativa dell'autorizzazione ordinaria; non richiede una seconda allowlist, modifiche a `.env` o riavvii. Tutti gli utilizzatori possono eseguire le stesse operazioni dello studio, anche per altri insegnanti, ma solo il gestore mantiene l'anagrafica. L'unico numero personale in configurazione è quello del gestore, da cui deriva anche il canale home. Il gestore non censito può solo completare sé stesso prima di lavorare sui dati dello studio. Non sono previsti più gestori o ruoli configurabili.

I numeri forniti per il censimento richiedono il prefisso internazionale; spazi e separatori comuni sono accettati e normalizzati prima di confronti e salvataggi. Non si assume un paese per i numeri senza prefisso e formati equivalenti non producono duplicati. Accesso, nome nella conversazione, riconoscimento di «io» e autore delle nuove operazioni derivano dalla stessa identità fidata. I numeri non sono esposti al modello, neppure tramite letture SQL, metadati o dati dell'autore.
