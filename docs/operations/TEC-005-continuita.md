# TEC-005 — Procedura operativa e recupero

**Stato:** procedura e prove operative documentate, con i limiti descritti in `TEC-005-prove-preliminari.md`. L'unica prova pubblica temporanea autorizzata è conclusa; l'audit completo del proxy resta nel debito TEC-008. Questo documento non dichiara l'accettazione privacy della release e non autorizza l'uso continuativo.

## Prerequisiti e sicurezza

- Server Linux predisposto con Docker Compose, Bash, `sha256sum`, `find`, `grep`, `tar` e un endpoint HTTPS già configurato. Provisioning, DNS e certificati non sono inclusi. La migrazione containerizzata usa la rete host Linux e non è destinata a Docker Desktop.
- Accesso operatore al daemon Docker, equivalente a privilegi elevati sull'host; non rendere il socket Docker disponibile a Hermes. Il repository deve provenire da un commit verificato: fissare il commit in ogni installazione e aggiornamento, non usare tag mobili. Hermes, PostgreSQL e l'immagine di migrazione sono fissati per digest; npm usa il lockfile.
- Directory dei segreti esterna alle release, privata (`0700`, file `0600`), con `db-admin`, `db-migrator`, `db-agent` e i file Meta/OpenRouter descritti nel [README](../../README.md). Non inserire valori reali in Git, shell history, comandi, chat o log. Conservare separatamente e in forma cifrata i segreti e la configurazione non segreta: il backup dati qui descritto **non** li include. La password amministrativa originale non può essere rigenerata semplicemente cancellando il file su un database già inizializzato.
- Usare un progetto Compose esplicito, dedicato e un solo operatore alla volta; riservare i nomi dei progetti e dei volumi per evitare corse con altri processi. Non interrompere o rimuovere risorse di altri progetti. Non usare `docker compose down --volumes` sul progetto di produzione.
- **REQ-NFR-004:** non avviare lo streaming remoto dei log del tunnel Cloudflare condiviso, né dal dashboard Live logs né tramite `cloudflared tail` o strumenti equivalenti. È un divieto operativo, non un blocco tecnico; non garantisce la sicurezza degli altri log.
- L'operatore ha dichiarato che non sono configurate esportazioni Cloudflare e che non verranno configurate. Questa scelta non disabilita necessariamente la conservazione di eventi da parte di Cloudflare: verificare separatamente i dataset, i campi raccolti e gli altri sistemi di log.
- Le richieste di verifica possono contenere token nell'URL. Prima di esporre il webhook o interromperne l'origine, verificare le mitigazioni disponibili del proxy e dei sistemi esterni, anche durante gli errori; non pubblicare `/health`. Il filtro locale documentato in `TEC-005-prove-preliminari.md` non dimostra l'assenza di ogni fuga. L'operatore ha accettato temporaneamente il rischio residuo solo per una prova controllata; se si rileva un'esposizione, interrompere la prova e coordinare la rotazione dei segreti coinvolti.

## Installazione intenzionale

1. Disporre il contenuto del commit scelto in una directory privata; conservare il riferimento al commit e il precedente artefatto per eventuale recupero. Usare `.env.example` come riferimento per sole opzioni non segrete e fornire i segreti nell'apposita directory esterna. Per una nuova installazione creare password indipendenti e casuali per i tre ruoli; per Meta usare il verify token effettivamente configurato nell'app. Non sovrascrivere segreti esistenti.
2. Nella directory del commit, impostare esplicitamente le opzioni non segrete. Sostituire i segnaposto con i valori dell'ambiente; la porta del webhook deve coincidere con il proxy già predisposto.

   ```bash
   export SECRETS_DIR=/percorso/privato/segreti
   export POSTGRES_PORT=55432
   export WHATSAPP_WEBHOOK_PORT=18090
   export WHATSAPP_WEBHOOK_PATH=/whatsapp/webhook
   PROJECT=agent-pilates-v010
   docker compose -p "$PROJECT" up -d --wait postgres
   docker compose -p "$PROJECT" run --rm db-bootstrap
   bash scripts/migrate-docker.sh
   ```

   `scripts/migrate-docker.sh` non legge `.env`: le variabili `SECRETS_DIR` e `POSTGRES_PORT` vanno esportate esplicitamente. Il bootstrap e la migrazione usano credenziali separate, mai montate nel container dell'agente.
3. Solo dopo i controlli e con autorizzazione esplicita, avviare il gateway intenzionalmente con `docker compose -p "$PROJECT" up -d --build --wait hermes`. Per la prova temporanea autorizzata applicare i limiti di REQ-NFR-002, verificare percorso HTTPS e segreti, e fermare il gateway alla conclusione. Verificare stato e salute con `docker compose -p "$PROJECT" ps`. Una prova reale Meta/OpenRouter richiede i servizi esterni e l'interlocutore autorizzato; non riportare messaggi, numeri o token nei risultati.

## Backup quiescente

Il backup contiene il dump PostgreSQL e **tutto** il volume persistente Hermes, inclusi SQLite e conversazioni: è sensibile. Usare una destinazione cifrata, con copia indipendente dall'host e controllo degli accessi; gli script creano directory `0700` e file privati ma **non verificano né forniscono la cifratura**. Le somme SHA-256 rilevano corruzione accidentale, non autenticità o manomissione. Conservare separatamente segreti, configurazione e commit usato.

Fermare Hermes e tutti gli altri eventuali scrittori; mantenere il controllo esclusivo del progetto per tutta la durata del backup. La sola verifica dello stato prima e dopo la copia non impedisce ad altri operatori di riavviarlo temporaneamente. La fermata può interrompere il webhook: la protezione dei log durante il 502 è un prerequisito.

```bash
export SECRETS_DIR=/percorso/privato/segreti
PROJECT=agent-pilates-v010
BACKUP=/percorso/cifrato/backup-nuovo

docker compose -p "$PROJECT" stop hermes
bash scripts/backup.sh "$PROJECT" "$BACKUP"
```

La directory `BACKUP` deve essere nuova e il suo genitore deve esistere. Lo script rifiuta un gateway in esecuzione, un database non sano e l'assenza del volume Hermes; non ferma né riavvia servizi. Un'interruzione può lasciare una directory incompleta: non usarla per il ripristino. Il file `COMPLETE` viene scritto soltanto alla fine. Dopo aver verificato l'esito, l'operatore decide se riavviare Hermes, solo se sono soddisfatti i prerequisiti di sicurezza.

## Ripristino in isolamento

Usare **solo backup fidati**: un dump PostgreSQL può contenere SQL eseguibile e un archivio può contenere file ostili. Le somme di controllo non sono una firma. Il ripristino rifiuta un progetto o nomi di volumi/rete già esistenti, verifica il manifest e non sovrascrive intenzionalmente i dati di produzione. Richiede nomi riservati e accesso esclusivo: i controlli non sono una transazione atomica contro altri processi Docker.

```bash
export SECRETS_DIR=/percorso/privato/segreti-di-ripristino
RESTORE=pilates-ripristino-prova
BACKUP=/percorso/cifrato/backup-verificato
bash scripts/restore.sh "$RESTORE" "$BACKUP"
```

La directory dei segreti di ripristino deve essere assoluta e privata e contenere i tre segreti database. Lo script avvia un PostgreSQL **nuovo** con porta loopback effimera, crea i ruoli, ripristina il dump e il volume Hermes; **non avvia Hermes**. Se fallisce dopo la creazione, lascia le risorse del nuovo progetto per l'ispezione: non rimuoverle senza identificarle. Non indicare mai un progetto di produzione esistente come destinazione.

Verificare il database ripristinato con controlli appropriati, confrontando dati o conteggi attesi senza stamparne il contenuto sensibile. Per controllare l'integrità SQLite senza montare segreti o aprire la rete, usare l'immagine Hermes fissata e operare su una copia temporanea dello storage:

```bash
HERMES_IMAGE='nousresearch/hermes-agent:v0.22.7@sha256:e6d81ae52ebf6a43efa529701405509f20054ba818f179ddd748bed4f8af584c'
docker run --rm --network none --read-only --tmpfs /tmp:mode=1777 \
  --cap-drop ALL --cap-add DAC_OVERRIDE \
  --mount "type=volume,src=${RESTORE}_hermes_data,dst=/data,readonly" \
  --entrypoint /opt/hermes/.venv/bin/python "$HERMES_IMAGE" -c \
  'import pathlib,shutil,sqlite3; p=pathlib.Path("/tmp/state"); p.mkdir(); [shutil.copyfile(f,p/f.name) for f in pathlib.Path("/data").glob("state.db*") if f.is_file()]; d=sqlite3.connect(f"file:{p}/state.db?mode=rw",uri=True); assert d.execute("PRAGMA integrity_check").fetchone()[0]=="ok"; d.close(); print("SQLite integrity_check: ok")'
```

Il comando deve fallire se `state.db` manca o non è integro. Verificare anche i privilegi PostgreSQL sul database reale. Il passaggio di un ripristino alla produzione è un'operazione separata e intenzionale: conservare l'ambiente precedente e il backup, pianificare l'interruzione, verificare le porte e le credenziali, e non esporre Hermes finché privacy e prove non sono soddisfatte. Non cancellare il progetto precedente per far posto al ripristino.

## Aggiornamento e osservabilità

Prima di aggiornare: fermare gli scrittori, eseguire il backup e provarne il ripristino; registrare commit e immagini precedenti. Preparare una directory separata dal commit nuovo e riutilizzare intenzionalmente progetto, volumi e segreti esterni. Rieseguire bootstrap e migrazioni con credenziali dedicate, quindi avviare Hermes solo dopo i controlli. Verificare dati, stato e disponibilità dopo riavvio e aggiornamento. Un cambio di versione **major** PostgreSQL richiede una procedura di migrazione dati dedicata: non avviare una nuova major sul vecchio volume. Il rollback di uno schema migrato non equivale a cambiare immagine; usare un ripristino verificato in un progetto nuovo.

Dopo il backup e la verifica del ripristino, nella directory del nuovo snapshot e con `PROJECT`, `SECRETS_DIR` e `POSTGRES_PORT` esportati intenzionalmente con gli stessi valori dell'installazione, controllare prima il progetto indicato da `docker compose -p "$PROJECT" ps` e la configurazione non segreta. Poi, se la versione è compatibile e Hermes e gli altri scrittori restano fermi:

```bash
docker compose -p "$PROJECT" config --quiet
docker compose -p "$PROJECT" build hermes
docker compose -p "$PROJECT" up -d --wait postgres
docker compose -p "$PROJECT" run --rm -T --interactive=false db-bootstrap
bash scripts/migrate-docker.sh
docker compose -p "$PROJECT" ps
```

L'avvio o la ricreazione di PostgreSQL può interrompere connessioni esistenti. Se uno dei passaggi fallisce, fermarsi e valutare il ripristino verificato, senza riavviare Hermes. Solo dopo i controlli di sicurezza e l'autorizzazione all'attivazione, l'operatore può avviare il gateway con `docker compose -p "$PROJECT" up -d --no-build --wait hermes` e verificarne disponibilità e dati.

`npm run test:upgrade` esercita con servizi in rete isolata e dati sintetici il percorso PostgreSQL 17.9→17.10 e Hermes 0.22.6→0.22.7. Questo non garantisce la compatibilità di altre versioni e non sostituisce la prova dell'aggiornamento in produzione.

`docker compose -p "$PROJECT" ps` e gli healthcheck permettono di verificare stato e disponibilità senza stampare il corpo di `/health`, che contiene un identificativo sensibile. `docker compose -p "$PROJECT" logs --tail=20 hermes postgres` consulta il log Docker `local`, limitato dagli entrypoint agli eventi fissi `hermes_launch`, `hermes_preflight_failed` e `postgres_launch`, con rotazione di tre file da 1 MB. I processi reali non ereditano il descrittore di log: il loro output è soppresso. L'evento di avvio non dimostra lo stato sano e i dettagli degli errori non sono disponibili; usare anche `ps` e gli healthcheck. I test sintetici non provano l'assenza di ogni possibile fuga. Gli eventi Docker fissi sono stati verificati anche durante le prove operative specifiche; l'audit completo dei log del proxy resta in TEC-008. Non aggirare le protezioni né attivare streaming remoto dei log del tunnel.
