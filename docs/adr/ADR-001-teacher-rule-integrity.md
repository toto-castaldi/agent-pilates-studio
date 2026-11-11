# ADR-001 — Integrità delle regole degli insegnanti

- **State:** Accepted
- **Date:** 2026-11-11
- **Item:** TEC-033
- **Requirements:** REQ-DB-002, REQ-STUDIO-003, REQ-STUDIO-012, REQ-STUDIO-013

## Context

Una lezione ha al più un insegnante atteso. Gli intervalli rappresentano **orari d'inizio inclusivi**, non la durata delle lezioni: 09:00–10:00 comprende anche l'inizio alle 10:00. Il modello deve chiedere conferma prima di sostituire regole sovrapposte, ma tale comportamento non basta a preservare l'invariante in presenza di SQL errato o turni concorrenti. Regole e intervalli devono inoltre restare uno storico immutabile: aggiungere intervalli a una regola già registrata ne cambierebbe retroattivamente il significato e l'autore.

## Options considered

1. **Solo istruzioni in SOUL.md** — nessun costo nello schema, ma nessuna difesa da errori SQL o concorrenza.
2. **Trigger con ricerca delle sovrapposizioni e lock applicativi** — richiede gestire esplicitamente snapshot, livelli d'isolamento e ordine dei lock; una semplice SELECT non vede necessariamente una scrittura concorrente.
3. **Vincolo di esclusione sugli intervalli attivi** — il GiST nativo per gli intervalli di interi gestisce anche scritture concorrenti, senza estensioni. Richiede riportare sugli intervalli lo stato attivo della regola, sotto controllo esclusivo del database.

## Decision

Si sceglie il vincolo di esclusione. `app.teacher_rule_intervals` contiene giorno ISO, minimo e massimo degli orari d'inizio al minuto e `is_active`, proiezione tecnica dello stato della regola. Un'espressione `int4range` converte giorno e orari in minuti dall'inizio della settimana, con entrambi gli estremi inclusi. Un `EXCLUDE USING gist (... WITH &&) WHERE (is_active)` rifiuta ogni sovrapposizione, anche tra regole dello stesso insegnante o all'interno della stessa regola. Non serve `btree_gist` né un nuovo privilegio per installare estensioni.

All'inserimento il database imposta `is_active = true`, senza fidarsi del valore dichiarato. La sola transizione ammessa è a `false`, propagata da un trigger alla disattivazione della regola; i dati dell'intervallo non cambiano. L'agente non ha UPDATE sugli intervalli. Anche il normale DML del migratore non può falsificare lo stato: il trigger verifica la disattivazione della regola e l'immutabilità dei campi originari. DELETE e TRUNCATE sono vietati sulle quattro nuove tabelle applicative, anche al migratore.

Una regola e **tutti** i suoi intervalli si inseriscono nella stessa transazione. Un trigger apre una finestra di costruzione privata in `studio_private.teacher_rule_builds`, vincolata a regola, backend e transazione; solo durante questa finestra sono ammessi gli inserimenti degli intervalli, con contesto autore attendibile. Un constraint trigger differito richiede almeno un intervallo e chiude la finestra prima del commit. La tabella privata non ha righe committate: non conserva dati personali né un identificatore di transazione storico che potrebbe coincidere dopo un ripristino. Forzare anticipatamente il controllo chiude la finestra, non permette di riaprirla. Per Hermes, che esegue una transazione per chiamata SQL, si usa una singola istruzione con CTE per inserire regola e intervalli. La verifica della finestra sugli intervalli è un trigger AFTER: nella CTE i BEFORE dei figli precedono gli AFTER del padre che aprono la finestra. La completezza resta differita; forzare i constraint trigger prima di avere concluso la costruzione può far rifiutare l'istruzione, senza lasciare dati parziali.

L'autore proviene dal contesto protetto di TEC-010; gli intervalli appartengono alla regola e ne ereditano l'attribuzione, senza colonne autore duplicate. I trigger impostano anche gli istanti di creazione, disattivazione e annullamento delle nuove entità con l'orologio del database. Il modello può richiedere una transizione, non retrodatare lo storico.

## Consequences

- La conferma, la scomposizione delle parti non sovrapposte e i limiti delle fasce restano regole di comportamento esclusivamente in `SOUL.md`; il database rifiuta il conflitto, non decide quale regola sostituire.
- Dopo la disattivazione gli intervalli restano nello storico, ma non bloccano una nuova regola. La ricostruzione storica usa le date della **regola**, non il flag tecnico `is_active`.
- Per cambiare o aggiungere intervalli occorre disattivare la regola e inserirne una nuova; non si completano regole in chiamate SQL successive. Una regola incompleta fa fallire il commit, senza lasciare righe parziali.
- Il dump ordinario include tabelle, flag, vincoli e trigger; la finestra di costruzione è sempre vuota fuori dalle transazioni di inserimento. Le prove coprono conflitti concorrenti, chiusura della finestra, rollback, upgrade con dati e funzionamento dopo backup/ripristino.
- Il collegamento configurato tra mittente e insegnante e le prove conversazionali con modello reale restano agli item dedicati; questa decisione non li anticipa.
