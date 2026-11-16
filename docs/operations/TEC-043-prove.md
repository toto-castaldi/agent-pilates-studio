# TEC-043 — Prove della transizione operativa dell'identità unica

**Data delle verifiche:** 2026-11-16 (`date +%F`).

## Scope

Transizione dalla baseline con allowlist, mapping e nome WhatsApp al modello unico, da dati esistenti e da database vuoto, con procedura operativa di trasferimento e cambio numero del gestore, backup/ripristino e catalogo reale. Non sostituisce i test di sicurezza di TEC-041, US-017 e TEC-042 e non è una prova Meta reale.

Solo identità, numeri e dati sintetici, in progetti Docker separati. Nessun avvio, aggiornamento o modifica dello stack operativo dello studio, nessun deploy su `jarvis`, nessuna copia di `.env`, `.local/` o stato Pi personale dal clone principale. La chiave OpenRouter è stata letta solo dall'ambiente del processo host, non cercata altrove, non copiata nei file e non stampata.

## Environment and revisions

- Node.js 24.22.2, npm 11.19.1, dipendenze da lockfile con `npm ci`. Nessuna modifica alla politica `allowScripts` per gli script Prisma segnalati da npm.
- Docker 29.9.3, Compose 5.7.1, PostgreSQL 17.10. Hermes 0.22.7 con digest `e6d81ae52ebf6a43efa529701405509f20054ba818f179ddd748bed4f8af584c`.
- `test:pi` e `test:pi-package` sono stati eseguiti con Pi 1.5.0 installato in un prefisso temporaneo e messo in testa al `PATH`. Il `pi` dell'utente era 1.5.2: la prima esecuzione di `test:pi` è fallita per questo e non è un successo. L'installazione personale non è stata sostituita.
- Modello reale OpenRouter: `openai/gpt-6.1-terra`, una sola esecuzione del catalogo. SOUL SHA-256: `2c0467ce707e366a926ff3436b198dd9c4f737a339e6998ff2c679781871a864` (10.826 caratteri). Catalogo SHA-256: `321ea338dbc3ebba6470cd15b8b5e8cfa1424bd340706a79312eb0fc28290555`, 56 scenari.

## Acceptance evidence

| Criterio | Evidenza | Non verificato |
| --- | --- | --- |
| Snapshot dalla baseline, nessuna importazione | `upgrade.test.ts` e `transition.test.ts`: dati sintetici precedenti, ID e relazioni confrontati, telefoni e accessi non importati anche con i vecchi file sul disco. I file non sono montati. `prod.sh` li rifiuta prima di ogni effetto. | Non è un aggiornamento di `jarvis`. |
| Completamento in chat e database nuovo | `transition.test.ts` completa una persona preesistente senza duplicarla e lascia l'incompleta nelle lezioni senza accesso. `fresh-install.test.ts` parte da zero insegnanti: bootstrap del solo gestore, censimento completo, telefono incompleto rifiutato senza riga, home dal gestore, `/sethome` rifiutato, zero chiamate al modello. `home-channel.test.ts` verifica home immutabile e cron disabilitato. | — |
| Trasferimento distinto dal cambio numero | `manager-transfer`, `manager-renumber` e `manager-recover` nell'immagine `ops`, senza checkout applicativo nel comando. Il trasferimento non cambia gli ID. Il cambio numero conserva l'ID, blocca il numero sostituito e non fa ereditare la chat. Il recupero riallinea la configurazione. Chat e ruoli agente/broker non possono fare le stesse operazioni (`identity-checks.ts`, `management.test.ts`). | Il recupero non è stato eseguito su `jarvis`. |
| Riavvio, backup, conferme interrotte | `hermes.test.ts`: riavvio, ricreazione, backup quiescente e ripristino di identità, privilegi e sessione guidata; il contesto effimero non torna. `transition.test.ts`: conferma interrotta ripristinata e rifiutata da un broker nuovo, senza scrittura. `hot-backup.test.ts`: copia a caldo coerente, log senza dati sintetici, ripristino senza ruoli. Anti-replay e esclusione del contesto restano quelli della procedura esistente. | Non è stato riesposto un webhook pubblico dopo il ripristino. |
| Matrice webhook firmati | `author.test.ts`, `management.test.ts`, `transition.test.ts`, `compaction.test.ts`: gestore, abilitato, sconosciuto, incompleto, revocato, cambio numero, numero riassegnato, conferme interrotte, SQL ostile, zero chiamate al modello per i non abilitati e per la gestione, telefoni assenti da richieste principali, titoli, ausiliarie e compattazione, chat non ereditata. | Meta reale non è autorizzato e non è stato usato. |
| Suite sul nuovo modello | Elenco sotto. `test:images` usa le immagini e `ops` senza checkout applicativo sul server simulato. | `test:claude` non è tra i criteri di questo item e non è stato rieseguito. |
| Catalogo OpenRouter | Una esecuzione, 49 OK e 7 ERRORE, exit 1. I casi di identità unica richiesti sono OK. Due ERRORE sono di stato database e non sono riclassificati. | Nessuna seconda esecuzione. Meta reale no. |
| Documentazione | README, `.env.example`, `SOUL.md`, design, ADR-003, contratto SQL e TEC-035 descrivono installazione, aggiornamento, rimozione delle vecchie fonti, completamento, protezione, recupero e ritorno da backup. È esplicito che il censimento non preregistra su Meta e che backup e cronologie precedenti non diventano anonimi. | — |
| Criteri di release dell'identità | Tabella sotto. Non si introduce deploy automatico, più gestori, ruoli configurabili, uso da parte di non insegnanti o gestione ordinaria fuori dalla chat. | La conversazione reale di produzione e il callback Meta restano non verificati. |

## Release criteria of the unique identity

| Criterio di release | Prova | Limite |
| --- | --- | --- |
| Installazione nuova, censimento, conferma, revoca, rifiuto fisso | `fresh-install.test.ts`, `management.test.ts`, `author.test.ts` | Nessun Meta reale |
| Webhook firmati, autore non falsificabile, telefoni fuori dal modello | `author.test.ts`, `identity-checks.ts`, `compaction.test.ts` | La redazione non è un filtro universale |
| Aggiornamento che conserva ID e snapshot e non importa i mapping | `upgrade.test.ts`, `transition.test.ts` | Non eseguito su `jarvis` |
| Cambio numero e riassegnazione senza ereditare la chat | `author.test.ts`, `transition.test.ts` | — |
| Backup, ripristino, home e recupero del gestore, cron non abilitato | `hermes.test.ts`, `hot-backup.test.ts`, `home-channel.test.ts`, `transition.test.ts` | Il recupero operativo non è stato provato in produzione |
| Regressioni conversazionali reali | Catalogo sotto | Sette scenari restano ERRORE |
| Log senza nomi, messaggi, numeri o credenziali | Suite Hermes, autore, transizione e immagini, nei limiti dei log osservati | Non è un audit nuovo del proxy |
| Produzione su `jarvis` e conversazione col numero di produzione | Non eseguita in questo item | Resta il criterio di release non chiuso da queste prove |

## Automated executions

| Comando | Esito |
| --- | --- |
| `npm run test:local` | 51/51 dopo la correzione, inclusa l'iniezione del fallimento di allineamento e di scrittura del segreto |
| `npm run test:pi` con Pi 1.5.0 nel `PATH` temporaneo | 7/7. La prima esecuzione, col `pi` 1.5.2 dell'utente, è fallita sul controllo di versione e non conta come successo. |
| `npm run test:pi-package` | 1/1 |
| `npm run test:db` | 2/2 dopo la correzione: privilegi, rifiuto del recupero su numero riassegnato, e recupero `ops` che compensa solo l'ultimo cambiamento |
| `npm run test:hermes` | 1/1 |
| `npm run test:author` | Prima esecuzione parallela: `management.test.ts` fallito con `Database role setup failed.` dopo 12 secondi, gli altri quattro test passati, exit 1. Riesecuzione isolata di quel file: passata. Suite completa ripetuta: 5/5. Dopo l'aggiunta del database vuoto, suite finale 6/6. Il primo fallimento resta registrato e non è stato riclassificato. |
| `npm run test:compaction` | 1/1 |
| `npm run test:upgrade` | 1/1 |
| `npm run test:start` | 1/1 |
| `npm run test:images` | 2/2 |
| `node --test dist/integration/fresh-install.test.js` | 1/1, poi incluso nella suite autore finale |

Durante home, transizione, avvio e installazione vuota sono comparsi dinieghi di lettura di `/proc/*/environ`. Nessun valore è stato stampato e le suite sono passate. Il gate rapido finale è registrato a parte, dopo questi aggiornamenti documentali.

## Real OpenRouter execution

Una sola esecuzione di `npm run test:conversation`, conclusa alle 21:26 +01:00, exit 1. L'harness non ha registrato l'orario di avvio. 56 scenari eseguiti: 49 OK, 7 ERRORE. Nessuna ripetizione.

Casi di identità unica del criterio, tutti OK, con database e storico confrontati: `insegnanti-io-nome-censito`, `insegnante-sconosciuto-indicazione`, `insegnante-sconosciuto-regola`, `autore-non-dichiarato`, `nessun-profilo-saluto`, `nessun-profilo-richiesta`, `nessun-profilo-nome-assente`.

Errori originali, non riclassificati:

- Lessicali, con diagnostica di database conforme e storico conservato: `consultazione-lezioni-senza-insegnante` T4, `insegnanti-cognome-e-riconoscimento` T5, `assenze-attesi-presenze` T5, `presenze-nomi-duplicato-futuro` T1, `disattivazione-esplicita-storico` T3. I testi delle risposte non sono conservati.
- Stato database non conforme, storico conservato, quindi non sono solo mismatch lessicali:
  - `insegnanti-disattivazione-parziale` T1: diagnostica con un insegnante e zero regole insegnanti, errore riconosciuto nella risposta, nessuna domanda o conferma.
  - `aggiornamento-implicito` T1: diagnostica con un cliente e una regola cliente, nessuna domanda, conferma o errore riconosciuti nella risposta.

Non si dichiara che questi sette casi siano corretti, né che i due stati difformi abbiano la stessa causa dei fallimenti lessicali di TEC-042. Non è stato eseguito un confronto controllato prima/dopo con lo stesso catalogo. Le prove TEC-046 non sono una deroga applicabile qui.

## Review corrections

Due difetti della prima consegna, riprodotti su PostgreSQL 17.10 isolato, sono stati corretti senza riscrivere `aa075a5`:

- Il recupero di un trasferimento cercava il gestore precedente dal numero. Dopo un cambio legittimo e la riassegnazione di quel numero, il recupero avrebbe reso gestore chi lo aveva ricevuto. L'audit ora conserva `previous_teacher_id`. Il recupero rifiuta con `23514` se quell'identità non ha più il numero, senza scrivere un recupero. Coperto da `identity-checks.ts` in `test:db`.
- Un errore di allineamento durante `manager-recover` richiamava di nuovo il recupero e consumava anche il trasferimento precedente. Ora compensa solo il recupero corrente. Il vincolo univoco su `reverses` impediva poi di ripetere quel recupero: è stato rimosso e un trigger ammette un nuovo recupero solo dopo la compensazione. `identity-checks.ts` esegue davvero recover, compensate e un nuovo recover, due volte, sia per il trasferimento sia per il cambio numero. `integration/local/manager-phone.test.ts` inietta il fallimento di `mv`. `manager-recovery.test.ts` sull'immagine `ops` fallisce la scrittura, riprova il recupero, ripete il guasto e riprova ancora.

Il catalogo OpenRouter non è stato rieseguito. Restano i risultati originali: 49 OK, 7 ERRORE, exit 1, SOUL `2c0467ce707e366a926ff3436b198dd9c4f737a339e6998ff2c679781871a864`, catalogo `321ea338dbc3ebba6470cd15b8b5e8cfa1424bd340706a79312eb0fc28290555`. Meta reale e produzione non sono stati usati.

## Limits

- Meta reale, callback di produzione e stack operativo non sono stati usati. Il criterio di release sulla conversazione di produzione resta non verificato.
- La redazione protegge numeri noti al database e prefissi internazionali nelle copie verso il modello; non è un filtro universale. Volumi, audit e backup restano privati, non anonimi.
- Censire un destinatario non lo iscrive al numero di test Meta e non ne supera il limite esterno.
- Gli adattamenti usano punti interni di Hermes 0.22.7. Un aggiornamento dell'immagine richiede di ripetere le prove dei confini.
- I turni già avviati non vengono interrotti da una revoca; le operazioni SQL successive rifiutano la revisione superata.
- La prima suite autore parallela ha incontrato il rifiuto intermittente del bootstrap dei ruoli già noto. La riesecuzione è passata e non dimostra da sola che il problema sia sparito.
- Il recupero del gestore è verificato su progetti isolati, non su `jarvis`. Non c'è deploy automatico.
