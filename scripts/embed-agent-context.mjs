import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';

// Build artifact only: unit tests consume strings without filesystem access.
const soul = await readFile('hermes/SOUL.md', 'utf8');
const skills = {};
for (const name of (await readdir('hermes/skills')).sort()) {
  skills[name] = await readFile(`hermes/skills/${name}/SKILL.md`, 'utf8');
}
await mkdir('dist/src', { recursive: true });
await writeFile('dist/src/agent-context.js', `export const soul = ${JSON.stringify(soul)};\nexport const skills = ${JSON.stringify(skills)};\n`);
