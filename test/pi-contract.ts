import assert from 'node:assert/strict';

export function checkPiPaths(tracked: string[], secrets: string[], settingsIsFile: boolean, skills: boolean[]) {
  assert.deepEqual([...tracked].sort(), ['.pi/extensions/backlog/index.ts', '.pi/prompts/work-alone.md', '.pi/settings.json'], 'Unexpected or missing tracked Pi resource: review the allowlist before sharing it.');
  assert.ok(secrets.every((path) => path === '.env.example'), 'Unexpected tracked local configuration or secrets.');
  assert.ok(settingsIsFile, 'Project Pi settings must be a regular file.');
  assert.ok(skills.length === 3 && skills.every(Boolean), 'Missing project skill.');
}

export function checkQuestionPackage(settings: unknown): string {
  assert.ok(settings && typeof settings === 'object' && 'packages' in settings);
  const packages = settings.packages;
  assert.ok(Array.isArray(packages));
  const sources = packages.map((entry: unknown) => {
    if (typeof entry === 'string') return entry;
    if (entry && typeof entry === 'object' && 'source' in entry && typeof entry.source === 'string') return entry.source;
    throw new Error('Invalid Pi package declaration');
  });
  assert.ok(!sources.some((source) => /^npm:pi-question-tool(?:@|$)/.test(source)), 'Original question package must not also load.');
  const shared = sources.filter((source) => /^git:github\.com\/toto-castaldi\/agent-harness-stuff(?:@|$)/.test(source));
  assert.equal(shared.length, 1, 'Exactly one shared package must be configured.');
  assert.match(shared[0], /^git:github\.com\/toto-castaldi\/agent-harness-stuff@[0-9a-f]{40}$/);
  return shared[0];
}

export function checkPiReadme(readme: string) {
  const match = readme.match(/## Configurazione Pi\n([\s\S]*?)(?=\n## |$)/);
  assert.ok(match, 'Pi configuration section is missing.');
  assert.match(match[1], /```bash\npi\n/);
  assert.match(match[1], /PI_CODING_AGENT_DIR/);
  assert.match(match[1], /npm run test:pi/);
  assert.match(match[1], /\/work-alone/);
  assert.match(match[1], /\/reload/);
  assert.match(match[1], /fiducia/i);
  assert.doesNotMatch(match[1], /scripts\/pi\.sh|\/avvio|\/start(?![\w-])/);
}

export function checkWorkAlonePrompt(prompt: string) {
  assert.match(prompt, /^---\ndescription: [^\n]+\n---\n/);
  for (const required of [
    'Implementa l\'attività già avviata in autonomia', 'Fermati solo quando serve l\'intervento dell\'utente',
    'branch corrente', 'backlog.py', 'AGENTS.md', 'docs/PROCESS.md', 'In Progress',
    'non è identificabile univocamente', 'chiedi chiarimenti', 'non scegliere né avviare un\'altra attività',
    'criteri di accettazione', 'verifiche richieste', 'Definition of Done', 'finish-task',
    'blocchi, decisioni necessarie o autorizzazioni richieste',
    'solo i push del branch dell\'item previsti dal processo ai cambi di stato',
    'merge, push su `main` e altri push richiedono una richiesta esplicita',
    'istruzioni più restrittive dell\'utente', 'non inserirli in file, commit o log',
  ]) {
    assert.ok(prompt.includes(required), `Missing instruction: ${required}`);
  }
}
