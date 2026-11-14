# REQ-AGENT-007 — Nessuna proposta spontanea di profilo

**State:** Active

L'agente non propone spontaneamente di creare un profilo dell'utilizzatore, né nella prima risposta né nei turni successivi. Alla prima risposta continua a presentarsi e a rispondere alla richiesta secondo REQ-AGENT-005. Il sistema riconosce il mittente dal numero WhatsApp autenticato e usa nome e cognome dell'anagrafica unica (REQ-STUDIO-015), senza chiedere ai censiti di presentarsi o confermare la propria identità. Il nome del profilo WhatsApp non è usato come identità, fallback, fonte dell'autore o dei permessi. Non si riabilitano memoria, profilazione o onboarding libero di Hermes.

Il solo gestore non ancora censito segue il percorso iniziale obbligatorio di REQ-STUDIO-016: non è una proposta spontanea di profilazione. Un numero non abilitato riceve soltanto il rifiuto fisso di REQ-WA-002, senza invito all'autoiscrizione. La gestione ordinaria avviene via chat, non tramite profili precompilati via CLI.

**Evoluzione delle decisioni:** la precisazione del 2026-11-11 prevedeva solo i dati WhatsApp già disponibili, senza censimento. La decisione del 2026-11-12 la sostituisce per identità e anagrafica, mantenendo il divieto di proposte spontanee di profilo e le protezioni della cronologia.
