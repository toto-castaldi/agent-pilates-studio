# REQ-NFR-017 — Template v1.7.0 e coordinamento non bloccante

**State:** Active

Il progetto deve allineare il processo e le skill condivise al template `agile-project-template` v1.7.0, preservando personalizzazioni e protezioni dello studio. Il riferimento adottato e le eventuali divergenze sono registrati secondo REQ-NFR-013; conflitti o deroghe richiedono accordo esplicito. Restano validi REQ-NFR-002, REQ-NFR-007, REQ-NFR-008, REQ-NFR-015 e REQ-NFR-016.

Durante il lavoro parallelo l'orchestratore resta disponibile all'utente senza bloccarsi in attesa dei worker: può svolgere attività di backlog che restano su `main`, senza implementare né cambiare branch, e gestisce i rapporti dei worker secondo il processo. Prima di avviare i worker verifica che `main` non contenga commit assenti da `origin/main`, perché i clone provengono da `origin`; se ne contiene, chiede all'utente come procedere e non pubblica `main` senza richiesta esplicita. L'adozione del template non avvia worker né autorizza merge o push su `main`.

**Decisione dell'utente (2026-11-07):** TEC-029 è aggiunto alla v0.3.0 per adottare il template v1.7.0 e il coordinamento non bloccante.
