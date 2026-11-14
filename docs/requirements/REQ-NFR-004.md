# REQ-NFR-004 — Divieto operativo di streaming dei log del tunnel

**State:** Active

Gli operatori non devono avviare lo streaming remoto dei log del tunnel Cloudflare condiviso, né dal dashboard Live logs né tramite `cloudflared tail` o strumenti equivalenti. Il divieto è una regola operativa, non un blocco tecnico; non sostituisce i requisiti di protezione degli altri log e dei dati previsti da REQ-NFR-002.
