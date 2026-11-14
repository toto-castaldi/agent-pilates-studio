# REQ-NFR-007 — Configurazione Pi e verifiche coerenti

**State:** Active

La documentazione e i test dello sviluppo devono descrivere e verificare la configurazione Pi effettivamente voluta dall'operatore: il punto d'ingresso che prepara il settings dal manifest del workflow (REQ-NFR-022), senza separazione fra directory personale e di progetto. Il launcher `scripts/pi.sh` e i template `/avvio` e `/start` non fanno parte del progetto. Le impostazioni esistenti e i dati personali non vengono modificati senza accordo; sessioni, autenticazione, log e segreti restano esclusi da Git. Le prove automatiche usano dati sintetici e il quality gate resta obbligatorio (REQ-NFR-001 e REQ-NFR-002).
