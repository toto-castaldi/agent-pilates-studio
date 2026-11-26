import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stringify } from 'yaml';
import { checkCiWorkflow } from './ci-contract.js';

test('CI contract accepts only the fast gate, validated on synthetic workflows in memory', () => {
  const commands = ['npm ci', 'npm run lint', 'npm run typecheck', 'npm test', 'npm run build'];
  const workflow = {
    on: { push: null, pull_request: null, workflow_dispatch: null }, permissions: { contents: 'read' },
    jobs: { quality: { 'runs-on': 'ubuntu-24.04', steps: [
      { uses: `actions/checkout@${'a'.repeat(40)}` },
      { uses: `actions/setup-node@${'b'.repeat(40)}`, with: { 'node-version-file': '.nvmrc' } },
      ...commands.map((run) => ({ run })),
    ] as { uses?: string; run?: string; with?: Record<string, string>; if?: string }[] }, publish: { 'runs-on': 'ubuntu-24.04', needs: 'quality', if: "github.event_name == 'push' && github.ref == 'refs/heads/main'", permissions: { contents: 'read', packages: 'write' }, steps: [] } },
  };
  checkCiWorkflow(stringify(workflow));
  const variant = (change: (steps: typeof workflow.jobs.quality.steps) => void) => {
    const copy = structuredClone(workflow);
    change(copy.jobs.quality.steps);
    return stringify(copy);
  };
  // Every gate command is required.
  for (const command of commands) {
    assert.throws(() => checkCiWorkflow(variant((steps) => steps.splice(steps.findIndex((step) => step.run === command), 1))));
  }
  // Integration suites, Docker and global installations are rejected, also appended or replacing a gate step.
  for (const extra of ['npm run test:local', 'npm run test:db', 'npm run test:images', 'docker compose build postgres hermes', 'bash scripts/ci-install-docker.sh', 'npm install --global @earendil-works/pi-coding-agent@1.5.0']) {
    assert.throws(() => checkCiWorkflow(variant((steps) => steps.push({ run: extra }))));
    assert.throws(() => checkCiWorkflow(variant((steps) => { steps[6] = { run: extra }; })));
  }
  // A gate step cannot be skipped.
  assert.throws(() => checkCiWorkflow(variant((steps) => { steps[5].if = 'false'; })));
  // Publication must wait for the gate.
  const unguarded = structuredClone(workflow) as { jobs: { publish: { needs?: string } } };
  delete unguarded.jobs.publish.needs;
  assert.throws(() => checkCiWorkflow(stringify(unguarded)));
});
