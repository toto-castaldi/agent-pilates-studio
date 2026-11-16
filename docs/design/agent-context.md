# Agent context

## `SOUL.md` e prompt di sistema

`hermes/SOUL.md` contiene il nucleo condiviso delle regole di comportamento, compresi identità, nome, protezioni, fasce orarie, schema e instradamento verso sei skill di dettaglio in `hermes/skills/<nome>/SKILL.md`. Nucleo e skill sono le fonti versionate delle istruzioni, senza duplicarle nel codice. Il nucleo non supera 15.000 caratteri; la build incorpora i testi in un modulo per verificarli con test interamente in memoria. Immagine e mount in sola lettura espongono `/opt/data/SOUL.md` e `/opt/data/skills` (`production`). La decisione è in [ADR-004](../adr/ADR-004-read-only-skills-computed-data.md).

- Prima di avviare il gateway il launcher richiede `sessions refresh-prompts` per tutte le sessioni del profilo e fallisce se la richiesta non riesce; la ricostruzione avviene al turno successivo, non durante un turno. Cronologia e vecchi prompt restano nel volume SQLite.
- Memoria, profilo utente e provider esterni sono disabilitati. L'offerta di profilazione di primo contatto di Hermes (`gateway/run_turn_prepare.py::_hmwa_first_contact_notes`, `agent/onboarding.py::first_contact_turn_note`) è spenta con `onboarding.profile_build: "off"`, indipendente dai flag della memoria; la stringa deve restare quotata.
- Il dispatcher aggiunge data e ora Europe/Rome alla sola copia del messaggio di sistema inviata al modello per ogni richiesta, senza salvarla nel prompt o nella cronologia; il fuso è configurato anche in Hermes e l'orologio dell'host deve essere sincronizzato. L'adattamento usa un punto interno dell'immagine fissata.
- Il controllo anti-injection del loader non costituisce un blocco affidabile.
- Senza `context_file_max_chars` Hermes 0.22.7 tronca i file di contesto oltre un limite dinamico (6% della finestra del modello a 4 caratteri per token, minimo 20.000 caratteri), conservando solo inizio e fine. Il limite del nucleo è inferiore a questo minimo; le skill sono caricate separatamente nel turno tramite `skill_view`.

## Comportamenti affidati al modello

`SOUL.md` descrive lo schema accessibile e le regole condivise; le skill definiscono:

- registrazione e consultazione delle regole di allenamento, con la deduplicazione delle regole sovrapposte;
- presenze, assenze, assenze anticipate, attesi non citati, correzioni e distinzione dai duplicati, con ricostruzione storica dei clienti attesi;
- consultazioni di lezioni, cliente, registrazioni mancanti e statistiche con sole SELECT, calcolando i conteggi con COUNT nel database e ricavando dal database giorni della settimana e limiti dei periodi relativi, poiché i metadati dell'orologio contengono solo data e ora ISO;
- regole degli insegnanti: conferma prima di sostituire regole sovrapposte, ricostruzione degli intervalli residui e resoconto;
- indicazioni e sostituzioni: identificazione delle lezioni puntuali, conferma dell'elenco per sostituzioni multiple, riepilogo delle lezioni senza clienti. Le sostituzioni senza orario esplicito cercano solo lezioni esistenti; per «l'ho tenuta io» si usa `app.current_sender_teacher_id()` anche nell'INSERT; le presenze senza insegnante non producono indicazioni;
- consultazioni per insegnante con le funzioni di sola lettura del database che ricostruiscono le lezioni esistenti del periodo, l'insegnante atteso dalle regole valide all'inizio e l'indicazione valida; definisce lezioni tenute (come atteso, in sostituzione o su indicazione), sostituite da altri, presenti alle lezioni tenute, lezioni senza insegnante, regole attive, insegnante atteso per giorno, fascia od orario e storico;
- divieto di proporre spontaneamente un profilo dell'utilizzatore.

Ogni chiamata del tool SQL usa una transazione distinta: annullamento e inserimento successivo, o disattivazione e nuove regole, non sono atomici. Una correzione chiara annulla e inserisce; una comunicazione contrastante non esplicitamente correttiva richiede chiarimento prima di annullare. In caso di errore il modello segnala le operazioni parziali senza dichiarare riuscita l'operazione.

## Contesto compatto

Le sei skill separano regole dei clienti, registrazione delle presenze, consultazione delle presenze, regole degli insegnanti, indicazioni degli insegnanti e consultazioni per insegnante. Il modello deve aprire quelle pertinenti prima di rispondere o operare. Confini tecnici:

- il toolset `skills` di Hermes non diventa di sola lettura con la sola configurazione. Lo diventa con `skill_manage` e `skills_list` fuori dal registro, allowlist dei due percorsi di esecuzione limitata a `studio_sql_query` e `skill_view`, skill montate in sola lettura dall'immagine su `/opt/data/skills` e impostazioni difensive;
- il contenuto di una skill caricata resta nella cronologia; alla compattazione è escluso dal riassunto e sostituito da un segnaposto di ricarica;
- funzioni SQL `STABLE` con diritti dell'invocante (`app.existing_lessons`, `app.expected_clients`, `app.lesson_teachers`) riproducono la query di riferimento delle lezioni senza DDL per l'agente; le viste ricevono DML per default e non sono raccomandate;
- `pilates_skills.py` rimuove dall'indice gli inviti a salvare o modificare skill e neutralizza il caricatore non-tool, gli elenchi dei comandi e i bundle. I comandi non nativi, anche destinazioni di alias, ricevono un rifiuto fisso prima della creazione della sessione e nel percorso busy, senza turno del modello. I comandi nativi come `/refine` e `/review` non cambiano;
- le skill incluse in Hermes sono nascoste dal mount. Variabili template, shell inline, discovery di progetto, curatore e background review sono disabilitati; solo `skill_view` può caricare le sei skill di progetto. Questi adattamenti usano API interne della versione fissata e richiedono regressione sul gateway a ogni aggiornamento.
