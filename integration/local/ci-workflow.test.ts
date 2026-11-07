import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { checkCiWorkflow } from '../../test/ci-contract.js';

test('actual CI runs all suites on push, pull requests and manual dispatch without deployment', async () => {
  checkCiWorkflow(await readFile('.github/workflows/ci.yml', 'utf8'));
  const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as { scripts: Record<string, string> };
  assert.match(packageJson.scripts['test:pi'], /dist\/integration\/pi-backlog\.test\.js/);
  assert.match(packageJson.scripts['test:pi'], /dist\/integration\/pi-settings\.test\.js/);
});
