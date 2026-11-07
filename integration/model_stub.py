"""Deterministic OpenAI-compatible model for isolated author-attribution tests."""

import json
from aiohttp import web

# Kept only in this isolated synthetic server; never used in the real stack.
observations = []


async def observe(request):
    return web.json_response(observations)


async def models(request):
    return web.json_response({'object': 'list', 'data': [
        {'id': 'synthetic/test-model', 'object': 'model', 'context_length': 65536},
        {'id': 'synthetic/updated-model', 'object': 'model', 'context_length': 131072},
    ]})


async def chat(request):
    body = await request.json()
    messages = body.get('messages', [])
    last_user = next((str(item.get('content', '')) for item in reversed(messages) if item.get('role') == 'user'), '')
    system = next((str(item.get('content', '')) for item in messages if item.get('role') == 'system'), '')
    observations.append({'user': last_user, 'system': system, 'last_role': messages[-1].get('role') if messages else None})
    if 'context-probe' in last_user or not body.get('tools') or (messages and messages[-1].get('role') == 'tool'):
        choice = {'index': 0, 'message': {'role': 'assistant', 'content': 'Completato.'}, 'finish_reason': 'stop'}
    else:
        last = next((str(item.get('content', '')) for item in reversed(messages) if item.get('role') == 'user'), '')
        if 'attendance-insert' in last:
            queries = ["INSERT INTO app.attendance (client_id, lesson_date, start_time, outcome, created_by_phone, created_by_name) SELECT id, '2020-01-01', '09:00', 'present', '999', 'forged' FROM app.clients WHERE first_name = 'alpha' RETURNING id"]
        elif 'attendance-cancel' in last:
            queries = ["UPDATE app.attendance SET cancelled_at = clock_timestamp(), cancelled_by_phone = '999', cancelled_by_name = 'forged', cancellation_reason = 'synthetic reason' WHERE outcome = 'present' RETURNING id"]
        elif 'deactivate-alpha' in last:
            queries = ["UPDATE app.training_rules SET deactivated_at = clock_timestamp(), deactivated_by_phone = '999', deactivated_by_name = 'forged', deactivation_reason = 'synthetic reason' WHERE rule_text = 'alpha rule' RETURNING id"]
        else:
            marker = 'alpha' if 'alpha' in last else 'beta'
            queries = [
                f"INSERT INTO app.clients (first_name, last_name, created_by_phone, created_by_name) VALUES ('{marker}', 'synthetic', '999', 'forged') RETURNING id",
                f"INSERT INTO app.training_rules (rule_text, created_by_phone, created_by_name) VALUES ('{marker} rule', '999', 'forged') RETURNING id",
            ]
        calls = [{'id': f'synthetic-call-{i}', 'type': 'function', 'function': {'name': 'studio_sql_query',
                  'arguments': json.dumps({'query': query, 'author': {'phone': '999', 'name': 'forged'}})}}
                 for i, query in enumerate(queries)]
        calls.append({'id': 'synthetic-forbidden', 'type': 'function', 'function': {'name': 'terminal',
                      'arguments': json.dumps({'command': 'touch /tmp/pilates-injection-marker'})}})
        choice = {'index': 0, 'message': {'role': 'assistant', 'content': None, 'tool_calls': calls}, 'finish_reason': 'tool_calls'}
    base = {'id': 'synthetic-completion', 'object': 'chat.completion', 'created': 1,
            'model': 'synthetic/test-model', 'choices': [choice],
            'usage': {'prompt_tokens': 10, 'completion_tokens': 10, 'total_tokens': 20}}
    if not body.get('stream'):
        return web.json_response(base)
    response = web.StreamResponse(headers={'Content-Type': 'text/event-stream'})
    await response.prepare(request)
    delta = choice['message'].copy()
    for i, call in enumerate(delta.get('tool_calls', [])):
        call['index'] = i
    chunk = {'id': base['id'], 'object': 'chat.completion.chunk', 'created': 1, 'model': base['model'],
             'choices': [{'index': 0, 'delta': delta, 'finish_reason': None}]}
    await response.write(('data: ' + json.dumps(chunk) + '\n\n').encode())
    chunk['choices'] = [{'index': 0, 'delta': {}, 'finish_reason': choice['finish_reason']}]
    await response.write(('data: ' + json.dumps(chunk) + '\n\ndata: [DONE]\n\n').encode())
    await response.write_eof()
    return response


app = web.Application()
app.router.add_get('/v1/models', models)
app.router.add_get('/v1/observations', observe)
app.router.add_post('/v1/chat/completions', chat)
web.run_app(app, host='0.0.0.0', port=8088, print=None, access_log=None)
