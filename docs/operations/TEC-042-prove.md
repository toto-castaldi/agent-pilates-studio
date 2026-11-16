# TEC-042 — Prove dell'attivazione dell'identità unica

**Data delle verifiche:** 2026-11-16 (`date +%F`).

## Scope

Attivazione coordinata di gateway, broker, percorso guidato e contesto SQL: accesso, nome, «io» e autore derivano dall'anagrafica unica. La migrazione `20261117000000_unified_sender_identity` rimuove gli inserimenti incompleti del runtime precedente e protegge anche i numeri degli autori storici dietro viste pubbliche senza telefoni.

Sono state usate soltanto identità, numeri e dati sintetici in progetti Docker separati. Nessun avvio, aggiornamento o modifica dello stack operativo dello studio, nessun deploy su `jarvis`, nessuna copia della configurazione privata dal clone principale. Il passaggio operativo e il recupero del gestore restano TEC-043. Queste prove non sostituiscono un end-to-end con Meta reale.

## Environment and revisions

- Node.js 24.22.2, npm 11.19.1, dipendenze preparate da lockfile con `npm ci`; nessuna modifica alla politica `allowScripts` per gli script Prisma segnalati da npm.
- Docker 29.9.3, Compose 5.7.1, PostgreSQL 17.10 reale e immagini fissate dal repository; Hermes 0.22.7 con digest `e6d81ae52ebf6a43efa529701405509f20054ba818f179ddd748bed4f8af584c`.
- Implementazione runtime e database in `e3252da`, protezione degli autori e adeguamento delle suite in `e5710a3`; catalogo e documentazione in `d5c02d7`; correzioni del solo harness conversazionale in `e0b4263`; affidabilità delle osservazioni della suite autore in `975eef5`.
- Modello reale OpenRouter: `openai/gpt-6.1-terra`. La chiave è letta dall'ambiente del processo host e aggiunta dal proxy soltanto in memoria; non è copiata nei container, nei file o nei log. Il trasporto Meta è sostituito da un servizio sintetico.

## Acceptance evidence

| Criterio | Evidenza raccolta |
| --- | --- |
| Risoluzione unica e bootstrap riservato | `author.test.ts`, `management.test.ts` e `identity-checks.ts`: webhook firmati, identità complete, incomplete e revocate; bootstrap del solo gestore senza modello o DML anonimo; normali messaggi degli insegnanti abilitati. |
| Rifiuti e confine autenticato | `author.test.ts`: rifiuto fisso per numeri non censiti/revocati senza richieste al modello, nessuna nuova proprietà di chat, nessun dato del gestore; firma, account e timestamp non validi; retry del webhook rifiutato senza seconda risposta e replay dopo riavvio del broker. |
| Configurazione unica | Test unitari di `start-local-core`, `test:local`, `hermes.test.ts`, `home-channel.test.ts` e `start-local.test.ts`: normalizzazione del solo numero gestore, home derivata, vecchie chiavi rifiutate prima degli effetti, vecchi file non usati; arresto/ricreazione congiunta dei consumatori e avvii falliti senza gateway lasciato attivo con autorizzazioni discordanti. |
| Nome, «io» e attribuzione | `author.test.ts`: nome censito diverso dal profilo o in assenza del profilo, nomi/ruoli/autori/GUC falsificati, mittenti concorrenti, correzione applicata senza riavvio, `current_sender_teacher_id()` e snapshot di creazione/transizione imposti dal database. `upgrade.test.ts` confronta gli snapshot precedenti invariati. |
| Telefoni e protocollo gestionale fuori dal modello | `identity-checks.ts` e `author.test.ts`: SELECT espliciti/privati, funzioni protette, `SELECT *`, conversioni JSON/XML/testuali, `RETURNING`, statistiche e SQLSTATE senza dettagli; osservazione delle richieste principali e ausiliarie e controllo dei log. `management.test.ts` esclude messaggi gestionali dalle richieste al modello e dai dati Hermes. `compaction.test.ts` osserva anche una compattazione e la sessione precedente al passaggio. |
| Nessuna creazione indiretta di insegnanti | Privilegi e trigger su PostgreSQL reale; INSERT del ruolo agente rifiutato anche con contesto del gestore. `author.test.ts` conserva la lezione di un insegnante preesistente incompleto; catalogo reale con insegnante sconosciuto per regola e indicazione. La creazione dei clienti e il lavoro sugli altri insegnanti restano verificati. |
| Modifiche senza riavvio e chat separate | `identity-checks.ts` verifica lock, revoche, riabilitazioni, revisione e cambio numero. `author.test.ts` rifiuta ricevute precedenti alla modifica, verifica nuove ammissioni, nome corretto, chat vuota al cambio/riuso del numero e snapshot/regole conservati. Vedere i limiti dei turni già in corso sotto. |
| Suite separate e transizione | `test:local`, PostgreSQL, gateway/broker, gestione, home, compattazione e avvio isolato; adattate anche upgrade, persistenza, immagini e backup. Le fixture legacy precedono la migrazione; il censimento ordinario usa le funzioni fidate senza scorciatoie nel runtime. |
| Catalogo con modello reale | Catalogo di 56 scenari e 185 turni previsti, con identità censite diverse dai profili; verifica risposte, database e storico anche quando fallisce il testo. Esecuzione ed esiti dettagliati sotto; i fallimenti non sono riclassificati come successi. |
| Fonti e documentazione | README, esempi, Compose, entrypoint, istruzioni dell'agente, design, contratto SQL, procedure e ADR-003 adeguati al runtime. I comportamenti dello studio restano in SOUL e nelle sei skill; autenticazione, privacy e gestione sono controlli di sistema. Scheduler, profilazione e scritture delle skill non sono riattivati. |

## Automated executions

Le integrazioni riportate sono separate dal gate rapido; i comandi `node --test` sono stati eseguiti dopo la build sugli stessi file previsti dagli script npm.

| Comando o suite | Esito raccolto |
| --- | --- |
| `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` | Passati; 100 test unitari esclusivamente in memoria. Il gate finale sarà ripetuto dopo gli ultimi aggiornamenti. |
| `node --test dist/integration/local/*.test.js` | 50/50, nessun test saltato. |
| `npm run test:db` | 1/1, PostgreSQL reale, comprese le verifiche dell'identità e dei privilegi; ripetizione conclusiva riuscita su `975eef5`. |
| `node --test dist/integration/hermes.test.js` | 1/1, persistenza e backup/ripristino inclusi. |
| `node --test dist/integration/management.test.js` | 1/1. |
| `node --test dist/integration/home-channel.test.js` | 1/1. |
| `node --test dist/integration/compaction.test.js` | 1/1. |
| `node --test dist/integration/upgrade.test.js` | 1/1. |
| `node --test dist/integration/start-local.test.js` | 1/1, compresi ricreazione dei volumi sintetici e cambio della configurazione. |
| Suite immagini e backup a caldo | 2/2. |
| `npm run test:author` | 4/4 (due test autore, gestione e home), incluso `queued follow-ups do not keep a revoked or reassigned identity`. Durante la suite home sono comparsi tre dinieghi di lettura di `/proc/*/environ`; nessun valore è stato stampato e la suite è passata. |

Pi, pacchetto Pi e Claude Code non sono modificati dall'item e non sono stati rieseguiti qui; tutte le suite restano obbligatorie in CI e alla chiusura di versione.

## Real OpenRouter executions

- Prove mirate `insegnanti-io-nome-censito` e `insegnante-sconosciuto-indicazione`: passate.
- Prima esecuzione del catalogo interrotta: diversi scenari con insegnanti preparati fallivano sul controllo dello stato iniziale, prima del turno. Il controllo contava soltanto l'identità del mittente e non gli insegnanti censiti dalla fixture. Corretto il conteggio in `e0b4263`, senza modificare le attese dei turni; le esecuzioni fallite restano tali. La stessa correzione rimuove, nella pulizia, anche l'immagine PostgreSQL del singolo progetto casuale.
- Ripetizione integrale su `e0b4263` conclusa: 48 scenari OK, 8 ERRORE sul contenuto lessicale della risposta, `exit 1`. SOUL SHA-256: `9cb47f31926cd277f008ff11173f7a9d1a6aa4959588b70ca88821a4aa898ae6`; catalogo SHA-256: `321ea338dbc3ebba6470cd15b8b5e8cfa1424bd340706a79312eb0fc28290555`.
- Casi di identità unica richiesti dal criterio: `insegnanti-io-nome-censito`, `insegnante-sconosciuto-indicazione`, `insegnante-sconosciuto-regola`, `autore-non-dichiarato`, `nessun-profilo-saluto`, `nessun-profilo-richiesta`, `nessun-profilo-nome-assente` — tutti OK, con database e storico confrontati.
- Fallimenti lessicali originali, tutti con database e storico conformi; i testi delle risposte non sono conservati dall'harness. Analisi della sola diagnostica già raccolta, senza riesecuzione del catalogo e senza allentare i matcher:
  - `indicazione-correzione-annullamento` T6: atteso un riconoscimento di assenza di indicazione (`già`/`nessun`/…); diagnostica con nomi e orari, domanda rispettata, insegnante 1 citato.
  - `insegnanti-cognome-e-riconoscimento` T5: attesa domanda sul cognome; diagnostica breve (30), entrambi gli insegnanti citati, nessuna domanda accessoria.
  - `assenza-anticipata-singola-annullamento` T4: atteso rifiuto di presenza futura; diagnostica con rifiuto e riferimento temporale riconosciuti.
  - `assenze-attesi-presenze` T5: attesa domanda su Ada e Bruno; diagnostica con nomi e menzione registrazione, nessuna domanda accessoria.
  - `presenze-data-odierna` T1 e `presenze-nomi-duplicato-futuro` T1: atteso il riconoscimento di non atteso/extra; diagnostica con nomi, orari e menzione registrazione.
  - `disattivazione-esplicita-storico` T3 e `aggiornamento-implicito` T3: attesi nomi dell'insegnante e dell'autore nello storico; diagnostica `nomi mancanti`.
  Nessuno di questi otto è un caso del criterio 9 (nome censito, identità falsa, «io», autore di sistema, insegnante sconosciuto). Quei casi restano OK. Non si dichiara che le otto risposte siano corrette: restano ERRORE.
- Il confronto completo prima/dopo sul contesto precedente non è stato eseguito. Le prove precedenti documentate in TEC-046 non sono un confronto controllato con lo stesso catalogo aggiornato e non costituiscono una deroga applicabile a questo item.

## Development failures and corrections

- Le prime esecuzioni delle suite adeguate hanno evidenziato fixture ancora basate su inserimenti di insegnanti incompleti dopo il passaggio, vecchie chiavi di configurazione e aspettative sullo schema/SOUL precedente. Le fixture incomplete ora vengono create prima della migrazione; il nuovo censimento usa gli ingressi fidati. I successivi risultati pertinenti sono riportati nella tabella, senza considerare positivi i tentativi precedenti.
- La copia isolata di `test:start` non includeva `src/`, richiesto dal Dockerfile della gestione; aggiunto. Un secondo errore nel test cercava di sostituire il numero con un formato diverso dalla fixture iniziale; allineato. La ripetizione completa è passata.
- `test:author` falliva sul conteggio degli SQLSTATE di diniego: dopo più errori SQL Hermes aggiunge un proprio avviso testuale al JSON del tool e il parser di prova scartava l'intero risultato. Ora il parser riconosce soltanto il suffisso nativo `Tool loop warning`/`hard stop`, preservando tutti i controlli di diniego e di assenza dei numeri. Non sono stati concessi privilegi o disattivati controlli per far passare il test.
- Una successiva esecuzione autore è fallita sul nome della chat riassegnata; quella seguente è passata. Le osservazioni raccoglievano anche richieste ausiliarie e i predicati dei controlli di identità non richiedevano il tool SQL principale. I predicati ora lo richiedono; sono passate sia la ripetizione isolata sia la successiva suite completa di tre test. Il risultato precedente non dimostra da solo né una fuga d'identità né la sua assenza.
- Un hook temporaneo di debug della suite autore che conservava lo stack poteva sopprimere il fallimento tramite `return` nel `finally`: è stato rimosso. I risultati ottenuti con quel hook non sono usati come evidenza; contano solo le successive esecuzioni complete senza hook.

## Limits and outstanding verification

- Gli adattamenti usano punti interni della versione Hermes fissata: aggiornare l'immagine richiede di ripetere le prove dei confini, dei tool, delle sessioni e delle richieste ausiliarie.
- I turni già avviati non vengono interrotti da una revoca; il binding delle successive operazioni SQL rifiuta la revisione superata. Lo steering nativo inietta testo nel turno in corso senza un nuovo controllo di ammissione: è lo stesso limite dei turni già avviati.
- Prova mirata `queued follow-ups do not keep a revoked or reassigned identity` in `author.test.ts`: con `busy_input_mode: queue`, un follow-up ammesso durante `skill-probe-busy` e poi revocato o con numero cambiato non compare nelle osservazioni del modello (attesa 20 s dopo la conferma). Non è una prova dello steering in-turno.
- Una regressione con webhook firmati ha mostrato che `/sessions` elencava il titolo di una sessione del proprietario precedente dopo il riuso del numero: il controllo nativo confronta la chat WhatsApp, non la persona. È stato aggiunto `studio_private.session_owners`, un legame immutabile sessione–insegnante, verificato prima dei turni e per elenco/recupero. La prova copre elenco negato, recupero negato e recupero della propria sessione; gli archivi SQLite non sono cancellati e restano nei backup.
- La redazione protegge numeri noti al database e prefissi internazionali riconosciuti nelle copie verso il modello; non riconosce ogni codifica arbitraria o dato personale scritto fuori dal percorso gestionale. Volumi, audit e backup restano privati, non anonimi.
- Le risposte fisse e gestionali sono inviate best effort dopo la decisione committata dal broker; un errore di consegna non riapre la conferma e un retry dello stesso webhook non risponde due volte.
- La validazione del telefono è strutturale; non certifica l'assegnazione della linea o l'iscrizione sul numero di test Meta. Restano invariati i limiti e il rischio privacy del proxy documentati in TEC-008.
- Gli otto ERRORE lessicali del catalogo restano tali e non sono riclassificati. Il confronto prima/dopo del catalogo non è stato eseguito. Nessuna deroga di TEC-046 viene estesa alla TEC-042.
