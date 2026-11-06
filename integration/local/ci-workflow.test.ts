import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { checkCiWorkflow } from '../../test/ci-contract.js';

test('actual CI runs all suites on push, pull requests and manual dispatch without deployment', async () => {
  checkCiWorkflow(await readFile('.github/workflows/ci.yml', 'utf8'));
});
