# REQ-NFR-002 — Segreti e dati nei log

**State:** Active

Credenziali e segreti non devono essere inclusi nel repository; i log non devono contenere credenziali, messaggi o numeri di telefono. La configurazione di esempio non deve contenere segreti reali.

Per la sola prova pubblica controllata di TEC-005, l'operatore ha autorizzato temporaneamente il rischio residuo dovuto all'audit incompleto dei log Cloudflare e di alcuni formati locali del proxy. Restano obbligatori il filtro locale verificato, la soppressione dell'output sensibile dei servizi, l'assenza di esportazioni Cloudflare e il divieto di streaming di REQ-NFR-004. Non registrare intenzionalmente dati sensibili; in caso di esposizione rilevata, interrompere la prova e coordinare la rotazione dei segreti coinvolti. L'autorizzazione non dimostra la conformità completa né autorizza un uso continuativo senza una decisione separata; l'approfondimento va tracciato come debito tecnico.

**Decisione dell'utente (2026-11-09):** l'operatore accetta il rischio residuo dell'audit incompleto dei log del proxy (TEC-008) anche per l'uso continuativo del gateway di produzione, dichiarando che alla data della decisione non sono presenti dati sensibili. La decisione non dimostra la conformità; restano obbligatori il filtro locale verificato esteso all'hostname di produzione, la soppressione dell'output sensibile dei servizi, l'assenza di esportazioni Cloudflare e il divieto di REQ-NFR-004.

**Decisione dell'utente (2026-11-14):** TEC-008 è assegnato alla v0.3.0 come ampliamento dello scope. La pianificazione dell'audit non dimostra la conformità né modifica la decisione del 2026-11-09 e il divieto di REQ-NFR-004; le modifiche infrastrutturali richiedono autorizzazioni separate.

**Esito dell'audit TEC-008 (2026-11-14):** l'audit con indicatori sintetici è descritto in [TEC-008](operations/TEC-008-audit-proxy.md).

- **Log locali del proxy:** nei formati e negli esiti osservati non conservano credenziali, messaggi o numeri. Fa eccezione una riga storica di sviluppo del 2026-11-04, anteriore al filtro, con un verify token di origine non determinata, nel journal e in copia in syslog.
- **Cloudflare:** conserva per 31-32 giorni la query string delle richieste nei dataset di analytics. Vi risultano i verify token reali di produzione (verifica accettata il 2026-11-10) e di sviluppo (2026-11-05). Corpi, header e firme non sono conservati.
- **Non verificabili con l'accesso in sola lettura:** job Logpush (richiedono permessi di modifica non concessi), dataset Log Explorer della zona, flag Logpull e sistemi interni Cloudflare. L'utente non esegue i controlli dal dashboard, che restano non verificati.

**Decisione dell'utente (2026-11-14):** nessuna rotazione dei verify token di produzione e sviluppo. L'utente accetta il rischio residuo fino alla scadenza della retention Cloudflare (circa 2026-12-06 per lo sviluppo e 2026-12-11 per la produzione) e per la riga storica su `jarvis`. Per le verifiche future adotta il verify token monouso: subito dopo ogni verifica Meta riuscita il valore lato server viene sostituito con uno nuovo, non comunicato a Meta ([procedura](operations/TEC-036-whatsapp-ambienti.md#verify-token-monouso)). La decisione non autorizza rotazioni o modifiche infrastrutturali e non dichiara la conformità a REQ-NFR-002. Il token API in sola lettura usato dall'audit va revocato al termine di TEC-008.
