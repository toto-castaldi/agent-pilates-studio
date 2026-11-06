# TEC-012 — Prove degli scenari conversazionali

## Modalità di registrazione

Per ogni esecuzione annotare data, commit, modello, scenari, esito, eventuali limiti e versioni o prerequisiti rilevanti. Non riportare messaggi, risposte, numeri, chiavi o log grezzi. `OK` attesta solo i controlli del catalogo, non la correttezza semantica completa o la conformità privacy.

## Evidenza del 2026-11-06

- Branch `task/TEC-012-scenari-conversazionali-harness`, modifiche candidate a TEC-012; modello `openai/gpt-6.1-terra`, OpenRouter reale, PostgreSQL e gateway Hermes reali, webhook sintetico firmato e sostituto locale Meta.
- Scenario `registrazione-consultazione`: **OK** in due esecuzioni con relay sul socket Unix; risposta e stato relazionale sono stati controllati dopo entrambi i turni. Le prime esecuzioni interpretavano erroneamente l'avviso di canale home come risposta e si sono concluse con errore; non costituiscono prove riuscite.
- La prova senza credenziale si è arrestata con errore esplicito. Una prova con identificativo di modello inesistente e un'altra con credenziale sintetica non valida hanno restituito errore, senza stampare output grezzo o gli indicatori sintetici controllati. Dopo le prove positive e negative non risultavano container, volumi, reti, immagini o directory temporanee con i prefissi del test.
- `npm run test:local` verifica catalogo sintetico ed esclusione dalla CI; il rifiuto della credenziale assente è stato provato separatamente. I test unitari verificano corrispondenze e casi negativi di risposta, stato, avviso iniziale e autorizzazione del relay. `npm run test:author` ha verificato separatamente il percorso autenticato con modello sintetico. Il gate rapido è verificato separatamente alla chiusura dell'item.
- Nelle prime prove del prototipo, prima del relay, la chiave reale è stata copiata in un file temporaneo privato e montata nel container, contrariamente all'istruzione di non inserirla in file. Il file e le risorse temporanee sono stati rimossi; non è stata osservata un'esposizione nei risultati, ma la rimozione non prova l'assenza di copie residue del sistema. La versione finale conserva la chiave solo nell'ambiente e nella memoria del processo host.

La risposta libera del modello è non deterministica: una prova riuscita non garantisce esiti futuri né sostituisce gli scenari delle User Story. La verifica del testo usa parole e orario, non un giudizio semantico. Non è stata effettuata una nuova prova con Meta reale, non è stato usato il proxy pubblico e non si dichiara accettazione privacy. Il relay host accede a OpenRouter tramite HTTPS; la rete dello stack non è una sandbox generale e il reindirizzamento Meta riguarda l'adattatore fissato dal progetto. Interruzioni forzate o guasti Docker possono richiedere pulizia manuale delle sole risorse temporanee.
