import assert from 'node:assert/strict';

export function checkPiPaths(tracked: string[], secrets: string[], settingsIsFile: boolean, skills: boolean[]) {
  assert.deepEqual([...tracked].sort(), ['.pi/prompts/start.md', '.pi/prompts/work-alone.md', '.pi/settings.json'], 'Unexpected or missing tracked Pi resource: review the allowlist before sharing it.');
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
  assert.match(match[1], /\/start/);
  assert.match(match[1], /\/work-alone/);
  assert.match(match[1], /\/reload/);
  assert.match(match[1], /fiducia/i);
  assert.doesNotMatch(match[1], /scripts\/pi\.sh|\/avvio/);
}

export function checkStartPrompt(prompt: string) {
  assert.match(prompt, /^---\ndescription: [^\n]+\n---\n/);
  for (const required of ['STATUS.md', 'BACKLOG.md', 'AGENTS.md', 'sola lettura', 'branch', 'working tree', 'priorità', 'dipendenze', 'successiva richiesta esplicita', 'Non leggere né mostrare segreti']) {
    assert.ok(prompt.includes(required), `Missing instruction: ${required}`);
  }
  assert.match(prompt, /Non modificare file, branch o stato del backlog/);
  assert.match(prompt, /non avviare lavoro, test, commit, merge o push/);
}

export function checkWorkAlonePrompt(prompt: string) {
  assert.match(prompt, /^---\ndescription: [^\n]+\n---\n/);
  for (const required of [
    'Implementa l\'attività già avviata in autonomia', 'Fermati solo quando serve l\'intervento dell\'utente',
    'branch corrente', 'BACKLOG.md', 'STATUS.md', 'AGENTS.md', 'docs/PROCESS.md', 'In Progress',
    'non è identificabile univocamente', 'chiedi chiarimenti', 'non scegliere né avviare un\'altra attività',
    'criteri di accettazione', 'verifiche richieste', 'Definition of Done', 'finish-task',
    'blocchi, decisioni necessarie o autorizzazioni richieste',
    'Non effettuare merge o push senza una richiesta esplicita dell\'utente', 'non inserirli in file, commit o log',
  ]) {
    assert.ok(prompt.includes(required), `Missing instruction: ${required}`);
  }
}
