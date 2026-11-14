# REQ-NFR-018 — Template v1.7.1 e fiducia nei clone dei worker

**State:** Active

Il progetto deve allineare processo e skill condivise al template `agile-project-template` v1.7.1, preservando le personalizzazioni e le protezioni dello studio. Il riferimento adottato e le eventuali divergenze sono registrati secondo REQ-NFR-013; conflitti o deroghe richiedono accordo esplicito. Restano validi REQ-NFR-002, REQ-NFR-007, REQ-NFR-008 e REQ-NFR-015–017.

Per i futuri worker il comando configurato è `pi --approve`: accorda fiducia ai file locali del clone per la sessione ed evita la richiesta interattiva iniziale. La documentazione deve esplicitare che questo consente il caricamento delle risorse e l'esecuzione delle estensioni del progetto attendibile; non costituisce una garanzia sull'operato del modello. Restano vietate la copia non autorizzata di segreti e stato personale e le modifiche allo stack operativo dello studio da parte dei worker. La sola adozione non avvia worker e non autorizza merge o push su `main`.

**Decisione dell'utente (2026-11-08):** TEC-030 è aggiunto alla v0.3.0 per adottare il template v1.7.1 e configurare `pi --approve` per i futuri worker.
