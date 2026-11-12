# ADR-003 — Identità unica degli insegnanti e accesso dal database

- **State:** Accepted — modello target pianificato, non ancora implementato
- **Date:** 2026-11-12
- **Items:** TEC-041 (base dati), US-017 (gestione guidata); gli item successivi completano attivazione e transizione
- **Requirements:** REQ-STUDIO-003, REQ-STUDIO-011, REQ-STUDIO-015, REQ-STUDIO-016, REQ-STUDIO-017, REQ-WA-002, REQ-WA-003, REQ-AGENT-006, REQ-AGENT-007, REQ-NFR-005
- **Supersedes:** ADR-002 al completamento del passaggio coordinato

## Context

La baseline riconosce il numero con WhatsApp e un'allowlist configurata, usa il nome del profilo nella conversazione e negli autori e risolve «io» come insegnante con un mapping privato numero–nome/cognome. Queste fonti richiedono manutenzioni separate e possono non coincidere.

L'utente chiede un solo riconoscimento: il numero del mittente autenticato identifica una persona nel database; nome e cognome vengono dalla stessa anagrafica. Per lo scope attuale gli utilizzatori sono soltanto insegnanti. Un solo gestore, identificato dal numero in `.env`, mantiene l'anagrafica tramite l'agente; gli altri non possono farlo. I numeri devono restare fuori dal modello, anche quando sono forniti per un censimento.

Le risposte dell'intervista del 2026-11-12 sono registrate in REQ-STUDIO-015–017 e costituiscono un cambio di scope della v0.3.0. Gli esiti di US-011 e US-016 restano descrizioni della baseline completata, non prove del nuovo modello.

## Options considered

1. **Conservare allowlist, nome WhatsApp e mapping** — non soddisfa l'unificazione richiesta e mantiene manutenzioni multiple.
2. **Anagrafica utilizzatori separata e collegamento agli insegnanti** — ammette categorie e ruoli futuri, ma duplica concetti non richiesti nello scope attuale e richiede una seconda associazione.
3. **Unica anagrafica degli insegnanti, con telefono e accesso** — coincide con gli attori attuali e permette di usare la stessa identità per accesso, conversazione, «io» e autore; richiede una gestione protetta e una transizione dei dati esistenti.

## Decision

Si sceglie la terza opzione, nello stesso modulo `MOD-001`.

### Identity and data

- Estendere l'anagrafica esistente degli insegnanti, mantenendo gli ID interni e le relazioni di dominio. Non creare una tabella separata degli utilizzatori.
- Ogni nuovo insegnante ha nome, cognome e un solo telefono corrente univoco. Nome e cognome restano univoci senza distinzione di maiuscole. I dati tecnici di accesso e tracciamento non sono nuovi dati di profilo.
- Il telefono è la chiave di riconoscimento del mittente, non la chiave primaria delle lezioni o delle regole: cambiarlo non crea un'altra persona.
- Richiedere il prefisso internazionale, normalizzare spazi e separatori comuni e confrontare il valore canonico. Non assumere il paese.
- Le nuove operazioni registrano il numero autenticato e nome/cognome censiti come snapshot dell'autore. Correzioni e cambio numero non riscrivono autori preesistenti, inclusi i nomi WhatsApp storici.

### Trust and authorization

- WhatsApp e la verifica del webhook provano il mittente tecnico; il database risolve la persona e l'accesso. Il nome del profilo WhatsApp non è una fonte dell'identità o un fallback.
- La stessa risoluzione privata fornisce ID, nome/cognome e autorizzazione per gateway, contesto autore e riconoscimento di «io». Il modello non può dichiararli o sostituirli con argomenti dei tool.
- Solo un'identità completa e abilitata accede alle normali operazioni. Il solo gestore configurato può iniziare il proprio censimento quando ancora incompleto; prima di completarlo non opera sui dati dello studio.
- Il numero gestore è l'unico numero personale in `.env`, con la chiave prevista `PILATES_MANAGER_PHONE`; il canale home deriva da esso. Non si mantengono allowlist, mapping o un numero home personale separato nel modello finale.
- Tutti gli insegnanti abilitati hanno gli stessi permessi sulle normali operazioni dello studio, anche per altri insegnanti. Solo il gestore mantiene l'anagrafica, con controlli fidati e privilegi del database, non con il solo prompt. Non esistono più gestori o ruoli configurabili.
- Un mittente autentico non censito, incompleto o revocato riceve un rifiuto fisso che invita a rivolgersi al gestore, senza divulgarne il numero, chiamare il modello o accedere ai dati dello studio. Il gestore incompleto segue invece il percorso iniziale riservato.
- Censimento, revoca e cambio numero si applicano senza riavvio. Nuove richieste e nuove operazioni dopo la conferma non riusano contesti o ricevute con autorizzazione superata.

### Guided management and privacy

- Usare un percorso guidato deterministico nella chat del gestore, avviato esplicitamente salvo il censimento iniziale obbligatorio. Non occorre riconoscere un numero in qualunque testo libero per trasformarlo in una richiesta gestionale.
- Consentire censimento, consultazione gestionale, correzione di nome/cognome, cambio numero degli altri, revoca e riabilitazione. Validare e riepilogare prima della conferma; annullamento, scadenza o errore non producono modifiche parziali. Verificare di nuovo il gestore al salvataggio.
- I passaggi contenenti numeri e gli eventuali riepiloghi per il gestore sono gestiti prima di modello e cronologia. Non reinserire quei numeri nelle richieste successive, nei riassunti, nei titoli o nelle altre richieste ausiliarie.
- Proteggere anche telefoni e numeri degli autori nel database: il ruolo del modello non può estrarli con SQL. Offrire soltanto le proiezioni necessarie ai casi d'uso, mentre il percorso gestionale fidato può mostrare i dati al gestore.
- La protezione riguarda i percorsi di identità e gestione e le relative fonti di contesto; non è una promessa di anonimizzazione universale di qualsiasi dato arbitrario. Nessun dato personale nei log; nessun cambiamento all'accettazione del rischio residuo di TEC-008.
- Il gestore può correggere il proprio nome/cognome, ma non revocare sé stesso o cambiare il proprio numero via chat. Il trasferimento richiede una procedura operativa che allinei `.env`, anagrafica e accessi senza lasciare privilegi duplicati o un sistema irrecuperabile.

### Lifecycle and transition

- La revoca blocca solo l'accesso. Non cancella l'insegnante, non disattiva regole e non modifica lezioni, indicazioni o autori. La riabilitazione ripristina l'accesso.
- Il nuovo numero comincia una chat vuota. Un numero assegnato a una persona diversa non eredita il contesto precedente. Non si cancellano retroattivamente le copie storiche o i backup.
- Conservare insegnanti, ID e dati preesistenti. Non importare automaticamente allowlist, mapping o nomi WhatsApp: il gestore completa manualmente le anagrafiche già presenti, senza duplicarle.
- Soltanto gli insegnanti preesistenti possono restare temporaneamente senza telefono: restano nelle lezioni, ma non accedono all'agente. Non è un modo ordinario per creare nuovi insegnanti incompleti.
- Non creare più un insegnante perché un utilizzatore lo nomina in una regola o indicazione: serve il censimento del gestore. Il riconoscimento per nome di insegnanti già presenti e la creazione automatica dei clienti restano invariati.
- Il censimento nel database non registra automaticamente destinatari sul numero di test Meta e non ne supera il limite esterno.

## Delivery and verification

La consegna è suddivisa in base dati additiva e funzioni protette (TEC-041), gestione guidata (US-017), attivazione comune dei consumatori dell'identità e prove operative di transizione. La base additiva non interrompe il runtime precedente; il passaggio finale non lascia gateway e broker con fonti diverse né richiede sincronizzazioni permanenti. Ogni item verifica la propria parte e documenta quando il nuovo comportamento diventa attivo.

Sono obbligatori PostgreSQL reale per migrazioni e privilegi, webhook firmati per i confini, casi negativi di SQL e falsificazione, revoche e cambi di numero senza riavvio, osservazione delle richieste principali e ausiliarie e della cronologia, prove da database nuovo e con dati, backup/ripristino e isolamento delle chat al riuso del numero. I casi negativi di accesso non devono chiamare il modello. Le regressioni con OpenRouter reale e dati sintetici restano separate dal gate e dalla CI.

## Consequences

- Non si duplicano più le fonti dell'identità; la gestione ordinaria passa dal file di configurazione alla chat del gestore.
- Il database e i backup contengono ora anche i telefoni dell'anagrafica e lo stato di accesso; restano dati privati.
- La gestione dell'anagrafica non è una conversazione libera interamente affidata al modello: il percorso dedicato è necessario per non trasmettere i numeri e imporre i permessi.
- Il passaggio richiede il completamento manuale degli insegnanti preesistenti; un vecchio mapping non conferisce automaticamente accesso.
- Gli adattamenti interni di Hermes, la cronologia persistita e le richieste ausiliarie richiedono verifiche esplicite. Questa decisione non dichiara già effettuate le prove né modifica lo stack operativo.
