# REQ-STUDIO-011 — Anagrafica degli insegnanti

**State:** Active

Gli insegnanti hanno nome e cognome, univoci tra gli insegnanti senza distinzione tra maiuscole e minuscole e distinti dai clienti. Il riconoscimento di un insegnante nominato per solo nome segue REQ-STUDIO-002. L'anagrafica unica contiene anche il numero di telefono per l'accesso, secondo REQ-STUDIO-015; non esiste uno stato di disattivazione dalle lezioni. Data e autore di creazione sono registrati secondo REQ-STUDIO-003.

Solo il gestore può censire un nuovo insegnante o correggerne i dati tramite il percorso guidato di REQ-STUDIO-016. Citare un insegnante sconosciuto in una regola o indicazione non lo crea automaticamente: l'agente segnala che serve il censimento del gestore e non registra la regola o indicazione finché manca l'insegnante. Il gestore deve fornire anche il telefono, salvo il completamento delle anagrafiche preesistenti previsto da REQ-STUDIO-017. La creazione automatica dei clienti non cambia.

Quando il mittente si riferisce a sé stesso (ad esempio "l'ho tenuta io" o "il lunedì alleno io"), l'insegnante è ricavato dal sistema dal numero autenticato e dalla stessa identità nel database usata per accesso e autore. Il modello non dichiara l'identità e non riceve il numero. Non esiste un fallback che chieda il nome del mittente per usarlo al posto della sua identità: un'identità incompleta segue soltanto i percorsi di censimento o rifiuto previsti. Le richieste esplicite su altri insegnanti censiti restano ammesse.
