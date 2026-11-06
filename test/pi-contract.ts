import assert from 'node:assert/strict';

export function checkPiPaths(tracked: string[], secrets: string[], settingsIsFile: boolean, skills: boolean[]) {
  assert.ok(tracked.length === 1 && tracked[0] === '.pi/settings.json', 'Unexpected tracked Pi resource: review the allowlist before sharing it.');
  assert.ok(secrets.every((path) => path === '.env.example'), 'Unexpected tracked local configuration or secrets.');
  assert.ok(settingsIsFile, 'Project Pi settings must be a regular file.');
  assert.ok(skills.length === 3 && skills.every(Boolean), 'Missing project skill.');
}

export function checkPiReadme(readme: string) {
  const match = readme.match(/## Configurazione Pi\n([\s\S]*?)(?=\n## |$)/);
  assert.ok(match, 'Pi configuration section is missing.');
  assert.match(match[1], /```bash\npi\n/);
  assert.match(match[1], /PI_CODING_AGENT_DIR/);
  assert.match(match[1], /npm run test:pi/);
  assert.doesNotMatch(match[1], /scripts\/pi\.sh|\/avvio/);
}
