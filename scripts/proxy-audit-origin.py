#!/usr/bin/env python3
"""Temporary synthetic origin for the proxy privacy audit (TEC-008).

It binds 127.0.0.1:<port> only if the port is free (no address reuse), answers
the development route of the tunnel with fixed responses chosen by the
`X-Pilates-Audit-Mode` header and never logs requests. It stops when its
standard input reaches EOF (the launcher closed it or the SSH session ended)
or after a hard deadline, whichever comes first, and writes nothing to disk.

Output lines: origin=listening | origin=busy | origin=failed, then origin=closed.
"""
import http.server
import os
import socket
import sys
import threading
import time

PORT = int(sys.argv[-1]) if sys.argv[-1].isdigit() else 8300
DEADLINE = float(os.environ.get('PILATES_PROXY_AUDIT_ORIGIN_SECONDS', '180'))
MAX_BODY = 64 * 1024


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = 'pilates-proxy-audit-origin'
    sys_version = ''
    protocol_version = 'HTTP/1.1'

    def log_message(self, *_args):  # never log requests
        return

    def log_request(self, *_args):
        return

    def _drain(self):
        try:
            length = min(int(self.headers.get('Content-Length') or 0), MAX_BODY)
        except ValueError:
            length = 0
        if length > 0:
            self.rfile.read(length)

    def _reply(self, status, text):
        body = text.encode()
        self.send_response(status)
        self.send_header('Content-Type', 'text/plain')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def _handle(self):
        self._drain()
        mode = self.headers.get('X-Pilates-Audit-Mode', 'ok')
        if mode == 'reset':
            # Abort the connection without a response: SO_LINGER 0 sends RST.
            self.connection.setsockopt(socket.SOL_SOCKET, socket.SO_LINGER, b'\x01\x00\x00\x00\x00\x00\x00\x00')
            self.close_connection = True
            self.connection.close()
            return
        if mode == 'slow':
            time.sleep(8)
        if mode == 'error':
            self._reply(500, 'synthetic error\n')
        else:
            self._reply(200, 'synthetic ok\n')

    do_GET = _handle
    do_POST = _handle
    do_HEAD = _handle


class Server(http.server.ThreadingHTTPServer):
    allow_reuse_address = False
    daemon_threads = True

    def handle_error(self, request, client_address):  # aborted requests: no tracebacks or addresses
        return


def main():
    try:
        server = Server(('127.0.0.1', PORT), Handler)
    except OSError as error:
        print('origin=busy' if error.errno in (98, 48) else 'origin=failed', flush=True)
        raise SystemExit(3) from None
    stop = threading.Event()

    def wait_stdin():
        try:
            while sys.stdin.buffer.read(1024):
                pass
        finally:
            stop.set()

    threading.Thread(target=wait_stdin, daemon=True).start()
    threading.Timer(DEADLINE, stop.set).start()
    serving = threading.Thread(target=server.serve_forever, kwargs={'poll_interval': 0.2}, daemon=True)
    serving.start()
    print('origin=listening', flush=True)
    stop.wait()
    server.shutdown()
    server.server_close()
    print('origin=closed', flush=True)
    os._exit(0)  # the deadline timer and blocked stdin reader must not keep the process alive


if __name__ == '__main__':
    main()
