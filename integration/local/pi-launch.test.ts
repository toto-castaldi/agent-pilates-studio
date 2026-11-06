import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { checkPiPaths, checkPiReadme } from '../../test/pi-contract.js';

test('project Pi settings and skills are tracked without tracking private Pi state', () => {
  // Inspect paths only, never the operator's settings or their contents.
  const tracked = execFileSync('git', ['ls-files', '-z', '--', '.pi'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const secrets = execFileSync('git', ['ls-files', '-z', '--', '.env', '.env.*', '.local'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  checkPiPaths(tracked, secrets, lstatSync('.pi/settings.json').isFile(), ['add-item', 'start-task', 'finish-task'].map((skill) => existsSync(`.agents/skills/${skill}/SKILL.md`)));
});

test('Pi documentation describes direct startup without the retired launcher or template', () => {
  checkPiReadme(readFileSync('README.md', 'utf8'));
});
