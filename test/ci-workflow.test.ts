import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stringify } from 'yaml';
import { checkCiWorkflow } from './ci-contract.js';

test('CI contract validates synthetic workflows in memory', () => {
  const commands = ['npm ci', 'npm run lint', 'npm run typecheck', 'npm test', 'npm run build', 'npm run test:local', 'npm install --global @earendil-works/pi-coding-agent@1.5.0', 'npm run test:pi', 'npm run test:pi-package', 'docker compose pull postgres\ndocker compose build hermes', 'npm run test:db', 'npm run test:hermes', 'npm run test:author', 'npm run test:upgrade', 'npm run test:start'];
  const workflow = {
    on: { push: null, pull_request: null, workflow_dispatch: null }, permissions: { contents: 'read' },
    jobs: { quality: { 'runs-on': 'ubuntu-24.04', steps: [
      { uses: `actions/checkout@${'a'.repeat(40)}` },
      { uses: `actions/setup-node@${'b'.repeat(40)}`, with: { 'node-version-file': '.nvmrc' } },
      ...commands.map((run) => ({ run })),
    ] } },
  };
  checkCiWorkflow(stringify(workflow));
  workflow.jobs.quality.steps.pop();
  assert.throws(() => checkCiWorkflow(stringify(workflow)));
});
