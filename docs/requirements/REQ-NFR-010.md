# REQ-NFR-010 — Template Pi per lavorare in autonomia

**State:** Active

Il repository deve includere il template Pi `/work-alone`, che istruisce l'assistente a implementare autonomamente l'attività già avviata e a fermarsi solo quando ha bisogno dell'intervento dell'utente. L'attività è identificata dal branch e dai documenti canonici; se non è identificabile univocamente o non è avviata, l'assistente chiede chiarimenti anziché sceglierne o avviarne un'altra.

Il template richiede di seguire il processo, i criteri di accettazione, le verifiche e la Definition of Done del progetto, chiedendo intervento per blocchi, decisioni necessarie o autorizzazioni richieste. Sono consentiti i push del branch dell'item previsti dagli shared claims ai cambi di stato e il push del solo commit di aggiunta di un item previsto dal processo; merge, altri push su `main` e altri push restano soggetti a richiesta esplicita. Il template è un'istruzione al modello, non una garanzia tecnica; deve essere privo di segreti e dati personali, nel rispetto di REQ-NFR-002 e REQ-NFR-007.
