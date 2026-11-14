"""Trusted management adapter. The TypeScript reducer owns all pure transitions."""
import asyncio
import hashlib
import json
import os
import re
import secrets
import time

from aiohttp import web
import asyncpg


def person(row):
    if row is None:
        return None
    return {key: str(value) if key in ('id', 'identity_revision') else value for key, value in dict(row).items()}


class IdentityManagement:
    def __init__(self, broker):
        self.broker = broker
        configured = os.environ.get('PILATES_MANAGER_PHONE', '')
        if configured and not re.fullmatch(r'\+[1-9][0-9]{7,14}', configured):
            raise ValueError('Invalid manager configuration')
        self.manager = configured
        self.instance = secrets.token_hex(32)

    async def reduce(self, data):
        child = await asyncio.create_subprocess_exec(
            'node', '--disable-warning=ExperimentalWarning', '/opt/pilates/identity-flow-runner.mjs',
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
        try:
            stdout, _ = await asyncio.wait_for(child.communicate(json.dumps(data).encode()), 5)
            if child.returncode:
                raise ValueError('Management policy failed')
            return json.loads(stdout)
        finally:
            if child.returncode is None:
                child.kill()
                await child.wait()

    async def message(self, sender, message):
        text = (message.get('text') or {}).get('body', '') if message.get('type') == 'text' else ''
        if not isinstance(text, str) or len(text) > 8192:
            text = ''
        digest = hashlib.sha256(message['id'].encode()).hexdigest()
        key = hashlib.sha256(sender.encode()).hexdigest()
        async with self.broker.pool.acquire(timeout=5) as connection:
            async with connection.transaction():
                # Serialize the entire transition and commit, including across broker instances.
                await connection.execute('SELECT pg_advisory_xact_lock(hashtextextended($1, 17))', key)
                stored = await connection.fetchval('SELECT state FROM studio_private.management_sessions WHERE sender_hash=$1', key)
                stored = json.loads(stored) if stored else None
                actor = person(await connection.fetchrow('SELECT * FROM studio_private.resolve_teacher_identity($1)', sender)) if sender == self.manager[1:] else None
                state = stored['state'] if stored else None
                people = []
                if sender == self.manager[1:] and actor and actor['access_enabled']:
                    people = [person(row) for row in await connection.fetch('SELECT * FROM studio_private.list_teacher_identities($1,$2)', sender, self.manager)]
                    # list locks and re-resolves the manager. Do not compare a
                    # revision fetched before waiting for that lock.
                    actor = next(p for p in people if p['phone'] == self.manager)
                if stored and (stored['instance'] != self.instance or stored.get('actorId') != (actor or {}).get('id')):
                    state['expires'] = 0
                data = dict(text=text, now=int(time.time()*1000), code=secrets.token_hex(8), manager=sender == self.manager[1:], actor=actor, people=people, state=state, managerPhone=self.manager)
                result = await self.reduce(data)
                if not result['handled']:
                    return None
                inserted = await connection.fetchval("INSERT INTO studio_private.consumed_messages VALUES ($1,clock_timestamp()+interval '15 minutes') ON CONFLICT DO NOTHING RETURNING true", digest)
                if not inserted:
                    return ''
                next_state = result.get('state')
                if next_state and next_state.get('operation') == 'bootstrap' and next_state['step'] == 'confirm':
                    preview = await connection.fetchrow('SELECT * FROM studio_private.preview_manager_bootstrap($1,$2,$3,$4)', sender, self.manager, next_state['firstName'], next_state['lastName'])
                    next_state['target'] = person(preview) if preview else None
                    if preview:
                        result['reply'] += ' Completa la persona preesistente con lo stesso nome e cognome, senza duplicarla.'
                draft = result.get('save')
                if draft:
                    try:
                        async with connection.transaction():
                            # A stale screen never authorizes a write after concurrent corrections.
                            if (stored.get('actorId'), stored.get('actorRevision')) != ((actor or {}).get('id'), (actor or {}).get('identity_revision')):
                                raise ValueError('Stale manager identity')
                            target = draft.get('target')
                            if target:
                                current = next((p for p in people if p['id'] == target['id']), None)
                                if draft['operation'] == 'bootstrap':
                                    current = person(await connection.fetchrow('SELECT * FROM studio_private.preview_manager_bootstrap($1,$2,$3,$4)', sender, self.manager, draft['firstName'], draft['lastName']))
                                if not current or current['identity_revision'] != target['identity_revision']:
                                    raise ValueError('Stale identity')
                            await connection.fetch('SELECT * FROM studio_private.manage_teacher_identity($1,$2,$3,$4,$5,$6,$7)', sender, self.manager, draft['operation'], int(target['id']) if target else None, draft.get('firstName'), draft.get('lastName'), draft.get('phone'))
                    except (ValueError, asyncpg.PostgresError, asyncio.TimeoutError):
                        result['reply'] = 'Salvataggio rifiutato: dati duplicati, modificati o permessi non validi. Riparti con /anagrafica.'
                # An expired/interrupted flow stays latched across restarts until explicit exit/re-entry.
                if state and state['expires'] <= data['now'] and not next_state and text.strip().lower() not in ('/annulla', '/anagrafica'):
                    next_state = dict(step='interrupted', expires=0)
                if next_state:
                    value = json.dumps(dict(instance=self.instance, state=next_state, actorId=(actor or {}).get('id'), actorRevision=(actor or {}).get('identity_revision')))
                    await connection.execute('INSERT INTO studio_private.management_sessions VALUES ($1,$2) ON CONFLICT(sender_hash) DO UPDATE SET state=excluded.state', key, value)
                else:
                    await connection.execute('DELETE FROM studio_private.management_sessions WHERE sender_hash=$1', key)
                return result['reply']

    async def handle(self, request):
        if not self.broker.authorized(request):
            return web.Response(status=403)
        body = await request.read()
        import hmac
        signature = request.headers.get('X-Hub-Signature-256', '')
        expected = 'sha256=' + hmac.new(self.broker.app_secret, body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature.encode(), expected.encode()):
            return web.Response(status=401)
        if not self.manager:
            return web.Response(status=503)
        try:
            payload = json.loads(body)
            if payload.get('object') != 'whatsapp_business_account':
                raise ValueError('Invalid payload')
            replies = []
            for entry in payload.get('entry', []):
                for change in entry.get('changes', []):
                    value = change.get('value') or {}
                    if change.get('field') != 'messages':
                        continue
                    kept = []
                    for message in value.get('messages', []):
                        sender = message.get('from', '')
                        valid = (str((value.get('metadata') or {}).get('phone_number_id', '')) == self.broker.phone_id
                                 and isinstance(sender, str) and re.fullmatch(r'[1-9][0-9]{7,14}', sender)
                                 and not message.get('chat') and isinstance(message.get('id'), str) and 0 < len(message['id']) <= 512
                                 and isinstance(message.get('timestamp'), str) and re.fullmatch(r'[0-9]{1,12}', message['timestamp'])
                                 and -30 <= time.time()-int(message['timestamp']) <= 300)
                        if not valid:
                            continue
                        reply = await self.message(sender, message)
                        if reply is None:
                            kept.append(message)
                        elif reply:
                            replies.append(dict(to=sender, text=reply))
                    value['messages'] = kept
            return web.json_response(dict(payload=payload, replies=replies))
        except asyncio.CancelledError:
            self.instance = secrets.token_hex(32)
            raise
        except (ValueError, TypeError, AttributeError, KeyError, asyncpg.PostgresError, asyncio.TimeoutError):
            # A failed/ambiguous request must not leave a pending confirmation
            # executable by a later replay in this broker process.
            self.instance = secrets.token_hex(32)
            return web.Response(status=503)
