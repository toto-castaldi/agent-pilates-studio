# Modules

**MOD-001 — Agente:** soluzione dell'assistente dello studio nel repository corrente: componenti applicativi, runtime e configurazione, dati e migrazioni, integrazioni, operatività e CI. Il modulo non implica un repository o un submodule Git separato. Le aree seguenti sono componenti dello stesso modulo, non moduli distinti.

- **Runtime e configurazione:** servizi Compose, versioni fissate e configurazione esterna; orchestratore locale Node.js che prepara dipendenze e file privati, avvia database e bootstrap, applica migrazioni e attende la salute dei servizi.
- **Dati e migrazioni:** PostgreSQL, ruoli e migrazioni Prisma. L'agente esegue SQL direttamente tramite un piccolo plugin nativo Hermes, senza MCP; il ruolo PostgreSQL limita i privilegi.
- **Agente e modello:** immagine Hermes, configurazione OpenRouter, `SOUL.md` e accesso ai dati con ruolo limitato.
- **Canale WhatsApp:** gateway WhatsApp Cloud nativo di Hermes con app Meta, validazione webhook e autorizzazione dei mittenti; percorso del webhook configurabile per riutilizzare un callback HTTPS esistente. Il progetto aggiunge un broker separato che verifica il webhook, registra il contesto autore e gestisce il percorso guidato dell'anagrafica.
- **Operatività e CI:** installazione, aggiornamento, recupero, osservabilità e verifiche automatiche.

L'identità unica resta in `MOD-001`: l'anagrafica appartiene al componente dati; la risoluzione fidata dell'identità e dei privilegi ai confini gateway/broker/database; la gestione guidata a un percorso deterministico precedente al modello. Non esistono un servizio di identità esterno o un'anagrafica utenti separata.

Il lavoro trasversale e gli item senza modulo non richiedono una classificazione.
