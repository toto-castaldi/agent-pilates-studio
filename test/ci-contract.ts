import assert from 'node:assert/strict';
import { parse } from 'yaml';

type WorkflowStep = {
  uses?: string;
  run?: string;
  with?: Record<string, string>;
  if?: unknown;
  'continue-on-error'?: unknown;
};

export function checkCiWorkflow(source: string) {
  const workflow = parse(source) as {
    on: Record<string, unknown>;
    permissions: Record<string, string>;
    jobs: Record<string, { 'runs-on': string; if?: unknown; needs?: unknown; permissions?: unknown; 'continue-on-error'?: unknown; steps: WorkflowStep[] }>;
  };
  assert.deepEqual(workflow.on, { push: null, pull_request: null, workflow_dispatch: null });
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.deepEqual(Object.keys(workflow.jobs), ['quality', 'publish']);
  const job = workflow.jobs.quality;
  assert.equal(job['runs-on'], 'ubuntu-24.04');
  assert.equal(job.if, undefined);
  assert.equal(job['continue-on-error'], undefined);
  for (const step of job.steps) {
    assert.equal(step.if, undefined);
    assert.equal(step['continue-on-error'], undefined);
  }
  // The gate alone (REQ-NFR-003): no integration suite, Docker, network
  // installation or other step whose outcome does not depend on the commit.
  assert.equal(job.steps.length, 7);
  assert.match(job.steps[0].uses ?? '', /^actions\/checkout@[0-9a-f]{40}$/);
  assert.match(job.steps[1].uses ?? '', /^actions\/setup-node@[0-9a-f]{40}$/);
  assert.equal(job.steps[1].with?.['node-version-file'], '.nvmrc');
  assert.deepEqual(job.steps.slice(2).map((step) => step.run?.trim()), ['npm ci', 'npm run lint', 'npm run typecheck', 'npm test', 'npm run build']);
  assert.doesNotMatch(JSON.stringify(job.steps), /test:|docker|--global/);
  // Images are published only after the gate passes on main.
  const publish = workflow.jobs.publish;
  assert.equal(publish.needs, 'quality');
  assert.equal(publish.if, "github.event_name == 'push' && github.ref == 'refs/heads/main'");
  assert.deepEqual(publish.permissions, { contents: 'read', packages: 'write' });
  assert.equal(publish['continue-on-error'], undefined);
  assert.doesNotMatch(JSON.stringify(publish.steps), /jarvis|ssh /i);
  assert.doesNotMatch(source, /\$\{\{\s*secrets\./i);
}
