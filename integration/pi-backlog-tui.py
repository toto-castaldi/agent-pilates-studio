#!/usr/bin/env python3
"""Exercise the checked-in viewer in a synthetic Pi TUI, without personal state."""
import fcntl
import json
import os
import pty
import select
import shutil
import struct
import subprocess
import tempfile
import termios
import time
from pathlib import Path

SOURCE = Path('.pi/extensions/backlog/index.ts').resolve()


class Pi:
    def __init__(self, project, home, agent):
        self.master, slave = pty.openpty()
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 40, 120, 0, 0))
        env = {
            'PATH': os.environ['PATH'], 'HOME': str(home), 'PI_CODING_AGENT_DIR': str(agent),
            'PI_SKIP_VERSION_CHECK': '1', 'PI_TELEMETRY': '0', 'TERM': 'xterm-256color',
            'OPENAI_API_KEY': 'synthetic-test-key',
        }
        self.proc = subprocess.Popen(
            ['pi', '--approve', '--offline', '--no-session', '--no-mcp', '--no-context-files'],
            cwd=project, env=env, stdin=slave, stdout=slave, stderr=slave, start_new_session=True,
        )
        os.close(slave)
        try:
            self.wait_for(b'Press ctrl+o to show full startup help', 30)
            time.sleep(0.5)
            self.drain()
        except BaseException:
            self.close()
            raise

    def drain(self, timeout=0.25):
        chunks = []
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            ready, _, _ = select.select([self.master], [], [], max(0, min(0.1, end - time.monotonic())))
            if ready:
                try:
                    chunks.append(os.read(self.master, 65536))
                except OSError:
                    break
        return b''.join(chunks)

    def send(self, data):
        os.write(self.master, data)

    def wait_for(self, expected, timeout=10):
        output = b''
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            output += self.drain(0.2)
            if expected in output:
                return output
            if self.proc.poll() is not None:
                break
        raise AssertionError(f'Pi output missing {expected!r}; synthetic tail: {output[-3000:]!r}')

    def close(self):
        if self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait(timeout=5)
        os.close(self.master)


def open_command(pi, expected):
    pi.drain()
    pi.send(b'/backlog\r')
    return pi.wait_for(expected)


def close_view(pi):
    pi.send(b'q')
    time.sleep(0.3)
    pi.drain()


def make_project(root, name, global_settings=None, project_settings=None):
    project, agent = root / (name + '-project'), root / (name + '-agent')
    extension = project / '.pi/extensions/backlog/index.ts'
    extension.parent.mkdir(parents=True)
    shutil.copyfile(SOURCE, extension)
    agent.mkdir()
    if global_settings is not None:
        (agent / 'settings.json').write_text(json.dumps(global_settings))
    if project_settings is not None:
        (project / '.pi/settings.json').write_text(json.dumps(project_settings))
    return project, agent


def exercise(root):
    project, agent = make_project(root, 'default')
    backlog = project / 'BACKLOG.md'
    fixture = ('## Version v0.2.0\n**State:** Open\n### EPIC-001 — Synthetic epic\n'
               '#### TEC-001 — Synthetic first\n- **Type:** Task · **Priority:** P1 · **Status:** Todo\n'
               + ''.join(f'- Synthetic body line {i:03d}\n' for i in range(80))
               + '```\n#### TEC-999 — Not an item\n```\n'
               + '#### TEC-002 — Synthetic second\n- **Type:** User Story · **Priority:** P2 · **Status:** Done\n'
               + '## Unassigned backlog\n#### TEC-003 — Synthetic unassigned\n'
               + '- **Epic:** EPIC-002 — Synthetic unassigned epic\n'
               + '- TEC-004 — Synthetic short idea\n')
    backlog.write_text(fixture)
    before_extension = (project / '.pi/extensions/backlog/index.ts').read_bytes()
    pi = Pi(project, root, agent)
    try:
        out = open_command(pi, b'Synthetic first')
        assert b'1 / 1 (4 total)' in out and b'Version v0.2.0 (Open)' in out and b'Synthetic epic' in out
        pi.send(b'S')  # Todo -> all, including unassigned and items without fields
        pi.wait_for(b'Status: all')
        pi.send(b't')  # Type: User Story
        out = pi.wait_for(b'Synthetic second')
        assert b'Type: User Story' in out
        pi.send(b'p')  # Priority P0: no match
        pi.wait_for(b'No items match the filters')
        pi.send(b'p')  # P1: still no match
        pi.wait_for(b'Priority: P1')
        pi.send(b'p')  # P2: second item
        pi.wait_for(b'Synthetic second')
        pi.send(b'T')  # Type: all
        pi.wait_for(b'Type: all')
        pi.send(b'P')  # P1
        pi.wait_for(b'Synthetic first')
        pi.send(b'P')  # P0
        pi.wait_for(b'No items match the filters')
        pi.send(b'P')  # all
        pi.wait_for(b'Synthetic first')
        pi.send(b'\x1b[6~')  # Page Down
        pi.wait_for(b'Synthetic body line 040')
        pi.send(b'\x1b[5~')  # Page Up
        pi.wait_for(b'Synthetic body line 000')
        pi.send(b'\x1b[C')
        pi.wait_for(b'Synthetic second')
        pi.send(b'\x1b[C')
        out = pi.wait_for(b'Synthetic unassigned')
        assert b'no version' in out and b'EPIC-002' in out
        pi.send(b'\x1b[C')
        pi.wait_for(b'Synthetic short idea')
        pi.send(b'\x1b[D')
        pi.wait_for(b'Synthetic unassigned')
        pi.send(b'\x1b[H')  # Home
        pi.wait_for(b'Synthetic first')
        pi.send(b'\x1b[F')  # End
        pi.wait_for(b'Synthetic short idea')
        pi.send(b'\x1b')  # Escape
        time.sleep(0.3)
        pi.drain()
        assert backlog.read_text() == fixture
        backlog.write_text('#### TEC-005 — Synthetic refreshed\n- **Status:** Todo\n')
        open_command(pi, b'Synthetic refreshed')
        close_view(pi)
        backlog.unlink()
        open_command(pi, b'BACKLOG.md not found')
        close_view(pi)
        backlog.write_text('No items here.\n')
        open_command(pi, b'BACKLOG.md contains no items')
        close_view(pi)
        backlog.unlink()
        backlog.mkdir()
        open_command(pi, b'Cannot read BACKLOG.md')
        close_view(pi)
        backlog.rmdir()
        backlog.write_text('#### TEC-006 — Synthetic shortcut\n- **Status:** Todo\n')
        pi.send(b'\x1b[98;6u')  # Kitty ctrl+shift+b
        pi.wait_for(b'Synthetic shortcut')
        close_view(pi)
        assert backlog.read_text() == '#### TEC-006 — Synthetic shortcut\n- **Status:** Todo\n'
        assert (project / '.pi/extensions/backlog/index.ts').read_bytes() == before_extension
    finally:
        pi.close()

    # Project setting overrides synthetic global setting; no personal Pi state is read.
    project, agent = make_project(root, 'custom', {'backlogOverlay': {'shortcut': False}},
                                  {'backlogOverlay': {'shortcut': 'alt+b'}})
    (project / 'BACKLOG.md').write_text('#### TEC-007 — Synthetic custom shortcut\n- **Status:** Todo\n')
    pi = Pi(project, root, agent)
    try:
        before = (project / '.pi/settings.json').read_bytes(), (agent / 'settings.json').read_bytes()
        pi.send(b'\x1bb')
        pi.wait_for(b'Synthetic custom shortcut')
        close_view(pi)
        assert before == ((project / '.pi/settings.json').read_bytes(), (agent / 'settings.json').read_bytes())
    finally:
        pi.close()

    project, agent = make_project(root, 'disabled', project_settings={'backlogOverlay': {'shortcut': False}})
    (project / 'BACKLOG.md').write_text('#### TEC-008 — Synthetic disabled\n- **Status:** Todo\n')
    pi = Pi(project, root, agent)
    try:
        pi.send(b'\x1b[98;6u')
        assert b'Synthetic disabled' not in pi.drain(1)
        open_command(pi, b'Synthetic disabled')
        close_view(pi)
    finally:
        pi.close()


def exercise_branches(root):
    project, agent = make_project(root, 'branches')
    remote = root / 'synthetic-remote.git'
    env = {'PATH': os.environ['PATH'], 'HOME': str(root), 'GIT_CONFIG_NOSYSTEM': '1',
           'GIT_AUTHOR_NAME': 'Synthetic', 'GIT_AUTHOR_EMAIL': 'synthetic@example.invalid',
           'GIT_COMMITTER_NAME': 'Synthetic', 'GIT_COMMITTER_EMAIL': 'synthetic@example.invalid'}

    def git(*args, cwd=project, date=None):
        extra = {'GIT_AUTHOR_DATE': date, 'GIT_COMMITTER_DATE': date} if date else {}
        return subprocess.check_output(['git', *args], cwd=cwd, env={**env, **extra}, stderr=subprocess.DEVNULL, text=True).strip()

    backlog = project / 'BACKLOG.md'
    def content(state):
        return ('## Version v0.2.0\n**State:** Open\n### EPIC-001 — Synthetic epic\n'
                f'#### TEC-001 — Synthetic branch item\n- **Type:** Task · **Priority:** P1 · **Status:** {state}\n')

    git('init', '-q', '-b', 'main')
    backlog.write_text(content('Todo'))
    git('add', 'BACKLOG.md')
    git('commit', '-qm', 'base', date='2020-01-01T00:00:00Z')
    git('switch', '-qc', 'task/TEC-001-first')
    backlog.write_text(content('Blocked'))
    git('commit', '-qam', 'first', date='2020-01-02T00:00:00Z')
    first_commit = git('rev-parse', 'HEAD')
    git('switch', '-q', 'main')
    git('switch', '-qc', 'task/TEC-001-second')
    backlog.write_text(content('Done'))
    git('commit', '-qam', 'second', date='2020-01-03T00:00:00Z')
    git('switch', '-q', 'main')
    git('clone', '-q', '--bare', str(project), str(remote), cwd=root)
    git('--git-dir', str(remote), 'update-ref', '-d', 'refs/heads/task/TEC-001-first', cwd=root)
    # The remote branch first appears only in the viewer's background fetch.
    git('remote', 'add', 'origin', str(remote))
    git('fetch', '-q', 'origin')
    git('switch', '-q', 'task/TEC-001-second')
    backlog.write_text(content('In Progress'))
    git('commit', '-qam', 'local', date='2020-01-04T00:00:00Z')
    git('switch', '-q', 'main')
    # Remove the other local branch so that the competing branch is remote-tracking.
    git('branch', '-D', 'task/TEC-001-first')
    assert not git('branch', '-r', '--list', 'origin/task/TEC-001-first')
    git('--git-dir', str(remote), 'update-ref', 'refs/heads/task/TEC-001-first', first_commit, cwd=root)
    before = backlog.read_bytes(), git('status', '--porcelain')
    pi = Pi(project, root, agent)
    try:
        open_command(pi, b'Synthetic branch item')
        pi.send(b'S')
        out = pi.wait_for(b'also in: origin/task/TEC-001-first', 20)
        assert b'from task/TEC-001-second' in out
        assert b'In Progress' in out
        assert git('branch', '-r', '--list', 'origin/task/TEC-001-first')
        close_view(pi)
        assert before == (backlog.read_bytes(), git('status', '--porcelain'))
    finally:
        pi.close()

    # Unreachable synthetic remote: failure is shown and existing refs remain useful.
    git('remote', 'set-url', 'origin', str(root / 'missing.git'))
    pi = Pi(project, root, agent)
    try:
        open_command(pi, b'Synthetic branch item')
        pi.send(b'S')
        pi.wait_for(b'fetch failed: showing last known state', 20)
        assert before == (backlog.read_bytes(), git('status', '--porcelain'))
    finally:
        pi.close()


if __name__ == '__main__':
    assert subprocess.check_output(['pi', '--version'], text=True).strip() == '1.5.0'
    with tempfile.TemporaryDirectory(prefix='pilates-pi-backlog-') as temporary:
        exercise(Path(temporary))
        exercise_branches(Path(temporary))
    print('Synthetic isolated Pi backlog TUI checks passed')
