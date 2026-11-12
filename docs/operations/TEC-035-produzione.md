# TEC-035 — Installazione e aggiornamento della produzione

Procedura manuale per `jarvis`. Sul server non c'è un checkout applicativo: restano Docker 29 o successivo, i volumi, le immagini e la directory privata `/opt/agent-pilates-prod`; è ammesso il solo launcher shell minimale descritto sotto. Ogni comando viene dall'immagine `ops` del commit scelto e parte solo se lanciato dall'operatore. La CI pubblica le immagini ma non contatta il server.

**REQ-NFR-004:** non avviare lo streaming remoto dei log del tunnel Cloudflare condiviso, né dal dashboard Live logs né con `cloudflared tail` o strumenti equivalenti. Non usare `docker compose down --volumes` sul progetto di produzione.

## Comando

Scegliere un commit di `main` la cui CI abbia pubblicato le immagini:

```bash
COMMIT=<sha-completo>
ops() {
  docker run --rm \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v /opt/agent-pilates-prod:/opt/agent-pilates-prod \
    "ghcr.io/toto-castaldi/agent-pilates-studio/ops:$OPS_COMMIT" "$@"
}
OPS_COMMIT=$COMMIT
```

La directory va montata allo stesso percorso dell'host, perché i percorsi dei segreti sono risolti dal Docker del server. Il socket Docker è dato solo a questo container, per la durata del comando, e mai a Hermes. Il commit indicato deve coincidere con quello dell'immagine `ops`: `compose.yaml` e immagini vengono così dalla stessa versione. Le immagini sono pubbliche e non serve un token.

## Prima installazione

```bash
sudo install -d -m 0700 -o "$USER" -g "$USER" /opt/agent-pilates-prod
ops init
```

`init` crea `prod.env` (porte `55433` e `18190`, solo loopback), le directory e i segreti interni, senza sovrascrivere quelli presenti. Crea inoltre `secrets/whatsapp-teacher-links` privato con `[]` se manca. Elenca poi i file da fornire in `secrets/`, con permessi `0600`: `openrouter-key`, `whatsapp-access-token`, `whatsapp-app-secret`, `whatsapp-verify-token`, `whatsapp-allowed-users`, `whatsapp-home-channel`, `whatsapp-phone-number-id`. Non inserire valori reali in comandi, chat o log. Conservare a parte, in forma cifrata, una copia di `secrets/` e `prod.env`: il backup non li include.

```bash
ops install "$COMMIT"
```

`install` rifiuta un progetto che ha già volumi. L'esito non verifica Meta, OpenRouter o la raggiungibilità pubblica.

## Collegamenti degli insegnanti

Facoltativamente, modificare privatamente `secrets/whatsapp-teacher-links` con un editor locale: contiene un array JSON nel formato di `WHATSAPP_TEACHER_LINKS` in `.env.example`, senza le virgolette esterne della riga `.env`. Ogni numero deve essere in `whatsapp-allowed-users` e può comparire una sola volta; nome e cognome devono corrispondere all'anagrafica, senza distinzione di maiuscole. Più numeri possono indicare lo stesso insegnante. `[]` disabilita tutti i collegamenti. La configurazione non crea insegnanti né cambia i permessi; se l'insegnante non esiste, l'agente chiede il nome.

Per applicare una modifica usare `ops update "$COMMIT"`: il comando interrompe i turni, salva un backup e ricrea broker e gateway. Il broker valida il file all'avvio senza mostrare i valori; se non è valido l'aggiornamento fallisce e lascia i servizi fermi. Correggere privatamente e ripetere. Le versioni di `ops` che includono US-011 creano il file vuoto se manca, anche per una directory di una versione precedente, ma non sovrascrivono un mapping esistente; un rollback usa l'immagine `ops` della versione scelta, che può non conoscere il file. Il file è montato solo nel broker e va conservato con gli altri segreti; backup e rollback dei volumi non ripristinano la configurazione.

## Aggiornamento

### Scelta del commit da GitHub

Con GitHub CLI già configurata, sul PC dell'operatore oppure su `jarvis`, il tip corrente di `main` si legge così:

```bash
gh api repos/toto-castaldi/agent-pilates-studio/commits/main --jq .sha
```

**Non è necessariamente installabile:** la CI o la pubblicazione delle immagini possono essere ancora in corso o fallite. Per ottenere invece l'ultimo commit con CI e pubblicazione riuscite, senza assumere che coincidano con il tip:

```bash
COMMIT=$(gh run list \
  --repo toto-castaldi/agent-pilates-studio \
  --workflow ci.yml --branch main --event push \
  --status success --limit 1 \
  --json headSha --jq '.[0].headSha // empty') &&
[[ $COMMIT =~ ^[0-9a-f]{40}$ ]] && printf '%s\n' "$COMMIT"
```

Se il comando fallisce o non stampa uno SHA, fermarsi: non scegliere un ripiego automatico. Il filtro `push` è necessario: il workflow eseguito manualmente o su pull request non pubblica le immagini. Nel workflow del progetto un run riuscito su push di `main` comprende entrambi i job `quality` e `publish`; verificarne l'esito su GitHub prima di usare lo SHA. La scelta resta esplicita e separata dal launcher: non viene fatta una ricerca durante l'aggiornamento. GitHub CLI serve solo per questa consultazione, non al launcher; non copiare credenziali GitHub o `.env` sul server.

### Installazione del launcher

Il file versionato `scripts/update-agent-pilates.sh` si copia come `~/update-agent-pilates.sh` su `jarvis`. Dal clone verificato sul PC, questa sequenza conserva una copia privata del precedente e sostituisce il file solo dopo il controllo di sintassi:

```bash
REMOTE_SCRIPT=$(ssh jarvis 'umask 077; mktemp "$HOME/.update-agent-pilates.XXXXXXXX"') &&
scp scripts/update-agent-pilates.sh "jarvis:$REMOTE_SCRIPT" &&
ssh jarvis bash -s -- "$REMOTE_SCRIPT" <<'REMOTE'
set -euo pipefail
candidate=$1
target="$HOME/update-agent-pilates.sh"
bash -n "$candidate"
if [[ -e $target ]]; then
  backup=$(mktemp "$HOME/update-agent-pilates.sh.bak.XXXXXXXX")
  cp -- "$target" "$backup"
fi
chmod 0700 "$candidate"
mv -T -- "$candidate" "$target"
"$target" --help
REMOTE
```

La copia di sicurezza non viene eliminata. Copiare solo questo launcher, non il repository, i segreti o la configurazione locale. L'installazione e `--help` non invocano Docker e non aggiornano i servizi.

### Esecuzione manuale

Dopo aver scelto e controllato lo SHA pubblicato, su `jarvis`:

```bash
~/update-agent-pilates.sh <sha-completo-pubblicato>
```

Se la selezione di `COMMIT` è stata fatta nella stessa shell di `jarvis`, si può passare `"$COMMIT"` al posto del segnaposto. È obbligatorio un solo SHA completo di 40 caratteri esadecimali minuscoli: argomenti mancanti, abbreviazioni, branch, `latest` e argomenti aggiuntivi sono rifiutati prima di Docker. Non c'è un commit predefinito e il launcher non controlla autonomamente GitHub: richiamarlo significa confermare l'aggiornamento, che **interrompe i turni in corso**. L'immagine `ops` e il suo argomento `update` usano sempre lo stesso SHA. Il launcher propaga il codice di uscita e monta solo socket Docker e directory di produzione con bind mount che richiedono sorgenti esistenti.

Resta equivalente la forma esplicita con la funzione `ops`:

```bash
OPS_COMMIT=$COMMIT
ops update "$COMMIT"
```

In entrambe le forme il comando scarica prima le immagini: se mancano, si ferma senza toccare il servizio. Poi arresta gateway e broker, esegue il backup quiescente in `backups/`, applica le migrazioni, ricrea i servizi e attende gli healthcheck. Se un passaggio fallisce, riporta l'errore, lascia gateway e broker fermi e non elimina volumi. I turni in corso sono interrotti.

## Ritorno alla versione precedente

Le migrazioni vanno solo avanti: si riparte da un backup e si perdono i dati successivi. Usare l'immagine `ops` del commit precedente, che compare anche nel nome del backup.

```bash
OPS_COMMIT=<sha-precedente>
ops rollback /opt/agent-pilates-prod/backups/<backup> "$OPS_COMMIT"
```

Il backup viene ripristinato in volumi nuovi, registrati in `state/volume-prefix`; i volumi precedenti restano sul disco per confronto e vanno rimossi solo intenzionalmente. Usare solo backup fidati. Prima di riesporre il gateway valgono le cautele anti-replay di [TEC-005](TEC-005-continuita.md#ripristino-in-isolamento).

## Backup

I backup contengono dati sensibili. Il filesystem di `jarvis` è cifrato con LUKS, ma è lo stesso disco della produzione: serve una copia indipendente su destinazione cifrata esterna, verificata periodicamente con un ripristino. Il backup quiescente dell'aggiornamento contiene PostgreSQL **e** tutto il volume Hermes e resta quello da usare per il rollback; la copia a caldo qui sotto non lo sostituisce.

### Copia a caldo del solo database

Dopo che la CI ha pubblicato un commit che include TEC-039, scegliere il suo SHA completo e usare la funzione `ops` definita sopra:

```bash
COMMIT=<sha-completo-pubblicato>
OPS_COMMIT=$COMMIT
ops backup-hot "$COMMIT"
```

Il commit indicato deve coincidere con l'immagine `ops` scelta, non necessariamente con la release già in esecuzione: la nuova immagine può ottenere la copia senza aggiornare o ricreare la produzione. Se non è già presente, `docker run` può prima scaricare l'immagine `ops` scelta; l'operazione non scarica le immagini dei servizi. Il comando legge la configurazione non segreta e usa `pg_dump -Fc` nel PostgreSQL sano del progetto, senza fermare o ricreare gateway e broker né avviare servizi. Il dump usa una singola snapshot coerente dei dati transazionali; le sequenze PostgreSQL non sono transazionali e possono avanzare durante la copia. Come nel backup quiescente, i dati effimeri di `studio_private.author_context` sono esclusi e le impronte anti-replay sono incluse. Il volume e la cronologia Hermes, i segreti e la configurazione non sono inclusi. Una modifica concorrente dello schema può fare attendere o fallire il dump: usare un solo operatore ed evitare operazioni DDL durante la copia.

La directory nuova indicata nell'output è `/opt/agent-pilates-prod/backups/hot-<data-UTC>-<commit-ops>-<suffisso>/`, con permessi `0700` e file `0600`: `postgres.dump`, `SHA256SUMS` e `COMPLETE` contenente `hot-postgres-v1`. Il suffisso evita collisioni, anche tra copie nello stesso secondo. Un errore non è un successo: se la directory è già stata creata resta incompleta, con `INCOMPLETE` se è stato possibile crearlo e senza `COMPLETE`; anche una directory priva di entrambi i marcatori è incompleta. Può contenere dati parziali sensibili: non usarla e rimuoverla solo intenzionalmente. Un errore prima della creazione non lascia alcuna directory. Gli output grezzi di Docker, PostgreSQL e checksum sono soppressi.

La copia a caldo è riconoscibile e non viene accettata come backup quiescente da `ops rollback` o `restore.sh`: mancano l'archivio Hermes e il relativo checksum e il marcatore ha un valore diverso. Un `ops` che include TEC-039 esegue il controllo **prima** di fermare la produzione. Le immagini `ops` precedenti possono invece fermare i servizi prima di rifiutare un backup non valido: non indicare mai una copia a caldo al rollback, anche quando si usa l'immagine della release precedente.

### Copia sul PC e ripristino per consultazione

Usare solo un backup completo e fidato. I checksum rilevano corruzione, **non** autenticità; un dump può contenere SQL eseguibile. SSH protegge il trasferimento, non i dati a riposo. Il PC deve essere controllato e cifrato, inclusi sia la directory di destinazione sia lo storage dei volumi Docker; limitare l'accesso e non caricare il dump su servizi terzi. Sul PC, con Bash, SSH, `sha256sum` e Docker, sostituire il nome con quello ricevuto dal comando; creare una destinazione nuova:

```bash
BACKUP=<nome-hot-dall-output>
DEST="$HOME/consultazione-pilates"
(
  set -e
  umask 077
  mkdir -m 700 "$DEST"
  scp -r "jarvis:/opt/agent-pilates-prod/backups/$BACKUP" "$DEST/"
  cd "$DEST/$BACKUP"
  test "$(cat COMPLETE)" = hot-postgres-v1
  test "$(wc -l < SHA256SUMS)" -eq 1
  LC_ALL=C grep -Eq '^[0-9a-f]{64}  postgres[.]dump$' SHA256SUMS
  sha256sum --check SHA256SUMS
)
```

Se la copia, il marcatore o il checksum falliscono, fermarsi: non ripristinare. Non riutilizzare directory esistenti o incomplete. La procedura seguente crea un PostgreSQL **nuovo e isolato**, senza rete e senza porte; la fiducia locale è accettabile solo dentro questo container temporaneo. Scegliere un nome di container nuovo: se esiste già, la creazione fallisce e la procedura non prosegue. Il comando usa l'immagine PostgreSQL 17.10 fissata; non monta segreti e disabilita il log Docker del container. La disponibilità va verificata via TCP su `127.0.0.1`, dentro il container: durante l'inizializzazione l'immagine avvia un server temporaneo che accetta solo socket Unix e poi si spegne. Un controllo senza `-h` può accettare quel server e far fallire il ripristino al riavvio (BUG-003). La rete resta disabilitata verso l'esterno. I messaggi grezzi di `pg_restore` sono soppressi perché possono contenere dati.

```bash
PG_CONTAINER=pilates-consultazione
PG_IMAGE='postgres:17.10@sha256:5f050f770b427fbd477edee6c3968a72e5c6be97e050a7e368b2b74a9494a285'
(
  set -e
  if ! (cd "$DEST/$BACKUP" && test "$(cat COMPLETE)" = hot-postgres-v1 &&
    test "$(wc -l < SHA256SUMS)" -eq 1 &&
    LC_ALL=C grep -Eq '^[0-9a-f]{64}  postgres[.]dump$' SHA256SUMS &&
    sha256sum --check --status SHA256SUMS) >/dev/null 2>&1; then
    echo 'Backup non verificato.' >&2; exit 1
  fi
  if ! docker run -d --name "$PG_CONTAINER" --network none --log-driver none \
    -e POSTGRES_HOST_AUTH_METHOD=trust "$PG_IMAGE" >/dev/null 2>&1; then
    echo 'Creazione del database isolato fallita.' >&2; exit 1
  fi
  for i in {1..60}; do
    docker exec "$PG_CONTAINER" pg_isready -h 127.0.0.1 -U postgres -d postgres >/dev/null 2>&1 && break
    sleep 1
  done
  if ! docker exec "$PG_CONTAINER" pg_isready -h 127.0.0.1 -U postgres -d postgres >/dev/null 2>&1; then
    echo 'Database isolato non disponibile.' >&2; exit 1
  fi
  if ! docker exec -i "$PG_CONTAINER" pg_restore --exit-on-error --no-owner --no-privileges \
    --no-password -U postgres -d postgres < "$DEST/$BACKUP/postgres.dump" >/dev/null 2>&1; then
    echo 'Ripristino fallito: il database parziale non va usato.' >&2; exit 1
  fi
  docker exec -it "$PG_CONTAINER" psql -X -U postgres -d postgres
)
```

La consultazione in `psql` può mostrare dati sensibili nel terminale e nella sua cronologia: proteggerli ed evitare copie, log e condivisioni. `--no-owner --no-privileges` non ricrea ruoli, proprietari e permessi di produzione: il risultato è per consultazione isolata, **non** un ambiente sicuro da esporre o collegare al gateway. Se il ripristino fallisce, il container parziale resta per ispezione e non va usato. Alla fine, verificato che il nome indichi proprio il container temporaneo creato sopra, eliminarlo con `docker rm -fv "$PG_CONTAINER"`; il comando elimina anche il suo volume anonimo, non quello di produzione. Gestire e rimuovere intenzionalmente anche la copia locale secondo le esigenze di conservazione; la cancellazione non garantisce la distruzione sicura su ogni supporto.

## Stato e diagnostica

```bash
docker compose -p agent-pilates-prod ps
```

Il comando va lanciato senza il file Compose solo per consultare lo stato. Non stampare il corpo di `/health`. Gli errori di `ops` sono messaggi fissi: l'output degli strumenti è soppresso per non esporre dati sensibili.

## Prova del 2026-11-09

Eseguita su `jarvis` con Docker 29.9.2, in un progetto temporaneo nella home, con dati sintetici, porte diverse da quelle di produzione e registry su loopback alimentato dalle immagini pubblicate su GHCR per il commit `bde1e6c`; la seconda versione era la stessa con una modifica sintetica a `SOUL.md`. Risultati positivi:

- `init`, con file di proprietà dell'operatore; installazione da vuoto e rifiuto di una seconda installazione;
- nessun bind mount oltre ai segreti, agente senza credenziali di migrazione né socket Docker, DDL dell'agente rifiutato su PostgreSQL reale, anche dopo il ritorno alla versione precedente;
- rifiuto di un commit non pubblicato, con gateway rimasto attivo, e di un'immagine `ops` di commit diverso;
- aggiornamento con backup, persistenza dei dati PostgreSQL e del volume Hermes anche dopo riavvio;
- ritorno alla versione precedente: dati del backup presenti, dati successivi assenti, file di release della versione precedente attivi, volumi precedenti conservati;
- nuovo aggiornamento e nuovo backup dopo il ritorno;
- nessun valore sintetico sensibile negli ultimi log del gateway.

Limiti: non sono stati provati Meta, OpenRouter con chiave reale o il tunnel pubblico, né un guasto durante le migrazioni. L'installazione reale di `agent-pilates-prod`, con Meta e tunnel, è descritta in [TEC-036](TEC-036-whatsapp-ambienti.md).

## Prova del backup a caldo — 2026-11-12

`npm run test:images` è passato su Docker 29.9.3 in un progetto Compose temporaneo, con PostgreSQL 17.10, gateway e broker reali, modello sostitutivo su rete interna e soli dati sintetici. L'immagine `ops` è stata costruita e lanciata con commit sintetico esplicito. Il test ha trattenuto un lock su una tabella finché `pg_dump` era in attesa, ha campionato per oltre 12 secondi salute, identità e riavvii dei due servizi durante la copia, poi ha confermato una modifica concorrente. Nel ripristino PostgreSQL isolato e inizialmente vuoto, con `pg_restore --no-owner --no-privileges`, compare il valore precedente della snapshot; sono presenti i dati applicativi e l'impronta anti-replay, ma non il contesto autore. Sono stati verificati formato custom, permessi, proprietà, checksum, assenza dell'archivio Hermes e rifiuto del rollback prima degli arresti; i due servizi sono risultati sani anche dopo.

`npm run test:local` inietta errori sintetici nei passaggi del comando e verifica marcatori, soppressione dell'output, commit e rifiuti; `npm run test:hermes` ha riprovato il backup e il ripristino quiescenti esistenti su PostgreSQL reale. La prova a caldo non ha usato `jarvis`, dati di produzione, Meta, OpenRouter o il tunnel; il campionamento degli healthcheck non dimostra la continuità di ogni richiesta esterna né l'assenza di tutti i guasti possibili.

## Correzione della disponibilità del ripristino — 2026-11-12

La [CI del merge di TEC-039](https://github.com/toto-castaldi/agent-pilates-studio/actions/runs/43210853015) è fallita durante `pg_restore`: il controllo via socket poteva accettare il server temporaneo dell'inizializzazione, poi arrestato dall'entrypoint. BUG-003 ha riprodotto in un container PostgreSQL isolato sia il falso positivo di `pg_isready` sia l'interruzione di un ripristino avviato contro quel server. Il nuovo controllo TCP rifiuta il server temporaneo e attende quello definitivo; il ripristino resta singolo e un suo errore continua a far fallire il test.

La regressione deterministica in `test:images` trattiene l'inizializzazione con uno script sintetico: fallisce sul controllo precedente, passa con `-h 127.0.0.1` e completa poi tutti i controlli del backup e dei servizi. Sono passati in locale il gate completo, `test:local` e `test:images`; la [CI del commit 8ca38e4](https://github.com/toto-castaldi/agent-pilates-studio/actions/runs/43218671914) ha completato con successo tutte le suite, incluse quelle PostgreSQL, Hermes, Pi, autore, compattazione, aggiornamento e avvio. La pubblicazione delle immagini è correttamente esclusa sul branch del bug. Le prove applicative non hanno usato produzione, dati reali, Meta, OpenRouter o il tunnel.

## Verifica del launcher parametrico — 2026-11-12

TEC-040 ha sostituito il launcher con commit cablato nella home di `jarvis`, conservando il precedente in `~/update-agent-pilates.sh.bak.QVjECoJj` con permessi `0600`. Il nuovo `~/update-agent-pilates.sh` ha permessi `0700`; checksum della copia uguale al file versionato, sintassi Bash e `--help` verificati. Non è stato invocato Docker né aggiornato alcun servizio.

I tre test del launcher in `test:local` usano solo un Docker sostitutivo: verificano argomenti mancanti, aggiuntivi e malformati, aiuto senza effetti, due SHA sintetici distinti, esatti argomenti e mount e propagazione di un codice di errore. Sono passati tutti i 27 test locali e il gate con 61 test unitari, lint, typecheck e build. La query GitHub della procedura è stata verificata separatamente in sola lettura; non è una prova di aggiornamento reale o di compatibilità delle future immagini.
