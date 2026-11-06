import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkPiPaths, checkPiReadme, checkStartPrompt, checkWorkAlonePrompt } from './pi-contract.js';

test('Pi path policy rejects private files and missing resources in memory', () => {
  const tracked = ['.pi/settings.json', '.pi/prompts/start.md', '.pi/prompts/work-alone.md'];
  checkPiPaths(tracked, ['.env.example'], true, [true, true, true]);
  assert.throws(() => checkPiPaths([...tracked, '.pi/auth.json'], [], true, [true, true, true]));
  assert.throws(() => checkPiPaths(['.pi/settings.json'], [], true, [true, true, true]));
  assert.throws(() => checkPiPaths([...tracked, '.pi/prompts/avvio.md'], [], true, [true, true, true]));
  assert.throws(() => checkPiPaths(tracked, ['.env'], true, [true, true, true]));
  assert.throws(() => checkPiPaths(tracked, [], false, [true, true, true]));
  assert.throws(() => checkPiPaths(tracked, [], true, [true, false, true]));
});

test('Pi documentation contract checks synthetic text in memory', () => {
  const text = '## Configurazione Pi\n```bash\npi\n```\nPI_CODING_AGENT_DIR\nnpm run test:pi\nfiducia /start /work-alone /reload\n';
  checkPiReadme(text);
  assert.throws(() => checkPiReadme(`${text}scripts/pi.sh`));
  assert.throws(() => checkPiReadme(text.replace('npm run test:pi', '')));
  assert.throws(() => checkPiReadme(text.replace('/reload', '')));
  assert.throws(() => checkPiReadme(text.replace('/work-alone', '')));
});

test('start prompt contract detects missing read-only and authorization instructions in memory', () => {
  const prompt = '---\ndescription: Sintetico\n---\nSTATUS.md BACKLOG.md AGENTS.md sola lettura branch working tree priorità dipendenze successiva richiesta esplicita Non leggere né mostrare segreti. Non modificare file, branch o stato del backlog e non avviare lavoro, test, commit, merge o push';
  checkStartPrompt(prompt);
  assert.throws(() => checkStartPrompt(prompt.replace('sola lettura', '')));
  assert.throws(() => checkStartPrompt(prompt.replace('successiva richiesta esplicita', '')));
  assert.throws(() => checkStartPrompt(prompt.replace('non avviare lavoro, test, commit, merge o push', '')));
});

test('work-alone prompt contract rejects missing autonomy, ambiguity, verification and authorization safeguards', () => {
  const prompt = `---\ndescription: Sintetico\n---\nImplementa l'attività già avviata in autonomia. Fermati solo quando serve l'intervento dell'utente.
branch corrente BACKLOG.md STATUS.md AGENTS.md docs/PROCESS.md In Progress
non è identificabile univocamente: chiedi chiarimenti, non scegliere né avviare un'altra attività
criteri di accettazione verifiche richieste Definition of Done finish-task
blocchi, decisioni necessarie o autorizzazioni richieste
Non effettuare merge o push senza una richiesta esplicita dell'utente; non inserirli in file, commit o log`;
  checkWorkAlonePrompt(prompt);
  for (const instruction of [
    'in autonomia', 'In Progress', 'non è identificabile univocamente', 'chiedi chiarimenti',
    'non scegliere né avviare un\'altra attività', 'criteri di accettazione', 'verifiche richieste',
    'Definition of Done', 'finish-task', 'autorizzazioni richieste',
    'Non effettuare merge o push senza una richiesta esplicita dell\'utente', 'non inserirli in file, commit o log',
  ]) {
    assert.throws(() => checkWorkAlonePrompt(prompt.replace(instruction, '')), instruction);
  }
});
