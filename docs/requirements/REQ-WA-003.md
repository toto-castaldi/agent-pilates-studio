# REQ-WA-003 — Canale home configurato e nessun avviso di sistema

**State:** Active

Gli utilizzatori ricevono via WhatsApp solo le risposte dell'agente e, quando previsti, i messaggi inviati sul canale home. Avvisi e suggerimenti interni di Hermes non pertinenti allo studio, come la richiesta di impostare un canale home con `/sethome`, non devono essere inviati. Il canale home, destinazione dei risultati dei job cron e dei messaggi da altre piattaforme, coincide automaticamente con l'unico numero del gestore configurato; non richiede un secondo numero in `.env` e gli utilizzatori non possono impostarlo o cambiarlo tramite la conversazione. Un numero del gestore mancante o malformato arresta l'avvio senza esporne il valore. Questa derivazione non abilita cron, messaggi pianificati o nuove notifiche.
