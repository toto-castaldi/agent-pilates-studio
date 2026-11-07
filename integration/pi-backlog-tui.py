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
        self.wait_for(b'ctrl+c/ctrl+d clear/exit', 30)
        time.sleep(0.5)
        self.drain()

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
               '#### TEC-001 — Synthetic first\n- **Status:** Todo\n'
               + ''.join(f'- Synthetic body line {i:03d}\n' for i in range(80))
               + '```\n#### TEC-999 — Not an item\n```\n'
               + '#### TEC-002 — Synthetic second\n- **Status:** Done\n'
               + '## Unassigned backlog\n#### TEC-003 — Synthetic unassigned\n'
               + '- **Epic:** EPIC-002 — Synthetic unassigned epic\n'
               + '- TEC-004 — Synthetic short idea\n')
    backlog.write_text(fixture)
    before_extension = (project / '.pi/extensions/backlog/index.ts').read_bytes()
    pi = Pi(project, root, agent)
    try:
        out = open_command(pi, b'Synthetic first')
        assert b'1 / 4' in out and b'Version v0.2.0 (Open)' in out and b'Synthetic epic' in out
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
        backlog.write_text('#### TEC-005 — Synthetic refreshed\n')
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
        backlog.write_text('#### TEC-006 — Synthetic shortcut\n')
        pi.send(b'\x1b[98;6u')  # Kitty ctrl+shift+b
        pi.wait_for(b'Synthetic shortcut')
        close_view(pi)
        assert backlog.read_text() == '#### TEC-006 — Synthetic shortcut\n'
        assert (project / '.pi/extensions/backlog/index.ts').read_bytes() == before_extension
    finally:
        pi.close()

    # Project setting overrides synthetic global setting; no personal Pi state is read.
    project, agent = make_project(root, 'custom', {'backlogOverlay': {'shortcut': False}},
                                  {'backlogOverlay': {'shortcut': 'alt+b'}})
    (project / 'BACKLOG.md').write_text('#### TEC-007 — Synthetic custom shortcut\n')
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
    (project / 'BACKLOG.md').write_text('#### TEC-008 — Synthetic disabled\n')
    pi = Pi(project, root, agent)
    try:
        pi.send(b'\x1b[98;6u')
        assert b'Synthetic disabled' not in pi.drain(1)
        open_command(pi, b'Synthetic disabled')
        close_view(pi)
    finally:
        pi.close()


if __name__ == '__main__':
    assert subprocess.check_output(['pi', '--version'], text=True).strip() == '1.5.0'
    with tempfile.TemporaryDirectory(prefix='pilates-pi-backlog-') as temporary:
        exercise(Path(temporary))
    print('Synthetic isolated Pi backlog TUI checks passed')
