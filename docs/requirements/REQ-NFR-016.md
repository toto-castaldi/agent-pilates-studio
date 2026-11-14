# REQ-NFR-016 — Template v1.6.1 e orchestrazione parallela

**State:** Active

Il progetto deve allineare processo e skill condivise al template `agile-project-template` v1.6.1, preservando personalizzazioni, requisiti e protezioni dello studio. Il riferimento adottato e le eventuali divergenze sono registrati secondo REQ-NFR-013; conflitti o deroghe richiedono accordo esplicito. Restano validi gli shared claims di REQ-NFR-015, il gate rapido e le verifiche separate di REQ-NFR-008.

La modalità di lavoro parallelo del template deve essere attivata con shared claims: su esplicita richiesta l'operatore può usare un orchestratore e un worker per item, ciascuno in un clone separato. L'orchestratore propone item pronti e segnala sovrapposizioni; i worker effettuano il claim e attendono il via esplicito dell'utente prima di implementare, salvo richiesta di avvio immediato al lancio. Durante l'orchestrazione solo l'orchestratore esegue i merge, uno alla volta e su richiesta esplicita; rilascio dei claim e pulizia dei clone rispettano i controlli del processo e non eliminano lavoro non salvato. La radice dei workspace segue il valore predefinito del template, relativo al clone principale, e il comando dei worker era `pi` all'adozione della v1.6.1; REQ-NFR-018 lo aggiorna a `pi --approve`. Nessun worker viene avviato dalla sola adozione del template.

Date e conteggi dei documenti di stato, controlli prima del merge e risoluzione dei conflitti seguono il processo adottato. Prove e documentazione non espongono segreti o dati personali e non modificano impostazioni personali (REQ-NFR-002, REQ-NFR-007).

**Decisione dell'utente (2026-11-07):** TEC-028 è aggiunto alla v0.3.0 e la modalità parallela sarà attivata durante l'item; non sono autorizzati avvii di worker, merge o push su `main` automatici.
