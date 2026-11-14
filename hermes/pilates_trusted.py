"""Bridge authenticated webhook receipts and per-turn metadata into the SQL tool.

This module is installed only in the gateway image. The model cannot supply these
values as tool arguments. The broker independently verifies the raw Meta signature.
"""

import contextvars
import hashlib
import hmac
import json
import math
import os
import re
import secrets
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from aiohttp import ClientSession, ClientTimeout
from aiohttp.web_app import Application

current_turn = contextvars.ContextVar('pilates_trusted_turn', default=None)
BROKER_URL = 'http://author-broker:8091'
TOKEN_PATH = '/run/pilates-agent/bridge_token'


def bridge_token():
    return Path(TOKEN_PATH).read_text().strip()


def idle_seconds():
    # The entrypoint validates and exports this; a missing value fails the turn
    # rather than silently disabling resume compaction.
    value = os.environ['PILATES_IDLE_COMPACT_SECONDS']
    if not re.fullmatch(r'[1-9][0-9]*', value):
        raise ValueError('invalid inactivity interval')
    return int(value)


def redact_phones(value, allowed):
    # Redact only a wire copy, not the authenticated identity or persisted
    # history. Also cover common separators in a known configured number.
    patterns = [re.compile(r'[ .()+\-\u00a0]*'.join(re.escape(digit) for digit in phone))
                for phone in allowed if re.fullmatch(r'[0-9]+', phone)]

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


async def send_evidence(request):
    try:
        body = await request.read()
        # The pinned WhatsApp adapter reads request.content directly instead of
        # request.read(); restore the bytes so it independently verifies them.
        request.content.unread_data(body)
        headers = {'X-Pilates-Bridge': bridge_token(),
                   'X-Hub-Signature-256': request.headers.get('X-Hub-Signature-256', '')}
        async with ClientSession(timeout=ClientTimeout(total=5), trust_env=False) as session:
            async with session.post(BROKER_URL + '/v1/evidence', data=body, headers=headers) as response:
                await response.read()
    except Exception:
        # The real adapter still authenticates the webhook. If this bridge is
        # unavailable, the SQL tool must refuse the turn rather than guess.
        pass


def install():
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
        return 'Il canale principale è gestito dall’operatore.'

    GatewaySlashCommandsMixin._handle_set_home_command = reject_set_home

    # The cached session prompt can span midnight. Add the clock to the wire
    # copy for every model request, never to SQLite or the conversation history.
    original_build_messages = assembly.build_api_messages

    def build_messages(agent, messages, **kwargs):
        api_messages, system = original_build_messages(agent, messages, **kwargs)
        now = datetime.now(ZoneInfo('Europe/Rome')).isoformat(timespec='seconds')
        system = (system + '\n\nData e ora correnti (Europe/Rome): ' + now).strip()
        # Native prompt redaction does not cover historic tool output, names or
        # user text. Remove known authorized phones from the wire copy too.
        allowed = os.environ.get('WHATSAPP_CLOUD_ALLOWED_USERS', '').split(',')
        api_messages = redact_phones(api_messages, allowed)
        system = redact_phones(system, allowed)
        if api_messages and api_messages[0].get('role') == 'system':
            api_messages[0] = {**api_messages[0], 'content': system}
        else:
            api_messages.insert(0, {'role': 'system', 'content': system})
        return api_messages, system

    assembly.build_api_messages = build_messages

    # Hermes sends compaction prompts through a separate auxiliary-model path,
    # before build_api_messages. Redact that wire copy too; the original
    # transcript stays intact for the gateway and the authenticated broker.
    original_summary_call = ContextCompressor._call_summary_llm

    def summary_call(compressor, prompt, prompt_started_at):
        allowed = os.environ.get('WHATSAPP_CLOUD_ALLOWED_USERS', '').split(',')
        return original_summary_call(compressor, redact_phones(prompt, allowed), prompt_started_at)

    ContextCompressor._call_summary_llm = summary_call

    # Title generation and /btw have their own auxiliary requests, which can
    # read the unsanitized transcript before the ordinary message assembly.
    # Keep their input copies private without changing the stored transcript.
    original_title = turn_context._maybe_title_session_at_turn_start

    def title(agent, messages, title_user_message=None):
        allowed = os.environ.get('WHATSAPP_CLOUD_ALLOWED_USERS', '').split(',')
        return original_title(agent, redact_phones(messages, allowed), redact_phones(title_user_message, allowed))

    turn_context._maybe_title_session_at_turn_start = title
    original_side_question = side_question.answer_side_question

    def answer_side_question(question, history=None, *args, **kwargs):
        allowed = os.environ.get('WHATSAPP_CLOUD_ALLOWED_USERS', '').split(',')
        return original_side_question(redact_phones(question, allowed), redact_phones(history, allowed), *args, **kwargs)

    side_question.answer_side_question = answer_side_question

    # Enforce the allowlist at both execution paths, including model-emitted
    # tool names that were not advertised in the tool schema.
    original_resolve = executor._resolve_sequential_dispatch

    def resolve(agent, ref, messages):
        if ref.name != 'studio_sql_query':
            return executor._SequentialDispatch(lambda args: '{"error":"Tool not permitted."}')
        return original_resolve(agent, ref, messages)

    executor._resolve_sequential_dispatch = resolve
    original_worker = executor._ConcurrentBatch._dispatch_worker

    def worker(batch, index, ref, scope_block, start_gate):
        if ref.name != 'studio_sql_query':
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
        if request.method == 'POST' and request.path == os.environ.get('WHATSAPP_CLOUD_WEBHOOK_PATH', '/whatsapp/webhook'):
            if os.environ.get('PILATES_MANAGER_PHONE'):
                # This path precedes the adapter, its slash commands, SQLite,
                # titles and model turns. Never fall through on broker failure.
                from aiohttp import web
                from multidict import CIMultiDict
                try:
                    raw = await request.read()
                    headers = {'X-Pilates-Bridge': bridge_token(),
                               'X-Hub-Signature-256': request.headers.get('X-Hub-Signature-256', '')}
                    async with ClientSession(timeout=ClientTimeout(total=20), trust_env=False) as session:
                        async with session.post(BROKER_URL + '/v1/management', data=raw, headers=headers) as response:
                            if response.status != 200:
                                return web.Response(status=response.status)
                            decision = await response.json()
                    import httpx
                    async with httpx.AsyncClient(timeout=10, trust_env=False) as client:
                        for reply in decision['replies']:
                            # Long administrative lists are sent as bounded chunks.
                            for start in range(0, len(reply['text']), 3500):
                                await client.post('https://graph.facebook.com/v21.0/' + os.environ['WHATSAPP_CLOUD_PHONE_NUMBER_ID'] + '/messages',
                                    headers={'Authorization': 'Bearer ' + os.environ['WHATSAPP_CLOUD_ACCESS_TOKEN']},
                                    json={'messaging_product': 'whatsapp', 'to': reply['to'], 'type': 'text',
                                          'text': {'body': reply['text'][start:start+3500]}})
                    payload = decision['payload']
                    if not any((change.get('value') or {}).get('messages') for entry in payload.get('entry', []) for change in entry.get('changes', [])):
                        return web.Response(status=200)
                    # Only non-management messages reach the native adapter. The
                    # broker has verified the original signature; re-sign the
                    # filtered wire copy for the adapter's independent verifier.
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
            await send_evidence(request)
        return await original_handle(app, request)

    Application._handle = handle
    original_run = TurnRunner._run_conversation_with_approval

    def run(self, agent, agent_history, observed_group_context, persist_user_message_override,
            persist_user_timestamp_override):
        ctx = self._ctx
        source = ctx.source
        identity = None
        if (api_execution.get() is None and source.platform == Platform.WHATSAPP_CLOUD
                and getattr(source, 'chat_type', None) == 'dm' and not getattr(source, 'is_bot', False)
                and not ctx.persist_user_display_kind and ctx.inbound_message_id and source.user_id):
            identity = (str(ctx.inbound_message_id), str(source.user_id), secrets.token_hex(32))
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
