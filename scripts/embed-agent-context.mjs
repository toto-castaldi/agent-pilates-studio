import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';

// Build artifact only: unit tests consume strings without filesystem access.
const soul = await readFile('hermes/SOUL.md', 'utf8');
const skills = {};
for (const name of (await readdir('hermes/skills')).sort()) {
  skills[name] = await readFile(`hermes/skills/${name}/SKILL.md`, 'utf8');
}
await mkdir('dist/src', { recursive: true });
await writeFile('dist/src/agent-context.js', `export const soul = ${JSON.stringify(soul)};\nexport const skills = ${JSON.stringify(skills)};\n`);
// Grafana provisioning and Compose definition for the dashboard contract test.
const grafana = {
  compose: await readFile('compose.yaml', 'utf8'),
  ini: await readFile('grafana/grafana.ini', 'utf8'),
  datasource: await readFile('grafana/provisioning/datasources/metrics.yaml', 'utf8'),
  provider: await readFile('grafana/provisioning/dashboards/metrics.yaml', 'utf8'),
  dashboard: await readFile('grafana/dashboards/usage.json', 'utf8'),
  dockerfile: await readFile('grafana/Dockerfile', 'utf8'),
  entrypoint: await readFile('grafana/entrypoint.sh', 'utf8'),
};
await writeFile('dist/src/grafana-provisioning.js', `export const grafana = ${JSON.stringify(grafana)};\n`);
