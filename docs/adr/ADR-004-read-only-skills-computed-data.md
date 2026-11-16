# ADR-004 — Skill di sola lettura e dati calcolati per il contesto compatto

- **State:** Accepted
- **Date:** 2026-11-16
- **Item:** TEC-046
- **Requirements:** REQ-AGENT-008, REQ-AGENT-005, REQ-DB-002, REQ-STUDIO-003, REQ-NFR-002, REQ-NFR-005, REQ-NFR-006

## Context

`hermes/SOUL.md` era l'unica fonte delle regole di comportamento e superava i 40.000 caratteri. Hermes 0.22.7 tronca i file di contesto oltre un limite dinamico (minimo 20.000 caratteri) e ogni richiesta al modello trasportava tutte le istruzioni di dettaglio, anche quelle non pertinenti. REQ-AGENT-008 chiede un contesto sempre presente entro 15.000 caratteri, istruzioni di dettaglio in skill versionate di sola lettura caricate su richiesta e ricostruzioni dei dati calcolate in modo deterministico, senza cambiare i comportamenti richiesti.

SPIKE-003 ha verificato sull'immagine fissata che:

- il toolset `skills` comprende `skills_list`, `skill_view` e `skill_manage` (creazione, modifica, cancellazione e scrittura di file) e non si rende di sola lettura con la sola configurazione;
- l'indice delle skill nel prompt di sistema contiene sempre due frasi che invitano a correggere o salvare skill;
- un utilizzatore può caricare una skill come messaggio con `/<nome-skill>` (anche in forma con `_`, in pila o tramite raggruppamenti), indipendentemente dai toolset; nella baseline erano già caricabili così le skill incluse in Hermes;
- il contenuto di una skill caricata resta nella cronologia e, alla compattazione, è sostituito da un segnaposto di ricarica;
- funzioni SQL `STABLE` con i diritti dell'invocante riproducono la query di riferimento delle lezioni senza DDL per l'agente, mentre le viste ricevono per default anche DML e, con i diritti del proprietario, superano il controllo per colonna.

## Options considered

1. **Skill native di Hermes limitate a `skill_view` (variante V2c dello spike)** — conserva indice nativo, deduplica e segnaposto di ricarica dopo la compattazione; richiede adattamenti a punti interni di Hermes (registro dei tool, testo dell'indice, comandi delle skill).
2. **Tool del plugin `studio_skill(name)` con il toolset `skills` disabilitato (V4)** — meno punti interni, ma nessun segnaposto di ricarica dopo la compattazione, indice da mantenere in `SOUL.md` e rischio che la descrizione del tool diventi istruzione.
3. **Comandi `/<nome-skill>` disponibili agli utilizzatori** — comportamento predefinito di Hermes; consente a chiunque sia autorizzato di inserire istruzioni nella conversazione al posto della decisione dell'agente.
4. **Ricostruzioni con viste, funzioni SQL o tool del plugin** — le viste non accettano il periodo e ricevono DML per default; i tool spostano SQL e definizioni nel codice Python fuori dalle migrazioni e richiedono un turno autenticato per essere provati; le funzioni restano nel database, sono provabili direttamente su PostgreSQL reale e non scrivono.

## Decision

Si adotta l'opzione 1 con il caricamento riservato all'agente e funzioni SQL di sola lettura.

- **Contenuti.** `SOUL.md` contiene identità e nome, principi generali e regole condivise, protezioni, fasce orarie, schema, definizioni delle lezioni, funzioni del database e l'indice delle skill con quando caricarle; non supera 15.000 caratteri. Le istruzioni di dettaglio stanno in sei skill: `studio-regole-clienti`, `studio-presenze`, `studio-presenze-consultazioni`, `studio-insegnanti-regole`, `studio-insegnanti-indicazioni`, `studio-insegnanti-consultazioni`.
- **Formato.** Ogni skill è `hermes/skills/<nome>/SKILL.md` con i soli campi `name` e `description` (al più 60 caratteri), senza dipendenze, variabili, comandi in linea, script o file collegati.
- **Sola lettura, tre barriere.** Le skill sono copiate nell'immagine in `/opt/pilates/release/skills` e montate con `type: image` in sola lettura su `/opt/data/skills`, nascondendo le skill incluse in Hermes. `skill_manage` e `skills_list` non entrano nel registro dei tool. L'allowlist dei due percorsi di esecuzione ammette solo `studio_sql_query` e `skill_view`. Il toolset `skills` è abilitato per WhatsApp Cloud e gli altri toolset restano disabilitati.
- **Impostazioni difensive.** Dall'indice si tolgono le due frasi su correzione e salvataggio delle skill. In configurazione: `skills.template_vars`, `skills.inline_shell` e `skills.project_discovery` disattivati, `skills.creation_nudge_interval: 0`, curatore e revisione ausiliaria in background disabilitati.
- **Caricamento solo da parte dell'agente.** Nel processo del gateway ogni comando slash che non è un comando nativo del gateway riceve una risposta fissa di comando non disponibile, sia a sessione inattiva sia durante un turno in corso, senza aprire un turno del modello: sono compresi `/<nome-skill>` e le sue varianti, le pile di skill, i raggruppamenti, le skill dei plugin e quelle incluse in Hermes, anche come destinazione di un alias. Il caricatore delle skill usato da comandi, raggruppamenti, precaricamenti e caricamenti automatici non restituisce contenuti, e skill e raggruppamenti non sono elencati come comandi. L'unico percorso resta il tool `skill_view`, chiamato dal modello. I comandi nativi del gateway, compresi `/refine` e `/review`, non cambiano.
- **Dati calcolati.** Una migrazione crea `app.existing_lessons`, `app.expected_clients` e `app.lesson_teachers` (periodo di date inclusivo): funzioni `LANGUAGE sql STABLE` con i diritti dell'invocante, senza clausole `SET`, con nomi qualificati, `EXECUTE` revocato a `PUBLIC` e concesso al solo ruolo agente. Restituiscono date, orari, ID e nomi, mai numeri. Non si introducono viste; un'eventuale vista futura userà `security_invoker = true` e la revoca del DML. Le definizioni di conteggio («tenuta», «in sostituzione», «sostituita da altri») restano esempi di filtro nelle skill: le funzioni calcolano dati e non decidono conferme, chiarimenti o resoconti.

## Consequences

- Il contesto stabile di un turno scende da circa 41.000 a meno di 15.000 caratteri; il primo caricamento di una skill aggiunge una richiesta al modello e il suo contenuto resta nella cronologia fino alla compattazione, dopo la quale va ricaricato.
- Filtro del registro, testo dell'indice, allowlist, sostituzione dei comandi delle skill (`_hm_skill_slash_rewrite`, `_busy_skill_turn`) e caricatore neutralizzato sono punti interni della 0.22.7: ogni aggiornamento di Hermes richiede di ripetere le prove sul gateway reale. Una variazione del testo dell'indice renderebbe inefficace la rimozione delle frasi senza errori: le prove verificano la richiesta effettivamente inviata al modello.
- Un comando slash sconosciuto riceve la stessa risposta fissa del comando di una skill, senza rivelare quali skill esistano. Gli altri comandi nativi restano esposti come prima: un loro eventuale limite richiede una decisione separata.
- Le skill entrano nella cronologia SQLite e nei backup del volume Hermes come il resto della conversazione; sono testo statico versionato, senza dati personali.
- Le funzioni seguono lo schema: ogni migrazione che ne cambia le tabelle deve aggiornarle e ripetere le prove di equivalenza e di privilegio su PostgreSQL reale.
- Prove: test in memoria su lunghezza, contenuto minimo e formato di `SOUL.md` e skill; coerenza di colonne e funzioni con le migrazioni in `test:local`; risultati, privilegi e assenza di numeri delle funzioni in `test:db` e `test:upgrade`; montaggio in `test:images`; tool annunciati, indice, tentativi di scrittura, rifiuto dei comandi delle skill e `skill_view` interno sul gateway reale in `test:author`; regressione conversazionale completa con il modello reale.
