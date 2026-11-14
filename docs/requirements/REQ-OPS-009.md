# REQ-OPS-009 — Launcher parametrico di aggiornamento

**State:** Active

L'operatore deve poter aggiornare manualmente la produzione con `~/update-agent-pilates.sh <commit>`, senza modificare lo script a ogni versione. Il launcher versionato accetta un solo SHA completo esplicito, rifiuta argomenti mancanti o non validi prima di invocare Docker e inoltra lo stesso commit all'immagine `ops` selezionata. Non sceglie versioni automaticamente, non richiede un checkout né credenziali GitHub e non duplica backup, migrazioni o verifiche di salute di REQ-OPS-005; un errore resta un errore.

La procedura deve spiegare come leggere da GitHub sia l'ultimo commit di `main` sia l'ultimo commit di `main` con CI su push completata e immagini pubblicate, distinguendoli: il primo può non essere ancora installabile. La scelta del commit e l'avvio dell'aggiornamento restano intenzionali; installare o sostituire il launcher non aggiorna i servizi. La copia del launcher nella home di `jarvis` non porta sul server il codice applicativo o i segreti del repository.
