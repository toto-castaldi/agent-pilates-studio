import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parse } from 'yaml';

type WorkflowStep = {
  uses?: string;
  run?: string;
  with?: Record<string, string>;
  if?: unknown;
  'continue-on-error'?: unknown;
};

test('CI runs the complete gate on push, pull requests and manual dispatch without deployment', async () => {
  const source = await readFile('.github/workflows/ci.yml', 'utf8');
  const workflow = parse(source) as {
    on: Record<string, unknown>;
    permissions: Record<string, string>;
    jobs: Record<string, { 'runs-on': string; if?: unknown; 'continue-on-error'?: unknown; steps: WorkflowStep[] }>;
  };
  assert.deepEqual(workflow.on, { push: null, pull_request: null, workflow_dispatch: null });
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.deepEqual(Object.keys(workflow.jobs), ['quality']);
  const job = workflow.jobs.quality;
  assert.equal(job['runs-on'], 'ubuntu-24.04');
  assert.equal(job.if, undefined);
  assert.equal(job['continue-on-error'], undefined);
  for (const step of job.steps) {
    assert.equal(step.if, undefined);
    assert.equal(step['continue-on-error'], undefined);
  }
  assert.equal(job.steps.length, 13);
  assert.match(job.steps[0].uses ?? '', /^actions\/checkout@[0-9a-f]{40}$/);
  assert.match(job.steps[1].uses ?? '', /^actions\/setup-node@[0-9a-f]{40}$/);
  assert.equal(job.steps[1].with?.['node-version-file'], '.nvmrc');
  assert.deepEqual(job.steps.slice(2).map((step) => step.run?.trim()), [
    'npm ci',
    'npm run lint',
    'npm run typecheck',
    'npm test',
    'npm run build',
    'docker compose pull postgres\ndocker compose build hermes',
    'npm run test:db',
    'npm run test:hermes',
    'npm run test:author',
    'npm run test:upgrade',
    'npm run test:start',
  ]);
  assert.doesNotMatch(source, /\$\{\{\s*secrets\./i);
});
