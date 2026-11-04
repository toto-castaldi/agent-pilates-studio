import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectName } from '../src/index.js';

test('loads the project scaffold', () => {
  assert.equal(projectName, 'agent-pilates-studio');
});
