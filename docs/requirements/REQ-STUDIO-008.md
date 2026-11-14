# REQ-STUDIO-008 — Correzione e storico di presenze e assenze

**State:** Active

Presenze e assenze non vengono mai cancellate né riscritte. Per correggere un errore l'agente annulla la registrazione errata indicando data, autore (REQ-STUDIO-003) e motivo e, se serve, registra quella corretta, ad esempio un'assenza al posto di una presenza o un tipo di assenza diverso; comunica poi cosa ha annullato e registrato. L'agente procede autonomamente quando la comunicazione dell'utilizzatore indica chiaramente la correzione e chiede conferma solo in caso di ambiguità. Un annullamento non può essere modificato. Le registrazioni annullate restano consultabili come storico e sono escluse da conteggi e consultazioni ordinarie. Il divieto di cancellazione e di riscrittura è imposto anche dal database.
