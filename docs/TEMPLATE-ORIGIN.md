# Origine e confronto del template

Questa registrazione è versionata nel progetto: non dipende dai remote Git configurati nel clone dell'operatore. Un riferimento solo confrontato non equivale a un'adozione; ogni aggiornamento richiede una decisione e un'attività separate secondo il processo del progetto. TEC-023 adotta le risorse indicate sotto, non il template indiscriminatamente; TEC-024 ne aggiorna alcune alla v1.5.0, TEC-028 processo e skill alla v1.6.1 e TEC-029 alla v1.7.0.

## Riferimenti e limiti dell'evidenza

- Origine dichiarata: <https://github.com/toto-castaldi/agile-project-template>.
- Base di confronto della copia iniziale per le risorse indicate sotto: commit template `aba6fcd50d25861a2ab0ea759f937d45e817dec7`, senza tag noto. Nel commit iniziale del progetto `e9db82b1a1c7007a469bf6668e7a4f50b6e7ecaf` i blob delle risorse elencate coincidono con quelli di tale commit del template. È evidenza del contenuto iniziale, non prova che il repository del progetto discenda Git da quel commit né che ogni file del template sia stato adottato.
- Riferimento confrontato e adottato da TEC-023 per le risorse sotto: tag annotato `v1.4.0`, commit `e16bbec69c067bc9432bc588acd0d232716f3dbf`, verificato il 2026-11-07. Il branch predefinito pubblico `main` puntava allo stesso commit. Per eventuali confronti futuri fissare e verificare un nuovo commit; un riferimento solo confrontato non è automaticamente adottato.
- Riferimento fissato da TEC-024: tag `v1.5.0`, commit `0cea2fd0ee138edbb845a01aa6bced2872145d2a`, verificato il 2026-11-07 con clone isolato. L'adozione è limitata alle risorse indicate sotto.
- Riferimento fissato da TEC-028: tag annotato `v1.6.1`, commit `6bea086a1ef9f1cd4b7ab79e86a504ddceb81788`, verificato il 2026-11-07 con clone isolato; il branch predefinito pubblico `main` puntava allo stesso commit. Confrontati i diff `0cea2fd0ee138edbb845a01aa6bced2872145d2a..6bea086a1ef9f1cd4b7ab79e86a504ddceb81788` di `docs/PROCESS.md`, delle skill, di `AGENTS.md`, `README.md` e del visualizzatore, e le differenze tra target e progetto. Prima dell'adozione processo e skill del progetto coincidevano con la base v1.5.0; il visualizzatore non cambia tra v1.5.0 e v1.6.1. L'adozione è limitata alle risorse indicate sotto.
- Riferimento fissato da TEC-029: tag annotato `v1.7.0`, commit `d261947d4c76b08147c17ddb0e1cc630ba7bd0d3`, verificato il 2026-11-07 con clone isolato; il branch predefinito pubblico `main` puntava allo stesso commit. Il diff `6bea086a1ef9f1cd4b7ab79e86a504ddceb81788..d261947d4c76b08147c17ddb0e1cc630ba7bd0d3` tocca solo `docs/PROCESS.md`, `.agents/skills/orchestrate/SKILL.md` e `README.md`. Prima dell'adozione `docs/PROCESS.md` e `orchestrate` coincidevano con la base v1.6.1 e le altre skill erano già identiche alla v1.7.0. Il `README.md` del template è solo confrontato. L'adozione è limitata alle risorse indicate sotto.
- Il riporto parziale di TEC-015 nel template è il commit `b4bc15f3a5944330826d9379fef6d60987ec1798`, antenato del tag `v1.4.0`; la sua pubblicazione è stata verificata il 2026-11-07 sul repository pubblico. Il commit del progetto `6b3b5aca1f7b9774d16c610e0e336e9d79102abd` contiene le modifiche locali al gate. Il riporto non equivale all'adozione delle altre modifiche intervenute nel template.
- Per risorse non elencate, elementi aggiunti successivamente o provenienze non dimostrate, la base adottata è **sconosciuta**. L'assenza di una corrispondenza non dimostra l'assenza di una provenienza dal template.

## Inventario dopo TEC-023 e aggiornamenti TEC-024, TEC-028 e TEC-029

La base `aba6fcd50d25861a2ab0ea759f937d45e817dec7` si riferisce ai blob iniziali verificati. Le basi successive sono `e16bbec69c067bc9432bc588acd0d232716f3dbf` (`v1.4.0`) e, per le risorse indicate, `0cea2fd0ee138edbb845a01aa6bced2872145d2a` (`v1.5.0`) `6bea086a1ef9f1cd4b7ab79e86a504ddceb81788` (`v1.6.1`) e `d261947d4c76b08147c17ddb0e1cc630ba7bd0d3` (`v1.7.0`); le personalizzazioni restano nel progetto.

| Risorsa o gruppo | Base iniziale verificata | Confronto con v1.4.0 e stato attuale |
| --- | --- | --- |
| `docs/PROCESS.md` | `aba6fcd50d25861a2ab0ea759f937d45e817dec7` | Adottato v1.7.0 senza divergenze (TEC-029), inclusi lavoro parallelo §6.5 con orchestratore non bloccante e controllo di `main` rispetto a `origin/main`, date dall'orologio di sistema e conteggio meccanico degli stati. Il gate TEC-015 rimane nel processo e in `AGENTS.md`; la regola sui moduli è interpretata come concordato in `docs/TECHNICAL-DESIGN.md` §10. |
| `.agents/skills/add-item`, `start-task`, `finish-task`, `close-version`, `kickoff`, `merge-task` | `aba6fcd50d25861a2ab0ea759f937d45e817dec7` per ciascun `SKILL.md` | Adottati i file v1.6.1 senza divergenze (TEC-028), invariati in v1.7.0; il riferimento a tutte le suite in `close-version` include quelle elencate in `AGENTS.md`. |
| `.agents/skills/orchestrate` | Nessuna base precedente: aggiunta in `v1.6.0` | Adottato il file v1.7.0 senza divergenze (TEC-029): coordinamento non bloccante, controllo dei commit non pubblicati su `main` prima del primo clone, attività di backlog durante il lavoro dei worker. Le protezioni dello studio per i clone dei worker (niente `.env`, `.local/`, segreti o stato Pi personale; preparazione con `npm ci`) e il fermo su errori di fetch o del controllo stanno in `AGENTS.md` §10, non nella skill. |
| `CLAUDE.md`, `.claude/skills`, `docs/adr/_TEMPLATE.md`, `docs/spikes/_TEMPLATE.md` | `aba6fcd50d25861a2ab0ea759f937d45e817dec7` | Identici a v1.4.0, come verificato da TEC-022, e invariati fino a v1.7.0; `.claude/skills` è un collegamento versionato. |
| `AGENTS.md`, `BACKLOG.md`, `STATUS.md`, `README.md`, `CHANGELOG.md`, `.gitignore`, `docs/REQUIREMENTS.md`, `docs/TECHNICAL-DESIGN.md`, `docs/adr/README.md`, `docs/spikes/README.md` | `aba6fcd50d25861a2ab0ea759f937d45e817dec7` | Copie iniziali corrispondenti, poi personalizzate per lo studio: non sostituirle con i file generici del template. TEC-028 riporta a mano in `AGENTS.md` §10 i campi `Parallel work`, `Workspace root` (`../agent-pilates-studio-work`) e `Worker agent command` (`pi`) e in `README.md` la descrizione del lavoro parallelo in italiano; i testi generici v1.6.1 di questi file sono solo confrontati. TEC-029 aggiunge a mano in `AGENTS.md` §10 il fermo su errori di fetch o controllo e i limiti delle attività durante il lavoro dei worker, e in `README.md` la descrizione in italiano del coordinamento non bloccante; il testo generico v1.7.0 del `README.md` è solo confrontato. |
| `.pi/extensions/backlog/index.ts` | Nessuna base precedente | Aggiornato sulle funzionalità v1.5.0, invariate in v1.6.1 e v1.7.0, con adattamenti locali: riconoscimento di idee non assegnate su una sola riga, intestazione epic dal campo dell'item quando manca un epic contenitore e segnalazione degli errori imprevisti durante il refresh. |
| Prompt e configurazione Pi dello studio, codice, test e documentazione operativa | Sconosciuta o non applicabile | Risorse proprie o personalizzate; non presumere che siano condivise o che vadano sovrascritte. Non leggere configurazioni personali per il confronto. |

TEC-023 allinea il processo e le skill al riferimento fissato, risolvendo il disallineamento rilevato da TEC-022 senza sovrascrivere le risorse personalizzate dello studio. L'interpretazione concordata dell'espressione «unassigned» è documentata in `docs/TECHNICAL-DESIGN.md` §10; nessuna deroga al processo è introdotta. Le regole proprie dello studio restano in `AGENTS.md`.

## Procedura manuale per un nuovo confronto

Servono Git e accesso in lettura al repository pubblico. Eseguire da un clone pulito del progetto; non confrontare file locali privati, credenziali o configurazioni personali. I diff possono contenere tutto il testo dei file confrontati: rivederli prima di condividerli. Usare esclusivamente percorsi versionati e non sensibili.

1. Creare un clone temporaneo del template, senza modificare quello dell'operatore; individuare un tag o commit preciso e risolverlo a SHA completo. Ad esempio, in una subshell, con il tag scelto sostituito esplicitamente:

   ```sh
   (
     set -eu
     tmp=$(mktemp -d)
     trap 'rm -rf -- "$tmp"' EXIT
     git clone --quiet -- https://github.com/toto-castaldi/agile-project-template.git "$tmp/template"
     git -C "$tmp/template" rev-parse 'v1.4.0^{commit}'
   )
   ```

   Verificare origine, tag e commit e registrare la data; non assumere che `main` o un tag mobile restino invariati. Se un riferimento non è reperibile, dichiararlo non verificabile e fermarsi per quel confronto.
2. Per ogni risorsa selezionare dall'inventario la **base adottata dimostrata** e il nuovo commit confrontato. Una base sconosciuta resta sconosciuta: non sostituirla con l'ultimo tag o con un riferimento solo confrontato. Usare una directory temporanea nuova e rimuovere solo quella creata dalla procedura. Esempio completo per `docs/PROCESS.md`, dal progetto:

   ```sh
   (
     set -eu
     tmp=$(mktemp -d)
     trap 'rm -rf -- "$tmp"' EXIT
     git clone --quiet -- https://github.com/toto-castaldi/agile-project-template.git "$tmp/template"
     base=aba6fcd50d25861a2ab0ea759f937d45e817dec7
     target=e16bbec69c067bc9432bc588acd0d232716f3dbf
     path=docs/PROCESS.md
     git -C "$tmp/template" cat-file -e "$base^{commit}"
     git -C "$tmp/template" cat-file -e "$target^{commit}"
     git -C "$tmp/template" diff "$base" "$target" -- "$path"
     git -C "$tmp/template" show "$target:$path" > "$tmp/template-file"
     if git diff --no-index -- "$tmp/template-file" "$path"; then
       echo 'Nessuna differenza rispetto al progetto'
     else
       code=$?
       [ "$code" -eq 1 ] || exit "$code"
       echo 'Differenze da valutare; nessun file è stato aggiornato'
     fi
   )
   ```

   Il primo diff mostra l'evoluzione nel template, il secondo le differenze rispetto al progetto; il codice 1 del secondo indica differenze, non un errore. Per una risorsa assente in uno dei due riferimenti, registrare esplicitamente aggiunta o rimozione invece di trattare l'assenza come uguaglianza. Ripetere per i percorsi pertinenti, incluse le skill.
3. Con base sconosciuta, **saltare il primo diff**: verificare l'esistenza del file nel target e confrontare solo target e progetto come sopra. Il risultato non distingue una personalizzazione da un cambiamento upstream. Se il file non esiste in uno dei due, registrare l'assenza; non inventare un'antenata.
4. Valutare divergenze, sicurezza, compatibilità e conflitti con il processo; registrare commit completo, eventuale tag, data, percorsi, basi note o ignote e risultati come **confronto**. Aggiornare separatamente la base **adottata** soltanto dopo una decisione esplicita e l'effettiva integrazione verificata. Non usare merge, copie o sovrascritture automatiche.

## Verifica isolata

`npm run test:local` include una prova con repository e riferimenti sintetici: verifica un clone pulito della registrazione, il confronto tra due commit del template fittizio e le differenze rispetto a un progetto personalizzato, oltre al caso con base sconosciuta. Non usa rete o file personali dell'operatore. La verifica degli SHA pubblici e della loro raggiungibilità è distinta da tale prova e documentata sopra; non garantisce disponibilità futura o autenticità crittografica del repository remoto.
