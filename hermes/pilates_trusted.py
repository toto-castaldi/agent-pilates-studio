"""Admit authenticated WhatsApp senders and bridge per-turn metadata into the SQL tool.

This module is installed only in the gateway image. Every webhook body is decided
by the broker before the Hermes adapter: only identities that are complete and
enabled in the database reach Hermes, with their registered name. The model
cannot supply identity values as tool arguments.
"""

import asyncio
import contextvars
import dataclasses
import hashlib
import hmac
import json
import math
import os
import re
import secrets
import threading
import time
from collections import OrderedDict
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from aiohttp import ClientSession, ClientTimeout
from aiohttp.web_app import Application

current_turn = contextvars.ContextVar('pilates_trusted_turn', default=None)
current_message = contextvars.ContextVar('pilates_trusted_message', default=None)
BROKER_URL = 'http://author-broker:8091'
TOKEN_PATH = '/run/pilates-agent/bridge_token'
ADMISSION_LIFETIME = 900
MAX_ADMISSIONS = 4096
# Same fixed text as the broker: no manager data, no self-enrollment invitation.
ACCESS_REFUSAL = 'Accesso non abilitato. Per usare l’assistente dello studio rivolgiti al gestore.'
# message ID -> (sender digits, teacher ID, monotonic expiry), filled only from broker decisions.
admissions = OrderedDict()
# Digits of every identity and author number known to the database (broker-provided).
known_numbers = frozenset()
sender_locks = {}
# Turns run in worker threads; the event loop records admissions.
admissions_lock = threading.Lock()


def admit(entries):
    now = time.monotonic()
    with admissions_lock:
        for item in entries:
            admissions[item['message_id']] = (item['sender'], item['teacher'], now + ADMISSION_LIFETIME)
            admissions.move_to_end(item['message_id'])
        while len(admissions) > MAX_ADMISSIONS:
            admissions.popitem(last=False)


def admitted(message_id, sender):
    now = time.monotonic()
    with admissions_lock:
        for key, value in list(admissions.items()):
            if value[2] <= now:
                del admissions[key]
        record = admissions.get(message_id) if message_id else None
    return record if record is not None and record[0] == sender else None


def admitted_senders():
    now = time.monotonic()
    with admissions_lock:
        return {sender for sender, _, expires in admissions.values() if expires > now}


def redaction_numbers():
    numbers = set(known_numbers) | admitted_senders()
    manager = os.environ.get('PILATES_MANAGER_PHONE', '')
    if manager.startswith('+'):
        numbers.add(manager[1:])
    return numbers


def bridge_token():
    return Path(TOKEN_PATH).read_text().strip()


def idle_seconds():
    # The entrypoint validates and exports this; a missing value fails the turn
    # rather than silently disabling resume compaction.
    value = os.environ['PILATES_IDLE_COMPACT_SECONDS']
    if not re.fullmatch(r'[1-9][0-9]*', value):
        raise ValueError('invalid inactivity interval')
    return int(value)


# Any international number written with an explicit prefix, with common separators.
INTERNATIONAL = re.compile(r'(?:\+|\b00)[ .()\-\u00a0\u202f]*[1-9](?:[ .()\-\u00a0\u202f]*[0-9]){7,14}')


def redact_phones(value, allowed):
    # Redact only a wire copy, not the authenticated identity or persisted
    # history: every identity/author number known to the database, also with
    # common separators, and any explicitly international number.
    patterns = [re.compile(r'[ .()+\-\u00a0\u202f]*'.join(re.escape(digit) for digit in phone))
                for phone in sorted(allowed, key=len, reverse=True) if re.fullmatch(r'[0-9]{8,15}', phone)]
    patterns.append(INTERNATIONAL)

    def redact(item):
        if isinstance(item, str):
            for pattern in patterns:
                item = pattern.sub('[numero riservato]', item)
            return item
        if isinstance(item, list):
            return [redact(entry) for entry in item]
        if isinstance(item, dict):
            return {redact(key): redact(entry) for key, entry in item.items()}
        return item

    return redact(value)


def transcript_epoch(value):
    # Persisted rows normally carry time.time(); tolerate numeric strings and ISO
    # values, and treat anything else as unknown (no resume compaction).
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value) if math.isfinite(value) else None
    if isinstance(value, str):
        try:
            number = float(value)
            return number if math.isfinite(number) else None
        except ValueError:
            pass
        try:
            return datetime.fromisoformat(value).timestamp()
        except ValueError:
            return None
    return None


async def broker_turn(message_id, sender, bind):
    """Ask the broker whether the admitted identity is still current; None means refuse."""
    try:
        async with ClientSession(timeout=ClientTimeout(total=8), trust_env=False) as session:
            async with session.post(BROKER_URL + '/v1/turn', json={'message_id': message_id, 'sender': sender, 'bind': bind},
                                    headers={'X-Pilates-Bridge': bridge_token()}) as response:
                if response.status != 200:
                    return None
                verdict = await response.json()
                return verdict if isinstance(verdict, dict) and isinstance(verdict.get('reset'), bool) else None
    except Exception:
        return None


async def session_allowed(message_id, sender, session_id):
    try:
        async with ClientSession(timeout=ClientTimeout(total=8), trust_env=False) as session:
            async with session.post(BROKER_URL + '/v1/session',
                                    json={'message_id': message_id, 'sender': sender, 'session_id': session_id, 'bind': False},
                                    headers={'X-Pilates-Bridge': bridge_token()}) as response:
                await response.read()
                return response.status == 204
    except Exception:
        return False


def bind_session(message_id, sender, session_id):
    # TurnRunner runs off the event loop. Recheck the receipt here as well: a
    # queued turn or a restored session must not start with a stale identity.
    try:
        import httpx
        with httpx.Client(timeout=8, trust_env=False) as client:
            response = client.post(BROKER_URL + '/v1/session',
                                   json={'message_id': message_id, 'sender': sender, 'session_id': session_id, 'bind': True},
                                   headers={'X-Pilates-Bridge': bridge_token()})
        return response.status_code == 204
    except Exception:
        return False


# Fixed event for a refused or undelivered WhatsApp send. Only the source, the
# HTTP status and Meta's numeric error code are written: never the recipient,
# the text, Meta's message or trace ID, names or credentials.
SEND_FAILURE_EVENT = 'whatsapp_send_failed'
SEND_SOURCES = ('fixed', 'agent')
# Write-only descriptor towards the Docker log, opened by the launcher; None
# disables the events (for example in a separate diagnostic run).
events_fd = None
# Collects the Graph response of an adapter send while its call is running.
adapter_send = contextvars.ContextVar('pilates_adapter_send', default=None)


def _plain_int(value):
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def send_failure_line(source, status=None, body=None):
    """Classify a failed send; status None means no HTTP response (network error)."""
    if source not in SEND_SOURCES:
        raise ValueError('unknown send source')
    status = _plain_int(status)
    status_field = str(status) if status is not None and 100 <= status <= 599 else ('network' if status is None else 'invalid')
    error = body.get('error') if isinstance(body, dict) else None
    code = _plain_int(error.get('code')) if isinstance(error, dict) else None
    # Meta codes and subcodes have at most seven digits: no field can carry a
    # phone number (eight or more digits).
    code_field = str(code) if code is not None and 0 <= code < 10 ** 7 else 'none'
    return f'{SEND_FAILURE_EVENT} source={source} status={status_field} code={code_field}'


def usage_send_failure(status, body):
    status = _plain_int(status)
    if status is None or not 100 <= status <= 599:
        return 'network', None, None
    error = body.get('error') if isinstance(body, dict) else None
    code = _plain_int(error.get('code')) if isinstance(error, dict) else None
    return 'refused', status, code if code is not None and 0 <= code < 10 ** 7 else None


def response_body(response):
    try:
        return response.json()
    except Exception:
        return None


def emit_send_failure(source, status=None, body=None):
    # Best effort: delivery and broker decisions never depend on the log.
    if events_fd is None:
        return
    try:
        os.write(events_fd, (send_failure_line(source, status, body) + '\n').encode())
    except (OSError, ValueError):
        pass


def observe_adapter_sends(cls):
    """Log refused or failed Graph sends of the native WhatsApp Cloud adapter."""
    if cls.__dict__.get('_pilates_send_observed') or '_post_messages' not in cls.__dict__:
        return
    original_post = cls.__dict__['_post_messages']
    original_error = cls.__dict__.get('_response_error')
    error_function = original_error.__func__ if isinstance(original_error, staticmethod) else original_error
    if error_function is None:
        return

    def response_error(resp):
        # Called by _post_messages only for a non-200 Graph response.
        outcome = adapter_send.get()
        if outcome is not None and not outcome:
            outcome.append((getattr(resp, 'status_code', None), response_body(resp)))
        return error_function(resp)

    async def post_messages(self, payload, *args, **kwargs):
        outcome = []
        token = adapter_send.set(outcome)
        try:
            result = await original_post(self, payload, *args, **kwargs)
        finally:
            adapter_send.reset(token)
        failed = isinstance(result, tuple) and len(result) == 2 and result[1] is not None
        if failed:
            # No recorded response: the request itself failed.
            emit_send_failure('agent', *(outcome[0] if outcome else (None, None)))
        record = usage_current.get()
        if record is not None:
            if not failed:
                record.note_send('sent')
            elif outcome:
                record.note_send(*usage_send_failure(*outcome[0]))
            else:
                record.note_send('network')
        return result

    cls._response_error = staticmethod(response_error)
    cls._post_messages = post_messages
    cls._pilates_send_observed = True


def observe_platform_adapters(base):
    """Patch the WhatsApp Cloud adapter class whenever its plugin module is (re)loaded."""
    import sys
    original = base.__dict__.get('__init_subclass__')

    def init_subclass(cls, **kwargs):
        if isinstance(original, classmethod):
            original.__func__(cls, **kwargs)
        else:
            super(base, cls).__init_subclass__(**kwargs)
        if cls.__name__ == 'WhatsAppCloudAdapter':
            observe_adapter_sends(cls)
            observe_usage(cls)

    base.__init_subclass__ = classmethod(init_subclass)
    for module in list(sys.modules.values()):
        cls = getattr(module, 'WhatsAppCloudAdapter', None)
        if isinstance(cls, type) and issubclass(cls, base):
            observe_adapter_sends(cls)
            observe_usage(cls)


# Usage metrics (REQ-OPS-011, design/usage-metrics). The trusted gateway
# measures every authenticated message it handles and hands the measurement to
# the broker after the reply was sent; the broker adds the teacher and the
# kind of its own replies and writes the event. Only numbers, enumerations and
# the provider's model identifier are collected: never numbers, texts, names,
# summaries or message IDs. Collection never changes requests, history or
# replies, and a failure only writes the fixed event below.
USAGE_EVENT_FAILED = 'usage_event_failed'
USAGE_LIFETIME = 840  # below the broker's receipt lifetime (900 s)
MAX_USAGE_RECORDS = 4096
REASONING_EFFORTS = ('none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra')
usage_current = contextvars.ContextVar('pilates_usage_record', default=None)
# message ID -> UsageRecord, created only for messages admitted by the broker.
usage_ledger = OrderedDict()
usage_lock = threading.Lock()
usage_tasks = set()


def emit_usage_failure():
    if events_fd is None:
        return
    try:
        os.write(events_fd, (USAGE_EVENT_FAILED + '\n').encode())
    except (OSError, ValueError):
        pass


def _field(obj, name):
    if obj is None:
        return None
    if isinstance(obj, dict):
        return obj.get(name)
    value = getattr(obj, name, None)
    if value is None:
        extra = getattr(obj, 'model_extra', None)
        if isinstance(extra, dict):
            value = extra.get(name)
    return value


def _count(value):
    value = _plain_int(value)
    return value if value is not None and value >= 0 else None


def _cost(value):
    # OpenRouter usage.cost, as reported; never Hermes' price estimates.
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value) if math.isfinite(value) and value >= 0 else None


def _model(value):
    return value if isinstance(value, str) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._:/@+~-]{0,199}', value) else None


def wire_reasoning(kwargs):
    """The reasoning level actually sent in a request body, None if Hermes sends none."""
    if not isinstance(kwargs, dict):
        return None
    extra = kwargs.get('extra_body')
    value = extra.get('reasoning') if isinstance(extra, dict) else None
    if value is None:
        value = kwargs.get('reasoning')
    if value is None:
        value = kwargs.get('reasoning_effort')
    if isinstance(value, dict):
        if value.get('enabled') is False:
            return 'none'
        value = value.get('effort')
    return value if isinstance(value, str) and value in REASONING_EFFORTS else None


def usage_request(purpose, duration, response, tool_calls=None, reasoning=None):
    usage = _field(response, 'usage')
    return {
        'purpose': purpose,
        'duration_ms': max(0, round(duration * 1000)) if isinstance(duration, (int, float)) and math.isfinite(duration) else 0,
        'prompt_tokens': _count(_field(usage, 'prompt_tokens')),
        'completion_tokens': _count(_field(usage, 'completion_tokens')),
        'cost': _cost(_field(usage, 'cost')),
        'model': _model(_field(response, 'model')),
        'tool_calls': tool_calls,
        'reasoning': reasoning,
    }


class UsageRecord:
    """Measurements of one admitted message, shared by its task and turn threads."""

    def __init__(self, message_id, sender, received_wall, received_mono):
        self.message_id = message_id
        self.sender = sender
        self.received_at = int(received_wall * 1000)
        self.received_mono = received_mono
        self.created = time.monotonic()
        # new -> ingesting -> claimed | merged -> done
        self.state = 'new'
        self.lock = threading.Lock()
        self.agent_turn = False
        self.rejected_command = False
        self.refused = False
        self.requests = []
        self.compactions = 0
        self.window = None
        self.threshold = None
        self.reasoning = {}
        self.send = None
        self.replied_mono = None
        self.absorbed = []
        self.threads = []
        self.inflight = 0
        # Model turns currently running under this message; the event waits for them.
        self.turns = 0
        self.submitted = False

    def transition(self, allowed, state):
        with self.lock:
            if self.state not in allowed:
                return False
            self.state = state
            return True

    def add_request(self, item):
        with self.lock:
            self.requests.append(item)

    def note_send(self, outcome, status=None, code=None):
        # Last attempt wins: the adapter retries transient failures and stops
        # the remaining parts of a reply after a refusal.
        with self.lock:
            self.send = (outcome, status, code)
            self.replied_mono = time.monotonic()

    def measurement(self):
        with self.lock:
            agent = self.agent_turn and not self.rejected_command and not self.refused
            outcome, status, code = self.send or ('none', None, None)
            return {
                'broker_kind': None, 'agent_turn': self.agent_turn, 'rejected_command': self.rejected_command,
                'refused': self.refused, 'received_at': self.received_at,
                'elapsed_ms': None if self.send is None else max(0, round((self.replied_mono - self.received_mono) * 1000)),
                'requests': list(self.requests) if agent else [],
                'compactions': self.compactions if agent else 0,
                'context_window': self.window if agent else None,
                'compaction_threshold': self.threshold if agent else None,
                'send': {'outcome': outcome, 'http_status': status, 'error_code': code},
            }


def usage_admit(entries, received_wall, received_mono):
    with usage_lock:
        for item in entries:
            if item['message_id'] not in usage_ledger:
                usage_ledger[item['message_id']] = UsageRecord(item['message_id'], item['sender'], received_wall, received_mono)
        stale = [record for record in usage_ledger.values()
                 if time.monotonic() - record.created >= USAGE_LIFETIME]
        for record in stale:
            del usage_ledger[record.message_id]
        while len(usage_ledger) > MAX_USAGE_RECORDS:
            stale.append(usage_ledger.popitem(last=False)[1])
    # A message that never reached its own turn (dropped while busy): record
    # what is known rather than losing the event.
    for record in stale:
        if record.transition(('new', 'ingesting'), 'done'):
            schedule_usage(record)


def usage_record(message_id, sender):
    with usage_lock:
        record = usage_ledger.get(str(message_id or ''))
    return record if record is not None and record.sender == str(sender or '') else None


def mark_usage(name):
    record = usage_current.get()
    if record is not None:
        with record.lock:
            setattr(record, name, True)


def usage_compaction():
    # post_compaction fires only for committed compactions, in the turn thread.
    record = usage_current.get()
    if record is not None:
        with record.lock:
            record.compactions += 1


async def submit_usage(body):
    try:
        async with ClientSession(timeout=ClientTimeout(total=10), trust_env=False) as session:
            async with session.post(BROKER_URL + '/v1/usage', json=body, headers={'X-Pilates-Bridge': bridge_token()}) as response:
                await response.read()
                if response.status != 204:
                    emit_usage_failure()
    except Exception:
        emit_usage_failure()


def _spawn(coroutine):
    task = asyncio.get_running_loop().create_task(coroutine)
    usage_tasks.add(task)
    task.add_done_callback(usage_tasks.discard)


def _settle(record, timeout=60):
    # Title generation may finish after the reply: it enters tokens and cost.
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        with record.lock:
            busy = (record.inflight > 0 or record.turns > 0
                    or any(thread.ident is None or thread.is_alive() for thread in record.threads))
        if not busy:
            return
        time.sleep(0.2)


async def _finish_usage(record):
    try:
        await asyncio.to_thread(_settle, record)
        with record.lock:
            record.submitted = True
            absorbed = list(record.absorbed)
        await submit_usage({'message_id': record.message_id, 'sender': record.sender, 'measurement': record.measurement()})
        # Messages merged into this turn: own receipt and reception, same reply;
        # model data stay on the message whose turn ran (counted once).
        for other in absorbed:
            with record.lock:
                flags = (record.agent_turn, record.rejected_command, record.refused)
                send = (record.send, record.replied_mono)
            with other.lock:
                other.agent_turn, other.rejected_command, other.refused = flags
                other.send, other.replied_mono = send
                other.submitted = True
            await submit_usage({'message_id': other.message_id, 'sender': other.sender, 'measurement': other.measurement()})
    except Exception:
        emit_usage_failure()


def schedule_usage(record):
    try:
        _spawn(_finish_usage(record))
    except Exception:
        emit_usage_failure()


def usage_queued(adapter, message_id):
    pending = getattr(adapter, '_pending_messages', None) or {}
    events = list(pending.values())
    try:
        events += [getattr(state, 'event', None) for state in adapter._text_debounce_store().values()]
    except Exception:
        pass
    return any(str(getattr(event, 'message_id', '') or '') == message_id for event in events)


# Sender -> session key of the adapter, learned from the processed messages.
usage_sessions = {}


async def _finish_inbound(adapter, record):
    # A message answered on the inbound path while its sender's session is busy
    # may still be merged into, or steer, the running turn: close its event only
    # once that session is idle and the message is not queued, unless a task
    # claimed it meanwhile.
    deadline = record.created + USAGE_LIFETIME
    while time.monotonic() < deadline:
        if record.state != 'ingesting':
            return
        key = usage_sessions.get(record.sender)
        active = key is not None and key in (getattr(adapter, '_active_sessions', None) or {})
        if not active and not usage_queued(adapter, record.message_id):
            break
        await asyncio.sleep(0.5)
    if record.transition(('ingesting',), 'done'):
        await _finish_usage(record)


def observe_usage(cls):
    """Per-message usage context for the native WhatsApp Cloud adapter."""
    if cls.__dict__.get('_pilates_usage_observed') or '_ingest_message' not in cls.__dict__:
        return
    original_ingest = cls.__dict__['_ingest_message']

    async def ingest_message(self, raw_message, *args, **kwargs):
        record = None
        if isinstance(raw_message, dict):
            record = usage_record(raw_message.get('id'), raw_message.get('from'))
        opened = record is not None and record.transition(('new',), 'ingesting')
        token = usage_current.set(record if opened else None)
        try:
            return await original_ingest(self, raw_message, *args, **kwargs)
        finally:
            usage_current.reset(token)
            # Answered or dropped on the inbound path (busy commands, refusals).
            if opened and record.state == 'ingesting':
                try:
                    _spawn(_finish_inbound(self, record))
                except Exception:
                    emit_usage_failure()

    cls._ingest_message = ingest_message
    cls._pilates_usage_observed = True


def observe_usage_processing(base):
    original = base._process_message_background

    def process(self, event, session_key):
        # Synchronous claim when the task is created, before the inbound path ends.
        record = None
        if type(self).__name__ == 'WhatsAppCloudAdapter':
            record = usage_record(getattr(event, 'message_id', None), getattr(getattr(event, 'source', None), 'user_id', None))
            if record is not None and not record.transition(('new', 'ingesting'), 'claimed'):
                record = None

        if record is not None:
            usage_sessions[record.sender] = session_key

        async def run():
            # Always reset: a drain task inherits the previous message's context.
            token = usage_current.set(record)
            try:
                return await original(self, event, session_key)
            finally:
                usage_current.reset(token)
                if record is not None and record.transition(('claimed',), 'done'):
                    schedule_usage(record)

        return run()

    base._process_message_background = process


def observe_usage_merges(base_module):
    original = base_module.merge_pending_message_event

    def merge(pending_messages, session_key, event, **kwargs):
        existing = pending_messages.get(session_key)
        result = original(pending_messages, session_key, event, **kwargs)
        try:
            survivor = pending_messages.get(session_key)
            loser = event if survivor is existing else existing if survivor is event else None
            if loser is not None and survivor is not None and loser is not survivor:
                kept = usage_record(survivor.message_id, survivor.source.user_id)
                lost = usage_record(loser.message_id, loser.source.user_id)
                if kept is not None and lost is not None and lost is not kept and lost.transition(('new', 'ingesting'), 'merged'):
                    with kept.lock:
                        kept.absorbed.append(lost)
                        kept.absorbed.extend(lost.absorbed)
                    lost.absorbed = []
        except Exception:
            pass
        return result

    base_module.merge_pending_message_event = merge


def install(events=None):
    global events_fd
    events_fd = events
    from pilates_skills import install as install_skills
    install_skills()
    from gateway.platforms.base import BasePlatformAdapter
    import gateway.platforms.base as platform_base
    observe_usage_processing(BasePlatformAdapter)
    observe_usage_merges(platform_base)
    observe_platform_adapters(BasePlatformAdapter)
    from gateway.config import Platform
    from gateway.run_turn_runner import TurnRunner
    from gateway.session_api_turn import api_execution
    import agent.side_question as side_question
    import agent.tool_executor as executor
    import agent.turn_context as turn_context
    import agent.turn_context_compaction as turn_compaction
    import agent.turn_request_assembly as assembly
    from agent.conversation_compression import conversation_history_after_compression
    from agent.context_compressor import ContextCompressor
    import cron.scheduler_provider as scheduler_provider
    import gateway.run as gateway_run
    import gateway.session as gateway_session
    from gateway.authz_mixin import GatewayAuthorizationMixin
    from gateway.platforms.whatsapp_common import WhatsAppBehaviorMixin
    from gateway.run_inbound import GatewayInboundMixin
    from gateway.slash_commands import GatewaySlashCommandsMixin

    # Hermes marks WhatsApp Cloud as a plugin but does not mark it PII-safe.
    # It has no raw-ID mention requirement, so enable its native ID hashing.
    gateway_session._PII_SAFE_PLATFORMS = gateway_session._PII_SAFE_PLATFORMS | {Platform.WHATSAPP_CLOUD}

    # Until scheduled delivery has its own authorization design, never start a
    # scheduler or dispatch missed jobs, even if a persistent store contains jobs.
    class DisabledScheduler(scheduler_provider.CronScheduler):
        name = 'disabled'

        def start(self, stop_event, **kwargs):
            stop_event.wait()

        def fire_due(self, job_id, **kwargs):
            return False

    scheduler_provider.resolve_cron_scheduler = lambda: DisabledScheduler()
    scheduler_provider.scheduler_for_profile_mode = lambda provider, **kwargs: DisabledScheduler()
    gateway_run._housekeeping_misfire_catch_up = lambda *args, **kwargs: None

    # The configured home is operator-owned, never writable through WhatsApp.
    async def reject_set_home(self, event):
        mark_usage('rejected_command')
        return 'Il canale principale è gestito dall’operatore.'

    GatewaySlashCommandsMixin._handle_set_home_command = reject_set_home

    # Model, reasoning effort, fast mode and runtime are operator-owned
    # (PILATES_MODEL, PILATES_REASONING_EFFORT). Every alias and spelling
    # resolves to these handlers on the idle path; mid-run, Hermes already
    # rejects them without changing anything. No session or global override
    # is written and the text never reaches the model.
    from gateway.slash_commands_model import GatewayModelCommandsMixin

    async def reject_model_settings(self, event):
        mark_usage('rejected_command')
        return 'Modello e livello di ragionamento sono gestiti dall’operatore.'

    for name in ('_handle_model_command', '_handle_reasoning_command', '_handle_fast_command', '_handle_codex_runtime_command'):
        if not callable(getattr(GatewayModelCommandsMixin, name, None)):
            raise RuntimeError('Unsupported Hermes model command boundary')
        setattr(GatewayModelCommandsMixin, name, reject_model_settings)

    # The cached session prompt can span midnight. Add the clock to the wire
    # copy for every model request, never to SQLite or the conversation history.
    original_build_messages = assembly.build_api_messages

    def build_messages(agent, messages, **kwargs):
        api_messages, system = original_build_messages(agent, messages, **kwargs)
        now = datetime.now(ZoneInfo('Europe/Rome')).isoformat(timespec='seconds')
        system = (system + '\n\nData e ora correnti (Europe/Rome): ' + now).strip()
        # Native prompt redaction does not cover tool output, names or user
        # text. Remove identity and author numbers from the wire copy too.
        allowed = redaction_numbers()
        api_messages = redact_phones(api_messages, allowed)
        system = redact_phones(system, allowed)
        if api_messages and api_messages[0].get('role') == 'system':
            api_messages[0] = {**api_messages[0], 'content': system}
        else:
            api_messages.insert(0, {'role': 'system', 'content': system})
        return api_messages, system

    assembly.build_api_messages = build_messages

    # Usage metrics of the model requests. Observers only: arguments, results
    # and exceptions pass through unchanged.
    import agent.auxiliary_hooks as auxiliary_hooks
    import agent.chat_completion_helpers as completion_helpers
    import agent.turn_response_intake as response_intake

    original_build_kwargs = completion_helpers.build_api_kwargs

    def build_api_kwargs(*args, **kwargs):
        result = original_build_kwargs(*args, **kwargs)
        record = usage_current.get()
        if record is not None:
            try:
                with record.lock:
                    record.reasoning[threading.get_ident()] = wire_reasoning(result)
            except Exception:
                pass
        return result

    completion_helpers.build_api_kwargs = build_api_kwargs
    original_fire = response_intake._fire_post_api_request_hook

    def fire_post_api_request(agent, response, assistant_message, finish_reason, **kwargs):
        record = usage_current.get()
        if record is not None:
            try:
                with record.lock:
                    reasoning = record.reasoning.pop(threading.get_ident(), None)
                compressor = getattr(agent, 'context_compressor', None)
                window = _count(getattr(compressor, 'context_length', None))
                threshold = _count(getattr(compressor, 'threshold_tokens', None))
                record.add_request(usage_request('main', kwargs.get('api_duration'), response,
                                                 len(getattr(assistant_message, 'tool_calls', None) or []), reasoning))
                with record.lock:
                    record.window = window or None
                    record.threshold = threshold or None
            except Exception:
                pass
        return original_fire(agent, response, assistant_message, finish_reason, **kwargs)

    response_intake._fire_post_api_request_hook = fire_post_api_request

    def aux_purpose(task):
        task = str(task or '')
        return 'compression' if task == 'compression' else 'title' if task.startswith('title') else 'other'

    original_aux = auxiliary_hooks.run_with_aux_hooks
    original_aux_async = auxiliary_hooks.arun_with_aux_hooks

    def run_with_aux_hooks(call, *args, **kwargs):
        record = usage_current.get()
        if record is None:
            return original_aux(call, *args, **kwargs)
        with record.lock:
            record.inflight += 1
        started = time.monotonic()
        response = None
        try:
            response = original_aux(call, *args, **kwargs)
            return response
        finally:
            try:
                streamed = kwargs.get('streaming', False)
                record.add_request(usage_request(aux_purpose(kwargs.get('aux_task')), time.monotonic() - started,
                                                 None if streamed else response))
            except Exception:
                pass
            with record.lock:
                record.inflight -= 1

    async def arun_with_aux_hooks(call, *args, **kwargs):
        record = usage_current.get()
        if record is None:
            return await original_aux_async(call, *args, **kwargs)
        with record.lock:
            record.inflight += 1
        started = time.monotonic()
        response = None
        try:
            response = await original_aux_async(call, *args, **kwargs)
            return response
        finally:
            try:
                record.add_request(usage_request(aux_purpose(kwargs.get('aux_task')), time.monotonic() - started, response))
            except Exception:
                pass
            with record.lock:
                record.inflight -= 1

    auxiliary_hooks.run_with_aux_hooks = run_with_aux_hooks
    auxiliary_hooks.arun_with_aux_hooks = arun_with_aux_hooks

    # Hermes sends compaction prompts through a separate auxiliary-model path,
    # before build_api_messages. Redact that wire copy too; the original
    # transcript stays intact for the gateway and the authenticated broker.
    original_summary_call = ContextCompressor._call_summary_llm

    def summary_call(compressor, prompt, prompt_started_at):
        allowed = redaction_numbers()
        return original_summary_call(compressor, redact_phones(prompt, allowed), prompt_started_at)

    ContextCompressor._call_summary_llm = summary_call

    # Title generation and /btw have their own auxiliary requests, which can
    # read the unsanitized transcript before the ordinary message assembly.
    # Keep their input copies private without changing the stored transcript.
    original_title = turn_context._maybe_title_session_at_turn_start

    def title(agent, messages, title_user_message=None):
        allowed = redaction_numbers()
        thread = original_title(agent, redact_phones(messages, allowed), redact_phones(title_user_message, allowed))
        record = usage_current.get()
        if record is not None and isinstance(thread, threading.Thread):
            with record.lock:
                record.threads.append(thread)
        return thread

    turn_context._maybe_title_session_at_turn_start = title
    original_side_question = side_question.answer_side_question

    def answer_side_question(question, history=None, *args, **kwargs):
        allowed = redaction_numbers()
        return original_side_question(redact_phones(question, allowed), redact_phones(history, allowed), *args, **kwargs)

    side_question.answer_side_question = answer_side_question

    # Enforce the allowlist at both execution paths, including model-emitted
    # tool names that were not advertised in the tool schema.
    original_resolve = executor._resolve_sequential_dispatch

    def resolve(agent, ref, messages):
        if ref.name not in ('studio_sql_query', 'skill_view'):
            return executor._SequentialDispatch(lambda args: '{"error":"Tool not permitted."}')
        return original_resolve(agent, ref, messages)

    executor._resolve_sequential_dispatch = resolve
    original_worker = executor._ConcurrentBatch._dispatch_worker

    def worker(batch, index, ref, scope_block, start_gate):
        if ref.name not in ('studio_sql_query', 'skill_view'):
            start_gate.advance()
            return executor._ToolOutcome(ref, '{"error":"Tool not permitted."}', 0.0, True, False)
        return original_worker(batch, index, ref, scope_block, start_gate)

    executor._ConcurrentBatch._dispatch_worker = worker

    # Resume compaction. Hermes' own idle timer restarts with each cached agent
    # turn and is lost on restart, and it skips small transcripts below a large
    # floor. The project measures inactivity from the last persisted transcript
    # row (see run() below) and, once per resumed turn, asks the built-in
    # compressor to compact before the new message is sent. The compressor still
    # protects the first and most recent turns, and is a no-op when nothing else
    # is eligible. No status is emitted: users receive only replies.
    original_idle = turn_compaction._idle_compaction

    def idle_compaction(agent, out, system_message, user_message, effective_task_id):
        if not getattr(agent, '_pilates_idle_resume', False):
            return original_idle(agent, out, system_message, user_message, effective_task_id)
        agent._pilates_idle_resume = False
        if not (agent.compression_enabled and out.messages):
            return None
        compressor = agent.context_compressor
        if bool(getattr(compressor, 'awaiting_real_usage_after_compression', False)):
            return None
        if getattr(compressor, 'get_active_compression_failure_cooldown', lambda: None)():
            return None
        messages = out.messages
        tokens = turn_context._preflight_request_tokens(agent, messages, out.active_system_prompt or '')
        out.messages, out.active_system_prompt = agent._compress_context(
            messages, system_message, approx_tokens=tokens, task_id=effective_task_id, trigger='idle')
        if out.messages is not messages:
            out.conversation_history = conversation_history_after_compression(
                agent, out.messages, out.conversation_history)
            out.current_turn_user_idx = turn_compaction._reanchor(agent, out.messages, user_message)
        return None

    turn_compaction._idle_compaction = idle_compaction

    original_handle = Application._handle

    async def handle(app, request):
        global known_numbers
        if request.method == 'POST' and request.path == os.environ.get('WHATSAPP_CLOUD_WEBHOOK_PATH', '/whatsapp/webhook'):
            # This path precedes the adapter, its slash commands, SQLite, titles
            # and model turns. Never fall through on broker failure.
            from aiohttp import web
            from multidict import CIMultiDict
            received_wall, received_mono = time.time(), time.monotonic()
            try:
                raw = await request.read()
                headers = {'X-Pilates-Bridge': bridge_token(),
                           'X-Hub-Signature-256': request.headers.get('X-Hub-Signature-256', '')}
                async with ClientSession(timeout=ClientTimeout(total=20), trust_env=False) as session:
                    async with session.post(BROKER_URL + '/v1/admission', data=raw, headers=headers) as response:
                        if response.status != 200:
                            return web.Response(status=response.status)
                        decision = await response.json()
                admit(decision['admitted'])
                usage_admit(decision['admitted'], received_wall, received_mono)
                if decision['admitted']:
                    # Immutable snapshot: worker threads can never observe a
                    # cleared/partially updated set during request assembly.
                    known_numbers = frozenset(number for number in decision['redact'] if isinstance(number, str))
                import httpx
                async with httpx.AsyncClient(timeout=10, trust_env=False) as client:
                    for reply in decision['replies']:
                        # Long administrative lists are sent as bounded chunks.
                        # Delivery is best effort: the broker decision is already
                        # committed, and a retried webhook is not answered twice.
                        # A refusal stops the remaining chunks and is logged as a
                        # fixed event without recipient or text.
                        outcome = ('sent', None, None)
                        try:
                            for start in range(0, len(reply['text']), 3500):
                                sent = await client.post('https://graph.facebook.com/v21.0/' + os.environ['WHATSAPP_CLOUD_PHONE_NUMBER_ID'] + '/messages',
                                    headers={'Authorization': 'Bearer ' + os.environ['WHATSAPP_CLOUD_ACCESS_TOKEN']},
                                    json={'messaging_product': 'whatsapp', 'to': reply['to'], 'type': 'text',
                                          'text': {'body': reply['text'][start:start+3500]}})
                                if not 200 <= sent.status_code < 300:
                                    emit_send_failure('fixed', sent.status_code, response_body(sent))
                                    outcome = usage_send_failure(sent.status_code, response_body(sent))
                                    break
                        except httpx.HTTPError:
                            emit_send_failure('fixed')
                            outcome = ('network', None, None)
                        # The broker decided kind and teacher of this reply (ticket).
                        if reply.get('ticket'):
                            _spawn(submit_usage({'ticket': reply['ticket'], 'measurement': {
                                'broker_kind': None, 'agent_turn': False, 'rejected_command': False, 'refused': False,
                                'received_at': int(received_wall * 1000),
                                'elapsed_ms': max(0, round((time.monotonic() - received_mono) * 1000)),
                                'requests': [], 'compactions': 0, 'context_window': None, 'compaction_threshold': None,
                                'send': {'outcome': outcome[0], 'http_status': outcome[1], 'error_code': outcome[2]}}}))
                payload = decision['payload']
                if not any((change.get('value') or {}).get('messages') for entry in payload.get('entry', []) for change in entry.get('changes', [])):
                    return web.Response(status=200)
                # Only admitted messages reach the native adapter, with the
                # registered names. The broker has verified the original
                # signature; re-sign the filtered copy for the adapter's verifier.
                wire = json.dumps(payload).encode()
                signature = 'sha256=' + hmac.new(os.environ['WHATSAPP_CLOUD_APP_SECRET'].encode(), wire, hashlib.sha256).hexdigest()
                filtered_headers = CIMultiDict(request.headers)
                filtered_headers['X-Hub-Signature-256'] = signature
                filtered_headers['Content-Length'] = str(len(wire))
                request._read_bytes = None
                request.content.unread_data(wire)
                request = request.clone(headers=filtered_headers)
            except Exception:
                return web.Response(status=503)
        return await original_handle(app, request)

    Application._handle = handle

    # The adapter's allowlist policy and Hermes' own authorization both read
    # this live set: only senders admitted by the broker from the database.
    original_allow_from = WhatsAppBehaviorMixin._live_dm_allow_from

    def live_allow_from(adapter):
        if type(adapter).__name__ == 'WhatsAppCloudAdapter':
            return admitted_senders()
        return original_allow_from(adapter)

    WhatsAppBehaviorMixin._live_dm_allow_from = live_allow_from
    original_principal = GatewayAuthorizationMixin._principal_authorized

    def principal_authorized(self, source, *, allow_adapter_delegation):
        # No pairing, role, allow-all or configuration grant for WhatsApp: a
        # direct sender is authorized only while the broker's admission lasts.
        if getattr(source, 'platform', None) == Platform.WHATSAPP_CLOUD:
            return (getattr(source, 'chat_type', None) == 'dm' and not getattr(source, 'is_bot', False)
                    and str(source.user_id or '') in admitted_senders())
        return original_principal(self, source, allow_adapter_delegation=allow_adapter_delegation)

    GatewayAuthorizationMixin._principal_authorized = principal_authorized

    # Native resume/list ownership uses the WhatsApp chat ID, which survives a
    # number reassignment. Also require the session's immutable database owner.
    original_resume_allowed = GatewaySlashCommandsMixin._resume_target_allowed

    async def resume_allowed(self, source, target_id, allow_override=False):
        if getattr(source, 'platform', None) == Platform.WHATSAPP_CLOUD:
            receipt = current_message.get()
            if receipt is None or receipt[1] != str(source.user_id or ''):
                return False
            if not await session_allowed(receipt[0], receipt[1], target_id):
                return False
        return await original_resume_allowed(self, source, target_id, allow_override)

    GatewaySlashCommandsMixin._resume_target_allowed = resume_allowed

    # Before session creation, busy handling and the model: the admitted
    # identity must still be current, and the chat's Hermes conversation must
    # belong to it. A pre-transition chat, or a number now registered to another
    # person, starts empty; the studio data are untouched.
    original_message = GatewayInboundMixin._handle_message

    async def handle_message(self, event):
        source = event.source
        if getattr(source, 'platform', None) == Platform.WHATSAPP_CLOUD:
            if getattr(event, 'internal', False) or source.chat_type != 'dm' or getattr(source, 'is_bot', False):
                return None
            sender = str(source.user_id or '')
            record = admitted(event.message_id, sender)
            if record is None:
                return None
            lock = sender_locks.setdefault(sender, asyncio.Lock())
            async with lock:
                verdict = await broker_turn(event.message_id, sender, False)
                if verdict is None:
                    mark_usage('refused')
                    return ACCESS_REFUSAL
                if verdict['reset']:
                    try:
                        await self._handle_reset_command(dataclasses.replace(event, text='/new'))
                    except Exception:
                        return None
                    verdict = await broker_turn(event.message_id, sender, True)
                    if verdict is None or verdict['reset']:
                        mark_usage('refused')
                        return ACCESS_REFUSAL
            token = current_message.set((event.message_id, sender))
            try:
                return await original_message(self, event)
            finally:
                current_message.reset(token)
        return await original_message(self, event)

    GatewayInboundMixin._handle_message = handle_message
    original_run = TurnRunner._run_conversation_with_approval

    def run(self, agent, agent_history, observed_group_context, persist_user_message_override,
            persist_user_timestamp_override):
        ctx = self._ctx
        source = ctx.source
        identity = None
        if (api_execution.get() is None and source.platform == Platform.WHATSAPP_CLOUD
                and getattr(source, 'chat_type', None) == 'dm' and not getattr(source, 'is_bot', False)
                and not ctx.persist_user_display_kind and ctx.inbound_message_id and source.user_id
                and admitted(str(ctx.inbound_message_id), str(source.user_id)) is not None):
            identity = (str(ctx.inbound_message_id), str(source.user_id), secrets.token_hex(32))
        # The turn's model requests belong to the message it runs for, also when
        # Hermes runs it from another message's task (busy, steer, drain).
        record = usage_record(identity[0], identity[1]) if identity is not None else None
        if record is not None:
            with record.lock:
                if record.submitted:
                    record = None
                else:
                    record.turns += 1
                    record.agent_turn = True
        usage_token = usage_current.set(record) if record is not None else None
        try:
            if identity is not None and (not ctx.session_id or not bind_session(identity[0], identity[1], ctx.session_id)):
                mark_usage('refused')
                return {'final_response': ACCESS_REFUSAL, 'messages': agent_history, 'completed': True}
            return run_turn(self, agent, agent_history, observed_group_context, persist_user_message_override,
                            persist_user_timestamp_override, ctx, identity)
        finally:
            if usage_token is not None:
                usage_current.reset(usage_token)
                with record.lock:
                    record.turns -= 1

    def run_turn(self, agent, agent_history, observed_group_context, persist_user_message_override,
                 persist_user_timestamp_override, ctx, identity):
        from gateway.run import _last_transcript_timestamp
        last = transcript_epoch(_last_transcript_timestamp(getattr(ctx, 'history', None)))
        agent._pilates_idle_resume = last is not None and time.time() - last >= idle_seconds()
        token = current_turn.set(identity)
        try:
            return original_run(self, agent, agent_history, observed_group_context,
                                persist_user_message_override, persist_user_timestamp_override)
        finally:
            agent._pilates_idle_resume = False
            current_turn.reset(token)

    TurnRunner._run_conversation_with_approval = run
