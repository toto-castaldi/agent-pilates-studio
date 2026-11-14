# Pi workflow and development tools

## Configurazione Pi

`.pi/workflow.json` è la fonte versionata delle sole chiavi `packages`, `skills`, `extensions` e `prompts` (REQ-NFR-022), con riferimenti fissati e nessun aggiornamento implicito dei pacchetti. `.pi/settings.json` è un file locale persistente, ignorato, unico settings effettivo del progetto; `themes` e `theme`, come ogni chiave non gestita, restano locali. Non esiste una seconda configurazione da far fondere a Pi né una directory agente imposta diversa da `.pi`.

`node scripts/start-pi.mjs` sincronizza dalla radice prima di avviare Pi e inoltra argomenti, stdio, segnali ed esito del processo; usa il modulo puro `src/pi-workflow.ts`, senza build preventiva.

- Il generatore valida il manifest rispetto all'insieme esplicito di chiavi gestite e legge l'eventuale settings come oggetto JSON; sovrappone soltanto quelle chiavi, rimuove senza residui quelle gestite assenti dal manifest e conserva ogni altra proprietà, compresi valori sconosciuti e oggetti annidati locali.
- La sincronizzazione è idempotente e non riscrive il file se invariato; una sostituzione atomica dopo la validazione evita file parziali, con temporanei esclusivi `0600`. Gli errori fermano l'avvio con diagnostica senza contenuti del settings.
- Il launcher rifiuta `.pi` simbolica, non directory o scrivibile da altri e settings non regolari, simbolici o con hard link. Il gruppo Unix è fidato; nessuna protezione contro scrittori concorrenti, ACL o host compromessi: un solo operatore durante la preparazione.
- Avviare direttamente `pi` resta possibile ma non prepara la configurazione. La preparazione non accorda fiducia e non copia autenticazione, sessioni o stato personale; un clone nuovo genera il file dal solo manifest.

`AGENTS.md` §10 usa lo stesso launcher, con `--approve`, come comando dei worker Pi. Procedura di recupero privato del settings, contratto e limiti: [workflow Pi](../operations/TEC-045-pi-workflow.md).

## Risorse condivise

- **`/work-alone`:** template Pi versionato che istruisce l'assistente a implementare autonomamente l'attività già avviata (REQ-NFR-010). I template `/start` e `/avvio` e il launcher `scripts/pi.sh` non esistono.
- **Tool di domanda:** il pacchetto pubblico `agent-harness-stuff` è fissato al commit `44f36742d47a4e83504abb9bdc0427be5f09ed82`, al posto di `npm:pi-question-tool` per evitare provider duplicati (REQ-NFR-011). Il fork mantiene contratto e licenza MIT dell'originale 0.1.1 e passa a `ctx.ui.custom()` l'opzione `blocked` di tipo `question`, con messaggi fissi che non contengono la domanda. Il riferimento deve restare raggiungibile sul repository pubblico.
- **Visualizzatore del backlog:** estensione in `.pi/extensions/backlog/` (`process-tooling`).

## Dettato vocale remoto

`npm run voice:diagnose` diagnostica in sola lettura il dettato Pi Voice su server remoto tramite il socket Pulse del client inoltrato da SSH (REQ-NFR-012). La valutazione dei passi e la raccolta dei fatti sono separate dagli effetti; il launcher usa `lstat`, lettura di file e `pactl`, invocato solo con `PULSE_SERVER` di forma `unix:` e socket privato dell'utente, con directory di configurazione non scrivibile per non creare il cookie Pulse. `npm run voice:setup` esegue sul server i passi della procedura in modo idempotente, con `sudo` solo per pacchetti e sshd. Procedura e prove: [dettato vocale remoto](../operations/TEC-020-dettato-vocale-remoto.md).
