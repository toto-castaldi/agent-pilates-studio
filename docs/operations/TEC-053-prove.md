# TEC-053 — Riavvio reale di jarvis

Verifica del 2026-11-25 su `jarvis`, eseguita a mano dall'operatore secondo la [procedura](TEC-035-produzione.md#verifica-dopo-un-riavvio); nessun agente ha aggiornato la produzione, eseguito il riavvio o avuto accesso al server. L'output è stato trasmesso dall'operatore; qui sono riportati solo release, identificativi dei container, versioni e stati, senza dati personali, numeri o credenziali.

## Ambiente

- Release: `ce55d7f29cb6e9c6dd036c25ed927ad7597ffb3b` (merge di TEC-054 su `main`, ultimo run `push` riuscito di `ci.yml`), che contiene la correzione di BUG-004 (`e40101c`).
- Docker 29.10.0 (build `fdd4b8e`); containerd v2.4.2 (`b7a25261e029d68978bbf290df0a62fc819b3c51`).

## Aggiornamento

`~/update-agent-pilates.sh ce55d7f29cb6e9c6dd036c25ed927ad7597ffb3b`: scaricata l'immagine `ops` del commit, poi pull delle immagini, arresto di gateway e broker, backup quiescente della release precedente, avvio di PostgreSQL, migrazioni, avvio di broker e gateway; esito «Updated and healthy», con backup in `backups/20261125T080752Z-…`.

## Prima del riavvio

`state/release`: `ce55d7f29cb6e9c6dd036c25ed927ad7597ffb3b`.

| Servizio | Container | Immagine | Stato |
| --- | --- | --- | --- |
| `author-broker` | `5812713e8fd2` | `hermes:ce55d7f…` | Up 35 seconds (healthy) |
| `hermes` | `5dcd64cf17da` | `hermes:ce55d7f…` | Up 30 seconds (healthy) |
| `postgres` | `ebdb51fcabca` | `postgres:ce55d7f…` | Up 40 seconds (healthy) |

## Dopo il riavvio

Dopo `sudo reboot` e il nuovo accesso, senza comandi Docker che modificano lo stato: `state/release` è ancora `ce55d7f29cb6e9c6dd036c25ed927ad7597ffb3b`.

| Servizio | Container | Immagine | Stato |
| --- | --- | --- | --- |
| `author-broker` | `5812713e8fd2` | `hermes:ce55d7f…` | Up About a minute (healthy) |
| `hermes` | `5dcd64cf17da` | `hermes:ce55d7f…` | Up About a minute (healthy) |
| `postgres` | `ebdb51fcabca` | `postgres:ce55d7f…` | Up About a minute (healthy) |

`docker inspect` del gateway: `running healthy 0` con errore vuoto. Gli stessi container, non ricreati, sono stati riavviati da Docker con `unless-stopped` sulla stessa release e con gli stessi volumi, senza intervento dell'operatore; il ripristino manuale non è servito.

Dopo il riavvio l'agente ha risposto a un messaggio WhatsApp di prova dell'operatore (contenuto non registrato).

## Esito

Riuscito: dopo un riavvio reale di `jarvis` PostgreSQL, broker e gateway ripartono healthy senza intervento, sulla stessa release e con gli stessi container e volumi, e l'agente risponde (REQ-OPS-002). Il criterio del riavvio reale separato da BUG-004 è soddisfatto; non è stato necessario aprire un bug.
