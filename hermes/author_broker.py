"""Broker for authenticated WhatsApp authors and protected PostgreSQL contexts."""

import asyncio
import hashlib
import hmac
import json
import logging
import os
import re
import time
import unicodedata
from pathlib import Path

import asyncpg
from aiohttp import web

logging.disable(logging.CRITICAL)

MAX_BODY = 3 * 1024 * 1024
MAX_RECEIPTS = 4096
RECEIPT_LIFETIME = 900


def read_secret(name):
    value = Path('/run/pilates-broker', name).read_text().strip()
    if not value:
        raise ValueError('Missing broker configuration')
    return value


def clean_name(value):
    if not isinstance(value, str):
        return None
    name = ''.join(ch for ch in value if unicodedata.category(ch) not in {'Cc', 'Cs', 'Cn', 'Co'}).strip()
    return name[:200] or None


class Broker:
    def __init__(self, password, token, app_secret, allowlist, phone_id):
        if (not re.fullmatch(r'[a-f0-9]{64}', password) or not re.fullmatch(r'[a-f0-9]{64}', token)
                or password == token or not re.fullmatch(r'[0-9]+(?:,[0-9]+)*', allowlist)
                or not re.fullmatch(r'[0-9]+', phone_id)):
            raise ValueError('Invalid broker configuration')
        self.password = password
        self.token = token.encode()
        self.app_secret = app_secret.encode()
        self.allowlist = frozenset(allowlist.split(','))
        self.phone_id = phone_id
        self.receipts = {}
        self.pool = None
        self.cleanup_task = None

    def authorized(self, request):
        return hmac.compare_digest(request.headers.get('X-Pilates-Bridge', '').encode(), self.token)

    def prune_receipts(self):
        now = time.monotonic()
        for key, value in list(self.receipts.items()):
            if value['expires'] <= now:
                del self.receipts[key]

    async def evidence(self, request):
        if not self.authorized(request):
            return web.Response(status=403)
        body = await request.read()
        signature = request.headers.get('X-Hub-Signature-256', '')
        expected = 'sha256=' + hmac.new(self.app_secret, body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature.encode(), expected.encode()):
            return web.Response(status=401)
        try:
            payload = json.loads(body)
            if not isinstance(payload, dict) or payload.get('object') != 'whatsapp_business_account':
                raise ValueError('Invalid payload')
            found = []
            for entry in payload.get('entry', []):
                for change in entry.get('changes', []):
                    if change.get('field') != 'messages':
                        continue
                    value = change.get('value') or {}
                    if str((value.get('metadata') or {}).get('phone_number_id') or '') != self.phone_id:
                        continue
                    contacts = {str(c.get('wa_id') or ''): clean_name((c.get('profile') or {}).get('name'))
                                for c in value.get('contacts', []) if isinstance(c, dict)}
                    for message in value.get('messages', []):
                        if not isinstance(message, dict) or message.get('chat'):
                            continue
                        sender = str(message.get('from') or '')
                        message_id = message.get('id')
                        timestamp = message.get('timestamp')
                        if (sender in self.allowlist and isinstance(message_id, str) and 0 < len(message_id) <= 512
                                and isinstance(timestamp, str) and re.fullmatch(r'[0-9]{1,12}', timestamp)
                                and -30 <= time.time() - int(timestamp) <= 300):
                            found.append((message_id, sender, contacts.get(sender)))
            self.prune_receipts()
            for message_id, sender, name in found:
                previous = self.receipts.get(message_id)
                if previous is not None:
                    if (previous['sender'], previous['name']) != (sender, name):
                        return web.Response(status=409)
                    continue
                if len(self.receipts) >= MAX_RECEIPTS:
                    return web.Response(status=503)
                self.receipts[message_id] = {'sender': sender, 'name': name,
                                             'expires': time.monotonic() + RECEIPT_LIFETIME,
                                             'turn': None, 'lock': asyncio.Lock()}
            return web.Response(status=204)
        except (ValueError, TypeError, AttributeError, UnicodeDecodeError):
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
            self.prune_receipts()
            receipt = self.receipts.get(message_id)
            if receipt is None or receipt['sender'] != sender or receipt['turn'] not in (None, turn):
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
                    await connection.execute(
                        "INSERT INTO studio_private.author_context (backend_pid, transaction_id, sender, profile_name, expires_at) "
                        "VALUES ($1, $2, $3, $4, clock_timestamp() + interval '60 seconds')",
                        pid, int(txid), receipt['sender'], receipt['name'], timeout=5,
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
                    read_secret('whatsapp_allowed_users'), read_secret('whatsapp_phone_number_id'))
    app = web.Application(client_max_size=MAX_BODY)
    app.router.add_post('/v1/evidence', broker.evidence)
    app.router.add_post('/v1/context', broker.context)
    app.router.add_post('/v1/release', broker.release)
    app.router.add_get('/health', broker.health)
    app.on_startup.append(broker.start)
    app.on_cleanup.append(broker.stop)
    web.run_app(app, host='0.0.0.0', port=8091, access_log=None, print=None)


if __name__ == '__main__':
    main()
