# Spikes

A spike is a backlog item of type `Spike` (`SPIKE-NNN`) that answers explicit questions before committing to a design (`docs/PROCESS.md` §4.1).

- Report file: `SPIKE-NNN-short-slug.md`, copied from `_TEMPLATE.md`, written in the project language.
- The spike's acceptance criteria are the questions to answer; the report must answer each of them or state why it could not.
- Exploratory code is not merged unless the acceptance criteria say so. Disposable material goes in an ignored folder (e.g. `tmp/`).
- Decisions resulting from the spike are recorded in `docs/design/` or in an ADR, and follow-up work is added to the backlog.

| Spike | Title | Outcome |
| ----- | ----- | ------- |
| [SPIKE-001](SPIKE-001-integrazioni-stack.md) | Verifica delle integrazioni e stack locale completo | Positive — integrazioni verificate; operatività e CI restano agli item successivi. |
| [SPIKE-002](SPIKE-002-identita-mittente-contesto-agente.md) | Identità del mittente e contesto dell'agente | Positive — percorso e alternative studiati; integrazione e verifiche restano a TEC-010 e TEC-011. |
| [SPIKE-003](SPIKE-003-skill-tool-contesto-compatto.md) | Skill e tool per un contesto dell'agente compatto | Positive — skill Hermes di sola lettura con adattamenti verificati, funzioni SQL equivalenti alla query di US-015, `SOUL.md` stimato sotto 12.000 caratteri; decisioni e attuazione in TEC-046. |
| [SPIKE-004](SPIKE-004-fonti-metriche-uso.md) | Fonti e punto di misura delle metriche d'uso | Positive — fonti verificate con gateway reale e provider sintetico, costo da `usage.cost`, scrittura tramite broker, Grafana 13.3.2 con provisioning; attuazione in TEC-052 e US-020. |
