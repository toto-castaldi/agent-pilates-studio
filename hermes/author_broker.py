"""Broker for authenticated WhatsApp senders and protected PostgreSQL contexts.

Every webhook body reaches this broker before Hermes. The broker verifies it
and resolves each direct sender in the single teacher registry (ADR-003): only
complete, enabled identities are admitted, the manager follows the guided
management path, and anyone else receives a fixed refusal without a model turn.
"""

import asyncio
import hashlib
import hmac
import json
import logging
import os
import re
import time
from pathlib import Path

import asyncpg
from aiohttp import web

logging.disable(logging.CRITICAL)

MAX_BODY = 3 * 1024 * 1024
MAX_RECEIPTS = 4096
RECEIPT_LIFETIME = 900
# Fixed text: no manager number or data, no self-enrollment invitation.
ACCESS_REFUSAL = ('Accesso non abilitato. Per usare l’assistente dello studio rivolgiti al gestore.')
SENDER = re.compile(r'[1-9][0-9]{7,14}')
MANAGER = re.compile(r'\+[1-9][0-9]{7,14}')


def read_secret(name):
    value = Path('/run/pilates-broker', name).read_text().strip()
    if not value:
        raise ValueError('Missing broker configuration')
    return value


def sender_hash(sender):
    return hashlib.sha256(sender.encode()).hexdigest()


def signed_message(message, now=None):
    """The fields every accepted direct message must carry, independently of Hermes."""
    now = time.time() if now is None else now
    sender = message.get('from') if isinstance(message, dict) else None
    timestamp = message.get('timestamp') if isinstance(message, dict) else None
    return (isinstance(message, dict) and not message.get('chat')
            and isinstance(sender, str) and SENDER.fullmatch(sender) is not None
            and isinstance(message.get('id'), str) and 0 < len(message['id']) <= 512
            and isinstance(timestamp, str) and re.fullmatch(r'[0-9]{1,12}', timestamp) is not None
            and -30 <= now - int(timestamp) <= 300)


class Broker:
    def __init__(self, password, token, app_secret, phone_id, manager_phone):
        if (not re.fullmatch(r'[a-f0-9]{64}', password) or not re.fullmatch(r'[a-f0-9]{64}', token)
                or password == token or not re.fullmatch(r'[0-9]+', phone_id)
                or not MANAGER.fullmatch(manager_phone)):
            raise ValueError('Invalid broker configuration')
        self.password = password
        self.token = token.encode()
        self.app_secret = app_secret.encode()
        self.phone_id = phone_id
        self.manager_phone = manager_phone
        self.receipts = {}
        self.pool = None
        self.cleanup_task = None
        self.management = None

    def authorized(self, request):
        return hmac.compare_digest(request.headers.get('X-Pilates-Bridge', '').encode(), self.token)

    def signature_valid(self, request, body):
        signature = request.headers.get('X-Hub-Signature-256', '')
        expected = 'sha256=' + hmac.new(self.app_secret, body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(signature.encode(), expected.encode())

    def prune_receipts(self):
        now = time.monotonic()
        for key, value in list(self.receipts.items()):
            if value['expires'] <= now:
                del self.receipts[key]

    async def refuse(self, message):
        """Fixed refusal once per message ID, also across Meta retries and restarts."""
        digest = hashlib.sha256(message['id'].encode()).hexdigest()
        async with self.pool.acquire(timeout=5) as connection:
            inserted = await connection.fetchval(
                "INSERT INTO studio_private.consumed_messages VALUES ($1, clock_timestamp() + interval '15 minutes') "
                'ON CONFLICT DO NOTHING RETURNING true', digest, timeout=5)
        return ACCESS_REFUSAL if inserted else ''

    async def resolve(self, sender):
        async with self.pool.acquire(timeout=5) as connection:
            return await connection.fetchrow('SELECT * FROM studio_private.resolve_teacher_identity($1)', sender, timeout=5)

    async def admission(self, request):
        """Decide every message of a signed webhook before the Hermes adapter sees it."""
        if not self.authorized(request):
            return web.Response(status=403)
        body = await request.read()
        if not self.signature_valid(request, body):
            return web.Response(status=401)
        try:
            payload = json.loads(body)
            if not isinstance(payload, dict) or payload.get('object') != 'whatsapp_business_account':
                raise ValueError('Invalid payload')
            replies, admitted = [], []
            self.prune_receipts()
            for entry in payload.get('entry', []):
                for change in entry.get('changes', []):
                    value = change.get('value') or {}
                    if change.get('field') != 'messages' or not isinstance(value, dict):
                        continue
                    if str((value.get('metadata') or {}).get('phone_number_id') or '') != self.phone_id:
                        value['messages'] = []
                        value['contacts'] = []
                        continue
                    names, kept = {}, []
                    for message in value.get('messages') or []:
                        if not signed_message(message):
                            continue
                        sender = message['from']
                        reply = None
                        if '+' + sender == self.manager_phone:
                            # Bootstrap, /anagrafica and confirmations never reach Hermes.
                            reply = await self.management.message(sender, message)
                            if reply is not None:
                                if reply:
                                    replies.append({'to': sender, 'text': reply})
                                continue
                        person = await self.resolve(sender)
                        if person is None or not person['access_enabled']:
                            reply = await self.refuse(message)
                            if reply:
                                replies.append({'to': sender, 'text': reply})
                            continue
                        if '+' + sender != self.manager_phone:
                            # Ordinary users get a fixed refusal for management commands.
                            reply = await self.management.message(sender, message)
                            if reply is not None:
                                if reply:
                                    replies.append({'to': sender, 'text': reply})
                                continue
                        receipt = {'sender': sender, 'teacher': int(person['id']),
                                   'revision': int(person['identity_revision'])}
                        previous = self.receipts.get(message['id'])
                        if previous is not None:
                            if (previous['sender'], previous['teacher'], previous['revision']) != (
                                    receipt['sender'], receipt['teacher'], receipt['revision']):
                                return web.Response(status=409)
                        else:
                            if len(self.receipts) >= MAX_RECEIPTS:
                                return web.Response(status=503)
                            self.receipts[message['id']] = {**receipt, 'expires': time.monotonic() + RECEIPT_LIFETIME,
                                                            'turn': None, 'lock': asyncio.Lock()}
                        names[sender] = f"{person['first_name']} {person['last_name']}"
                        admitted.append({'message_id': message['id'], 'sender': sender, 'teacher': str(person['id'])})
                        kept.append(message)
                    value['messages'] = kept
                    # The registered name replaces the WhatsApp profile name; the
                    # profile is never an identity or a fallback for the model.
                    value['contacts'] = [{'wa_id': sender, 'profile': {'name': name}} for sender, name in names.items()]
            redact = []
            if admitted:
                async with self.pool.acquire(timeout=5) as connection:
                    redact = [row[0] for row in await connection.fetch(
                        'SELECT * FROM studio_private.identity_phone_digits()', timeout=5)]
            return web.json_response({'payload': payload, 'replies': replies, 'admitted': admitted, 'redact': redact})
        except asyncio.CancelledError:
            self.management.invalidate()
            raise
        except (ValueError, TypeError, AttributeError, KeyError, UnicodeDecodeError,
                asyncpg.PostgresError, asyncio.TimeoutError):
            # A failed/ambiguous request must not leave a pending confirmation
            # executable by a later replay in this broker process.
            self.management.invalidate()
            return web.Response(status=503)

    def current_receipt(self, message_id, sender):
        self.prune_receipts()
        receipt = self.receipts.get(message_id)
        if receipt is None or receipt['sender'] != sender:
            return None
        return receipt

    async def receipt_current(self, connection, receipt):
        person = await connection.fetchrow('SELECT * FROM studio_private.resolve_teacher_identity($1)',
                                           receipt['sender'], timeout=5)
        return (person is not None and person['access_enabled'] and int(person['id']) == receipt['teacher']
                and int(person['identity_revision']) == receipt['revision'])

    async def turn(self, request):
        """Before a model turn: the admitted identity must still be current; report chat ownership."""
        if not self.authorized(request):
            return web.Response(status=403)
        try:
            data = await request.json()
            if not isinstance(data, dict) or set(data) != {'message_id', 'sender', 'bind'}:
                raise ValueError('Invalid request')
            message_id, sender, bind = data['message_id'], data['sender'], data['bind']
            if not isinstance(message_id, str) or not isinstance(sender, str) or not isinstance(bind, bool):
                raise ValueError('Invalid request')
            receipt = self.current_receipt(message_id, sender)
            if receipt is None:
                return web.Response(status=403)
            key = sender_hash(sender)
            async with self.pool.acquire(timeout=5) as connection:
                async with connection.transaction():
                    if not await self.receipt_current(connection, receipt):
                        return web.Response(status=403)
                    if bind:
                        # Recorded only after the gateway emptied the chat.
                        await connection.execute(
                            'INSERT INTO studio_private.chat_owners (sender_hash, teacher_id) VALUES ($1, $2) '
                            'ON CONFLICT (sender_hash) DO UPDATE SET teacher_id = excluded.teacher_id, bound_at = clock_timestamp()',
                            key, receipt['teacher'], timeout=5)
                        owner = receipt['teacher']
                    else:
                        owner = await connection.fetchval(
                            'SELECT teacher_id FROM studio_private.chat_owners WHERE sender_hash = $1', key, timeout=5)
            return web.json_response({'reset': owner is None or int(owner) != receipt['teacher']})
        except (ValueError, TypeError, KeyError, asyncpg.PostgresError, asyncio.TimeoutError):
            return web.Response(status=400)

    async def session(self, request):
        """Bind a Hermes session once, or verify its immutable person before resume/list."""
        if not self.authorized(request):
            return web.Response(status=403)
        try:
            data = await request.json()
            if not isinstance(data, dict) or set(data) != {'message_id', 'sender', 'session_id', 'bind'}:
                raise ValueError('Invalid request')
            message_id, sender = data['message_id'], data['sender']
            session_id, bind = data['session_id'], data['bind']
            if (not isinstance(message_id, str) or not isinstance(sender, str)
                    or not isinstance(session_id, str) or not 1 <= len(session_id) <= 128
                    or not isinstance(bind, bool)):
                raise ValueError('Invalid request')
            receipt = self.current_receipt(message_id, sender)
            if receipt is None:
                return web.Response(status=403)
            async with self.pool.acquire(timeout=5) as connection:
                async with connection.transaction():
                    if not await self.receipt_current(connection, receipt):
                        return web.Response(status=403)
                    if bind:
                        await connection.execute(
                            'INSERT INTO studio_private.session_owners (session_id, teacher_id) VALUES ($1, $2) '
                            'ON CONFLICT DO NOTHING', session_id, receipt['teacher'], timeout=5)
                    owner = await connection.fetchval(
                        'SELECT teacher_id FROM studio_private.session_owners WHERE session_id = $1', session_id, timeout=5)
            return web.Response(status=204 if owner is not None and int(owner) == receipt['teacher'] else 403)
        except (ValueError, TypeError, KeyError, asyncpg.PostgresError, asyncio.TimeoutError):
            return web.Response(status=400)

    async def context(self, request):
        if not self.authorized(request):
            return web.Response(status=403)
        try:
            data = await request.json()
            if not isinstance(data, dict) or set(data) != {'message_id', 'sender', 'turn', 'pid', 'txid'}:
                raise ValueError('Invalid request')
            message_id, sender, turn = data['message_id'], data['sender'], data['turn']
            pid, txid = data['pid'], data['txid']
            if (not isinstance(message_id, str) or not isinstance(sender, str)
                    or not isinstance(turn, str) or not re.fullmatch(r'[0-9a-f]{64}', turn)
                    or type(pid) is not int or not 0 < pid < 2**31
                    or not isinstance(txid, str) or not re.fullmatch(r'[0-9]{1,18}', txid)):
                raise ValueError('Invalid request')
            receipt = self.current_receipt(message_id, sender)
            if receipt is None or receipt['turn'] not in (None, turn):
                return web.Response(status=403)
            async with receipt['lock']:
                if receipt['turn'] not in (None, turn) or receipt['expires'] <= time.monotonic():
                    return web.Response(status=403)
                async with self.pool.acquire(timeout=5) as connection:
                    if receipt['turn'] is None:
                        # A durable digest prevents replay after a broker restart. It
                        # is retained longer than the signed timestamp's acceptance window.
                        digest = hashlib.sha256(message_id.encode()).hexdigest()
                        inserted = await connection.fetchval(
                            "INSERT INTO studio_private.consumed_messages (message_hash, expires_at) "
                            "VALUES ($1, clock_timestamp() + interval '15 minutes') "
                            "ON CONFLICT DO NOTHING RETURNING true", digest, timeout=5,
                        )
                        if not inserted:
                            return web.Response(status=403)
                        receipt['turn'] = turn
                    # The database binds only the identity admitted with this
                    # signed message, if it is still the same enabled revision.
                    await connection.execute(
                        'SELECT studio_private.bind_teacher_identity($1, $2, $3, $4, $5)',
                        pid, int(txid), receipt['sender'], receipt['teacher'], receipt['revision'], timeout=5,
                    )
            return web.Response(status=204)
        except (ValueError, TypeError, KeyError, asyncpg.PostgresError, asyncio.TimeoutError):
            return web.Response(status=400)

    async def release(self, request):
        if not self.authorized(request):
            return web.Response(status=403)
        try:
            data = await request.json()
            if (not isinstance(data, dict) or set(data) != {'pid', 'txid'} or type(data['pid']) is not int
                    or not isinstance(data['txid'], str) or not re.fullmatch(r'[0-9]{1,18}', data['txid'])):
                raise ValueError('Invalid request')
            async with self.pool.acquire(timeout=5) as connection:
                await connection.execute('DELETE FROM studio_private.author_context WHERE backend_pid = $1 AND transaction_id = $2',
                                         data['pid'], int(data['txid']), timeout=5)
            return web.Response(status=204)
        except (ValueError, TypeError, KeyError, asyncpg.PostgresError, asyncio.TimeoutError):
            return web.Response(status=400)

    async def cleanup(self):
        while True:
            await asyncio.sleep(30)
            self.prune_receipts()
            try:
                async with self.pool.acquire(timeout=5) as connection:
                    await connection.execute('DELETE FROM studio_private.author_context WHERE expires_at <= clock_timestamp()', timeout=5)
                    await connection.execute('DELETE FROM studio_private.consumed_messages WHERE expires_at <= clock_timestamp()', timeout=5)
            except (asyncpg.PostgresError, asyncio.TimeoutError):
                pass

    async def health(self, request):
        try:
            async with self.pool.acquire(timeout=3) as connection:
                await connection.fetch('SELECT 1 FROM studio_private.author_context LIMIT 0', timeout=3)
            return web.Response(status=200)
        except (asyncpg.PostgresError, asyncio.TimeoutError):
            return web.Response(status=503)

    async def start(self, app):
        self.pool = await asyncpg.create_pool(host=os.environ.get('PILATES_DB_HOST', 'postgres'), port=5432,
                                              database='studio', user='studio_broker', password=self.password,
                                              min_size=1, max_size=4, timeout=10, command_timeout=10)
        async with self.pool.acquire() as connection:
            await connection.execute('DELETE FROM studio_private.author_context WHERE expires_at <= clock_timestamp()')
            await connection.execute('DELETE FROM studio_private.consumed_messages WHERE expires_at <= clock_timestamp()')
        self.cleanup_task = asyncio.create_task(self.cleanup())

    async def stop(self, app):
        if self.cleanup_task:
            self.cleanup_task.cancel()
            try:
                await self.cleanup_task
            except asyncio.CancelledError:
                pass
        if self.pool:
            await self.pool.close()


def main():
    broker = Broker(read_secret('db_broker'), read_secret('bridge_token'), read_secret('whatsapp_app_secret'),
                    read_secret('whatsapp_phone_number_id'), read_secret('whatsapp_manager_phone'))
    app = web.Application(client_max_size=MAX_BODY)
    import sys
    sys.path.insert(0, '/opt/pilates')  # Root-owned code, not HOME or the working directory.
    from identity_management import IdentityManagement
    broker.management = IdentityManagement(broker)
    app.router.add_post('/v1/admission', broker.admission)
    app.router.add_post('/v1/turn', broker.turn)
    app.router.add_post('/v1/session', broker.session)
    app.router.add_post('/v1/context', broker.context)
    app.router.add_post('/v1/release', broker.release)
    app.router.add_get('/health', broker.health)
    app.on_startup.append(broker.start)
    app.on_cleanup.append(broker.stop)
    web.run_app(app, host='0.0.0.0', port=8091, access_log=None, print=None)


if __name__ == '__main__':
    main()
