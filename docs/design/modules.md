# Modules

**MOD-001 — Agente:** soluzione dell'assistente dello studio nel repository corrente: componenti applicativi, runtime e configurazione, dati e migrazioni, integrazioni, operatività e CI. Il modulo non implica un repository o un submodule Git separato. Le aree seguenti sono componenti dello stesso modulo, non moduli distinti.

- **Runtime e configurazione:** servizi Compose, versioni fissate e configurazione esterna; TEC-002 e SPIKE-001. TEC-009 aggiunge un orchestratore locale Node.js che prepara dipendenze e file privati, avvia database e bootstrap, applica migrazioni e attende la salute dei servizi.
- **Dati e migrazioni:** PostgreSQL, ruoli e migrazioni Prisma; SPIKE-001. L'agente esegue SQL direttamente tramite un piccolo plugin nativo Hermes, senza MCP; il ruolo PostgreSQL limita i privilegi.
- **Agente e modello:** installazione Hermes, configurazione OpenRouter e accesso ai dati con ruolo limitato; SPIKE-001.
- **Canale WhatsApp:** gateway WhatsApp Cloud nativo di Hermes con app Meta, validazione webhook e autorizzazione dei numeri; percorso del webhook configurabile per riutilizzare un callback HTTPS esistente; SPIKE-001.
- **Operatività e CI:** installazione, aggiornamento, recupero, osservabilità e verifiche automatiche; TEC-005 e TEC-006.

Hermes fornisce l'adattatore WhatsApp Cloud nativo; il progetto aggiunge un plugin SQL e un broker separato. TEC-010 collega il webhook autenticato al turno effettivo e al plugin tramite metadati interni, non argomenti del modello. Nella baseline il broker verifica autonomamente la firma e l'allowlist e registra il contesto della transazione in PostgreSQL.

Il piano di ADR-003 resta in `MOD-001`: l'anagrafica unica appartiene al componente dati; la risoluzione fidata dell'identità e dei privilegi ai confini gateway/broker/database; la gestione guidata a un percorso deterministico precedente al modello. Non introduce un modulo, un servizio di identità esterno o un'anagrafica utenti separata.
