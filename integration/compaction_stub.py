"""Deterministic OpenAI-compatible model for the isolated compaction test.

Only synthetic markers are recorded, never message text. Summaries repeat the
markers they received in lower case, so tests can tell verbatim turns from
summarised ones and detect cross-sender leaks in either form.
"""

import json
import re
from aiohttp import web

MODEL = 'synthetic/compaction-model'
WINDOW = 200_000
MARKER = re.compile(r'MARK-[A-Z]+-\d+', re.IGNORECASE)
state = {'fail_summary': False}
observations = []


def text(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return ''.join(str(part.get('text', '')) for part in content if isinstance(part, dict))
    return ''


async def models(request):
    return web.json_response({'object': 'list', 'data': [{'id': MODEL, 'context_length': WINDOW}]})


async def observe(request):
    return web.json_response(observations)


async def control(request):
    state.update(await request.json())
    return web.json_response(state)


async def chat(request):
    body = await request.json()
    messages = body.get('messages', [])
    joined = '\n'.join(text(item.get('content')) for item in messages)
    tools = body.get('tools') or []
    size = sum(len(text(item.get('content'))) for item in messages) + len(json.dumps(tools))
    last_user = next((text(item.get('content')) for item in reversed(messages) if item.get('role') == 'user'), '')
    if tools:
        kind = 'turn'
    elif 'TURNS TO SUMMARIZE' in joined or 'context checkpoint' in joined:
        kind = 'summary'
    else:
        kind = 'aux'
    # Record only a boolean, never the request or the synthetic phone itself.
    wire = json.dumps(body, ensure_ascii=False)
    private_phone = any(re.search(r'[ .()+\-\u00a0]*'.join(number), wire)
                        for number in ('15555550102', '15555550103', '15555550901', '15555550902', '15555550903', '15555550904'))
    observations.append({
        'kind': kind, 'model': body.get('model'), 'chars': size, 'last_role': messages[-1].get('role') if messages else None,
        'private_phone': private_phone,
        'private_management': any(value in wire for value in ('CorrectedManager', 'ChangedAgain', 'LegacyManager')),
        'verbatim': sorted({m for m in MARKER.findall(joined) if m == m.upper()}),
        'all': sorted({m.upper() for m in MARKER.findall(joined)}),
        'current': [m for m in MARKER.findall(last_user) if m == m.upper()],
        'summary_in_context': 'synthetic-summary' in joined.lower(),
        'soul': 'Assistente dello studio Pilates' in joined,
        'clock': 'Data e ora correnti (Europe/Rome):' in joined,
    })
    if kind != 'turn' and state['fail_summary']:
        return web.json_response({'error': {'message': 'synthetic summary failure', 'code': 503}}, status=503)
    if kind == 'summary':
        markers = ' '.join(m.lower() for m in sorted({m.upper() for m in MARKER.findall(joined)}))
        message = {'role': 'assistant', 'content': f'synthetic-summary of {markers}'}
        finish = 'stop'
    elif kind == 'turn' and ('REGISTER' in last_user or 'ENROLL' in last_user) and messages[-1].get('role') != 'tool':
        query = ("INSERT INTO app.teachers (first_name,last_name) VALUES ('Forbidden','Synthetic') RETURNING id"
                 if 'ENROLL' in last_user else
                 "INSERT INTO app.clients (first_name, last_name, created_by_phone, created_by_name) "
                 "VALUES ('compaction', 'synthetic', '999', 'forged') RETURNING id")
        message = {'role': 'assistant', 'content': None, 'tool_calls': [{
            'id': 'synthetic-register', 'type': 'function',
            'function': {'name': 'studio_sql_query', 'arguments': json.dumps({'query': query})}}]}
        finish = 'tool_calls'
    else:
        message = {'role': 'assistant', 'content': 'Risposta sintetica.'}
        finish = 'stop'
    base = {'id': 'synthetic-completion', 'object': 'chat.completion', 'created': 1, 'model': MODEL,
            'choices': [{'index': 0, 'message': message, 'finish_reason': finish}],
            'usage': {'prompt_tokens': size // 4, 'completion_tokens': 10, 'total_tokens': size // 4 + 10}}
    if not body.get('stream'):
        return web.json_response(base)
    response = web.StreamResponse(headers={'Content-Type': 'text/event-stream'})
    await response.prepare(request)
    delta = dict(message)
    if delta.get('tool_calls'):
        delta['tool_calls'] = [{**call, 'index': i} for i, call in enumerate(delta['tool_calls'])]
    chunk = {'id': base['id'], 'object': 'chat.completion.chunk', 'created': 1, 'model': MODEL,
             'choices': [{'index': 0, 'delta': delta, 'finish_reason': None}]}
    await response.write(('data: ' + json.dumps(chunk) + '\n\n').encode())
    chunk['choices'] = [{'index': 0, 'delta': {}, 'finish_reason': finish}]
    chunk['usage'] = base['usage']
    await response.write(('data: ' + json.dumps(chunk) + '\n\ndata: [DONE]\n\n').encode())
    await response.write_eof()
    return response


app = web.Application(client_max_size=32 * 1024 * 1024)
app.router.add_get('/v1/models', models)
app.router.add_get('/v1/observations', observe)
app.router.add_post('/v1/control', control)
app.router.add_post('/v1/chat/completions', chat)
web.run_app(app, host='0.0.0.0', port=8088, print=None, access_log=None)
