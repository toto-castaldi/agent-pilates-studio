# TEC-045 — Pi workflow e recupero locale

## Transition

Operazioni manuali nel proprio clone, non negli altri clone; nessun worker deve copiare dati personali. Chiudere Pi prima di aggiornare o recuperare il settings. La rimozione da Git può rimuovere il file dal working tree durante l'integrazione: non affidarsi al fatto che esista ancora dopo l'aggiornamento.

**Prima dell'aggiornamento**, salvare privatamente il file corrente:

```bash
umask 077
recovery=$(mktemp -d "$HOME/pi-settings-recovery.XXXXXX")
cp -- .pi/settings.json "$recovery/settings.json"
chmod 600 "$recovery/settings.json"
cmp -s .pi/settings.json "$recovery/settings.json"
```

Se `cmp` fallisce, fermarsi. Conservare il percorso privatamente, senza stamparne i contenuti, committarlo o copiarlo nei worker. Se modifiche locali al settings impediscono l'aggiornamento, **solo dopo la copia verificata**, e senza modifiche in staging da preservare su questo file, `git restore -- .pi/settings.json` lo riporta alla vecchia baseline versionata. Non ripristinare altri file. Integrare TEC-045 con la procedura Git autorizzata del progetto; questa guida non autorizza merge o push. Non usare skip-worktree, assume-unchanged o filtri Git.

**Dopo l'aggiornamento**, il percorso deve essere ignorato e non versionato:

```bash
git check-ignore .pi/settings.json
git ls-files -- .pi/settings.json
# Il primo deve confermare l'esclusione, il secondo non deve elencare il file.
cp -- "$recovery/settings.json" .pi/settings.json
chmod 600 .pi/settings.json
cmp -s .pi/settings.json "$recovery/settings.json"
node scripts/start-pi.mjs
```

Il launcher conserva tutte le chiavi locali, comprese sconosciute/annidate, e riallinea solo packages/skills/extensions/prompts. Il recupero è reversibile: chiudere Pi e ricopiare il backup nello stesso percorso ignorato, poi riavviare. Conservare il backup privato fino alla verifica delle preferenze; gestirlo come dato sensibile. Non usare `git add -f`. In un clone nuovo basta il launcher, senza alcun recupero o copia da altri clone. Autenticazione, sessioni, log e cache non vengono migrati o letti dalla preparazione.

## Implementation and limits

`src/pi-workflow.ts` valida il manifest e calcola la sincronizzazione in memoria. `scripts/start-pi.mjs`, dalla radice del clone, legge il solo settings di progetto e il manifest, prepara un temporaneo esclusivo `0600`, sincronizza e sostituisce atomicamente il file solo quando cambia. Prima dell'avvio rifiuta link simbolici, hard link, file non regolari e directory `.pi` scrivibili da altri. Un errore non stampa eccezioni o contenuti personali e non avvia Pi. Il launcher inoltra argomenti, stdio, esiti e segnali; non aggiunge `--approve`. Non aggiorna pacchetti né sceglie versioni: mantiene le dichiarazioni esistenti, anche quelle npm non fissate, che restano soggette al comportamento di installazione di Pi.

Usare un solo operatore e non cambiare il settings durante la preparazione: nessuna garanzia contro scrittori concorrenti, sostituzioni ostili di directory antenate, ACL o host compromessi. Il rename evita scritture parziali; non è una transazione con l'avvio di Pi. Un errore di esecuzione di Pi può lasciare il settings già correttamente sincronizzato. L'avvio diretto `pi` e `/reload` non sincronizzano il manifest. I futuri worker usano il launcher con `--approve`; quelli già aperti non sono interrotti o rilanciati. Lo stack dello studio non cambia.

## Evidence

Le prove sintetiche sono in `test/pi-workflow.test.ts`, `integration/local/pi-workflow.test.ts`, `integration/local/worker-command.test.ts` e `integration/pi-settings.test.ts`, oltre ai contratti aggiornati di allowlist e pacchetto domanda. Coprono validazione, rimozioni, preferenze future/annidate, idempotenza senza cambio inode/mtime, transizione da file versionato, backup privato, Git reale pulito, argomenti/esiti, errori e destinazioni non sicure. Pi offline carica risorse condivise sintetiche con fiducia e conserva preferenze con directory agente coincidente; le altre prove di fiducia restano separate. Nessuna prova legge impostazioni o credenziali personali, invoca un modello o dimostra il comportamento di Herdr reale. File/processi/Git/Pi/rete restano nelle suite separate, mai nei test unitari in memoria.
