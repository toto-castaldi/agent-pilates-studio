# SPIKE-003 — Skill e tool per un contesto dell'agente compatto

- **Date:** 2026-11-14
- **Outcome:** Positive — il toolset `skills` di Hermes 0.22.7 non si rende di sola lettura con la sola configurazione, ma sì con tre barriere verificate (`skill_manage` fuori dal registro, allowlist estesa al solo `skill_view` nei due percorsi, montaggio in sola lettura dall'immagine). Funzioni SQL di sola lettura riproducono la query di riferimento di US-015 e il nucleo stimato di `SOUL.md` resta sotto i 12.000 caratteri. Restano a TEC-046 le scelte da confermare con l'utente, l'attuazione e le prove con il modello reale.
- **Requirements:** REQ-AGENT-008, REQ-DB-002, REQ-NFR-002, REQ-NFR-006 (per il riferimento probabilmente inteso a REQ-NFR-005 vedere «Limits, costs and risks»)

## Questions

1. Come vengono scoperte, caricate e iniettate le skill nell'immagine Hermes 0.22.7 fissata, quali tool comprende il toolset `skills` e si può abilitare in sola lettura, impedendo al modello di creare, modificare o installare skill, anche nei due percorsi di esecuzione dei tool e con l'allowlist attuale?
2. Dove finisce il contenuto delle skill caricate (contesto, cronologia persistita, compattazione, richieste ausiliarie)? È compatibile con REQ-NFR-006 e con il montaggio in sola lettura dalle immagini pubblicate?
3. Per le ricostruzioni complesse (query di riferimento di US-015, lezioni esistenti, attesi delle presenze) come si confrontano viste o funzioni del database e tool del plugin, rispetto a privilegi senza DDL, attribuzione dell'autore, testabilità su PostgreSQL reale e confine con le regole di comportamento?
4. Quale ripartizione dei contenuti tra `SOUL.md`, skill e dati calcolati porta `SOUL.md` sotto 15.000 caratteri? Con quali rischi e limiti, quale raccomandazione e quali ADR o decisioni dell'utente servono a TEC-046?

## Metodo e isolamento

L'analisi del codice usa i sorgenti estratti con `docker create` e `docker cp` dall'immagine fissata `nousresearch/hermes-agent:v0.22.7@sha256:e6d81ae52ebf6a43efa529701405509f20054ba818f179ddd748bed4f8af584c`, senza avviarla. I percorsi citati sotto sono relativi a `/opt/hermes` dell'immagine.

Le prove dinamiche, eseguite il 2026-11-14 con Docker 29.9.3, usano progetti Compose temporanei con nome univoco (`spike003-*`, `spike003db-*`) e rete interna. Ogni progetto ha volumi, immagini (`<progetto>-hermes`, `-spike-hermes`, `-postgres`) e segreti sintetici propri. Prima dell'avvio la configurazione risolta è stata controllata: volumi e immagini avevano il prefisso del progetto, nessun riferimento ai nomi dello studio o di produzione. Lo stack dello studio non era in esecuzione e non è stato toccato.

Al termine tutte le risorse sono state rimosse, senza container, volumi o reti residui. Gli script esplorativi (sostituto del modello, launcher di prova, patch sperimentale, plugin di prova, sonde) sono rimasti in `tmp/`, ignorata da Git, e non sono integrati. I risultati registrano soltanto marcatori sintetici, nomi dei tool e valori booleani.

La sonda del gateway usa l'immagine del progetto più due skill sintetiche, inserite in `/opt/pilates/release/skills` con proprietario root e permessi `0644`/`0755`. Il webhook firmato usa i numeri sintetici `1555555011x`, il sostituto locale di Meta di `scenarios/` e un modello deterministico che emette chiamate ai tool su comando. Il launcher di prova deriva da `scenarios/gateway-launcher.sh` e chiama `pilates_trusted.install()`; poi applica la variante sperimentale. Le varianti sono state eseguite in sequenza sullo stesso volume, ciascuna con un mittente diverso:

| Variante | Configurazione e adattamenti |
| --- | --- |
| V3 | `hermes/config.yaml` attuale, senza montaggio delle skill del progetto: equivale alla baseline operativa. |
| V0 | configurazione attuale con le skill del progetto montate in sola lettura (`type: image`) su `/opt/data/skills`. |
| V1 | V0 con `skills` aggiunto a `platform_toolsets.whatsapp_cloud` e tolto da `agent.disabled_toolsets`; allowlist attuale (solo `studio_sql_query`). |
| V2 | V1 con `skill_manage` escluso dal registro dei tool e allowlist `studio_sql_query`, `skill_view`, `skills_list` nei due percorsi. |
| V2b | V2 con impostazioni difensive (`skills.template_vars: false`, `skills.inline_shell: false`, `skills.creation_nudge_interval: 0`, `curator.enabled: false`). |
| V2c | V2b con anche `skills_list` fuori dal registro, allowlist `studio_sql_query`, `skill_view`, indice di Hermes privato delle due frasi che invitano a modificare o salvare skill, `skills.project_discovery: false` e `auxiliary.background_review.enabled: false`. |
| V4 | toolset `skills` ancora disabilitato; un plugin di prova registra `studio_skill(name)`, che legge `SKILL.md` dal montaggio in sola lettura; allowlist `studio_sql_query`, `studio_skill`. |

La sonda del database usa PostgreSQL 17.10 del progetto, ruoli e migrazioni reali (`prisma migrate deploy`) e fixture sintetiche. Le fixture sono inserite dal migratore come nell'harness conversazionale: contesto autore fidato e trigger dell'autore disabilitati solo nella transazione di preparazione. Il prototipo di funzioni e viste è applicato dal migratore, proprietario dello schema; le verifiche sono eseguite con il ruolo `studio_agent`.

## Findings

### 1. Skill in Hermes 0.22.7: scoperta, caricamento, iniezione e sola lettura

**Toolset.** `toolsets.py` definisce `skills` con tre tool: `skills_list` (nomi e descrizioni), `skill_view` (contenuto di `SKILL.md` o di un file collegato tramite `file_path`) e `skill_manage`. Quest'ultimo ha le azioni `create`, `edit`, `patch`, `delete`, `write_file` e `remove_file` (`tools/skill_manager_tool.py`). La configurazione abilita o disabilita interi toolset (`platform_toolsets`, `agent.disabled_toolsets`), non singoli tool. Una voce di `disabled_toolsets` è sottratta tool per tool alla fine della risoluzione: con `skills` disabilitato sparisce anche `skill_view`.

L'installazione dall'hub è solo da CLI dell'operatore (`hermes skills install`). Il comando gateway `/skills` gestisce soltanto le scritture in attesa di approvazione. Il modello non ha un tool di installazione: i toolset `terminal`, `file`, `code_execution` e `catalog` non sono disponibili.

**Scoperta.** `agent/skill_utils.py::get_skill_search_roots` considera, in ordine di precedenza:

1. le cartelle di progetto attendibili (`skills.trusted_project_dirs`);
2. la cartella locale `$HERMES_HOME/skills`, cioè `/opt/data/skills` nel volume;
3. `skills.create_dir`;
4. `skills.external_dirs`.

Uno stesso nome in una cartella con precedenza maggiore oscura gli altri. Inoltre `docker/stage2-hook.sh` e `gateway/run_bootstrap.py` sincronizzano a ogni avvio le skill incluse in Hermes (`/opt/hermes/skills`, 44 `SKILL.md`) in `$HERMES_HOME/skills`. In V3 il volume conteneva le 44 skill e `.bundled_manifest`; `/reload-skills` ne riportava 39 utilizzabili sulla piattaforma.

Anche le skill registrate da un plugin (`hermes_cli/plugins_content.py::register_skill`) sono di sola lettura e si caricano come `<plugin>:<nome>` tramite `skill_view`. Non eliminano però né la necessità di `skill_view` né le skill del volume nell'indice.

**Iniezione.** `agent/system_prompt.py::_skills_prompt` aggiunge al prompt di sistema un indice `## Skills` con `<available_skills>` solo se tra i tool validi c'è `skills_list`, `skill_view` o `skill_manage`. Ogni riga riporta il nome e la descrizione del frontmatter, tagliata a 60 caratteri (`SKILL_PROMPT_DESC_LIMIT`). L'intestazione impone di caricare le skill pertinenti («you MUST load it with skill_view(name)»). Contiene sempre anche «If a skill has issues, fix it with skill_manage(action='patch')» e «After difficult/iterative tasks, offer to save as a skill», indipendentemente dai tool disponibili (`agent/prompt_builder.py::_render_skills_index`). `SKILLS_GUIDANCE` («record it with skill_manage») si aggiunge solo se `skill_manage` è disponibile.

Il contenuto entra nel contesto per altre tre vie:

- come risultato di `skill_view`;
- con `skills.auto_load`, che fissa intere skill nel prefisso stabile del prompt, solo con un tool di skill attivo;
- con il comando `/<nome-skill>` inviato dall'utente in chat (`gateway/run_inbound.py::_hm_skill_slash_rewrite`). Questo comando sostituisce il messaggio con il contenuto della skill e non dipende dai toolset abilitati.

All'apertura `skill_view` sostituisce di default `${HERMES_SKILL_DIR}` e `${HERMES_SESSION_ID}` (`skills.template_vars`). Esegue snippet `` !`cmd` `` solo con `skills.inline_shell`, disattivato di default, e installa pacchetti per i `deps:` del frontmatter. Una seconda apertura di un contenuto identico nella stessa sessione restituisce un segnaposto breve (`tools/skills_tool_dedup.py`), azzerato a ogni compattazione. I risultati dei tool oltre 100.000 caratteri sono spostati su file con un'anteprima (`tools/budget_config.py`), soglia lontana dalle dimensioni previste delle skill.

**Scritture autonome di Hermes.** La revisione in background che crea o aggiorna skill dopo i turni parte solo se `skill_manage` è tra i tool validi (`agent/turn_finalizer.py`). Il curatore (`agent/curator.py`) è attivo di default, tiene lo stato in `skills/.curator_state` e archivia solo le skill che gestisce. Con le skill montate in sola lettura non può scrivere, e va comunque disabilitato.

**Percorsi di esecuzione e allowlist.** `skill_view` e `skills_list` sono tra i tool parallelizzabili (`agent/tool_dispatch_helpers.py`). Due o più chiamate nello stesso messaggio passano quindi dal percorso concorrente (`agent/tool_executor.py::_ConcurrentBatch._dispatch_worker`), una sola da quello sequenziale (`_resolve_sequential_dispatch`). `skill_manage` non è parallelizzabile e passa sempre da quello sequenziale. `pilates_trusted.py` intercetta entrambi i percorsi e oggi consente solo `studio_sql_query`. Indipendentemente da questo, i nomi non annunciati al modello sono respinti come tool inesistenti prima dell'esecuzione (`agent/turn_tool_validation.py`).

Esiti osservati nelle richieste ricevute dal modello sintetico:

| Variante | Tool annunciati | Indice skill | `skill_view` | `skill_manage` / scrittura |
| --- | --- | --- | --- | --- |
| V3 | `studio_sql_query` | no | — | — |
| V0 | `studio_sql_query` | no | tool inesistente | — |
| V1 | `skill_manage`, `skill_view`, `skills_list`, `studio_sql_query` | sì, con invito a `skill_manage` e `SKILLS_GUIDANCE` | «Tool not permitted» nel percorso sequenziale (una chiamata) e concorrente (due chiamate) | «Tool not permitted» |
| V2 | `skill_view`, `skills_list`, `studio_sql_query` | sì, frasi su `skill_manage` e salvataggio ancora presenti | contenuto completo (6.824 caratteri); percorso concorrente riuscito; `file_path` riuscito; `../../config.yaml` rifiutato | tool inesistente, anche in un lotto misto con `skill_view` |
| V2c | `skill_view`, `studio_sql_query` | sì, senza le due frasi | come V2; `skills_list` tool inesistente | tool inesistente |
| V4 | `studio_skill`, `studio_sql_query` | no | tool inesistente | tool inesistente; `studio_skill` rifiuta i nomi fuori schema |

Il montaggio di tipo `image` su `/opt/data/skills` è risultato in sola lettura (`ro`). Come utente root e come utente Hermes (uid 10000) sono falliti creazione di file, creazione di cartelle, aggiunta a un `SKILL.md` e rimozione di una skill, con «Read-only file system» oppure, per l'aggiunta dell'utente Hermes, per i permessi del file. Dopo tutti i tentativi del modello l'impronta dell'albero era invariata e nel volume e nel filesystem del container non esisteva alcuna skill creata. `.usage.json` non è stato creato.

`.skills_prompt_snapshot.json`, con nomi e descrizioni delle skill, è scritto nella radice del volume. Il montaggio nasconde le 44 skill incluse in Hermes (V0: `/hermes-agent` è un comando sconosciuto); la sincronizzazione all'avvio non può scrivere e l'avvio resta sano. Il log del container conteneva solo `hermes_launch`.

**Risposta.** Il toolset `skills` comprende `skills_list`, `skill_view` e `skill_manage`. Non può essere abilitato in sola lettura con la sola configurazione. Con l'allowlist attuale abilitarlo è inutile: ogni chiamata è rifiutata in entrambi i percorsi. Inoltre annuncerebbe `skill_manage` e le relative istruzioni.

La sola lettura si ottiene con tre barriere indipendenti, verificate in V2c:

1. `skill_manage` (e `skills_list`, superfluo) non entra nel registro, quindi non è annunciato ed è respinto come inesistente;
2. l'allowlist dei due percorsi ammette solo `studio_sql_query` e `skill_view`;
3. le skill sono montate in sola lettura dall'immagine sopra `/opt/data/skills`.

Completano la protezione le impostazioni difensive di V2c e la rimozione delle due frasi dall'indice. Il metodo segue quello dei punti interni già adattati in `pilates_trusted.py`, con lo stesso obbligo di ripetere le prove a ogni aggiornamento di Hermes.

### 2. Dove finisce il contenuto delle skill e compatibilità

| Destinazione | Esito osservato |
| --- | --- |
| Richiesta del turno | Il risultato di `skill_view` (o di `studio_skill`) è un messaggio `tool` della richiesta successiva e costa una chiamata al modello in più. |
| Turni seguenti | Il contenuto torna integralmente in tutte le richieste della sessione fino alla compattazione. Un nuovo caricamento identico restituisce un segnaposto (circa 380 caratteri). |
| Cronologia persistita | Il contenuto è salvato in `/opt/data/state.db*`, quindi nel backup del volume Hermes, come il resto della conversazione. |
| Compattazione | Nella compattazione per inattività il modello sintetico ha ricevuto una richiesta di riassunto senza i corpi delle skill (circa 6.800 e 1.000 caratteri), sostituiti dal segnaposto `[SKILL_PRUNED: content lost in compression; reload with skill_view(name='…')]`. Il risultato breve di un file collegato (160 caratteri) è invece arrivato al riassunto. Dopo la compattazione il contesto conteneva il riassunto con i segnaposto e nessun corpo; un nuovo `skill_view` ha restituito il contenuto completo. In V4 il risultato di `studio_skill` è stato ugualmente escluso dal riassunto, ma per i tool dei plugin Hermes non genera un segnaposto di ricarica: il segnaposto osservato in V4 deriva da un tentativo di `skill_view` nella stessa sessione. |
| Richieste ausiliarie | Nessuna delle 7 richieste ausiliarie osservate (titoli delle sessioni) conteneva marcatori delle skill. Il comando utente `/refine` avvia una revisione che invia al modello l'intera conversazione, skill comprese, anche con `auxiliary.background_review.enabled: false`. |
| Comandi utente | `/<nome-skill>` inserisce la skill come messaggio utente, persistito come tale (V0 e V2c). Nella baseline attuale (V3) un utilizzatore autorizzato può già caricare così le 44 skill incluse in Hermes. |
| Log | Il container registra solo `hermes_launch`; nessun marcatore nei log di Hermes. |

Nessuna richiesta al modello conteneva i numeri sintetici dei mittenti. In V2 `${HERMES_SESSION_ID}` è stato sostituito con l'identificativo della sessione, che conteneva cifre ma non il numero del mittente; in V2b e V2c è rimasto letterale. Le skill sono testo statico versionato, senza dati personali, e seguono il percorso del contesto dello studio verso OpenRouter già ammesso per conversazioni e riassunti. La protezione dei numeri prevista per TEC-042 non ne dipende.

**REQ-NFR-006.** L'harness conversazionale (`npm run test:conversation`) costruisce l'immagine del progetto e usa `compose.yaml` più un override. Copia `hermes/config.yaml` e usa `scenarios/gateway-launcher.sh`, che chiama `pilates_trusted.install()`. Se TEC-046 attua montaggio, configurazione e adattamenti in questi file, l'harness li eredita senza modifiche. La prova con stub ha confermato che il marcatore delle aggregazioni SQL e il sostituto di Meta funzionano con le chiamate a `skill_view` intercalate. Restano due costi da verificare con il modello reale nell'esecuzione completa del catalogo prevista da TEC-046: più richieste e più tempo per turno, e variabilità nella scelta della skill. Scenari e verifiche su PostgreSQL restano invariati.

**Montaggio dalle immagini pubblicate.** Il montaggio `type: image` con `subpath: opt/pilates/release/skills` e destinazione `/opt/data/skills` funziona accanto ai tre montaggi esistenti dalla stessa immagine, in sola lettura anche per root. Porta le skill nuove nei volumi esistenti alla ricreazione del container, senza copia nel volume. Usa lo stesso meccanismo e gli stessi requisiti Docker di `SOUL.md`, configurazione e plugin (più montaggi `subpath`, Docker 29). È quindi compatibile con la produzione da immagini senza checkout. Andrà aggiunto a `test:images`.

### 3. Ricostruzioni: viste o funzioni del database e tool del plugin

Il prototipo applicato dal migratore definisce tre funzioni `LANGUAGE sql STABLE` con diritti dell'invocante, nomi qualificati e `GRANT EXECUTE` al solo `studio_agent`:

- `app.existing_lessons(dal, al)`: lezioni esistenti;
- `app.expected_clients(dal, al)`: clienti attesi per data e ora, deduplicati;
- `app.lesson_teachers(dal, al)`: insegnante atteso, indicazione valida, insegnante della lezione e nomi.

Per confronto definisce anche una vista. Risultati su PostgreSQL reale:

- **Equivalenza.** Con il ruolo agente, `app.lesson_teachers` ha restituito righe identiche alla query di riferimento estratta da `hermes/SOUL.md` per marzo 2026 (16 lezioni, con il passaggio all'ora legale), per l'ultima settimana di ottobre 2026 (5, con l'ora ripetuta) e per l'intero 2026 (167). I casi campione (sostituzione, indicazione senza clienti, lezione da sola presenza senza insegnante, regola disattivata prima dell'inizio, indicazione annullata) e i conteggi di un insegnante con `FILTER` sono coerenti con le definizioni di US-015.
- **Attesi.** `app.expected_clients` esclude la regola creata dopo la lezione e quella disattivata prima dell'inizio. Deduplica lo stesso cliente previsto da due regole, esclude le 02:30 inesistenti del 29 marzo e conta una sola volta le 02:30 ripetute del 25 ottobre. Le registrazioni mancanti si ottengono con un `LEFT JOIN` sulle presenze valide, senza ripetere le definizioni.
- **Privilegi.** Il ruolo agente esegue le funzioni. Riceve `42501` per `CREATE FUNCTION`, `CREATE OR REPLACE` di una funzione esistente, `ALTER`, `DROP`, `COMMENT`, `CREATE VIEW`, `CREATE TEMP VIEW` e funzioni in `pg_temp`. Il suo `GRANT EXECUTE ... TO PUBLIC` termina senza errore ma con l'avviso «no privileges were granted»; i privilegi della funzione restano invariati. Una funzione con diritti dell'invocante che legge `studio_private` fallisce per l'agente (`42501`) e riesce per il migratore: non apre accessi alla parte privata.
- **Scritture.** Una funzione SQL `STABLE` con `INSERT` si crea, ma la sua esecuzione fallisce (`0A000`). Le funzioni di lettura non toccano l'autore, che resta impostato dai trigger alle scritture sulle tabelle esistenti.
- **Viste.** I privilegi predefiniti del migratore concedono all'agente `SELECT`, `INSERT`, `UPDATE` e `DELETE` anche sulle nuove viste. Una vista semplice con i diritti del proprietario è aggiornabile e salta il controllo per colonna: riscrivere `outcome` di una presenza è rifiutato direttamente sulla tabella (`42501`) ma, tramite la vista, solo dal trigger (`23514`). Con `security_invoker = true` torna il `42501`. Le viste, inoltre, non accettano i parametri del periodo.
- **Pianificatore.** Senza clausole `SET` le funzioni SQL vengono espanse nella query chiamante (nessun «Function Scan»). Con `SET search_path` il pianificatore le tratta come opache. Sui dati sintetici di un anno una chiamata ha richiesto circa 3–4 ms, come la query di riferimento.
- **Numeri.** Le funzioni restituiscono solo date, orari, ID e nomi. Restano compatibili con la protezione dei numeri degli autori pianificata in TEC-042.

| Criterio | Funzioni SQL di sola lettura | Viste | Tool del plugin |
| --- | --- | --- | --- |
| Privilegi senza DDL | Create dal migratore; per l'agente solo `EXECUTE` esplicito; diritti dell'invocante, nessun accesso nuovo | Ricevono di default DML per l'agente; servono `security_invoker` e `REVOKE` | Nessuna migrazione; esegue come `studio_agent`; amplia l'allowlist e lo schema dei tool |
| Attribuzione dell'autore | Non scrivono (`STABLE`); invariata | Le viste aggiornabili offrono un secondo percorso di scrittura | La lettura non tocca l'autore; per scrivere servirebbe lo stesso contesto del broker usato oggi per ogni query |
| Testabilità su PostgreSQL reale | Diretta in `test:db` con `pg` e fixture; oracolo di US-015 riusabile; `test:upgrade` per la migrazione | Diretta, ma senza parametri | Il plugin richiede un turno WhatsApp autenticato e il broker: in `test:db` il registro verifica oggi solo i rifiuti, i risultati richiedono `test:author` o un'emulazione del turno |
| Confine con il comportamento | Calcolano definizioni di dato del glossario; conferme e resoconti restano nelle istruzioni | Come le funzioni | SQL e definizioni finiscono nel codice Python, fuori dalle migrazioni, e la descrizione del tool tende a diventare istruzione |

### 4. Ripartizione, stima e raccomandazione

`hermes/SOUL.md` misura oggi 40.611 caratteri. Il conteggio usa i caratteri Python; i byte sono 40.838. Hermes tronca i file di contesto oltre un limite che non scende sotto 20.000 caratteri: un file entro 15.000 resta integro con qualsiasi finestra. La ripartizione proposta assegna tutti i 78 blocchi attuali, senza duplicati, e conteggia i blocchi spostati alla lettera:

| Destinazione | Contenuto | Caratteri |
| --- | --- | --- |
| `SOUL.md` | Identità e nome, nessuna profilazione, riconoscimento del mittente, data, fasce e periodi relativi, uso del tool e schema compatto, glossario, autore, protezioni dell'identità e della gestione: blocchi esistenti | 8.393 |
| `SOUL.md`, testo nuovo | Indice delle skill con quando usarle (1.137), funzioni del database (445), principi comuni (599), glossario dell'insegnante della lezione (257), più i separatori | 2.446 |
| **`SOUL.md` stimato** | | **10.839** |
| `studio-regole-clienti` | Registrazione, consultazione, cambiamenti e storico delle regole | 1.522 |
| `studio-presenze` | Presenze, assenze, assenze anticipate, correzioni e storico | 7.189 |
| `studio-presenze-consultazioni` | Presenti e assenti, mancanti, statistiche | 1.969 |
| `studio-insegnanti-regole` | Anagrafica d'uso, regole e intervalli, esempi CTE, sovrapposizioni | 6.783 |
| `studio-insegnanti-indicazioni` | Indicazioni, sostituzioni, correzioni | 6.849 |
| `studio-insegnanti-consultazioni` | Consultazioni per insegnante, senza la query di riferimento | 4.603 |
| Sostituito dalle funzioni | Query di riferimento e relativo paragrafo; definizione dell'insegnante atteso | 3.276 |

Il totale arriva a 10.839 sommando i 2.446 caratteri di testo nuovo ai blocchi esistenti, con un margine di circa 4.100 caratteri sotto il limite. I testi nuovi sono bozze esplorative in `tmp/` e vanno riscritti in TEC-046.

Ci sono 14 rinvii testuali («come sopra», «descritta sotto»), alcuni tra aree diverse. Riguardano la ricerca di clienti e insegnanti per nome, l'uso di «io» con `app.current_sender_teacher_id()` e le fasce. Vanno risolti spostando nel nucleo poche regole condivise, circa 1.000–1.200 caratteri: la stima diventa circa 11.900, sempre sotto 15.000. In un turno operativo il contesto stabile passa da circa 41.000 caratteri a circa 12.000. A questi si aggiungono l'indice di Hermes (circa 0,9–1,5 mila caratteri) e la skill caricata (1,5–7,2 mila).

**Raccomandazione per TEC-046.**

1. Istruzioni di dettaglio in skill Hermes di sola lettura secondo V2c:
   - cartella `hermes/skills/<nome>/SKILL.md`, solo `name` e `description` di al più 60 caratteri, senza `deps`, `${…}`, `` !` ``, script o riferimenti;
   - copia nell'immagine in `/opt/pilates/release/skills` e montaggio `type: image` su `/opt/data/skills`;
   - `skills` nei toolset della piattaforma e tolto dai disabilitati;
   - in `pilates_trusted.py`, allowlist dei due percorsi `studio_sql_query`/`skill_view`, rifiuto della registrazione di `skill_manage` e `skills_list` e rimozione delle due frasi dall'indice;
   - in configurazione `skills.template_vars: false`, `skills.inline_shell: false`, `skills.creation_nudge_interval: 0`, `skills.project_discovery: false`, `curator.enabled: false`, `auxiliary.background_review.enabled: false`;
   - in `SOUL.md`, l'indice con quando caricare ciascuna skill, il divieto di creare, modificare o proporre di salvare skill e la ricarica dopo i segnaposto di compattazione.

   Rispetto a V4 conserva il segnaposto di ricarica dopo la compattazione e la deduplica, che riducono il rischio di comportamenti diversi nelle conversazioni lunghe. In cambio aggiunge due punti interni di Hermes da verificare a ogni aggiornamento.
2. Ricostruzioni nel database con funzioni SQL `STABLE`, diritti dell'invocante, senza `SET`, nomi qualificati, create da migrazione e con `GRANT EXECUTE` esplicito al solo agente: `app.existing_lessons`, `app.expected_clients`, `app.lesson_teachers`. Niente viste per i periodi; per eventuali viste semplici usare `security_invoker = true` e revocare il DML. Le definizioni di conteggio («tenuta», «in sostituzione», «sostituita da altri») restano esempi di filtro nelle skill.
3. Prove di TEC-046, oltre a quelle già nei criteri:
   - test in memoria su lunghezza e frontmatter delle skill e sulla corrispondenza tra indice di `SOUL.md` e cartelle;
   - prove sul gateway reale come queste sonde: tool annunciati, indice, tentativi di scrittura e lotti concorrenti, sola lettura per root, compattazione con segnaposto, assenza dei numeri;
   - in `test:db` equivalenza, privilegi, assenza di colonne con numeri e funzione che non raggiunge `studio_private`;
   - `test:upgrade` della migrazione e `test:images` del montaggio.

## Limits, costs and risks

- **Non verificato con il modello reale:** scelta e caricamento della skill giusta, rispetto delle istruzioni divise, effetto della compattazione sul comportamento. Le prove usano un modello deterministico sintetico; la regressione completa resta un criterio di TEC-046.
- **Costo e latenza:** il primo caricamento di una skill aggiunge una richiesta al modello con l'intero contesto. Le skill caricate restano nella cronologia fino alla compattazione.
- **Punti interni di Hermes:** il filtro del registro, la rimozione delle due frasi dall'indice e l'allowlist dipendono da nomi interni della 0.22.7. Una variazione del testo dell'indice renderebbe inefficace la sostituzione senza errori: il test deve verificare l'assenza delle frasi nella richiesta al modello. Anche i segnaposto di compattazione e la deduplica sono comportamenti interni.
- **Comandi slash già esposti:** senza `allow_admin_from` (`gateway/slash_access.py`) ogni utilizzatore autorizzato può usare tutti i comandi del gateway. Nella baseline attuale può già caricare con `/hermes-agent` le 44 skill incluse in Hermes; con `/refine` invia la conversazione a una revisione del modello, anche disattivando la revisione automatica. Con le skill del progetto si aggiungono i comandi `/<nome-skill>`. Il montaggio proposto nasconde le skill incluse in Hermes; `/refine`, `/review` (non provato) e gli altri comandi restano, come oggi.
- **Volume e backup:** le skill incluse in Hermes restano nel volume sotto il montaggio. I contenuti delle skill caricate entrano nella cronologia SQLite e nei backup del volume come la conversazione. `.skills_prompt_snapshot.json` contiene solo nomi e descrizioni.
- **Viste:** i privilegi predefiniti concedono DML sulle nuove viste e le viste con diritti del proprietario superano il controllo per colonna (verificato); ogni vista futura va revisionata.
- **Ripartizione:** dimensioni stimate su blocchi copiati alla lettera; la riscrittura, i rinvii tra aree e TEC-042 cambieranno i numeri. La divisione in sei skill e i nomi sono una proposta.
- **Ambito delle prove:** solo Docker 29.9.3, dati sintetici di piccola dimensione (167 lezioni annue) e un'esecuzione per variante. Non sono stati provati la richiesta di titolo quando il primo messaggio della sessione è un comando di skill, `/review`, altre versioni di Hermes e la produzione su `jarvis`, che non è stata toccata.
- **Riferimento da allineare:** REQ-AGENT-008 richiede che viste, funzioni o tool rispettino «la protezione dei numeri di REQ-NFR-006», ma i numeri sono protetti da REQ-NFR-005 (e i log da REQ-NFR-002); REQ-NFR-006 riguarda la verifica conversazionale. Anche il secondo criterio di questo spike cita REQ-NFR-006 con un elenco (contesto, cronologia, compattazione, richieste ausiliarie) che ricalca REQ-NFR-005. Questo rapporto copre entrambe le letture; la correzione del requisito è una decisione dell'utente.

## Recommendations

- **ADR da registrare in TEC-046 (proposta ADR-004 — «Skill di sola lettura e dati calcolati per il contesto compatto»):**
  - meccanismo delle skill: V2c raccomandata, V4 come alternativa con meno punti interni ma senza segnaposto di ricarica;
  - le tre barriere e le impostazioni difensive;
  - montaggio e immagini;
  - funzioni SQL di sola lettura con i relativi vincoli;
  - punti interni da riverificare;
  - prove richieste.
- **Decisioni dell'utente prima dell'attuazione:**
  1. scelta tra V2c e V4;
  2. accettazione dei comandi `/<nome-skill>`, oppure item separato per limitare i comandi slash, che riguarderebbe anche l'esposizione già presente di `/refine`, `/review` e delle skill incluse in Hermes;
  3. allineamento di REQ-AGENT-008 a REQ-NFR-005;
  4. granularità e nomi delle skill e collocazione delle regole condivise.
- **TEC-046:** attuare la raccomandazione del §4 con le prove indicate. Aggiornare `AGENTS.md` §5, design, README e `test:local` per la nuova fonte delle regole, come già previsto dai suoi criteri.
- **Nessun nuovo item aggiunto:** l'eventuale limitazione dei comandi slash è da valutare con l'utente su `main`.

## Sources

- Immagine `nousresearch/hermes-agent:v0.22.7@sha256:e6d81ae52ebf6a43efa529701405509f20054ba818f179ddd748bed4f8af584c`:
  - toolset e tool: `toolsets.py`, `tools/skills_tool.py`, `tools/skill_manager_tool.py`, `tools/skills_tool_dedup.py`, `tools/budget_config.py`;
  - scoperta, indice e caricamento: `agent/skill_utils.py`, `agent/system_prompt.py`, `agent/prompt_builder.py`, `agent/skill_preprocessing.py`, `agent/skill_commands.py`;
  - esecuzione dei tool: `agent/tool_executor.py`, `agent/tool_dispatch_helpers.py`, `agent/turn_tool_validation.py`;
  - compattazione e scritture autonome: `agent/context_compressor.py`, `agent/turn_finalizer.py`, `agent/curator.py`;
  - gateway: `gateway/run_inbound.py`, `gateway/run_bootstrap.py`, `gateway/slash_commands_goals.py`, `gateway/slash_access.py`, `hermes_cli/plugins_content.py`, `docker/stage2-hook.sh`.
- Progetto: `hermes/SOUL.md`, `hermes/config.yaml`, `hermes/pilates_trusted.py`, `hermes/plugins/pilates-postgres/__init__.py`, `hermes/Dockerfile`, `compose.yaml`, `scenarios/gateway-launcher.sh`, `scripts/conversation.mjs`, `prisma/migrations/`, `db/bootstrap/roles.sql`.
- [Documentazione PostgreSQL 17](https://www.postgresql.org/docs/17/): `CREATE VIEW` (`security_invoker`, viste aggiornabili), `CREATE FUNCTION` (`STABLE`, `SECURITY INVOKER`/`DEFINER`, `SET`), inlining delle funzioni SQL, `GRANT`.
