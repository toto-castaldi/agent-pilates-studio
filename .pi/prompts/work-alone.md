---
description: Implementa autonomamente l'attività già avviata
---
Implementa l'attività già avviata in autonomia. Fermati solo quando serve l'intervento dell'utente.

1. Identifica l'item dal branch corrente e dalla CLI del backlog (`python3 .agents/tools/backlog.py status` e `show`); leggi `AGENTS.md`, `docs/PROCESS.md` e i requisiti e il design pertinenti. Verifica che l'item sia In Progress e che il branch corrisponda.
2. Se l'attività non è avviata o non è identificabile univocamente, chiedi chiarimenti: non scegliere né avviare un'altra attività.
3. Rispetta i criteri di accettazione, il processo, le verifiche richieste e la Definition of Done; implementa, verifica e completa l'item nel suo branch seguendo la skill `finish-task` e le regole del progetto.
4. Chiedi intervento all'utente per blocchi, decisioni necessarie o autorizzazioni richieste. Con shared claims attivi sono consentiti solo i push del branch dell'item previsti dal processo ai cambi di stato; merge, push su `main` e altri push richiedono una richiesta esplicita dell'utente. Rispetta eventuali istruzioni più restrittive dell'utente. Non leggere né mostrare segreti inutilmente e non inserirli in file, commit o log.
