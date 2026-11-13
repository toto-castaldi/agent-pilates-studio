import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkPiPaths, checkPiReadme, checkQuestionPackage, checkWorkAlonePrompt } from './pi-contract.js';

test('Pi path policy rejects private files and missing resources in memory', () => {
  const tracked = ['.pi/workflow.json', '.pi/prompts/work-alone.md', '.pi/extensions/backlog/index.ts'];
  checkPiPaths(tracked, ['.env.example'], true, [true, true, true]);
  assert.throws(() => checkPiPaths([...tracked, '.pi/auth.json'], [], true, [true, true, true]));
  assert.throws(() => checkPiPaths(['.pi/settings.json'], [], true, [true, true, true]));
  assert.throws(() => checkPiPaths([...tracked, '.pi/prompts/avvio.md'], [], true, [true, true, true]));
  assert.throws(() => checkPiPaths([...tracked, '.pi/prompts/start.md'], [], true, [true, true, true]));
  assert.throws(() => checkPiPaths(tracked, ['.env'], true, [true, true, true]));
  assert.throws(() => checkPiPaths(tracked, [], false, [true, true, true]));
  assert.throws(() => checkPiPaths(tracked, [], true, [true, false, true]));
});

test('question package contract rejects floating refs and duplicate providers in memory', () => {
  const source = `git:github.com/toto-castaldi/agent-harness-stuff@${'a'.repeat(40)}`;
  assert.equal(checkQuestionPackage({ packages: [source, 'npm:other'] }), source);
  assert.equal(checkQuestionPackage({ packages: [{ source }] }), source);
  for (const packages of [
    [], ['git:github.com/toto-castaldi/agent-harness-stuff'],
    [source, source], [source, 'npm:pi-question-tool@0.1.1'], [source, { source: 'npm:pi-question-tool' }],
  ]) assert.throws(() => checkQuestionPackage({ packages }));
});

test('Pi documentation contract checks synthetic text in memory', () => {
  const text = '## Configurazione Pi\n```bash\nnode scripts/start-pi.mjs\n```\nPI_CODING_AGENT_DIR\nnpm run test:pi\nfiducia /work-alone /reload\n';
  checkPiReadme(text);
  assert.throws(() => checkPiReadme(`${text}scripts/pi.sh`));
  assert.throws(() => checkPiReadme(text.replace('npm run test:pi', '')));
  assert.throws(() => checkPiReadme(text.replace('/reload', '')));
  assert.throws(() => checkPiReadme(text.replace('/work-alone', '')));
  assert.throws(() => checkPiReadme(`${text}/start`));
  checkPiReadme(`${text}.agents/skills/start-task`);
});

test('work-alone prompt contract rejects missing autonomy, ambiguity, verification and authorization safeguards', () => {
  const prompt = `---\ndescription: Sintetico\n---\nImplementa l'attività già avviata in autonomia. Fermati solo quando serve l'intervento dell'utente.
branch corrente backlog.py AGENTS.md docs/PROCESS.md In Progress
non è identificabile univocamente: chiedi chiarimenti, non scegliere né avviare un'altra attività
criteri di accettazione verifiche richieste Definition of Done finish-task
blocchi, decisioni necessarie o autorizzazioni richieste
solo i push del branch dell'item previsti dal processo ai cambi di stato; merge, push su \`main\` e altri push richiedono una richiesta esplicita; istruzioni più restrittive dell'utente; non inserirli in file, commit o log`;
  checkWorkAlonePrompt(prompt);
  for (const instruction of [
    'in autonomia', 'In Progress', 'non è identificabile univocamente', 'chiedi chiarimenti',
    'non scegliere né avviare un\'altra attività', 'criteri di accettazione', 'verifiche richieste',
    'Definition of Done', 'finish-task', 'autorizzazioni richieste',
    'solo i push del branch dell\'item previsti dal processo ai cambi di stato',
    'merge, push su `main` e altri push richiedono una richiesta esplicita',
    'istruzioni più restrittive dell\'utente', 'non inserirli in file, commit o log',
  ]) {
    assert.throws(() => checkWorkAlonePrompt(prompt.replace(instruction, '')), instruction);
  }
});
