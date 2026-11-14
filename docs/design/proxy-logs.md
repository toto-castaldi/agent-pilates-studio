# Tunnel and proxy logs

Il callback pubblico passa da un tunnel Cloudflare condiviso verso `jarvis`. Requisiti: REQ-NFR-002 e REQ-NFR-004.

## Streaming remoto

La procedura operativa vieta agli operatori di avviare lo streaming remoto dei log del tunnel condiviso tramite il dashboard Cloudflare (Live logs), `cloudflared tail` o strumenti equivalenti. Il divieto è operativo e non impedisce tecnicamente l'avvio da parte di utenti autorizzati; non prova la sicurezza degli altri log Cloudflare o dei log locali.

## Proxy locale

`cloudflared` 2026.10.7, con binario identico all'asset ufficiale, protocollo QUIC e livello info. Un filtro journald (`LogFilterPatterns`) scarta le righe con gli hostname di produzione e sviluppo prima della memorizzazione e dell'inoltro a rsyslog, comprese le righe `Request failed` con `dest` e query; elimina l'intera riga. Le righe di errore conservate non contengono URL, header o corpi. Per 200, 401, 403, 404, 500, 502, chiusura brusca e richiesta annullata nessun marcatore sintetico compare nel journal o in syslog. Resta una riga storica di sviluppo, anteriore al filtro, con un verify token di origine non determinata. L'operatore dichiara che non sono configurate esportazioni Cloudflare e che non lo saranno.

## Cloudflare

`httpRequestsAdaptive` e gli eventi firewall conservano la query string per 31-32 giorni, non header né corpi; vi risultano le verifiche Meta accettate, quindi i verify token reali di produzione e sviluppo. Non sono verificabili con il token di sola lettura i job Logpush, Log Explorer della zona, Logpull e i sistemi interni di Cloudflare (decisione aperta in `README`).

## Verify token e rischio accettato

I verify token esposti non sono ruotati: il rischio è accettato fino alla scadenza della retention (REQ-NFR-002). Le verifiche future usano il verify token monouso: il valore lato server si sostituisce subito dopo ogni verifica Meta riuscita ([procedura](../operations/TEC-036-whatsapp-ambienti.md#verify-token-monouso)).

## Audit ripetibile

`npm run proxy:audit` esegue l'audit con indicatori sintetici: verifica il filtro locale, gli esiti delle richieste, i dataset Cloudflare consentiti e, leggendo la sola data di modifica del token di produzione, se la rotazione è successiva all'ultima verifica accettata. Finché la retention non scade l'esecuzione resta con esito 1 per l'esposizione accettata. La logica pura è in `src/proxy-audit.ts` e `src/proxy-audit-cloudflare.ts` (marcatori, prove, schema rigido dei riepiloghi remoti, filtro journald, valutazione, elenco consentito delle chiamate Cloudflare, orchestrazione con effetti iniettati). Le esecuzioni reali usano SSH, il tunnel pubblico e l'API Cloudflare in sola lettura e richiedono le autorizzazioni registrate nella [procedura](../operations/TEC-008-audit-proxy.md), che contiene evidenze, date di retention e limiti.
