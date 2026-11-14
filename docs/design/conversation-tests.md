# Conversation tests

`npm run test:conversation` verifica il comportamento conversazionale con il modello reale (REQ-NFR-006). È separato dal gate e dalla CI e richiede configurazione e credenziali esterne. Esiti e limiti delle esecuzioni sono registrati in [prove conversazionali](../operations/TEC-012-prove.md).

## Harness

- Un catalogo JSON con stato iniziale, turni e aspettative guida uno stack Compose nuovo per scenario, con database e volume Hermes isolati, credenziali sintetiche e webhook firmati. Il progetto Docker ha accesso esterno e non costituisce una sandbox di rete.
- Gateway e broker di produzione ricevono l'identità lungo il percorso autentico; un launcher solo di prova reindirizza le richieste HTTPX per `graph.facebook.com` a un sostituto locale di Meta, mentre OpenRouter è reale.
- Un relay autenticato da token sintetico inoltra le chiamate tramite un socket Unix privato a un proxy nel processo host, che aggiunge la chiave OpenRouter solo in memoria per il server HTTPS fisso; la chiave reale non è copiata nei file o nei container. Compose è atteso in modo asincrono durante l'avvio del gateway, così il relay può servire la richiesta del catalogo dei modelli.
- Output grezzo, messaggi, query, parametri e risultati non sono registrati intenzionalmente; la diagnostica aggiunge solo indicatori booleani sui formati, scostamenti in giorni delle date riconosciute e insegnanti citati per posizione.
- Gli avvisi del canale home sono rilevati come errore; il progresso dei tool non è trattato come risposta finale. Pulizia e limiti sono descritti nel README.

## Fixture e date

Lo stato iniziale è vuoto; gli scenari creano i dati nei turni precedenti o li preparano con fixture sintetiche isolate. Le date relative (`$YESTERDAY`, `$LAST_SATURDAY`, `$LAST_WEEK_MONDAY`, date future) sono calcolate in Europe/Rome all'inizio dello scenario; una data può cambiare durante un turno a cavallo di mezzanotte.

Le fixture storiche (regole dei clienti e degli insegnanti con date sintetiche di inserimento e disattivazione, presenze e indicazioni annullate) sono inserite dal migratore isolato nella sola transazione di preparazione, disabilitando i trigger autore delle tabelle interessate (per gli insegnanti `teacher_rules_author` e `teacher_assignments_author`) e riattivandoli prima del commit; i controlli differiti di completezza delle regole sono eseguiti subito con `SET CONSTRAINTS ... IMMEDIATE`, perché `ALTER TABLE` rifiuta eventi in sospeso. Il trigger dell'anagrafica resta sempre attivo e le regole senza data storica seguono il percorso normale. Dopo il commit l'harness verifica trigger attivi, orari locali validi e corrispondenza esatta di righe, istanti, autori e motivi con le fixture; nessun trigger o privilegio operativo cambia.

## Confronti

- Dopo ogni turno si confronta l'intero snapshot dei dati applicativi e lo storico, anche se il testo della risposta fallisce: date, autori, associazioni cliente/slot (ammettendo scomposizioni diverse senza mancanze o duplicati), copertura degli intervalli degli insegnanti minuto per minuto, presenze e indicazioni anche annullate, con istanti, annullamento unico e motivo. Lo storico tra turni ammette solo la prima transizione ad annullato e rifiuta riscritture o cancellazioni.
- Nei turni statistici il launcher di prova intercetta nel processo gateway le sole esecuzioni SQL riuscite e invia al sostituto Meta un marcatore fisso se la query contiene lessicalmente una funzione aggregata; l'harness richiede un incremento per ogni turno indicato. Il controllo non interpreta SQL né dimostra che il risultato sia usato nella risposta.
- Le risposte sono verificate con indicatori lessicali (domande, orari, conteggi vicini agli indicatori, nome dell'agente, assenza di proposte di profilo), non per significato completo: il comportamento resta dipendente dal modello.

Il catalogo copre regole individuali, di gruppo e con più giorni, chiarimenti e tentativi di dichiarare l'autore; consultazione della pianificazione; presenze, attesi storici, duplicati, nuovi clienti e lezioni future; assenze, tipi, attesi non citati e assenze anticipate; correzioni; consultazioni e statistiche; regole degli insegnanti, indicazioni e sostituzioni; consultazioni per insegnante; nome dell'agente e primo contatto senza proposta di profilo.
