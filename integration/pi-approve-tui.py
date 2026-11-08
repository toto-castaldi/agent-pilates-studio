#!/usr/bin/env python3
"""Check session-only trust in an offline synthetic Pi TUI, without model turns."""
import fcntl
import os
import pty
import select
import struct
import subprocess
import tempfile
import termios
import time
from pathlib import Path


def run(project, home, agent, approve, expected):
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 40, 120, 0, 0))
    env = {
        'PATH': os.environ['PATH'], 'HOME': str(home), 'PI_CODING_AGENT_DIR': str(agent),
        'PI_SKIP_VERSION_CHECK': '1', 'PI_TELEMETRY': '0', 'TERM': 'xterm-256color',
        'OPENAI_API_KEY': 'synthetic-test-key',
    }
    proc = subprocess.Popen(
        ['pi', *(['--approve'] if approve else []), '--offline', '--no-session', '--no-mcp', '--no-context-files'],
        cwd=project, env=env, stdin=slave, stdout=slave, stderr=slave, start_new_session=True,
    )
    os.close(slave)
    try:
        output = b''
        end = time.monotonic() + 30
        while time.monotonic() < end and expected not in output:
            ready, _, _ = select.select([master], [], [], 0.2)
            if ready:
                try:
                    output += os.read(master, 65536)
                except OSError:
                    break
            if proc.poll() is not None:
                break
        assert expected in output, f'missing {expected!r}; synthetic output tail {output[-2000:]!r}'
        if approve:
            assert b'Trust project folder?' not in output
            assert (project / 'extension-executed').read_text() == 'synthetic'
        else:
            assert not (project / 'extension-executed').exists()
    finally:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5)
        os.close(master)


with tempfile.TemporaryDirectory(prefix='pi-approve-tui-') as directory:
    root = Path(directory)
    project, agent = root / 'project', root / 'agent'
    extensions = project / '.pi' / 'extensions'
    extensions.mkdir(parents=True)
    agent.mkdir()
    (extensions / 'synthetic.js').write_text(
        'import { writeFileSync } from "node:fs"; '
        'export default function(pi) { pi.on("session_start", async () => writeFileSync("extension-executed", "synthetic")); }\n'
    )
    run(project, root, agent, False, b'Trust project folder?')
    run(project, root, agent, True, b'Press ctrl+o to show full startup help')
    (project / 'extension-executed').unlink()
    # A fresh session still asks: --approve did not persist project trust.
    run(project, root, agent, False, b'Trust project folder?')
