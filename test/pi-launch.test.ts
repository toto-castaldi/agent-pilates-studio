import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkPiPaths, checkPiReadme } from './pi-contract.js';

test('Pi path policy rejects private files and missing resources in memory', () => {
  const tracked = ['.pi/settings.json'];
  checkPiPaths(tracked, ['.env.example'], true, [true, true, true]);
  assert.throws(() => checkPiPaths([...tracked, '.pi/auth.json'], [], true, [true, true, true]));
  assert.throws(() => checkPiPaths(tracked, ['.env'], true, [true, true, true]));
  assert.throws(() => checkPiPaths(tracked, [], false, [true, true, true]));
  assert.throws(() => checkPiPaths(tracked, [], true, [true, false, true]));
});

test('Pi documentation contract checks synthetic text in memory', () => {
  const text = '## Configurazione Pi\n```bash\npi\n```\nPI_CODING_AGENT_DIR\nnpm run test:pi\n';
  checkPiReadme(text);
  assert.throws(() => checkPiReadme(`${text}scripts/pi.sh`));
  assert.throws(() => checkPiReadme(text.replace('npm run test:pi', '')));
});
