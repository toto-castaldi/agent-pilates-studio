# agent-pilates-studio

Progetto per installare e aggiornare [Hermes Agent](https://hermes-agent.nousresearch.com/), provarlo in locale e collegarlo a PostgreSQL, OpenRouter e WhatsApp Business.

## Stato

La v0.1.0 dispone di uno scaffold TypeScript e di un quality gate locale; non contiene ancora un'applicazione Hermes o procedure di installazione dell'ambiente. La compatibilità delle integrazioni deve essere verificata.

## Scaffold e verifiche locali

Per lo scaffold servono Node.js LTS 24.14.0 e npm 11.9.0, le versioni usate per le verifiche. Il progetto accetta Node.js dalla 24.14.0 alla 24.x e npm dalla 11.9.0 alla 11.x; `.nvmrc` indica la versione di Node.js verificata. Con `nvm` si possono usare `nvm install` e `nvm use` dalla directory del progetto.

Da una copia pulita del repository:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Il lint con Biome controlla `src/` e `test/`; il test smoke usa il test runner integrato di Node.js. `npm test` ricompila prima di eseguire i test e `npm run build` rigenera `dist/`, includendo il codice compilato e i test. Le dipendenze sono fissate nel lockfile.

## Prerequisiti previsti per l'ambiente completo

- Docker e Docker Compose per l'ambiente locale e il server Linux di produzione.
- Un endpoint HTTPS pubblico già disponibile per i webhook Meta.
- App Meta WhatsApp Business configurata e credenziali per i servizi esterni; non inserire credenziali nel repository.

I comandi di installazione, configurazione e deploy dell'ambiente completo saranno documentati quando disponibili.
