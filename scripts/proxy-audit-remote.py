#!/usr/bin/env python3
"""Read-only collector for the proxy privacy audit (TEC-008).

It runs on the tunnel host, sent over SSH by scripts/proxy-audit.mjs, and
prints only `key=value` lines whose values are counts, booleans, versions,
checksums or fixed enumerations. It never prints log lines, configuration
values, secrets, messages or telephone numbers, and it never changes the
host: the only write is one synthetic positive-control line in the journal
(`pre`) and, under sudo, the private summary file requested by the launcher.

Phases:
  pre         configuration, retention and destinations; positive control
  post        synthetic markers and cloudflared formats since `pre`
  privileged  facts readable only by root (run through sudo by the operator)

The launcher prepends `INPUT = {...}` with the synthetic markers for `post`.
"""
import glob
import gzip
import hashlib
import json
import os
import re
import subprocess
import sys
import time

SCHEMA = 'pilates-proxy-audit-v1'
UNIT = 'cloudflared'
PROD_HOST = 'agent-pilates-studio.toto-castaldi.com'
DEV_HOST = 'pilates-dev.toto-castaldi.com'
PROD_PATH = '/whatsapp/webhook'
DEV_PATH = '/webhooks/whatsapp'
ORIGINS = {
    'http://127.0.0.1:18190': 'prod-origin',
    'http://localhost:18190': 'prod-origin',
    'http://127.0.0.1:8300': 'dev-origin',
    'http://localhost:8300': 'dev-origin',
    'http_status:404': 'status-404',
}
SHIPPERS = (
    'alloy', 'datadog-agent', 'elastic-agent', 'filebeat', 'fluent-bit', 'grafana-agent', 'netdata',
    'nxlog', 'otelcol', 'otelcol-contrib', 'promtail', 'splunkd', 'systemd-journal-remote',
    'systemd-journal-upload', 'td-agent-bit', 'telegraf', 'vector', 'wazuh-agent',
)
# Fixed message texts of cloudflared 2026.10.x request errors (proxy/proxy.go,
# connection/quic_connection.go, connection/http2.go).
FORMATS = (
    ('request_failed', b'Request failed'),
    ('origin_unreachable', b'Unable to reach the origin service'),
    ('ended_abruptly', b'Incoming request ended abruptly'),
    ('failed_to_serve', b'failed to serve incoming request'),
)
TUNNEL_ENV = (
    'TUNNEL_LOGLEVEL', 'TUNNEL_TRANSPORT_LOGLEVEL', 'TUNNEL_PROTO_LOGLEVEL', 'TUNNEL_LOGFILE',
    'TUNNEL_LOGDIRECTORY', 'TUNNEL_TRACE_OUTPUT', 'TUNNEL_LOG_OUTPUT', 'TUNNEL_MANAGEMENT_OUTPUT', 'TUNNEL_TOKEN',
)
JOURNALD_KEYS = (
    'Storage', 'Compress', 'Seal', 'SplitMode', 'SystemMaxUse', 'SystemKeepFree', 'SystemMaxFileSize',
    'SystemMaxFiles', 'RuntimeMaxUse', 'MaxRetentionSec', 'MaxFileSec', 'ForwardToSyslog', 'ForwardToKMsg',
    'ForwardToConsole', 'ForwardToWall', 'ForwardToSocket', 'MaxLevelStore', 'MaxLevelSyslog', 'LineMax',
)
LEVELS = ('debug', 'info', 'warn', 'error', 'fatal')
KEY = re.compile(r'^[a-z0-9_.-]{1,96}$')
SAFE = re.compile(r'^[A-Za-z0-9._:+-]{0,64}$')
PATH_VALUE = re.compile(r'^/[A-Za-z0-9._/-]{1,128}$')
ENV = {
    'LC_ALL': 'C', 'PATH': os.environ.get('PATH') or '/usr/sbin:/usr/bin:/sbin:/bin',
    'SYSTEMD_PAGER': '', 'SYSTEMD_COLORS': '0', 'SYSTEMD_LESS': '',
}
# Only the local tests set a synthetic filesystem root; on the host it is empty.
ROOTFS = os.environ.get('PILATES_PROXY_AUDIT_ROOT', '')
OUT = []


def host_path(path):
    return ROOTFS + path if ROOTFS and path.startswith('/') else path


def emit(key, value, path=False):
    value = str(value)
    if not KEY.match(key):
        raise SystemExit(4)
    if path and PATH_VALUE.match(value):
        OUT.append(f'{key}={value}')
    elif SAFE.match(value):
        OUT.append(f'{key}={value}')
    else:
        OUT.append(f'{key}=invalid')


def run(args, timeout=120, data=None):
    try:
        result = subprocess.run(
            args, input=data, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            timeout=timeout, env=ENV, check=False,
        )
        return result.returncode, result.stdout
    except (OSError, subprocess.SubprocessError):
        return None, b''


def text(data):
    return data.decode('utf-8', 'replace')


def enum(value, allowed, empty='unset'):
    value = (value or '').strip().strip('"\'').lower()
    if not value:
        return empty
    return value if value in allowed else 'other'


def count_lines(data, needle, ignore_case=True):
    if ignore_case:
        needle = needle.lower()
        return sum(1 for line in data.splitlines() if needle in line.lower())
    return sum(1 for line in data.splitlines() if needle in line)


def unit_properties():
    names = (
        'ActiveState', 'SubState', 'MainPID', 'ExecStart', 'Environment', 'EnvironmentFiles',
        'StandardOutput', 'StandardError', 'LogFilterPatterns', 'LogLevelMax', 'LimitCORE',
        'NeedDaemonReload', 'User',
    )
    code, data = run(['systemctl', 'show', UNIT, '--no-pager'] + [f'--property={name}' for name in names])
    properties = {}
    if code == 0:
        for line in text(data).splitlines():
            key, separator, value = line.partition('=')
            if separator:
                properties.setdefault(key, []).append(value)
    return properties


def first(properties, name):
    values = properties.get(name) or ['']
    return values[0]


def exec_argv(properties):
    """Arguments of ExecStart (`{ path=... ; argv[]=... ; ... }`) and of the running process."""
    argv = []
    exec_path = ''
    for value in properties.get('ExecStart', []):
        match = re.search(r'path=([^ ;]+)', value)
        if match:
            exec_path = match.group(1)
        match = re.search(r'argv\[\]=([^;]*)', value)
        if match:
            argv.extend(match.group(1).split())
    pid = first(properties, 'MainPID')
    process = []
    if pid.isdigit() and pid != '0':
        try:
            with open(host_path(f'/proc/{pid}/cmdline'), 'rb') as handle:
                process = [text(part) for part in handle.read().split(b'\0') if part]
        except OSError:
            process = []
    return exec_path, argv, process


def flag_value(argv, name):
    """Value of --name / --name=value / -name in an argument vector, None when absent."""
    for index, arg in enumerate(argv):
        for prefix in (f'--{name}', f'-{name}'):
            if arg == prefix:
                return argv[index + 1] if index + 1 < len(argv) else ''
            if arg.startswith(prefix + '='):
                return arg.split('=', 1)[1]
    return None


def flag_facts(prefix, argv):
    if not argv:
        for name in ('no_autoupdate', 'config', 'token', 'loglevel', 'transport_loglevel', 'logfile',
                     'log_directory', 'trace_output', 'output', 'protocol'):
            emit(f'{prefix}.{name}', 'unknown')
        return
    emit(f'{prefix}.no_autoupdate', 'yes' if flag_value(argv, 'no-autoupdate') is not None else 'no')
    emit(f'{prefix}.config', 'set' if flag_value(argv, 'config') is not None else 'unset')
    emit(f'{prefix}.token', 'yes' if flag_value(argv, 'token') is not None else 'no')
    level = flag_value(argv, 'loglevel')
    emit(f'{prefix}.loglevel', enum(level, LEVELS) if level is not None else 'unset')
    transport = flag_value(argv, 'transport-loglevel')
    if transport is None:
        transport = flag_value(argv, 'proto-loglevel')
    emit(f'{prefix}.transport_loglevel', enum(transport, LEVELS) if transport is not None else 'unset')
    for name, flag in (('logfile', 'logfile'), ('log_directory', 'log-directory'), ('trace_output', 'trace-output')):
        emit(f'{prefix}.{name}', 'set' if flag_value(argv, flag) is not None else 'unset')
    output = flag_value(argv, 'output')
    emit(f'{prefix}.output', enum(output, ('default', 'json')) if output is not None else 'unset')
    protocol = flag_value(argv, 'protocol')
    emit(f'{prefix}.protocol', enum(protocol, ('quic', 'http2', 'auto')) if protocol is not None else 'unset')


def compile_pattern(pattern):
    try:
        return re.compile(pattern)
    except re.error:
        return None


def filter_samples():
    url = f'https://{PROD_HOST}{PROD_PATH}?hub.verify_token=synthetic'
    return {
        'prod_lower': f'2026-01-01T00:00:00Z ERR Request failed dest={url} error="synthetic" type=http',
        'prod_upper': f'2026-01-01T00:00:00Z ERR Request failed dest=https://{PROD_HOST.upper()}{PROD_PATH} type=http',
        'prod_mixed': f'2026-01-01T00:00:00Z ERR Request failed dest=https://{PROD_HOST.title()}{PROD_PATH} type=http',
        'prod_json': json.dumps({'level': 'error', 'dest': url, 'message': 'Request failed'}),
        'dev_lower': f'2026-01-01T00:00:00Z ERR Request failed dest=https://{DEV_HOST}{DEV_PATH} type=http',
        'dev_upper': f'2026-01-01T00:00:00Z ERR Request failed dest=https://{DEV_HOST.upper()}{DEV_PATH} type=http',
        'neutral': '2026-01-01T00:00:00Z ERR  error="Unable to reach the origin service" connIndex=0 event=1 originService=http://127.0.0.1:18190',
    }


def filter_facts(properties):
    """Apply journald's LogFilterPatterns semantics (systemd v259) to synthetic lines."""
    denied, allowed, broken = [], [], False
    for value in properties.get('LogFilterPatterns', []):
        if not value:
            continue
        deny = value.startswith('~')
        regex = compile_pattern(value[1:] if deny else value)
        if regex is None:
            broken = True
        elif deny:
            denied.append(regex)
        else:
            allowed.append(regex)
    emit('unit.filter.deny_patterns', len(denied))
    emit('unit.filter.allow_patterns', len(allowed))
    for name, sample in filter_samples().items():
        if broken:
            emit(f'unit.filter.{name}', 'unknown')
            continue
        if any(regex.search(sample) for regex in denied):
            outcome = 'dropped'
        elif any(regex.search(sample) for regex in allowed) or not allowed:
            outcome = 'kept'
        else:
            outcome = 'dropped'
        emit(f'unit.filter.{name}', outcome)


def unit_facts(properties):
    emit('unit.state', enum(first(properties, 'ActiveState'), (
        'active', 'inactive', 'failed', 'activating', 'deactivating', 'reloading'), 'unknown'))
    emit('unit.substate', enum(first(properties, 'SubState'), (
        'running', 'dead', 'exited', 'failed', 'auto-restart', 'start', 'stop'), 'unknown'))
    user = first(properties, 'User')
    emit('unit.user', 'root' if user in ('', 'root') else 'other')
    outputs = ('journal', 'journal+console', 'kmsg', 'kmsg+console', 'null', 'tty', 'inherit', 'socket')
    for name, prop in (('stdout', 'StandardOutput'), ('stderr', 'StandardError')):
        value = first(properties, prop).strip().lower()
        if value.startswith(('file:', 'append:', 'truncate:')):
            value = value.split(':', 1)[0]
            emit(f'unit.{name}', value)
        else:
            emit(f'unit.{name}', enum(value, outputs, 'unknown'))
    emit('unit.need_daemon_reload', enum(first(properties, 'NeedDaemonReload'), ('yes', 'no'), 'unknown'))
    emit('unit.log_level_max', enum(first(properties, 'LogLevelMax'), (
        'emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug')))
    core = first(properties, 'LimitCORE').strip().lower()
    emit('unit.limit_core', core if core == 'infinity' or core.isdigit() else 'unknown')
    environment = ' '.join(properties.get('Environment', []))
    for name in TUNNEL_ENV:
        emit(f'cloudflared.unit_env.{name.lower()}', 'set' if re.search(rf'(^|\s){name}=', environment) else 'unset')
    files = [value for value in properties.get('EnvironmentFiles', []) if value.strip()]
    emit('cloudflared.env_files', len(files))


def binary_facts(exec_path, argv, process):
    emit('cloudflared.exec', exec_path or 'unknown', path=True)
    version = 'unknown'
    digest = 'unknown'
    if exec_path:
        code, data = run([host_path(exec_path), '--version'], timeout=30)
        match = re.search(r'version (\d{4}\.\d{1,2}\.\d{1,3})', text(data)) if code == 0 else None
        if match:
            version = match.group(1)
        try:
            with open(os.path.realpath(host_path(exec_path)), 'rb') as handle:
                digest = hashlib.sha256(handle.read()).hexdigest()
        except OSError:
            digest = 'unknown'
    emit('cloudflared.version', version)
    emit('cloudflared.sha256', digest)
    code, data = run(['dpkg-query', '-W', '-f=${Version}', 'cloudflared'], timeout=30)
    package = text(data).strip() if code == 0 else ''
    emit('cloudflared.package_version', package if re.match(r'^[0-9][A-Za-z0-9.+~-]{0,40}$', package) else 'none')
    flag_facts('cloudflared.args', argv)
    flag_facts('cloudflared.process', process)


def journald_facts():
    code, data = run(['systemd-analyze', 'cat-config', 'systemd/journald.conf'], timeout=30)
    values = {}
    section = ''
    if code == 0:
        for line in text(data).splitlines():
            line = line.strip()
            if not line or line.startswith(('#', ';')):
                continue
            if line.startswith('['):
                section = line
                continue
            key, separator, value = line.partition('=')
            if separator and section == '[Journal]' and key.strip() in JOURNALD_KEYS:
                values[key.strip()] = value.strip()
    for key in JOURNALD_KEYS:
        value = values.get(key)
        emit(f'journald.{key.lower()}', 'unset' if value is None else (value if SAFE.match(value) else 'other'))
    emit('journald.config_readable', 'yes' if code == 0 else 'no')
    emit('journald.persistent_dir', 'yes' if os.path.isdir(host_path('/var/log/journal')) else 'no')
    code, data = run(['journalctl', '--disk-usage'], timeout=60)
    match = re.search(r'take up ([0-9.]+[KMGTPE]?)', text(data)) if code == 0 else None
    emit('journald.disk_usage', match.group(1) if match else 'unknown')


def oldest_epoch(extra):
    args = ['journalctl', '-q', '--no-pager', '-o', 'json', '--output-fields=__REALTIME_TIMESTAMP'] + extra
    try:
        process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=ENV)
    except OSError:
        return 'unknown'
    try:
        line = process.stdout.readline()
    finally:
        process.kill()
        process.wait()
    try:
        return str(int(json.loads(line)['__REALTIME_TIMESTAMP']) // 1_000_000)
    except (ValueError, KeyError, TypeError):
        return 'unknown'


def unit_messages(extra):
    """Yield (message, epoch) of cloudflared journal entries, streaming; None when unreadable."""
    args = ['journalctl', '-q', '--no-pager', '-u', UNIT, '-o', 'json',
            '--output-fields=MESSAGE,__REALTIME_TIMESTAMP'] + extra
    try:
        process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=ENV)
    except OSError:
        return None
    entries = []
    try:
        for line in process.stdout:
            try:
                entry = json.loads(line)
                message = entry.get('MESSAGE', '')
                if isinstance(message, list):
                    message = bytes(message).decode('utf-8', 'replace')
                entries.append((str(message), int(entry['__REALTIME_TIMESTAMP']) // 1_000_000))
            except (ValueError, KeyError, TypeError):
                continue
    finally:
        process.stdout.close()
        code = process.wait()
    return entries if code == 0 else None


HOST_QUERY = re.compile(r'(agent-pilates-studio|pilates-dev)\.toto-castaldi\.com[^\s"]*\?', re.I)
VERIFY_VALUE = re.compile(r'verify_token=([^&\s"]*)', re.I)


def token_shape(value):
    """Format class of a logged verify token, never the value itself."""
    lower = value.lower()
    if re.fullmatch(r'[0-9a-f]{64}', value):
        return 'hex64'
    if any(word in lower for word in ('synthetic', 'sintetic', 'pxaudit', 'fake', 'dummy', 'wrong', 'errat', 'invalid')):
        return 'synthetic'
    return 'other'


def host_token_facts(prefix, lines):
    """Counts on lines carrying a webhook hostname, by format of the verify tokens."""
    query = 0
    shapes = {'hex64': 0, 'synthetic': 0, 'other': 0}
    for line in lines:
        if HOST_QUERY.search(line):
            query += 1
        for value in VERIFY_VALUE.findall(line):
            shapes[token_shape(value)] += 1
    emit(f'{prefix}.host_query_lines', query)
    for name, value in shapes.items():
        emit(f'{prefix}.host_token_{name}', value)


def message_facts(prefix, entries):
    counts = {'prod': 0, 'dev': 0, 'token': 0, 'debug': 0, 'json': 0}
    newest = {'prod': 'unknown', 'dev': 'unknown', 'token': 'unknown'}
    formats = {name: 0 for name, _ in FORMATS}
    host_lines = []
    for message, epoch in entries:
        lower = message.lower()
        if PROD_HOST in lower or DEV_HOST in lower:
            host_lines.append(message)
            if 'verify_token' in lower or 'hub.challenge' in lower:
                counts['token'] += 1
                newest['token'] = str(epoch)
        for name, host in (('prod', PROD_HOST), ('dev', DEV_HOST)):
            if host in lower:
                counts[name] += 1
                newest[name] = str(epoch)
        if ' DBG ' in message or '"level":"debug"' in message:
            counts['debug'] += 1
        if message.startswith('{'):
            counts['json'] += 1
        for name, needle in FORMATS:
            if needle.decode() in message:
                formats[name] += 1
    emit(f'{prefix}.entries', len(entries))
    emit(f'{prefix}.prod_host_lines', counts['prod'])
    emit(f'{prefix}.dev_host_lines', counts['dev'])
    emit(f'{prefix}.host_token_lines', counts['token'])
    emit(f'{prefix}.debug_lines', counts['debug'])
    emit(f'{prefix}.json_lines', counts['json'])
    for name, value in formats.items():
        emit(f'{prefix}.format.{name}', value)
    host_token_facts(prefix, host_lines)
    emit(f'{prefix}.host_token_newest_epoch', newest['token'])
    return newest


def journal_facts():
    entries = unit_messages([])
    readable = bool(entries)
    emit('journal.readable', 'yes' if readable else 'no')
    emit('journal.oldest_epoch', oldest_epoch([]))
    entries = entries or []
    emit('cloudflared.journal.oldest_epoch', str(entries[0][1]) if entries else 'unknown')
    newest = message_facts('cloudflared.journal', entries)
    emit('cloudflared.journal.prod_host_newest_epoch', newest['prod'])
    emit('cloudflared.journal.dev_host_newest_epoch', newest['dev'])
    protocol = 'unknown'
    version = 'unknown'
    for message, _ in entries:
        if 'Registered tunnel connection' in message:
            match = re.search(r'protocol[=":]+\s*"?(quic|http2)', message)
            if match:
                protocol = match.group(1)
        match = re.search(r'Version (\d{4}\.\d{1,2}\.\d{1,3})', message)
        if match:
            version = match.group(1)
    emit('cloudflared.journal.protocol', protocol)
    emit('cloudflared.journal.version', version)


def syslog_files():
    files = []
    for pattern in ('/var/log/syslog*', '/var/log/messages*', '/var/log/daemon.log*'):
        files.extend(path for path in glob.glob(host_path(pattern)) if os.path.isfile(path))
    return sorted(set(files))


def read_log(path):
    try:
        if os.path.getsize(path) > 256 * 1024 * 1024:
            return None
        if path.endswith('.gz'):
            with gzip.open(path, 'rb') as handle:
                return handle.read()
        with open(path, 'rb') as handle:
            return handle.read()
    except OSError:
        return None


def service_state(name):
    code, data = run(['systemctl', 'is-active', name], timeout=15)
    return enum(text(data), ('active', 'inactive', 'failed', 'activating', 'deactivating'), 'unknown')


def syslog_facts():
    emit('syslog.rsyslog', service_state('rsyslog'))
    emit('syslog.syslog_ng', service_state('syslog-ng'))
    files = syslog_files()
    contents = [read_log(path) for path in files]
    readable = [data for data in contents if data is not None]
    emit('syslog.files', len(files))
    emit('syslog.readable_files', len(readable))
    if files and len(readable) == len(files):
        joined = b'\n'.join(readable)
        emit('syslog.cloudflared_lines', count_lines(joined, b'cloudflared'))
        emit('syslog.prod_host_lines', count_lines(joined, PROD_HOST.encode()))
        emit('syslog.dev_host_lines', count_lines(joined, DEV_HOST.encode()))
        host_lines = [text(line) for line in joined.splitlines()
                      if PROD_HOST.encode() in line.lower() or DEV_HOST.encode() in line.lower()]
        emit('syslog.host_cloudflared_lines', sum(1 for line in host_lines if 'cloudflared[' in line))
        verify = [line for line in host_lines if 'verify_token' in line.lower() or 'hub.challenge' in line.lower()]
        emit('syslog.host_token_lines', len(verify))
        host_token_facts('syslog', host_lines)
        dates = [match.group(1) for match in (re.match(r'^(\d{4}-\d{2}-\d{2})T', line) for line in verify) if match]
        emit('syslog.host_token_newest_date', max(dates) if dates else ('unknown' if verify else 'none'))
    else:
        for name in ('cloudflared_lines', 'prod_host_lines', 'dev_host_lines', 'host_cloudflared_lines', 'host_token_lines',
                     'host_query_lines', 'host_token_hex64', 'host_token_synthetic', 'host_token_other'):
            emit(f'syslog.{name}', 0 if not files else 'unknown')
        emit('syslog.host_token_newest_date', 'none' if not files else 'unknown')
    rotate, frequency = 'unknown', 'unknown'
    try:
        with open(host_path('/etc/logrotate.d/rsyslog'), 'rb') as handle:
            config = text(handle.read())
        match = re.search(r'^\s*rotate\s+(\d+)', config, re.M)
        rotate = match.group(1) if match else 'unknown'
        match = re.search(r'^\s*(daily|weekly|monthly|yearly)\s*$', config, re.M)
        frequency = match.group(1) if match else 'unknown'
    except OSError:
        pass
    emit('logrotate.rsyslog_rotate', rotate)
    emit('logrotate.rsyslog_frequency', frequency)


def core_facts():
    try:
        with open(host_path('/proc/sys/kernel/core_pattern'), 'rb') as handle:
            pattern = text(handle.read()).strip()
    except OSError:
        pattern = None
    if pattern is None:
        kind = 'unknown'
    elif 'apport' in pattern:
        kind = 'apport'
    elif 'systemd-coredump' in pattern:
        kind = 'systemd-coredump'
    elif pattern.startswith('|'):
        kind = 'pipe-other'
    else:
        kind = 'file'
    emit('core.pattern', kind)
    enabled = 'unknown'
    try:
        with open(host_path('/etc/default/apport'), 'rb') as handle:
            match = re.search(rb'^\s*enabled\s*=\s*([01])', handle.read(), re.M)
            enabled = {b'1': 'yes', b'0': 'no'}[match.group(1)] if match else 'unknown'
    except OSError:
        enabled = 'absent'
    emit('core.apport_enabled', enabled)
    try:
        crashes = sum(1 for name in os.listdir(host_path('/var/crash')) if 'cloudflared' in name)
        emit('core.crash_files', crashes)
    except OSError:
        emit('core.crash_files', 'unknown')


def destination_facts():
    emit('audit.auditd', service_state('auditd'))
    active = [name for name in SHIPPERS if service_state(name) == 'active']
    emit('shippers.active', len(active))
    for name in active:
        emit(f'shippers.{name}', 'active')


def listening(port):
    found = False
    for table in ('/proc/net/tcp', '/proc/net/tcp6'):
        try:
            with open(host_path(table), 'rb') as handle:
                rows = handle.read().splitlines()[1:]
        except OSError:
            return 'unknown'
        for row in rows:
            fields = row.split()
            if len(fields) > 3 and fields[3] == b'0A' and int(fields[1].rsplit(b':', 1)[1], 16) == port:
                found = True
    return 'busy' if found else 'free'


def prod_token_facts():
    """Modification time of the production verify token: metadata only, never the content."""
    try:
        emit('prod.verify_token_mtime', int(os.stat(host_path('/opt/agent-pilates-prod/secrets/whatsapp-verify-token')).st_mtime))
    except FileNotFoundError:
        emit('prod.verify_token_mtime', 'absent')
    except OSError:
        emit('prod.verify_token_mtime', 'unknown')


def control_marker(control):
    if not control:
        emit('control.written', 'no')
        return
    code, _ = run(['systemd-cat', '-t', 'pilates-proxy-audit'], timeout=30, data=(control + '\n').encode())
    emit('control.written', 'yes' if code == 0 else 'no')


def phase_pre(data):
    code, version = run(['systemctl', '--version'], timeout=15)
    match = re.match(rb'systemd (\d+)', version) if code == 0 else None
    emit('systemd.version', match.group(1).decode() if match else 'unknown')
    properties = unit_properties()
    unit_facts(properties)
    filter_facts(properties)
    exec_path, argv, process = exec_argv(properties)
    binary_facts(exec_path, argv, process)
    config = config_path(argv or process)
    emit('cloudflared.config.readable', readable_state(config))
    journald_facts()
    journal_facts()
    syslog_facts()
    core_facts()
    destination_facts()
    emit('port.8300', listening(8300))
    emit('port.18190', listening(18190))
    prod_token_facts()
    control_marker(data.get('control', ''))


def phase_post(data):
    since = int(data.get('since', 0))
    emit('since.epoch', since)
    markers = data.get('markers', {})
    if not isinstance(markers, dict) or since <= 0:
        raise SystemExit(4)
    code, exported = run(['journalctl', '-q', '--no-pager', '--since', f'@{since}', '-o', 'export'], timeout=300)
    readable = code == 0 and bool(exported)
    emit('journal.readable', 'yes' if readable else 'no')
    emit('journal.since_bytes', len(exported) if readable else 0)
    control = str(data.get('control', ''))
    emit('control.journal', exported.count(control.encode()) if readable and control else 0)
    files = [path for path in syslog_files() if not path.endswith('.gz') and os.path.getmtime(path) >= since - 5]
    contents = [read_log(path) for path in files]
    syslog = None if any(item is None for item in contents) else b'\n'.join(contents)
    for marker_id, value in sorted(markers.items()):
        if not re.match(r'^[a-z0-9-]+\.[a-z]+$', marker_id) or not re.match(r'^[A-Za-z0-9]{8,64}$', str(value)):
            raise SystemExit(4)
        needle = str(value).encode()
        emit(f'marker.{marker_id}.journal', exported.count(needle) if readable else 'unknown')
        emit(f'marker.{marker_id}.syslog', 'unknown' if syslog is None else syslog.count(needle))
    message_facts('cloudflared.since', unit_messages(['--since', f'@{since}']) or [])
    emit('port.8300', listening(8300))


def config_path(argv):
    configured = flag_value(argv, 'config') if argv else None
    return configured or '/etc/cloudflared/config.yml'


def readable_state(path):
    path = host_path(path)
    if not os.path.exists(path):
        return 'absent'
    return 'yes' if os.access(path, os.R_OK) else 'no'


def config_facts(path):
    state = readable_state(path)
    emit('cloudflared.config.readable', state)
    content = ''
    if state == 'yes':
        with open(host_path(path), 'rb') as handle:
            content = text(handle.read())
    keys = {}
    for line in content.splitlines():
        match = re.match(r'^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*?)\s*(#.*)?$', line)
        if match:
            keys[match.group(1).lower()] = match.group(2)
    emit('cloudflared.config.loglevel', enum(keys.get('loglevel'), LEVELS))
    transport = keys.get('transport-loglevel', keys.get('proto-loglevel'))
    emit('cloudflared.config.transport_loglevel', enum(transport, LEVELS))
    for name, key in (('logfile', 'logfile'), ('log_directory', 'log-directory'), ('trace_output', 'trace-output'),
                      ('metrics', 'metrics')):
        emit(f'cloudflared.config.{name}', 'set' if key in keys and keys[key].strip('"\' ') else 'unset')
    metrics = keys.get('metrics', '').strip('"\' ')
    host = metrics.rsplit(':', 1)[0].strip('[]') if ':' in metrics else metrics
    if not metrics:
        scope = 'unset'
    elif host in ('localhost', '127.0.0.1', '::1'):
        scope = 'loopback'
    elif host in ('', '0.0.0.0', '::'):
        scope = 'any'
    else:
        scope = 'other'
    emit('cloudflared.config.metrics_scope', scope)
    emit('cloudflared.config.output', enum(keys.get('output'), ('default', 'json')))
    emit('cloudflared.config.protocol', enum(keys.get('protocol'), ('quic', 'http2', 'auto')))
    emit('cloudflared.config.no_autoupdate', enum(keys.get('no-autoupdate'), ('true', 'false')))
    emit('cloudflared.config.token', 'set' if 'token' in keys else 'unset')
    emit('cloudflared.config.ingress_rules', len(re.findall(r'^\s*-\s*(hostname|service)\s*:', content, re.M))
         if state == 'yes' else 0)


def ingress_facts(exec_path, path):
    probes = {
        'prod_webhook': f'https://{PROD_HOST}{PROD_PATH}',
        'prod_root': f'https://{PROD_HOST}/',
        'prod_health': f'https://{PROD_HOST}/health',
        'prod_subpath': f'https://{PROD_HOST}{PROD_PATH}/synthetic',
        'dev_webhook': f'https://{DEV_HOST}{DEV_PATH}',
        'dev_root': f'https://{DEV_HOST}/',
    }
    for name, url in probes.items():
        outcome = 'unknown'
        if exec_path and readable_state(path) == 'yes':
            code, data = run([host_path(exec_path), 'tunnel', '--config', host_path(path), 'ingress', 'rule', url], timeout=30)
            match = re.search(r'service:\s*(\S+)', text(data)) if code == 0 else None
            if match:
                outcome = ORIGINS.get(match.group(1).rstrip('/'), 'other')
        emit(f'ingress.{name}', outcome)


def process_environment(properties):
    pid = first(properties, 'MainPID')
    names = set()
    known = False
    if pid.isdigit() and pid != '0':
        try:
            with open(host_path(f'/proc/{pid}/environ'), 'rb') as handle:
                names = {text(item.split(b'=', 1)[0]) for item in handle.read().split(b'\0') if b'=' in item}
                known = True
        except OSError:
            known = False
    for name in TUNNEL_ENV:
        emit(f'cloudflared.proc_env.{name.lower()}', ('set' if name in names else 'unset') if known else 'unknown')
    files = set()
    for value in properties.get('EnvironmentFiles', []):
        match = re.match(r'^-?(/\S+)', value.strip())
        if not match:
            continue
        try:
            with open(host_path(match.group(1)), 'rb') as handle:
                for line in text(handle.read()).splitlines():
                    key = line.strip().removeprefix('export ').split('=', 1)[0].strip()
                    files.add(key)
        except OSError:
            continue
    for name in TUNNEL_ENV:
        emit(f'cloudflared.env_file.{name.lower()}', 'set' if name in files else 'unset')


def phase_privileged():
    properties = unit_properties()
    exec_path, argv, process = exec_argv(properties)
    path = config_path(argv or process)
    config_facts(path)
    ingress_facts(exec_path, path)
    process_environment(properties)
    try:
        emit('core.crash_files', sum(1 for name in os.listdir(host_path('/var/crash')) if 'cloudflared' in name))
    except OSError:
        emit('core.crash_files', 'unknown')


def write_private(path):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'w', encoding='ascii') as handle:
        handle.write('\n'.join(OUT) + '\n')
    uid, gid = os.environ.get('SUDO_UID'), os.environ.get('SUDO_GID')
    if uid and gid and uid.isdigit() and gid.isdigit():
        os.chown(path, int(uid), int(gid))


def main():
    data = globals().get('INPUT') or {}
    phase = data.get('phase') or (sys.argv[1] if len(sys.argv) > 1 else '')
    emit('schema', SCHEMA)
    emit('phase', phase if phase in ('pre', 'post', 'privileged') else 'invalid')
    emit('user', 'root' if os.geteuid() == 0 else 'unprivileged')
    emit('time.epoch', int(time.time()))
    if phase == 'pre':
        phase_pre(data)
    elif phase == 'post':
        phase_post(data)
    elif phase == 'privileged':
        if len(sys.argv) != 3 or not sys.argv[2].startswith('/tmp/pilates-proxy-audit.'):
            raise SystemExit(4)
        phase_privileged()
        write_private(sys.argv[2])
        print('privileged=ok')
        return
    else:
        raise SystemExit(4)
    print('\n'.join(OUT))


if __name__ == '__main__':
    try:
        main()
    except SystemExit:
        raise
    except Exception:  # noqa: BLE001 - never print tracebacks: they may contain local values.
        print('collector=failed', file=sys.stderr)
        raise SystemExit(5) from None
