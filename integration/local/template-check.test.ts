import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { test } from 'node:test';

const FIXTURE = resolve('integration/backlog_fixture.py');
// A loopback port with no listener: the same failure as a start without network, without leaving the host.
const OFFLINE = 'https://127.0.0.1:9/synthetic-template.git';

interface Report {
  state: 'current' | 'behind' | 'unknown';
  current: string | null;
  latest: string | null;
  level: 'major' | 'minor' | 'patch' | null;
  template: string | null;
  message: string;
}

function environment(root: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH, HOME: root, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0',
    PYTHONDONTWRITEBYTECODE: '1',
  };
}

function files(directory: string, base = directory): [string, string][] {
  return readdirSync(directory)
    .sort()
    .flatMap((name) => {
      const path = join(directory, name);
      return statSync(path).isDirectory() ? files(path, base) : [[relative(base, path), readFileSync(path, 'latin1')] as [string, string]];
    });
}

function withRoot(body: (root: string, env: NodeJS.ProcessEnv) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'pilates-template-check-'));
  try {
    body(root, environment(root));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function project(root: string, env: NodeJS.ProcessEnv, name: string, current: string, tags: string[], options: { line?: boolean; template?: string } = {}) {
  const args = [FIXTURE, 'template', root, name, current, options.line === false ? 'no' : 'yes', options.template ?? '-', ...tags];
  const result = spawnSync('python3', args, { env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as { project: string; template: string };
}

function check(directory: string, env: NodeJS.ProcessEnv, ...args: string[]): string {
  const result = spawnSync('python3', [join(directory, '.agents/tools/backlog.py'), 'template-check', ...args], {
    cwd: directory, env, encoding: 'utf8', timeout: 30_000,
  });
  // Never fails: the check is informational and never blocks the start of a session.
  assert.equal(result.status, 0, `${result.error?.message ?? ''}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

/** Runs every output format and proves that none of them writes a file of the project. */
function formats(directory: string, env: NodeJS.ProcessEnv) {
  const before = files(directory);
  const outputs = {
    json: JSON.parse(check(directory, env, '--format', 'json')) as Report,
    text: check(directory, env),
    quiet: check(directory, env, '--quiet'),
    hook: check(directory, env, '--format', 'claude-hook'),
  };
  assert.deepEqual(files(directory), before);
  return outputs;
}

test('template-check reports an aligned project and ignores tags that are not vX.Y.Z releases', () => {
  withRoot((root, env) => {
    const { project: directory, template } = project(root, env, 'aligned', '1.2.3', ['v1.0.0', 'v1.2.3', 'v1.3.0-rc1', 'v9', 'latest']);
    const out = formats(directory, env);
    assert.deepEqual(out.json, {
      state: 'current', current: '1.2.3', latest: '1.2.3', level: null, template,
      message: `process version 1.2.3 is the latest release of ${template}`,
    });
    assert.equal(out.text, `${out.json.message}\n`);
    assert.equal(out.quiet, '');
    assert.equal(out.hook, '', 'Claude Code shows nothing when the project is aligned');
    const ahead = project(root, env, 'ahead', '2.0.0', ['v1.9.9']);
    assert.equal(formats(ahead.project, env).json.state, 'current');
  });
});

test('template-check reports a project behind the template with its semver level', () => {
  withRoot((root, env) => {
    const cases = [
      { name: 'patch', tags: ['v1.2.3', 'v1.2.4'], latest: '1.2.4', upgrade: 'backwards compatible' },
      { name: 'minor', tags: ['v1.2.3', 'v1.3.0', 'v1.2.9'], latest: '1.3.0', upgrade: 'backwards compatible' },
      { name: 'major', tags: ['v1.2.3', 'v1.10.0', 'v2.0.0'], latest: '2.0.0', upgrade: 'it needs a migration: read the upgrade notes of every major release in between' },
    ];
    for (const { name, tags, latest, upgrade } of cases) {
      const { project: directory, template } = project(root, env, name, '1.2.3', tags);
      const out = formats(directory, env);
      const message =
        `Template update available: process version ${latest} (${name}, ${upgrade}); this project uses 1.2.3. ` +
        `Release notes: ${template}. Adopt it in a task/ item (docs/process/release.md §2).`;
      assert.deepEqual(out.json, { state: 'behind', current: '1.2.3', latest, level: name, template, message });
      assert.equal(out.text, `${message}\n`);
      assert.equal(out.quiet, `${message}\n`);
      assert.deepEqual(JSON.parse(out.hook), { systemMessage: message });
    }
  });
});

test('template-check stays silent at startup without a Template line, without PROCESS.md or without network', () => {
  withRoot((root, env) => {
    const missingLine = project(root, env, 'no-line', '1.2.3', ['v1.3.0'], { line: false });
    let out = formats(missingLine.project, env);
    assert.equal(out.json.state, 'unknown');
    assert.equal(out.json.message, 'no `Template` line at the top of docs/PROCESS.md');
    assert.equal(out.text, 'cannot check: no `Template` line at the top of docs/PROCESS.md\n');
    assert.equal(out.quiet, '');
    assert.equal(out.hook, '');

    const offline = project(root, env, 'offline', '1.2.3', [], { template: OFFLINE });
    out = formats(offline.project, env);
    assert.equal(out.json.state, 'unknown');
    assert.equal(out.json.current, '1.2.3');
    assert.equal(out.json.latest, null);
    assert.match(out.json.message, /^cannot read the releases of https:\/\/127\.0\.0\.1:9\/synthetic-template\.git/);
    assert.equal(out.quiet, '');
    assert.equal(out.hook, '', 'without network Claude Code shows nothing');

    const untagged = project(root, env, 'untagged', '1.2.3', ['latest']);
    out = formats(untagged.project, env);
    assert.equal(out.json.state, 'unknown');
    assert.equal(out.json.message, `no vX.Y.Z release tag in ${untagged.template}`);
    assert.equal(out.hook, '');

    rmSync(join(missingLine.project, 'docs/PROCESS.md'));
    out = formats(missingLine.project, env);
    assert.equal(out.json.message, 'docs/PROCESS.md not found');
    assert.equal(out.hook, '');
  });
});

test('the adopted startup hooks and the project process point at the template check', () => {
  const process = readFileSync('docs/PROCESS.md', 'utf8').split('\n');
  assert.equal(process[2], '**Process version:** 4.5.0');
  assert.equal(process[4], '**Template:** https://github.com/toto-castaldi/agile-project-template');
  assert.deepEqual(JSON.parse(readFileSync('.claude/settings.json', 'utf8')), {
    hooks: {
      SessionStart: [
        {
          matcher: 'startup',
          hooks: [
            {
              type: 'command',
              command: 'python3 "$CLAUDE_PROJECT_DIR/.agents/tools/backlog.py" template-check --format claude-hook',
              timeout: 15,
            },
          ],
        },
      ],
    },
  });
  const pi = readFileSync('.pi/extensions/template-check/index.ts', 'utf8');
  assert.ok(pi.includes('event.reason !== "startup" || !ctx.hasUI'));
  assert.ok(pi.includes('"template-check", "--format", "json"'));
  assert.ok(pi.includes('if (error) return;'));
  assert.doesNotMatch(pi, /writeFile|appendFile|mkdir/);
});
