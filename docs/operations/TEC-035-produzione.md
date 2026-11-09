# TEC-035 — Installazione e aggiornamento della produzione

Procedura manuale per `jarvis`. Sul server non c'è il codice del progetto: restano Docker 29 o successivo, i volumi, le immagini e la directory privata `/opt/agent-pilates-prod`. Ogni comando viene dall'immagine `ops` del commit scelto e parte solo se lanciato dall'operatore. La CI pubblica le immagini ma non contatta il server.

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

`init` crea `prod.env` (porte `55433` e `18190`, solo loopback), le directory e i segreti interni, senza sovrascrivere quelli presenti. Elenca poi i file da fornire in `secrets/`, con permessi `0600`: `openrouter-key`, `whatsapp-access-token`, `whatsapp-app-secret`, `whatsapp-verify-token`, `whatsapp-allowed-users`, `whatsapp-home-channel`, `whatsapp-phone-number-id`. Non inserire valori reali in comandi, chat o log. Conservare a parte, in forma cifrata, una copia di `secrets/` e `prod.env`: il backup non li include.

```bash
ops install "$COMMIT"
```

`install` rifiuta un progetto che ha già volumi. L'esito non verifica Meta, OpenRouter o la raggiungibilità pubblica.

## Aggiornamento

```bash
OPS_COMMIT=$COMMIT
ops update "$COMMIT"
```

Il comando scarica prima le immagini: se mancano, si ferma senza toccare il servizio. Poi arresta gateway e broker, esegue il backup quiescente in `backups/`, applica le migrazioni, ricrea i servizi e attende gli healthcheck. Se un passaggio fallisce, riporta l'errore, lascia gateway e broker fermi e non elimina volumi. I turni in corso sono interrotti.

## Ritorno alla versione precedente

Le migrazioni vanno solo avanti: si riparte da un backup e si perdono i dati successivi. Usare l'immagine `ops` del commit precedente, che compare anche nel nome del backup.

```bash
OPS_COMMIT=<sha-precedente>
ops rollback /opt/agent-pilates-prod/backups/<backup> "$OPS_COMMIT"
```

Il backup viene ripristinato in volumi nuovi, registrati in `state/volume-prefix`; i volumi precedenti restano sul disco per confronto e vanno rimossi solo intenzionalmente. Usare solo backup fidati. Prima di riesporre il gateway valgono le cautele anti-replay di [TEC-005](TEC-005-continuita.md#ripristino-in-isolamento).

## Backup

I backup contengono dati sensibili. Il filesystem di `jarvis` è cifrato con LUKS, ma è lo stesso disco della produzione: serve una copia indipendente su destinazione cifrata esterna, verificata periodicamente con un ripristino.

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

Limiti: non sono stati provati Meta, OpenRouter con chiave reale o il tunnel pubblico, né un guasto durante le migrazioni. L'installazione reale di `agent-pilates-prod` è parte di TEC-036.
