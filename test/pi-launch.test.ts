import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkPiPaths, checkPiReadme, checkStartPrompt } from './pi-contract.js';

test('Pi path policy rejects private files and missing resources in memory', () => {
  const tracked = ['.pi/settings.json', '.pi/prompts/start.md'];
  checkPiPaths(tracked, ['.env.example'], true, [true, true, true]);
  assert.throws(() => checkPiPaths([...tracked, '.pi/auth.json'], [], true, [true, true, true]));
  assert.throws(() => checkPiPaths(['.pi/settings.json'], [], true, [true, true, true]));
  assert.throws(() => checkPiPaths([...tracked, '.pi/prompts/avvio.md'], [], true, [true, true, true]));
  assert.throws(() => checkPiPaths(tracked, ['.env'], true, [true, true, true]));
  assert.throws(() => checkPiPaths(tracked, [], false, [true, true, true]));
  assert.throws(() => checkPiPaths(tracked, [], true, [true, false, true]));
});

test('Pi documentation contract checks synthetic text in memory', () => {
  const text = '## Configurazione Pi\n```bash\npi\n```\nPI_CODING_AGENT_DIR\nnpm run test:pi\nfiducia /start /reload\n';
  checkPiReadme(text);
  assert.throws(() => checkPiReadme(`${text}scripts/pi.sh`));
  assert.throws(() => checkPiReadme(text.replace('npm run test:pi', '')));
  assert.throws(() => checkPiReadme(text.replace('/reload', '')));
});

test('start prompt contract detects missing read-only and authorization instructions in memory', () => {
  const prompt = '---\ndescription: Sintetico\n---\nSTATUS.md BACKLOG.md AGENTS.md sola lettura branch working tree priorità dipendenze successiva richiesta esplicita Non leggere né mostrare segreti. Non modificare file, branch o stato del backlog e non avviare lavoro, test, commit, merge o push';
  checkStartPrompt(prompt);
  assert.throws(() => checkStartPrompt(prompt.replace('sola lettura', '')));
  assert.throws(() => checkStartPrompt(prompt.replace('successiva richiesta esplicita', '')));
  assert.throws(() => checkStartPrompt(prompt.replace('non avviare lavoro, test, commit, merge o push', '')));
});
