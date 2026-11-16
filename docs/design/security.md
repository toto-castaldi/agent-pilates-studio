# Security and observability

## Segreti e configurazione privata

Segreti e credenziali restano fuori dal repository; gli esempi di configurazione non contengono valori reali.

- `.env` è la fonte delle credenziali esterne e può essere un link simbolico a un file regolare privato: l'avvio lo apre in modalità non bloccante, controlla tipo e bit di permesso sul descrittore e legge dallo stesso file. I file segreti separati rifiutano i link. Il controllo non verifica ACL e non protegge da operatori concorrenti o modifiche in loco del file.
- L'orchestratore locale rifiuta file o directory non privati, aggiorna i file intermedi tramite sostituzione atomica e ricrea entrambi i consumatori (`configuration`). Le password database e i segreti interni esistenti non vengono sovrascritti: su un volume esistente i quattro ruoli vengono autenticati prima del bootstrap, che altrimenti ripristinerebbe le password. La verifica usa il container PostgreSQL esistente con la sua configurazione precedente oppure, se assente, un container temporaneo senza porte sull'host; il nuovo assetto si applica solo dopo la verifica. File mancanti o credenziali discordanti arrestano l'avvio prima delle modifiche esterne.
- Compose riceve solo le opzioni non segrete e i percorsi dei file. Hermes non riceve né `.env` né i segreti di amministrazione o migrazione; tra le credenziali database, il processo Prisma riceve solo quella di migrazione.
- Gli output grezzi dei sottoprocessi sono soppressi e i comandi emettono solo eventi e messaggi di errore fissi. Non è prevista protezione contro operatori concorrenti: un solo operatore alla volta.

## Log dei servizi

I log non devono includere messaggi, numeri di telefono o credenziali. L'adattatore WhatsApp nativo di Hermes può registrare numeri e PostgreSQL può registrare query e valori: gli entrypoint deviano stdout e stderr verso `/dev/null` prima di avviare i processi; un descrittore separato, chiuso prima dell'avvio dei figli, invia al driver Docker `local` solo gli eventi fissi `hermes_launch`, `hermes_preflight_failed` e `postgres_launch`. Il launcher del gateway disabilita il logging Python prima di importare Hermes. La rotazione è limitata a tre file da 1 MB. Gli eventi non attestano che i servizi siano sani: stato e disponibilità richiedono Compose e healthcheck, e i dettagli degli errori non sono disponibili. Il calcolo della soglia di compattazione stampa solo due numeri. Evitare modalità di avvio alternative non protette; non assumere che una configurazione predefinita di Hermes soddisfi questi requisiti. Il monitoraggio avanzato è fuori scope.

I log del tunnel e del proxy sono trattati in `proxy-logs`.

## Dati verso il modello

Riassunti e cronologia compattata restano nel volume SQLite di Hermes come le conversazioni, persistono, sono inclusi nel backup del volume, transitano verso OpenRouter per la generazione del riassunto e non sono registrati nei log. La lettura del catalogo dei modelli invia la chiave OpenRouter allo stesso endpoint già usato per il modello.

- **Runtime attuale:** la redazione nativa degli identificativi WhatsApp è abilitata e i numeri autorizzati noti, anche con comuni separatori, sono oscurati nelle copie inviate alle richieste principali, ai riassunti, ai titoli e alle domande laterali; la cronologia persistita non è riscritta. Gli adattamenti usano punti interni Hermes e non sono un filtro universale per codifiche arbitrarie o numeri non più nell'allowlist. Il mapping numero–insegnante resta nel file privato del broker, non nel gateway.
- **Base dell'identità unica:** telefoni correnti e audit sono già protetti per costruzione con tabella privata, vista di compatibilità e ingressi fidati, senza affidarsi a filtri del tool SQL; anche le conversioni JSON o testuali della riga pubblica non includono i campi privati. Gli autori storici ancora esposti nelle altre tabelle non sono dichiarati protetti.
- **Alla transizione all'identità unica** (`identity`): si rimuove insieme l'accesso del modello ai numeri degli autori da proiezioni, risultati ed errori SQL e cronologia; i telefoni restano esclusi anche nel percorso guidato, nei metadati fidati, nelle richieste ausiliarie, nelle sessioni persistite e nella compattazione. Eliminare il solo campo del nuovo messaggio non basta. Le vecchie copie di cronologia e backup non sono dichiarate anonime: prima dell'invio al modello si impedisce che riportino telefoni di identità o nomi WhatsApp come identità corrente. Non si promette di riconoscere ogni dato personale arbitrario scritto fuori dal percorso guidato.

I test sintetici non dimostrano l'assenza di ogni possibile fuga.

## Skill interne

Le skill sono testo statico versionato senza dati personali; dopo `skill_view` restano nella cronologia e nei backup SQLite e possono transitare verso OpenRouter. Il mount dall'immagine è in sola lettura, nasconde le skill preinstallate e impedisce sostituzione o aggiunta anche se il processo possiede la directory superiore. Registro e dispatcher escludono gestione, installazione e scrittura delle skill; gli altri toolset restano disabilitati. Il caricatore non-tool è neutralizzato e il gateway rifiuta comandi di skill, varianti, pile, bundle e destinazioni di alias prima del turno del modello, anche nel percorso busy. Non è un filtro di prompt né un limite agli altri comandi nativi; `/refine` e `/review` restano invariati. Gli adattamenti sono specifici della versione Hermes fissata e richiedono prove reali a ogni aggiornamento (ADR-004).

## Accesso

L'accesso al database è limitato con ruoli distinti (`invariants`); l'integrazione WhatsApp autentica le richieste e applica l'autorizzazione dei mittenti (`webhook-trust`, `identity`).
