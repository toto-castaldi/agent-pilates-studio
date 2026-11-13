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

`src/pi-workflow.ts` valida il manifest e calcola la sincronizzazione in memoria. `scripts/start-pi.mjs`, dalla radice del clone, legge il solo settings di progetto e il manifest, prepara un temporaneo esclusivo `0600`, sincronizza e sostituisce atomicamente il file solo quando cambia. Prima dell'avvio rifiuta link simbolici, hard link, file non regolari e directory `.pi` scrivibili da altri (il gruppo Unix deve essere fidato). Un errore non stampa eccezioni o contenuti personali e non avvia Pi. Il launcher inoltra argomenti, stdio, esiti e segnali; non aggiunge `--approve`. Non aggiorna pacchetti né sceglie versioni: mantiene le dichiarazioni esistenti, anche quelle npm non fissate, che restano soggette al comportamento di installazione di Pi.

Usare un solo operatore e non cambiare il settings durante la preparazione: nessuna garanzia contro scrittori concorrenti, sostituzioni ostili di directory antenate, ACL o host compromessi. Il rename evita scritture parziali; non è una transazione con l'avvio di Pi. Un errore di esecuzione di Pi può lasciare il settings già correttamente sincronizzato. L'avvio diretto `pi` e `/reload` non sincronizzano il manifest. I futuri worker usano il launcher con `--approve`; quelli già aperti non sono interrotti o rilanciati. Lo stack dello studio non cambia.

## Evidence

| Criterio TEC-045 | Evidenza |
| --- | --- |
| Manifest e sole chiavi gestite | `workflow validates only managed resource keys and package filters`; allowlist Git e lettore del pacchetto domanda aggiornati. Riferimenti copiati dalla precedente baseline Git, senza preferenze personali. |
| Aggiunte/rimozioni, locali sconosciuti e idempotenza | `workflow replaces/removes managed keys and preserves unknown nested preferences without mutation`; integrazione launcher confronta inode/mtime e mantiene preferenze dopo riavvii. |
| Launcher, argomenti/esito e rifiuti | Integrazione launcher: exit 23, argomenti con spazi, SIGTERM, JSON invalidi, chiavi vietate, FIFO/link/directory/hard link, permessi insufficienti e assenza di perdita/diagnostica personale. |
| Transizione e Git pulito | Repository Git reale con vecchio settings forzatamente versionato, copia privata verificata, rimozione solo dall'indice, clone reale nuovo e rigenerazione; status/diff vuoti dopo avvio e preferenze. Procedura manuale sopra per i clone esistenti. |
| Futuri worker | `Herdr and manual launch preserve the configured worker arguments` esegue il wrapper invariato con hc e Pi sintetici, il launcher reale e il comando di AGENTS. Nessuna modifica ai processi generici, nessun worker reale. |
| Documentazione e lettori | README, AGENTS, design, provenienza, CHANGELOG e test di contratto leggono il manifest; backup e limiti espliciti. Temi non presenti nel manifest. |
| Prove isolate | 69 unit test in memoria; 38 test locali con filesystem/processi/Git separati dal gate; nessun settings personale letto. |
| Pi reale e pacchetto | 7 prove Pi offline di risorse/fiducia/riavvio, 1 prova installazione e test del pacchetto domanda; prova mirata anche con 1.5.2. Limiti RPC/UI sotto. |

Verifica del **2026-11-13**, Linux, Node.js **24.22.2**, npm **11.19.1**. `npm ci` da lockfile riuscito (0 vulnerabilità; npm segnala gli script Prisma non approvati, non necessari a queste prove). Suite di riferimento con Pi **1.5.0** selezionato tramite PATH temporaneo, senza cambiare l'installazione personale; la prova mirata di preferenze/riavvio passa anche con Pi **1.5.2**. `test:local`: 38 test; `test:pi`: 7 test; `test:pi-package`: 1 test, comprensivo dell'installazione isolata del riferimento pubblico e dei test del pacchetto. Gate rapido: lint, typecheck, 69 unit test in memoria e build.

Le prove sintetiche sono in `test/pi-workflow.test.ts`, `integration/local/pi-workflow.test.ts`, `integration/local/worker-command.test.ts` e `integration/pi-settings.test.ts`, oltre ai contratti aggiornati di allowlist e pacchetto domanda. Coprono validazione, rimozioni, preferenze future/annidate, idempotenza senza cambio inode/mtime, transizione da file versionato, backup privato, Git reale pulito, argomenti/esiti, errori e destinazioni non sicure. Pi offline carica risorse condivise sintetiche con fiducia e conserva preferenze con directory agente coincidente; le altre prove di fiducia restano separate. La prova RPC invia una richiesta alla volta e osserva il cambio di modello/thinking in memoria; in Pi 1.5.x `set_model` e `set_thinking_level` RPC sono transitori, non salvano i default. Per il riavvio le preferenze sintetiche vengono salvate esplicitamente nel settings locale e Pi reale ne verifica modello e override thinking attivi: non si rivendica una prova del selettore interattivo di modello o di ogni preferenza UI. Nessuna prova legge impostazioni o credenziali personali, invoca un modello o dimostra il comportamento di Herdr reale. File/processi/Git/Pi/rete restano nelle suite separate, mai nei test unitari in memoria.
