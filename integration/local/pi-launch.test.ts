import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkPiPaths, checkPiReadme, checkStartPrompt } from '../../test/pi-contract.js';

test('project Pi settings and skills are tracked without tracking private Pi state', () => {
  // Inspect paths only, never the operator's settings or their contents.
  const tracked = execFileSync('git', ['ls-files', '-z', '--', '.pi'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const secrets = execFileSync('git', ['ls-files', '-z', '--', '.env', '.env.*', '.local'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  checkPiPaths(tracked, secrets, lstatSync('.pi/settings.json').isFile(), ['add-item', 'start-task', 'finish-task'].map((skill) => existsSync(`.agents/skills/${skill}/SKILL.md`)));
});

test('Pi documentation describes direct startup without the retired launcher or template', () => {
  checkPiReadme(readFileSync('README.md', 'utf8'));
});

test('start prompt is present in a clean clone of the current commit', () => {
  const root = mkdtempSync(join(tmpdir(), 'pi-start-checkout-'));
  const checkout = join(root, 'checkout');
  try {
    execFileSync('git', ['clone', '--quiet', '--no-local', '--', process.cwd(), checkout]);
    const status = execFileSync('git', ['-C', checkout, 'status', '--porcelain'], { encoding: 'utf8' });
    assert.equal(status, '');
    const promptPath = join(checkout, '.pi', 'prompts', 'start.md');
    assert.ok(lstatSync(promptPath).isFile());
    const prompt = readFileSync(promptPath, 'utf8');
    assert.equal(prompt, readFileSync('.pi/prompts/start.md', 'utf8'));
    checkStartPrompt(prompt);
    assert.equal(existsSync(join(checkout, '.pi', 'prompts', 'avvio.md')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
