#!/usr/bin/env python3
"""Real Claude Code project loading and pane interactions, with synthetic HOME and no model."""
import fcntl
import json
import os
import pty
import select
import shutil
import signal
import struct
import subprocess
import tempfile
import termios
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from backlog_fixture import (cli, copy_tool, create_branch_fixture, git, isolated_env,
                             item, snapshot, viewer_items, write_store)
from terminal_fixture import Screen

PLUGIN = Path('.agents/skills/backlog-overlay').resolve()
FOCUS_HINT = 'ctrl+x tab gives the keys to the backlog pane'


class Claude:
    def __init__(self, project, root, base_url, version):
        self.project, self.root = project, root
        home, config = root / 'home', root / 'config'
        home.mkdir()
        config.mkdir()
        (config / '.claude.json').write_text(json.dumps({
            'hasCompletedOnboarding': True, 'theme': 'dark', 'lastOnboardingVersion': version,
        }))
        env = {
            **isolated_env(home), 'CLAUDE_CONFIG_DIR': str(config), 'TERM': 'xterm-256color',
            'ANTHROPIC_API_KEY': 'synthetic-test-key', 'ANTHROPIC_BASE_URL': base_url,
            'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC': '1', 'DISABLE_AUTOUPDATER': '1',
            'DISABLE_TELEMETRY': '1', 'DISABLE_ERROR_REPORTING': '1', 'PYTHONDONTWRITEBYTECODE': '1',
        }
        self.screen = Screen()
        self.master, slave = pty.openpty()
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 40, 120, 0, 0))
        self.proc = subprocess.Popen(
            ['claude', '--no-chrome', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
             '--setting-sources', 'project', '--permission-mode', 'manual', '--tools', ''],
            cwd=project, env=env, stdin=slave, stdout=slave, stderr=slave, start_new_session=True,
        )
        os.close(slave)
        try:
            self.wait_for('Quick safety check', 30)
            self.drain(0.5)
            assert not (root / 'cli-calls.jsonl').exists(), 'no backlog reads before project trust'
            self.send(b'\x1b[B')  # No is the safe default: explicitly trust this synthetic folder.
            self.wait_for('❯ Yes, I trust this folder')
            self.send(b'\r')
            self.wait_for('Do you want to use this API key?', 15)
            self.drain(0.25)
            self.send(b'\x1b[A')  # Approve only the synthetic key, routed to the loopback stub.
            self.wait_for('❯ Yes')
            self.send(b'\r')
            self.wait_for('API Usage Billing', 20)
            self.drain(0.5)
        except BaseException:
            self.close()
            raise

    def drain(self, timeout=0.2):
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            ready, _, _ = select.select([self.master], [], [], min(0.05, max(0, end - time.monotonic())))
            if ready:
                try:
                    self.screen.feed(os.read(self.master, 65536))
                except OSError:
                    break

    def send(self, data):
        os.write(self.master, data)

    def wait_for(self, expected, timeout=12):
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            self.drain(0.1)
            if self.screen.contains(expected):
                return
            if self.proc.poll() is not None:
                break
        raise AssertionError(f'Claude screen missing {expected!r}; synthetic screen:\n{self.screen.text()}')

    def key(self, key, expected=None):
        self.send(key)
        if expected:
            self.wait_for(expected)
        else:
            self.drain(0.15)

    def open(self, expected):
        self.send(b'/backlog\r')
        self.wait_for(expected)
        self.drain(0.4)
        if self.screen.contains(FOCUS_HINT):
            self.key(b'\x18\t')
        assert not self.screen.contains(FOCUS_HINT), self.screen.text()

    def scroll(self, direction, expected):
        for _ in range(100):
            self.send(b'\x1b[B' if direction == 'down' else b'\x1b[A')
            self.drain(0.025)
        self.wait_for(expected)

    def close(self):
        if self.proc.poll() is None:
            os.killpg(self.proc.pid, signal.SIGTERM)
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(self.proc.pid, signal.SIGKILL)
                self.proc.wait(timeout=5)
        os.close(self.master)


def install_plugin(project, root):
    copy_tool(project)
    shutil.copytree(PLUGIN, project / '.agents/skills/backlog-overlay')
    (project / '.claude').mkdir()
    (project / '.claude/skills').symlink_to('../.agents/skills', target_is_directory=True)
    (project / '.gitignore').write_text('.agents/skills/backlog-overlay/.claude-plugin/types/\n')
    # Trace real CLI invocations outside the worktree; do not replace their behavior or Git calls.
    tool = project / '.agents/tools/backlog.py'
    actual = project / '.agents/tools/backlog_actual.py'
    tool.rename(actual)
    tool.write_text('import json, subprocess, sys\n'
                    f'with open({str(root / "cli-calls.jsonl")!r}, "a") as log:\n'
                    '    log.write(json.dumps(sys.argv[1:]) + "\\n")\n'
                    f'sys.exit(subprocess.call([sys.executable, {str(actual)!r}, *sys.argv[1:]]))\n')


def exercise_viewer(root, base_url, version):
    project = root / 'project'
    copy_tool(project)
    write_store(project, viewer_items())
    install_plugin(project, root)
    before = snapshot(project)
    app = Claude(project, root, base_url, version)
    try:
        app.open('Synthetic first')
        app.wait_for('Type: all · Priority: all · Status: Todo')
        app.scroll('down', 'Synthetic body line 079')
        app.scroll('up', 'Synthetic body line 000')
        for _ in range(5):
            app.key(b's')
        app.wait_for('Status: all')
        app.key(b'n', 'Synthetic second')
        app.key(b'e', 'Synthetic unassigned')
        app.wait_for('no version')
        app.key(b'b', 'Synthetic second')
        app.key(b'g', 'Synthetic first')
        app.key(b't', 'Type: User Story')
        app.key(b'p', 'No items match the filters')
        app.key(b'p', 'Priority: P1')
        app.key(b'p', 'Synthetic second')
        app.key(b'q')
        app.open('Synthetic second')
        app.wait_for('Type: User Story · Priority: P2 · Status: all')
        app.key(b'x', 'Synthetic first')
        assert snapshot(project) == before
        write_store(project, [item('TEC-005', 'Synthetic refreshed')])
        expected = snapshot(project)
        app.key(b'r', 'Synthetic refreshed')
        assert snapshot(project) == expected
        write_store(project, [])
        app.key(b'r', 'The backlog contains no items.')
        (project / 'backlog/items/TEC-009.json').write_text('{')
        app.key(b'r', 'Cannot read the backlog')
        write_store(project, [item('TEC-005', 'Synthetic recovered')])
        expected = snapshot(project)
        app.key(b'r', 'Synthetic recovered')
        app.key(b'\x1b')
        assert snapshot(project) == expected
        calls = [json.loads(line) for line in (root / 'cli-calls.jsonl').read_text().splitlines()]
        assert ['export', '--json'] in calls
        assert ['export', '--json', '--branches', '--no-fetch'] in calls
    finally:
        app.close()


def exercise_branches(root, base_url, version):
    data = create_branch_fixture(root)
    project = Path(data['project'])
    install_plugin(project, root)
    before = snapshot(project), git(project, 'status', '--porcelain')
    app = Claude(project, root, base_url, version)
    try:
        app.open('Status: Todo')
        for _ in range(5):
            app.key(b's')
        app.wait_for('from task/TEC-001-second')
        app.wait_for('also in: origin/task/TEC-001-first')
        app.wait_for('In Progress')
        assert not app.screen.contains('Synthetic branch-only item')
        assert not app.screen.contains('TEC-001-merged')
        assert git(project, 'branch', '-r', '--list', 'origin/task/TEC-001-first')
        assert before == (snapshot(project), git(project, 'status', '--porcelain'))
        git(project, 'remote', 'set-url', 'origin', str(root / 'missing.git'))
        app.key(b'r', 'fetch failed: showing last known state')
        app.wait_for('from task/TEC-001-second')
        app.wait_for('In Progress')
        assert before == (snapshot(project), git(project, 'status', '--porcelain'))
        git(project, 'switch', '-q', data['second'])
        cli(project, 'edit', 'TEC-001', '--title', 'Synthetic working copy')
        cli(project, 'block', 'TEC-001', '--reason', 'Synthetic working copy blocker')
        expected = snapshot(project)
        app.key(b'r', 'Synthetic working copy')
        app.wait_for('Blocked')
        assert not app.screen.contains('from task/'), app.screen.text()
        assert not app.screen.contains('also in:'), app.screen.text()
        assert snapshot(project) == expected
        calls = [json.loads(line) for line in (root / 'cli-calls.jsonl').read_text().splitlines()]
        assert ['export', '--json', '--branches'] in calls
    finally:
        app.close()


if __name__ == '__main__':
    with tempfile.TemporaryDirectory(prefix='pilates-claude-tui-') as temporary:
        root = Path(temporary)
        env = {**isolated_env(root), 'CLAUDE_CONFIG_DIR': str(root / 'version-config'),
               'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC': '1'}
        version = subprocess.check_output(['claude', '--version'], env=env, text=True).split()[0]
        requests = []

        class Stub(BaseHTTPRequestHandler):
            def do_GET(self):
                requests.append(('GET', self.path))
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"data":[]}')

            def do_POST(self):
                requests.append(('POST', self.path))
                self.send_error(503, 'Synthetic endpoint: no model')

            def log_message(self, *_):
                pass

        server = ThreadingHTTPServer(('127.0.0.1', 0), Stub)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            base_url = f'http://127.0.0.1:{server.server_port}'
            for name, exercise in [('viewer', exercise_viewer), ('branches', exercise_branches)]:
                directory = root / name
                directory.mkdir()
                exercise(directory, base_url, version)
            assert not any('messages' in path for _, path in requests), requests
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)
    print(f'Synthetic isolated Claude Code {version} project trust, CLI and TUI checks passed; no model requests')
