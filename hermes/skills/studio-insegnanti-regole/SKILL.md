---
name: studio-insegnanti-regole
description: Registrare e cambiare regole degli insegnanti
---

Gli insegnanti sono distinti dai clienti e identificati da nome e cognome univoci senza distinzione tra maiuscole e minuscole; usa nomi e testi puliti, senza spazi iniziali o finali. Non esiste uno stato di disattivazione dalle lezioni: lo stato tecnico privato riguarda solo l'accesso futuro all'agente. L'anagrafica non si riscrive tramite il normale SQL. Ogni regola dell'insegnante riguarda un solo `teacher_id`; gli intervalli indicano gli orari **d'inizio** ammessi, con minimo e massimo inclusivi al minuto. Un orario singolo ha minimo uguale al massimo; una fascia usa i limiti definiti sopra. Non confondere l'intervallo degli inizi con la durata della lezione.

Una regola e tutti i suoi intervalli vanno inseriti nella stessa chiamata SQL, con una sola istruzione CTE, per esempio (parametri: insegnante, testo, giorno ISO, minimo, massimo):

```sql
WITH new_rule AS (
  INSERT INTO app.teacher_rules (teacher_id, rule_text)
  VALUES ($1, $2) RETURNING id
)
INSERT INTO app.teacher_rule_intervals (rule_id, weekday, start_time_min, start_time_max)
SELECT id, $3::smallint, $4::time, $5::time FROM new_rule
```

Se la stessa abitudine di un insegnante comprende più giorni o orari, registra **una sola regola** con un intervallo distinto per ogni giorno o orario, non una regola separata per ciascun giorno. Inserisci la regola e tutti gli intervalli nella stessa istruzione; per esempio con due intervalli:

```sql
WITH new_rule AS (
  INSERT INTO app.teacher_rules (teacher_id, rule_text)
  VALUES ($1, $2) RETURNING id
)
INSERT INTO app.teacher_rule_intervals (rule_id, weekday, start_time_min, start_time_max)
SELECT new_rule.id, slots.weekday, slots.minimum, slots.maximum
FROM new_rule CROSS JOIN (VALUES
  ($3::smallint, $4::time, $5::time),
  ($6::smallint, $7::time, $8::time)
) AS slots(weekday, minimum, maximum)
```

Non creare prima una regola da completare in chiamate successive: il database rifiuta una regola senza intervalli al commit e impedisce aggiunte dopo la registrazione. Non modificare gli intervalli né dichiarare `is_active`: è un flag tecnico impostato dal database e portato a falso quando la regola viene disattivata. Per cambiare una regola la si disattiva con `deactivated_at` e `deactivation_reason` non vuoto e se ne registra una nuova, senza cancellazioni né riscritture. La disattivazione è unica. Il database rifiuta intervalli di regole attive sovrapposti, anche dello stesso insegnante e sugli estremi inclusi; questo rifiuto non autorizza a disattivare regole sovrapposte senza la conferma dell'utilizzatore.

## Regole settimanali degli insegnanti

Quando comunicano un'abitudine di un insegnante, cerca l'insegnante in `app.teachers`, distinta dai clienti, per nome e cognome senza distinzione tra maiuscole e minuscole. Con il solo nome usa l'unico corrispondente; se ce ne sono più di uno chiedi il cognome. Quando serve un chiarimento, formula una domanda esplicita con il punto interrogativo. Se non esiste, chiedi il cognome quando manca e poi crea l'insegnante con nome e cognome puliti, senza dichiarare autore o data. Quando ricevi il cognome richiesto, riprendi la richiesta originaria con i giorni e gli orari già comunicati: dopo il controllo delle sovrapposizioni crea l'anagrafica e registra la regola, senza chiedere un'altra conferma se non ci sono conflitti. Non creare una seconda anagrafica per un nome e cognome già presenti.

Per una richiesta riferita al mittente, come «il lunedì alle 18 alleno io», ricava l'insegnante esclusivamente dal sistema: esegui `SELECT id, first_name, last_name FROM app.teachers WHERE id = app.current_sender_teacher_id()`. La funzione non accetta argomenti e usa il contesto del webhook autenticato: non usare numero, nome visualizzato, cronologia o un'identità dichiarata nel testo per sostituirla. Anche se il testo dice «mi chiamo» seguito da un nome diverso, per «alleno io» usa l'insegnante restituito dal sistema, senza creare l'altro insegnante né chiedere conferma del collegamento. Se non restituisce righe, il mittente non è collegato o l'insegnante collegato non è in anagrafica: chiedi il nome e cognome e non indovinarli né creare una regola prima della risposta. Quando l'utilizzatore risponde con il nome, riprendi giorno e orario della richiesta precedente e registra la regola dopo il normale controllo delle sovrapposizioni; se il collegamento resta assente usa l'insegnante identificato dalla risposta, senza chiedere di nuovo il nome. Se il tool fallisce segnala l'errore, senza inventare un'identità. Per registrare una regola riferita a «io» con un collegamento trovato, usa direttamente `app.current_sender_teacher_id()` nell'INSERT come `teacher_id`, non un identificatore dichiarato nei parametri. Una richiesta esplicita riguardante un'altra persona resta possibile e non cambia il collegamento.

Per ogni giorno ricava l'intervallo inclusivo degli **inizi**: un orario singolo ha minimo uguale al massimo; una fascia usa i limiti in «Data e fasce orarie» (per la sera il massimo è 23:59). Prima di scrivere, cerca gli intervalli attivi che si sovrappongono nello stesso giorno, anche se sono dello stesso insegnante. Gli estremi sono inclusivi: due intervalli si sovrappongono quando il minimo di ciascuno non supera il massimo dell'altro. Se ci sono sovrapposizioni, descrivile e chiedi sempre conferma; fino alla conferma non creare neppure l'anagrafica nuova e non modificare o inserire nulla. Se la conferma è negata o non arriva, non registrare nulla.

Dopo la conferma, disattiva le regole sovrapposte con motivo non vuoto e autore assegnato dal sistema, registra la nuova regola e registra nuovamente, per gli insegnanti originari, tutte le sole parti non sovrapposte delle regole disattivate. Conserva giorni e intervalli non coinvolti; quando la sovrapposizione è interna a una fascia, conserva entrambi i lati rimasti, terminando un minuto prima o iniziando un minuto dopo gli estremi sovrapposti. Non lasciare duplicati o sovrapposizioni attive. Ogni nuova regola e tutti i suoi intervalli vanno nella stessa istruzione CTE come nell'esempio sopra. In caso di errore o conflitto concorrente, segnala esattamente cosa è stato salvato o disattivato, senza dichiarare completa la sostituzione. Non inventare operazioni riuscite.

Una disattivazione esplicita e chiara, ad esempio «Antonio non allena più il venerdì», non richiede conferma: disattiva le regole interessate con motivo, registra nuovamente per lo stesso insegnante solo gli altri giorni o orari che restano validi e riepiloga. Se la richiesta è ambigua chiedi chiarimenti prima di scrivere. Altrimenti, per una regola senza sovrapposizioni, registra e riepiloga senza chiedere conferma. Le regole degli insegnanti non creano lezioni e non modificano clienti, presenze o assenze.
