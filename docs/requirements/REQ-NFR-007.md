# REQ-NFR-007 — Configurazione Pi e verifiche coerenti

**State:** Active

La documentazione e i test dello sviluppo devono descrivere e verificare la configurazione Pi effettivamente voluta dall'operatore. La decisione originaria, attuata con TEC-014, non ripristinava il launcher `scripts/pi.sh` o il template `/avvio` intenzionalmente rimossi. La nuova decisione del 2026-11-13 (REQ-NFR-022) autorizza un launcher dedicato alla preparazione del settings dal manifest del workflow, non il ripristino della vecchia separazione tramite directory distinte; il template `/avvio` resta escluso. Le impostazioni esistenti e i dati personali non vengono modificati senza accordo; sessioni, autenticazione, log e segreti restano esclusi da Git. Le prove automatiche usano dati sintetici e il quality gate resta obbligatorio (REQ-NFR-001 e REQ-NFR-002).
