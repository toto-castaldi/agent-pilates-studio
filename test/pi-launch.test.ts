import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

test('project Pi settings and skills are tracked without tracking private Pi state', () => {
  // Inspect paths only, never the operator's settings or their contents.
  const tracked = execFileSync('git', ['ls-files', '-z', '--', '.pi'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  assert.ok(tracked.length === 1 && tracked[0] === '.pi/settings.json', 'Unexpected tracked Pi resource: review the allowlist before sharing it.');
  const trackedSecrets = execFileSync('git', ['ls-files', '-z', '--', '.env', '.env.*', '.local'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  assert.ok(trackedSecrets.every((path) => path === '.env.example'), 'Unexpected tracked local configuration or secrets.');
  assert.ok(lstatSync('.pi/settings.json').isFile(), 'Project Pi settings must be a regular file.');
  for (const skill of ['add-item', 'start-task', 'finish-task']) {
    assert.ok(existsSync(`.agents/skills/${skill}/SKILL.md`), `Missing project skill ${skill}.`);
  }
});

test('Pi documentation describes direct startup without the retired launcher or template', () => {
  const readme = readFileSync('README.md', 'utf8');
  const match = readme.match(/## Configurazione Pi\n([\s\S]*?)(?=\n## |$)/);
  assert.ok(match, 'Pi configuration section is missing.');
  assert.match(match[1], /```bash\npi\n/);
  assert.match(match[1], /PI_CODING_AGENT_DIR/);
  assert.match(match[1], /npm run test:pi/);
  assert.doesNotMatch(match[1], /scripts\/pi\.sh|\/avvio/);
});
