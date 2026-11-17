# REQ-NFR-002 — Segreti e dati nei log

**State:** Active

Credenziali e segreti non devono essere inclusi nel repository; i log non devono contenere credenziali, messaggi o numeri di telefono. La configurazione di esempio non deve contenere segreti reali.

L'uso continuativo del gateway pubblico è ammesso solo per la produzione, con il rischio residuo dell'audit incompleto dei log del proxy accettato dall'operatore, che dichiara l'assenza di dati sensibili al momento della messa in esercizio. Restano obbligatori il filtro locale verificato, esteso agli hostname di produzione e sviluppo, la soppressione dell'output sensibile dei servizi, l'assenza di esportazioni Cloudflare e il divieto di streaming di REQ-NFR-004. Non si registrano intenzionalmente dati sensibili; in caso di esposizione rilevata si interrompe l'uso e si coordina la rotazione dei segreti coinvolti. L'accettazione del rischio non dimostra la conformità.

Lo stato dei log del proxy è quello verificato dall'audit con indicatori sintetici ([evidenze e limiti](../operations/TEC-008-audit-proxy.md)):

- **Log locali del proxy:** nei formati e negli esiti osservati non conservano credenziali, messaggi o numeri. Fa eccezione una riga storica di sviluppo, anteriore al filtro, con un verify token di origine non determinata, nel journal e in copia in syslog.
- **Cloudflare:** conserva per 31-32 giorni la query string delle richieste nei dataset di analytics, dove risultano i verify token reali di produzione e sviluppo delle verifiche Meta accettate. Corpi, header e firme non sono conservati.
- **Non verificabili con l'accesso in sola lettura:** job Logpush, dataset Log Explorer della zona, flag Logpull e sistemi interni Cloudflare; non sono controllati dal dashboard e restano limiti accettati dall'operatore.

I verify token esposti non sono ruotati: l'operatore accetta il rischio residuo fino alla scadenza della retention Cloudflare indicata nelle evidenze e per la riga storica su `jarvis`. Per ogni verifica futura si usa il verify token monouso: subito dopo una verifica Meta riuscita il valore lato server è sostituito con uno nuovo, non comunicato a Meta ([procedura](../operations/TEC-036-whatsapp-ambienti.md#verify-token-monouso)). Rotazioni o modifiche infrastrutturali richiedono autorizzazioni separate.
