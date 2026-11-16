# Architecture Decision Records

Use an ADR for a decision with relevant alternatives or long-term consequences that would bloat a design topic in `docs/design/` (`docs/PROCESS.md` §5.2).

- File name: `ADR-NNN-short-slug.md`, starting from `ADR-001`, never reused.
- Copy `_TEMPLATE.md`, write the content in the project language.
- An ADR is created in the branch of the backlog item that takes the decision, and the item references it in `Design references`.
- Accepted ADRs are not rewritten: a changed decision gets a new ADR that supersedes the old one, whose state becomes `Superseded by ADR-NNN`.

| ADR | Title | State | Item |
| --- | ----- | ----- | ---- |
| [ADR-001](ADR-001-teacher-rule-integrity.md) | Integrità delle regole degli insegnanti | Accepted | TEC-033 |
| [ADR-002](ADR-002-sender-teacher-identity.md) | Collegamento fidato tra mittente e insegnante | Accepted | US-011 |
| [ADR-003](ADR-003-unified-teacher-identity.md) | Identità unica degli insegnanti e accesso dal database | Accepted | TEC-041, US-017, TEC-042, TEC-043 |
| [ADR-004](ADR-004-read-only-skills-computed-data.md) | Skill di sola lettura e dati calcolati per il contesto compatto | Accepted | TEC-046 |
