# REQ-AGENT-006 — Configurazione locale da un'unica fonte

**State:** Active

Per l'avvio locale, l'operatore modifica solo `.env` privato per configurazione tecnica e credenziali esterne WhatsApp e OpenRouter, incluso l'unico numero del gestore; il comando applica automaticamente le modifiche valide senza richiedere modifiche manuali a copie o file intermedi. Il canale home deriva dal numero del gestore (REQ-WA-003); telefoni e identità degli altri insegnanti stanno soltanto nel database e si mantengono via chat (REQ-STUDIO-015–017), senza sincronizzazione con `.env`. Gateway e broker devono usare coerentemente la configurazione applicata; un avvio fallito non deve lasciare servizi in esecuzione con configurazioni di autorizzazione discordanti. L'esito positivo non attesta la validità delle credenziali presso Meta o OpenRouter.

Le password PostgreSQL già inizializzate e le credenziali interne generate non vengono ruotate automaticamente: una password PostgreSQL in `.env` discordante arresta l'avvio con un messaggio non sensibile. La configurazione collegata, la persistenza, l'autenticazione e l'isolamento delle credenziali restano protetti secondo REQ-AGENT-003, REQ-DB-002, REQ-WA-002 e REQ-NFR-002; l'applicazione non modifica le impostazioni sui servizi esterni.
