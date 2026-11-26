# REQ-OPS-007 — Immagini di produzione da pipeline

**State:** Active

Le immagini di produzione (`hermes`, `postgres`, `migrator`, `ops`) sono costruite da GitHub Actions e pubblicate su GHCR solo dopo il superamento del gate della CI su `main`, marcate con il commit. Le immagini sono pubbliche e non contengono segreti. Contengono tutto il necessario all'esecuzione, inclusi `SOUL.md`, configurazione Hermes e plugin. Sviluppo e produzione usano lo stesso `compose.yaml`: lo sviluppo costruisce in locale, la produzione usa solo immagini pubblicate e non costruisce. La pubblicazione non avvia alcun aggiornamento. Le suite di integrazione che avviano lo stack usano la stessa versione di Docker della produzione, perché lo stack monta più file dalla stessa immagine e Docker 28.0.4 lo rifiuta; la versione verificata è la 29.9.2.
