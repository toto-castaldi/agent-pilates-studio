# REQ-OPS-005 — Aggiornamento manuale della produzione

**State:** Active

L'operatore deve poter installare e aggiornare la produzione su `jarvis` solo a mano, con una procedura precisa e versionata: scelta esplicita del commit delle immagini, backup quiescente preliminare, migrazioni, ricreazione dei servizi, verifica di salute e ritorno documentato alla versione precedente. Nessun deploy automatico. Su `jarvis` non è presente un checkout del codice applicativo: restano Docker, i volumi, le immagini e una directory privata con segreti e configurazione. È ammesso il solo launcher shell minimale di REQ-OPS-009, senza logica di aggiornamento propria. La procedura è eseguita dall'immagine `ops`, l'unica a ricevere il socket Docker, solo per la durata del comando e mai in Hermes.
