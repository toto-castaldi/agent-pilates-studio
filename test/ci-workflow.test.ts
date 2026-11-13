import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stringify } from 'yaml';
import { checkCiWorkflow } from './ci-contract.js';

test('CI contract validates synthetic workflows in memory', () => {
  const commands = ['npm ci', 'npm run lint', 'npm run typecheck', 'npm test', 'npm run build', 'npm run test:local', 'npm install --global @earendil-works/pi-coding-agent@1.5.0', 'npm run test:pi', 'npm run test:pi-package', 'npm install --global @anthropic-ai/claude-code@2.1.323', 'npm run test:claude', 'bash scripts/ci-install-docker.sh', 'docker compose build postgres hermes', 'npm run test:db', 'npm run test:hermes', 'npm run test:author', 'npm run test:compaction', 'npm run test:upgrade', 'npm run test:start', 'npm run test:images'];
  const workflow = {
    on: { push: null, pull_request: null, workflow_dispatch: null }, permissions: { contents: 'read' },
    jobs: { quality: { 'runs-on': 'ubuntu-24.04', steps: [
      { uses: `actions/checkout@${'a'.repeat(40)}` },
      { uses: `actions/setup-node@${'b'.repeat(40)}`, with: { 'node-version-file': '.nvmrc' } },
      ...commands.map((run) => ({ run })),
    ] }, publish: { 'runs-on': 'ubuntu-24.04', needs: 'quality', if: "github.event_name == 'push' && github.ref == 'refs/heads/main'", permissions: { contents: 'read', packages: 'write' }, steps: [] } },
  };
  checkCiWorkflow(stringify(workflow));
  const withoutDocker = structuredClone(workflow);
  withoutDocker.jobs.quality.steps = withoutDocker.jobs.quality.steps.filter((step) => !('run' in step && step.run === 'bash scripts/ci-install-docker.sh'));
  assert.throws(() => checkCiWorkflow(stringify(withoutDocker)));
  const withoutClaude = structuredClone(workflow);
  withoutClaude.jobs.quality.steps = withoutClaude.jobs.quality.steps.filter((step) => !('run' in step && step.run === 'npm run test:claude'));
  assert.throws(() => checkCiWorkflow(stringify(withoutClaude)));
  workflow.jobs.quality.steps.pop();
  assert.throws(() => checkCiWorkflow(stringify(workflow)));
});
