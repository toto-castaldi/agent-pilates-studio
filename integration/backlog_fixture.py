"""Shared synthetic backlog fixtures for the CLI, Pi and Claude Code tests."""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

TOOL = Path(__file__).resolve().parents[1] / '.agents/tools/backlog.py'
FIRST = 'task/TEC-001-first'
SECOND = 'task/TEC-001-second'
BRANCH_ONLY = 'task/TEC-002-branch-only'


def isolated_env(root):
    return {
        'PATH': os.environ['PATH'], 'HOME': str(root), 'XDG_CONFIG_HOME': str(root / 'xdg'),
        'GIT_CONFIG_GLOBAL': '/dev/null', 'GIT_CONFIG_NOSYSTEM': '1', 'GIT_TERMINAL_PROMPT': '0',
        'GIT_AUTHOR_NAME': 'Synthetic', 'GIT_AUTHOR_EMAIL': 'synthetic@example.invalid',
        'GIT_COMMITTER_NAME': 'Synthetic', 'GIT_COMMITTER_EMAIL': 'synthetic@example.invalid',
    }


def checked(command, env, cwd=None):
    result = subprocess.run(command, cwd=cwd, env=env, capture_output=True, text=True, check=False)
    if result.returncode:
        raise AssertionError(f'{command!r}:\n{result.stdout}\n{result.stderr}')
    return result.stdout.strip()


def git(project, *args, date=None, env=None):
    extra = {'GIT_AUTHOR_DATE': date, 'GIT_COMMITTER_DATE': date} if date else {}
    return checked(['git', '-C', str(project), '-c', 'core.hooksPath=/dev/null', *args],
                   {**(env or isolated_env(project.parent)), **extra})


def cli(project, *args, env=None):
    return checked(['python3', str(project / '.agents/tools/backlog.py'), *args],
                   env or isolated_env(project.parent), cwd=project)


def copy_tool(project):
    tool = project / '.agents/tools/backlog.py'
    tool.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(TOOL, tool)


def item(number, title, kind='Task', priority='P1', status='Todo', version='v0.2.0', epic='EPIC-001', criteria=('Synthetic criterion',)):
    record = {'id': number, 'title': title, 'epic': epic, 'type': kind, 'priority': priority, 'status': status,
              'dependencies': [], 'acceptance_criteria': list(criteria)}
    if version is not None:
        record['version'] = version
    return record


def viewer_items():
    return [
        item('TEC-001', 'Synthetic first', criteria=[f'Synthetic body line {i:03d}' for i in range(80)]),
        item('TEC-002', 'Synthetic second', kind='User Story', priority='P2', status='Done'),
        item('TEC-003', 'Synthetic unassigned', status='Blocked', version=None, epic='EPIC-002'),
    ]


def write_store(project, items):
    """Write only a disposable viewer fixture, never the project's canonical store."""
    base = project / 'backlog'
    shutil.rmtree(base, ignore_errors=True)
    for folder in ('items', 'epics', 'versions'):
        (base / folder).mkdir(parents=True)
    (base / 'versions/v0.2.0.json').write_text(json.dumps({'id': 'v0.2.0', 'goal': 'Synthetic', 'state': 'Open'}))
    for epic, title in (('EPIC-001', 'Synthetic epic'), ('EPIC-002', 'Synthetic unassigned epic')):
        (base / 'epics' / f'{epic}.json').write_text(json.dumps({'id': epic, 'title': title, 'scope': 'Synthetic'}))
    for record in items:
        (base / 'items' / f"{record['id']}.json").write_text(json.dumps(record))


def snapshot(project):
    return sorted((str(path.relative_to(project)), path.read_bytes())
                  for path in (project / 'backlog').rglob('*') if path.is_file())


def create_branch_fixture(root, project=None):
    """Local In Progress beats a newer same-name remote Done; a competing remote is pending fetch."""
    project = project or root / 'project'
    remote = root / 'origin.git'
    env = isolated_env(root)
    copy_tool(project)
    git(project, 'init', '-q', '-b', 'main', env=env)
    cli(project, 'version', 'add', 'v0.2.0', '--goal', 'Synthetic', env=env)
    cli(project, 'epic', 'add', '--title', 'Synthetic epic', '--scope', 'Synthetic', env=env)
    add = ['add', '--type', 'TEC', '--version', 'v0.2.0', '--epic', 'EPIC-001', '--priority', 'P1',
           '--criterion', 'Synthetic criterion', '--design-references', 'PROCESS §3']
    cli(project, *add, '--title', 'Synthetic branch item', env=env)
    git(project, 'add', '.', env=env)
    git(project, 'commit', '-qm', 'Synthetic base', date='2020-01-01T00:00:00Z', env=env)
    git(project, 'switch', '-qc', FIRST, env=env)
    cli(project, 'start', 'TEC-001', '--branch', FIRST, env=env)
    cli(project, 'block', 'TEC-001', '--reason', 'Synthetic blocker', env=env)
    git(project, 'commit', '-qam', 'Synthetic first', date='2020-01-02T00:00:00Z', env=env)
    first_commit = git(project, 'rev-parse', 'HEAD', env=env)
    git(project, 'switch', '-q', 'main', env=env)
    git(project, 'switch', '-qc', SECOND, env=env)
    cli(project, 'start', 'TEC-001', '--branch', SECOND, env=env)
    cli(project, 'done', 'TEC-001', '--outcome', 'Synthetic remote result', env=env)
    git(project, 'commit', '-qam', 'Synthetic second', date='2020-01-05T00:00:00Z', env=env)
    git(project, 'switch', '-q', 'main', env=env)
    git(project, 'switch', '-qc', BRANCH_ONLY, env=env)
    assert cli(project, *add, '--title', 'Synthetic branch-only item', env=env) == 'TEC-002'
    git(project, 'add', '.', env=env)
    git(project, 'commit', '-qm', 'Synthetic branch-only item', date='2020-01-06T00:00:00Z', env=env)
    git(project, 'switch', '-q', 'main', env=env)
    git(root, 'clone', '-q', '--bare', str(project), str(remote), env=env)
    git(root, '--git-dir', str(remote), 'update-ref', '-d', f'refs/heads/{FIRST}', env=env)
    git(project, 'remote', 'add', 'origin', str(remote), env=env)
    git(project, 'fetch', '-q', 'origin', env=env)
    git(project, 'switch', '-q', SECOND, env=env)
    cli(project, 'reopen', 'TEC-001', env=env)
    git(project, 'commit', '-qam', 'Synthetic local', date='2020-01-04T00:00:00Z', env=env)
    git(project, 'switch', '-q', 'main', env=env)
    git(project, 'branch', '-D', FIRST, BRANCH_ONLY, env=env)
    git(project, 'branch', 'task/TEC-001-merged', 'main', env=env)
    assert not git(project, 'branch', '-r', '--list', f'origin/{FIRST}', env=env)
    git(root, '--git-dir', str(remote), 'update-ref', f'refs/heads/{FIRST}', first_commit, env=env)
    return {'project': str(project), 'remote': str(remote), 'first': FIRST, 'second': SECOND,
            'branch_only': BRANCH_ONLY, 'first_commit': first_commit}


if __name__ == '__main__':
    mode, target = sys.argv[1:]
    root = Path(target).resolve()
    if mode == 'branches':
        print(json.dumps(create_branch_fixture(root)))
    elif mode == 'viewer':
        copy_tool(root)
        write_store(root, viewer_items())
        print(cli(root, 'export', '--json'))
    else:
        raise ValueError(f'Unknown synthetic fixture: {mode}')
