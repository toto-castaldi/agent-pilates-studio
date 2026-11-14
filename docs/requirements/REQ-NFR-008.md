# REQ-NFR-008 — Gate di chiusura con soli test di unità in memoria

**State:** Active

I gate di chiusura dello sviluppo (completamento di un item, merge e push su `main`) devono eseguire soltanto test di unità in memoria, veloci e privi di processi, file system, git, rete o Docker, oltre a lint, controllo dei tipi e build. Il push del solo commit documentale di aggiunta di un item non richiede il gate; il gate resta richiesto per completamento, merge e push dei merge. I test di integrazione ed end-to-end restano disponibili come comandi separati: si eseguono durante il lavoro sull'item quando servono come prova dei criteri di accettazione o delle verifiche richieste da `AGENTS.md`, nella chiusura di una versione e nella CI GitHub, che continua a eseguire tutte le suite (REQ-NFR-003). La regola è documentata, senza controlli automatici dedicati.
