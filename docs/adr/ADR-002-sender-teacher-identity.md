# ADR-002 — Collegamento fidato tra mittente e insegnante

- **State:** Accepted
- **Date:** 2026-11-11
- **Item:** US-011
- **Requirements:** REQ-STUDIO-003, REQ-STUDIO-011, REQ-STUDIO-012, REQ-AGENT-006, REQ-NFR-002, REQ-NFR-005
- **Supersession planned:** [ADR-003](ADR-003-unified-teacher-identity.md), decisione del 2026-11-12; efficace al completamento del passaggio coordinato

Questa ADR conserva la decisione della baseline US-011. I riferimenti al divieto di telefoni nel database e ai permessi uguali anche sull'anagrafica descrivono i requisiti dell'epoca, modificati dal cambio di scope di REQ-STUDIO-015–017. La sola pianificazione di ADR-003 non modifica il runtime esistente.

## Context

Un utilizzatore autorizzato può riferirsi a sé stesso come insegnante. Il suo numero non va inviato al modello e il collegamento numero–insegnante deve rimanere nella configurazione esterna privata. Il nome visualizzato su WhatsApp e il testo del messaggio non sono una prova dell'identità; anche gli argomenti dei tool e i GUC PostgreSQL sono controllabili dal modello. I permessi restano uguali per tutti gli utilizzatori.

## Options considered

1. **Numero e collegamento nel prompt o negli argomenti del tool** — semplice, ma espone il numero e permette al modello di dichiarare un'identità.
2. **Tabella applicativa persistente con i collegamenti** — offre un join diretto ma sposta dati di configurazione personali nel database e li rende parte dei backup applicativi, contro REQ-NFR-005.
3. **Configurazione privata del broker e contesto transazionale protetto** — riusa la verifica indipendente del webhook e il confine autore esistente; richiede una migrazione e un adattamento ai punti interni della versione Hermes fissata.

## Decision

Si sceglie la terza opzione. In `.env` locale `WHATSAPP_TEACHER_LINKS` è un array JSON opzionale di oggetti con esattamente `phone`, `firstName` e `lastName`. Il numero, in sole cifre, deve appartenere all'allowlist e comparire una sola volta; più numeri possono indicare lo stesso insegnante. Nomi e cognomi sono non vuoti, privi di spazi ai bordi e caratteri di controllo. L'omissione equivale a `[]`. `start:local` valida tutto prima di modificare file o servizi e scrive il mapping in un file privato; il broker lo valida indipendentemente anche nella procedura manuale e in produzione. Gli errori non includono valori. Il file è montato solo nel broker, non nel gateway; un'installazione o aggiornamento di produzione senza il nuovo file ne crea uno privato vuoto, senza sovrascrivere un mapping esistente.

Dopo aver verificato HMAC, account, allowlist, timestamp e ricevuta, il broker sceglie il mapping dal mittente della ricevuta, non dalla richiesta del modello. Una funzione `SECURITY DEFINER` riservata al broker cerca nome e cognome senza distinzione di maiuscole nell'anagrafica; il broker non ha lettura diretta della tabella. Inserisce il solo ID risultante, oppure NULL, nel contesto autore temporaneo associato a backend e transazione, già escluso dai backup. `app.current_sender_teacher_id()` non accetta argomenti, usa il contesto protetto e fallisce senza un contesto valido. L'agente non può scrivere il contesto né chiamare la funzione privata di ricerca.

Per «alleno io», `SOUL.md` richiede di usare questa funzione, anche nell'INSERT; se non restituisce un insegnante, richiede nome e cognome senza indovinarli. La risposta dell'utilizzatore può identificare o creare un insegnante per quella richiesta, ma non modifica la configurazione. Il modello può comunque operare su insegnanti esplicitamente nominati: la scelta semantica tra «io» e un'altra persona dipende dalle istruzioni e dal modello, non è un vincolo SQL che riconosce l'intenzione. Il database garantisce la provenienza del valore restituito dalla funzione, non che ogni query generata la usi correttamente.

Hermes abilita la propria redazione degli identificativi WhatsApp nel contesto di sessione; il gateway oscura inoltre i numeri autorizzati noti, anche con comuni separatori, nelle copie inviate al modello principale, ai riassunti, al generatore dei titoli e alle domande laterali `/btw`. La cronologia originale resta nel volume SQLite; identità e corpo firmato restano disponibili al broker. L'adattamento usa punti interni dell'immagine Hermes fissata e va riverificato agli aggiornamenti. Non è un anonimizzatore universale: non riconosce ogni possibile codifica, numero storico non più autorizzato o dato personale arbitrario.

## Consequences

- Cambiare il mapping richiede un riavvio coordinato di broker e gateway tramite la procedura dell'ambiente; non cambia autorizzazioni né crea automaticamente l'insegnante. Senza corrispondenza in anagrafica l'agente deve chiedere il nome.
- Le sovrapposizioni richiedono conferma secondo `SOUL.md`; il vincolo del database continua a vietare conflitti attivi. La disattivazione e le nuove regole possono richiedere chiamate SQL distinte, quindi non sono necessariamente atomiche: un errore può lasciare una sostituzione parziale, che l'agente deve segnalare.
- `test:db` verifica su PostgreSQL reale privilegi, contesto assente/scaduto e resistenza a identità dichiarate; `test:author` prova mittenti, mapping assente o non risolto, contraffazione e redazione con webhook firmati e modello sintetico. `test:compaction` verifica la redazione anche nei riassunti. I test non dimostrano l'assenza di ogni fuga né che il modello segua sempre le istruzioni.
- Gli scenari reali confrontano lo stato degli insegnanti e la copertura degli intervalli dopo ogni turno; gli indicatori delle risposte rimangono lessicali. Le prove non sostituiscono l'audit privacy del proxy, né attestano affidabilità futura del modello.
