# BUG-005 — Prove del bootstrap dei ruoli

Esiti del 2026-11-19 sul branch `fix/BUG-005-bootstrap-ruoli-inizializzazione-postgresql`, commit `e906741` (correzione) più i soli aggiornamenti documentali. Host di sviluppo con 12 CPU e Docker 29.9.3; solo dati sintetici e progetti Compose con nomi casuali. Nello stesso periodo un altro worker usava Docker in parallelo con i propri progetti, senza container condivisi.

## Correzione

- Healthcheck di `postgres` in `compose.yaml`: `pg_isready -h 127.0.0.1 -U studio_admin -d studio`, uguale in sviluppo e produzione.
- Attesa di `scripts/start-local-core.mjs` con lo stesso controllo TCP.
- `db/bootstrap/bootstrap.sh`: al più 15 tentativi di `pg_isready` verso `postgres:5432`, a 1 s di distanza e con timeout di 2 s, prima di `roles.sql`; nessun output di `pg_isready` o `psql` nei log.

## Regressione

`integration/postgres-readiness.test.ts` (in `npm run test:db`) blocca l'entrypoint su un volume vuoto con uno script in `/docker-entrypoint-initdb.d`, mentre è attivo il server temporaneo che ascolta solo sul socket. Verifica che il controllo via socket risponda, che il healthcheck letto da `compose config` fallisca, che lo stato resti diverso da `healthy` per 8 s e che `db-bootstrap` avviato in quel momento attenda e poi riesca dopo il rilascio.

| Healthcheck | Esito |
| --- | --- |
| precedente (`pg_isready -U studio_admin -d studio`) | fallisce: «configured healthcheck must fail on the temporary server» |
| corretto (`-h 127.0.0.1`) | passa |

La finestra è riprodotta in modo deterministico dal blocco di initdb; non serve una verifica manuale.

## Suite in parallelo

Tre giri, ciascuno con `test:author` (file eseguiti in parallelo, concorrenza predefinita di `node --test`), `test:db`, `test:hermes` e `test:upgrade` avviati contemporaneamente:

| Giro | test:author | test:db | test:hermes | test:upgrade | «Database role setup failed.» |
| --- | --- | --- | --- | --- | --- |
| 1 | 6/6 | 3/3 | 1/1 | 1/1 | assente |
| 2 | 6/6 | 3/3 | 1/1 | 1/1 | assente |
| 3 | 6/6 | 3/3 | 1/1 | 1/1 | assente |

Eseguite poi in sequenza: `test:start` 1/1 (avvio locale), `test:images` 2/2 (backup a caldo e ripristino su volume vuoto), `test:local` 56/56 e `test:compaction` 1/1. Il ripristino quiescente su volumi nuovi è coperto da `test:hermes`. Nessun fallimento osservato.

## Limiti

Tre giri non dimostrano l'assenza dell'intermittenza, che prima si manifestava in modo occasionale; la causa individuata è però esclusa dalla regressione. La prova su `jarvis` non è stata eseguita: l'aggiornamento applica il nuovo healthcheck ricreando PostgreSQL con `compose.yaml` dell'immagine `ops`, senza passi aggiuntivi. La CI del branch (run 44423248171, commit della correzione e dei documenti) ha superato quality gate e tutte le suite di integrazione, comprese `test:pi`, `test:pi-package` e `test:claude`, non eseguite in locale.
