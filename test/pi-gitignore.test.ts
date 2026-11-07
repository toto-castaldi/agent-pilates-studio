import assert from 'node:assert/strict';
import { test } from 'node:test';
import ignore from 'ignore';

// Git itself and the repository's real rules are exercised by test:local.
test('Pi allowlist and private paths can be evaluated entirely in memory', () => {
  const policy = ignore().add(`.pi/*
!.pi/settings.json
!.pi/prompts/
.pi/prompts/*
!.pi/prompts/start.md
!.pi/prompts/work-alone.md
!.pi/extensions/
.pi/extensions/*
!.pi/extensions/backlog/
.pi/extensions/backlog/*
!.pi/extensions/backlog/index.ts
.local/
.env
.env.*
!.env.example
`);
  for (const path of ['.pi/settings.json', '.pi/prompts/start.md', '.pi/prompts/work-alone.md', '.pi/extensions/backlog/index.ts', '.agents/skills/start-task/SKILL.md']) {
    assert.equal(policy.ignores(path), false, path);
  }
  for (const path of ['.pi/auth.json', '.pi/credentials.json', '.pi/models.json', '.pi/mcp.json', '.pi/logs/private.log', '.pi/local/settings.json', '.pi/local/auth.json', '.pi/local/sessions/example.jsonl', '.pi/trust.json', '.pi/sessions/example.jsonl', '.pi/pi-voice.log', '.pi/npm/node_modules/example/index.js', '.pi/prompts/private.md', '.pi/prompts/avvio.md', '.pi/prompts/nested/start.md', '.pi/extensions/unreviewed.ts', '.pi/extensions/other/index.ts', '.pi/extensions/backlog/private.ts', '.pi/extensions/backlog/nested/index.ts', '.pi/skills/private/SKILL.md', '.env', '.local/secrets/db-admin']) {
    assert.equal(policy.ignores(path), true, path);
  }
});
