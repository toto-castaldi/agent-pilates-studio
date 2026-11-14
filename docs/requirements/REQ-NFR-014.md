# REQ-NFR-014 — Aggiornamento dal template e consultazione del backlog

**State:** Active

Il progetto deve adottare il processo, le skill e il visualizzatore Pi del backlog del template `agile-project-template` v1.4.0, preservando le personalizzazioni, i requisiti e le protezioni propri dello studio. Eventuali conflitti o deroghe devono essere concordati e documentati, non risolti con sovrascritture indiscriminate. La provenienza e le risorse effettivamente adottate devono essere registrate secondo REQ-NFR-013.

Il progetto deve definire un solo modulo architetturale, `MOD-001 — Agente`, per la soluzione dell'assistente dello studio nel repository corrente. Gli item aperti pertinenti possono riferirsi al modulo; il lavoro trasversale e lo storico completato non richiedono una classificazione retroattiva.

In Pi l'operatore deve poter consultare gli item del backlog senza modificarli, navigando tra gli item e scorrendone il contenuto; il visualizzatore si apre con `/backlog` e dispone di una scorciatoia configurabile o disattivabile. Gli strumenti rispettano REQ-NFR-002, REQ-NFR-007 e il gate di REQ-NFR-008; le prove non leggono né modificano impostazioni personali.
