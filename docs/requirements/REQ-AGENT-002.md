# REQ-AGENT-002 — Modello e dati

**State:** Active

Hermes deve poter ottenere risposte tramite OpenRouter e accedere al database con i privilegi dell'agente definiti in REQ-DB-002. Il modello predefinito è `openai/gpt-6.1-terra` e resta configurabile.

L'operatore sceglie il modello e il livello di thinking (reasoning effort) dell'assistente con due sole impostazioni della configurazione privata, in sviluppo e in produzione; un valore non valido arresta l'avvio senza esporre segreti. Senza livello configurato vale il predefinito documentato. Il cambio diventa effettivo al successivo riavvio o ricreazione del gateway, senza ricostruire le immagini né modificare dati o cronologia. Gli utilizzatori non possono cambiare modello o livello di thinking dalla chat WhatsApp.
