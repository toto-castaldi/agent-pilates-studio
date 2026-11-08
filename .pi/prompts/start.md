---
description: Riassume lo stato del progetto e propone le prossime attività
---
Dimmi lo stato del progetto e le prossime attività da fare.

1. Esegui `python3 .agents/tools/backlog.py status` e `show` per gli item pertinenti; leggi `AGENTS.md` e, se necessario, `docs/PROCESS.md`. Il backlog, letto solo con questa CLI, è la fonte canonica per stati e dipendenze.
2. Controlla in sola lettura il branch corrente e lo stato del working tree. Segnala eventuali incoerenze o informazioni mancanti senza inventare dettagli.
3. Riassumi in italiano e in modo conciso: versione e avanzamento, attività in corso o bloccate con relative cause, attività pronte ordinate per priorità e relative dipendenze.
4. Consiglia la prossima attività, spiegando perché è pronta e quali eventuali interventi dell'utente servono per sbloccare le altre. Distingui ciò che è documentato da ciò che non è verificato.
5. Chiedimi quale attività desidero affrontare. Non modificare file, branch o stato del backlog e non avviare lavoro, test, commit, merge o push senza una mia successiva richiesta esplicita. Non leggere né mostrare segreti.
