# REQ-NFR-005 — Dati personali dello studio

**State:** Active

I dati di dominio sono limitati a nome e cognome dei clienti, alle loro regole di allenamento, alle loro presenze e assenze con il tipo di assenza e il motivo di eventuali annullamenti, a nome, cognome e telefono degli insegnanti, al loro stato tecnico di accesso e alle loro regole e indicazioni con i motivi di disattivazione e annullamento, e agli autori e alle date delle modifiche. Gli autori nuovi contengono numero autenticato e nome e cognome dall'anagrafica; gli snapshot storici possono conservare il nome del profilo WhatsApp (REQ-STUDIO-003). Non si raccolgono ulteriori dati di profilo o ruoli configurabili.

Le identità e i telefoni stanno nel database e nei relativi backup privati, non in un mapping esterno. I nomi e gli altri dati necessari alle conversazioni possono transitare verso OpenRouter e WhatsApp; i numeri di identità, censimento e autore non devono essere inviati al modello, tramite messaggi gestionali, risultati SQL, contesto nativo, riassunti, titoli o richieste ausiliarie. Il sistema può usare il numero per il trasporto WhatsApp e mostrarlo al solo gestore nel percorso dedicato, senza reinserirlo nel contesto del modello. I dati non devono comparire nei log (REQ-NFR-002). Cronologia e backup precedenti non vengono dichiarati anonimi dal refactoring. Test automatici, CI ed esempi usano solo dati sintetici.

**Decisione dell'utente (2026-11-05):** per la v0.2.0 l'uso di nomi e cognomi reali nelle prove è accettato rinviando l'audit privacy a TEC-008. La decisione non dichiara la conformità a REQ-NFR-002, non autorizza l'uso continuativo del gateway, che è fuori scope per la v0.2.0, e non modifica REQ-NFR-004.
