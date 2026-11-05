# Changelog

Le modifiche rilevanti del progetto sono documentate qui.

Il formato segue [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) e il progetto usa [Semantic Versioning](https://semver.org/). Ogni voce riporta l'ID dell'item.

## [Unreleased]

### Added

- Baseline documentale del progetto, requisiti e piano iniziale (TEC-001).
- Scaffold TypeScript e quality gate locale con lint, controllo dei tipi, test e build (TEC-002).
- Stack locale Compose con PostgreSQL, migrazioni Prisma, Hermes e gateway WhatsApp Cloud nativo; tool SQL diretto e verifiche locali e reali delle integrazioni e dei privilegi (SPIKE-001).
- Migrazioni containerizzate su host Linux Docker senza Node.js installato (TEC-005).
- Backup quiescente e ripristino isolato di PostgreSQL e del volume Hermes, con procedura operativa preliminare (TEC-005).
- Workflow GitHub Actions per il quality gate e i test di integrazione PostgreSQL e Hermes, senza deploy automatico (TEC-006).

### Changed

- Diagnostica Docker limitata a eventi fissi per Hermes e PostgreSQL, senza output grezzo dei servizi (TEC-005).
- Versionamento selettivo della configurazione e del template Pi, con esclusione dei dati locali e delle estensioni non approvate (TEC-007).

### Fixed

### Removed
