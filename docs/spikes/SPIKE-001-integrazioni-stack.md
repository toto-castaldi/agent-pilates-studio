# SPIKE-001 — Verifica delle integrazioni e stack locale completo

- **Date:** 2026-11-04
- **Outcome:** Partial — ricerca e realizzazione in corso; nessuna prova end-to-end esterna ancora eseguita.
- **Requirements:** REQ-DB-001, REQ-DB-002, REQ-AGENT-001, REQ-AGENT-002, REQ-WA-001, REQ-WA-002, REQ-NFR-002

## Questions

1. Come installare e fissare Hermes e collegarlo a OpenRouter?
2. Come usare le API WhatsApp Business e proteggere webhook, accessi e log?
3. Come permettere all'agente DML su PostgreSQL, escludendo DDL e credenziali di migrazione?
4. Quali prerequisiti, rischi, costi e prove restano?

## Findings

### 1. Hermes e OpenRouter

Hermes Agent è [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent). La release stabile `v0.22.7`, pubblicata il 2026-11-03, dispone dell'immagine `nousresearch/hermes-agent:v0.22.7`; il manifest rilevato il 2026-11-04 ha digest `sha256:e6d81ae52ebf6a43efa529701405509f20054ba818f179ddd748bed4f8af584c`. L'immagine è stata scaricata localmente; il gateway è stato avviato con configurazione e messaggi sintetici in una rete senza accesso esterno. Le prove reali con OpenRouter e Meta non sono ancora state eseguite. Il tag include la `v`: `0.22.7` senza prefisso non è presente.

La documentazione della release prevede la configurazione `OPENROUTER_API_KEY` e un modello selezionabile. Il catalogo pubblico `https://openrouter.ai/api/v1/models`, consultato il 2026-11-04 senza autenticazione, include `openai/gpt-6.1-terra`: il nome richiesto senza prefisso non è l'ID completo. Il catalogo non prova che l'account dell'operatore abbia accesso né che una richiesta riesca. Al momento della verifica il prezzo base pubblicato era 1 USD per milione di token in ingresso e 5 USD per milione in uscita; soglie e prezzi possono cambiare e vanno ricontrollati.

Hermes conserva le proprie sessioni e i messaggi in SQLite (`/opt/data/state.db` nel container), non in PostgreSQL. PostgreSQL è il database applicativo a cui l'agente deve accedere; non è verificata una sostituzione dello storage interno delle sessioni. Entrambi i dati persistenti richiedono protezione e, per la produzione, backup adeguati.

### 2. WhatsApp e sicurezza

La release documenta un adattatore nativo per le API ufficiali WhatsApp Business Cloud: webhook pubblico HTTPS, app Meta, identificativo del numero aziendale, access token, app secret, verify token e allowlist. Il codice della release verifica l'HMAC SHA-256 sul corpo originale e rifiuta richieste prive di app secret o con firma errata. La documentazione indica che l'allowlist vuota nega gli accessi; questo comportamento va verificato con test, inclusi ingressi non autorizzati e interattivi.

**Rischio e mitigazione:** il codice `plugins/platforms/whatsapp_cloud/adapter.py` della release registra il mittente in un avviso per interazioni non autorizzate. Una prova isolata senza rete esterna, con dati sintetici e webhook firmato, ha confermato che l'identificativo sintetico finisce sia nei log del container sia nei file di log Hermes. La configurazione nativa predefinita non è quindi conforme a REQ-NFR-002.

La configurazione del progetto conserva l'adattatore ufficiale ma sopprime stdout/stderr e logging Python del processo gateway prima dell'import di Hermes; i container Hermes e PostgreSQL usano il logging driver Docker `none`. `npm run test:hermes` verifica con l'immagine reale, dati sintetici e rete isolata handshake, firme assenti o errate, numeri autorizzati e non autorizzati, mancato ingresso nella sessione per i non autorizzati e assenza dei valori sintetici nei file di log Hermes. La prova non dimostra l'assenza di ogni possibile fuga. La mitigazione impedisce la diagnostica dettagliata tramite log: TEC-005 dovrà definire una soluzione sicura. L'endpoint `/health` riporta anche l'ID del numero aziendale ed è non autenticato: non esporlo pubblicamente.

Per le risposte libere WhatsApp si applica la finestra di 24 ore dall'ultimo messaggio dell'interlocutore. L'adattatore documenta il supporto ai messaggi diretti, non ai gruppi, e non implementa ancora i template per risposte fuori finestra. Verificare prerequisiti, autorizzazioni e costi Meta con l'app effettiva.

### 3. PostgreSQL e privilegi

L'immagine Hermes esaminata non contiene `psql`, `psycopg` né `psycopg2`; contiene `asyncpg`. Su indicazione dell'utente, l'accesso previsto è diretto tramite un piccolo plugin nativo Hermes che accetta una query SQL e si collega come `studio_agent`, senza MCP. La sola presenza del driver o del plugin non dimostra che l'accesso sia sicuro: occorre provarlo tramite Hermes senza rendere disponibili all'agente le credenziali di migrazione o amministrazione.

È stata realizzata una base PostgreSQL locale con ruoli distinti per amministrazione, migrazione e agente. La migrazione Prisma crea lo schema applicativo `app`, sul quale l'agente riceve DML tramite privilegi predefiniti; i metadati di Prisma restano in `public`, non accessibile all'agente. La creazione di database, schemi, tabelle e tabelle temporanee è negata al ruolo agente; anche l'esecuzione predefinita delle nuove funzioni viene revocata a `PUBLIC`.

Il test `npm run test:db` ha applicato migrazioni su un PostgreSQL reale isolato, sia iniziali sia su schema esistente, e verificato DML, rifiuto del DDL sugli schemi, rifiuto di `TRUNCATE`, accesso ai metadati, esecuzione di una funzione e `SET ROLE` verso il migratore. `pg_hba.conf` impedisce inoltre all'agente di connettersi agli altri database del cluster, inclusi quelli creati successivamente. Nello stesso test il plugin supera `hermes plugins doctor` e viene invocato tramite il registro dei tool dell'immagine Hermes reale: usa il ruolo `studio_agent`, esegue DML e riceve `42501` per DDL sugli schemi, tabelle temporanee e metadati delle migrazioni. Non è ancora una prova di chiamata generata dal modello.

**Decisione aperta sui privilegi:** il test su PostgreSQL reale conferma che un ruolo di login senza `CREATEROLE` può comunque cambiare la propria password con `ALTER ROLE`. PostgreSQL consente anche alcune altre operazioni sul proprio ruolo; quindi non si può descrivere il ruolo come capace *esclusivamente* di DML in senso assoluto. Questa operazione non modifica le tabelle, ma può interrompere la connettività dell'agente. PostgreSQL non offre un semplice `REVOKE` per eliminarla; si attende una decisione dell'utente prima di considerare accettabile questa limitazione o introdurre una protezione aggiuntiva.

## Limits, costs and risks

- Nessuna credenziale o prova reale con OpenRouter o Meta è stata utilizzata finora. La chiusura richiede prove documentate con account, app Meta, numeri autorizzati ed HTTPS pubblico effettivi.
- Docker e Docker Compose sono disponibili nell'ambiente di lavoro; l'immagine di Hermes scaricata occupa circa 3,2 GB. Hermes e PostgreSQL sono fissati per versione e digest nella configurazione Compose.
- Il terminale dell'agente non costituisce di per sé un confine di sicurezza: evitare socket Docker, credenziali amministrative e mount sensibili accessibili all'agente; verificare anche eventuali percorsi indiretti.
- Le sessioni SQLite contengono conversazioni: non sono log, ma sono dati sensibili da proteggere. Nessuna chiave, numero o messaggio reale va inserito nel repository o nei log.
- La configurazione dello stack passa le prove locali sintetiche, ma resta aperta la decisione sulle operazioni che PostgreSQL consente al ruolo su sé stesso. Mancano inoltre la prova reale Meta/OpenRouter e la chiamata SQL generata dal modello. Questi risultati parziali non soddisfano i criteri di chiusura.

## Recommendations

- Fissare release e digest delle immagini, isolare la migrazione e applicare privilegi minimi effettivi su PostgreSQL.
- Concordare con l'utente come trattare la modifica della propria password consentita da PostgreSQL prima di considerare adeguato il ruolo.
- Mantenere la mitigazione dei log e definire una diagnostica sicura in TEC-005; verificare con l'app Meta effettiva firma, allowlist e risposta reale.
- Documentare configurazione e prove senza segreti; scegliere eventuali alternative con l'utente se le integrazioni richieste non risultano compatibili.

## Sources

- [Release Hermes v0.22.7](https://github.com/NousResearch/hermes-agent/releases/tag/v0.22.7)
- [Documentazione Docker nella release](https://github.com/NousResearch/hermes-agent/blob/v0.22.7/website/docs/user-guide/docker.md)
- [Documentazione WhatsApp Cloud nella release](https://github.com/NousResearch/hermes-agent/blob/v0.22.7/website/docs/user-guide/messaging/whatsapp-cloud.md)
- [Codice WhatsApp Cloud nella release](https://github.com/NousResearch/hermes-agent/blob/v0.22.7/plugins/platforms/whatsapp_cloud/adapter.py)
- [Storage delle sessioni nella release](https://github.com/NousResearch/hermes-agent/blob/v0.22.7/website/docs/user-guide/sessions.md)
- [Provider nella release](https://github.com/NousResearch/hermes-agent/blob/v0.22.7/website/docs/integrations/providers.md)
- [Catalogo OpenRouter](https://openrouter.ai/api/v1/models)
