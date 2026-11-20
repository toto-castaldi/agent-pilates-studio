# REQ-OPS-012 — Dashboard delle metriche d'uso

**State:** Active

L'operatore consulta le metriche di REQ-OPS-011 in una dashboard Grafana, in produzione e in sviluppo, raggiungibile solo dal server tramite un tunnel SSH e mai dall'hostname pubblico. L'accesso richiede le credenziali Grafana della configurazione privata, assenti dal repository e dagli esempi.

La dashboard, filtrabile per periodo e utilizzatore, mostra almeno: numero di messaggi per utilizzatore e per giorno; tempi di risposta (mediana e 95° percentile) complessivi e del modello; token e contesto inviato in percentuale della finestra, rispetto alla soglia di compattazione; compattazioni; costi per utilizzatore, per giorno e per modello; esiti degli invii rifiutati. Gli utilizzatori sono indicati con nome e cognome censiti, senza numeri di telefono.

Grafana legge con un ruolo PostgreSQL di sola lettura limitato alle metriche e ai soli nome e cognome degli insegnanti; non accede agli altri dati dello studio né alle sessioni Hermes. Dashboard e sorgente dati sono versionate e incluse nelle immagini, non modificabili in modo persistente dall'interfaccia; installazione, aggiornamento e prova sono riproducibili come gli altri servizi (REQ-OPS-005, REQ-OPS-007).
