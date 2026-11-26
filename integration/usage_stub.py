"""Deterministic OpenRouter-like model for the isolated usage-metrics test.

Every response carries an OpenRouter-style usage block with `cost`, also in the
last chunk of a stream. Only numbers and fixed kinds are recorded, never text.
"""

import asyncio
import json
from aiohttp import web

# An OpenRouter family prefix: Hermes sends the reasoning level only to those.
MODEL = 'openai/synthetic-usage-model'
# OpenRouter may route to another model: the served one is what is recorded.
SERVED = 'openai/synthetic-usage-served'
WINDOW = 200_000
COST = {'turn': 0.000125, 'summary': 0.0005, 'aux': 0.000003}
state = {'omit_cost': False, 'delay': 0}
observations = []


def text(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return ''.join(str(part.get('text', '')) for part in content if isinstance(part, dict))
    return ''


async def models(request):
    return web.json_response({'object': 'list', 'data': [{
        'id': MODEL, 'context_length': WINDOW, 'supported_parameters': ['reasoning', 'include_reasoning', 'tools']}]})


async def observe(request):
    return web.json_response(observations)


async def control(request):
    state.update(await request.json())
    return web.json_response(state)


def tool_call(index, name, query):
    return {'id': f'synthetic-call-{index}', 'type': 'function',
            'function': {'name': name, 'arguments': json.dumps({'query': query})}}


async def chat(request):
    body = await request.json()
    messages = body.get('messages', [])
    joined = '\n'.join(text(item.get('content')) for item in messages)
    tools = body.get('tools') or []
    size = sum(len(text(item.get('content'))) for item in messages) + len(json.dumps(tools))
    last_user = next((text(item.get('content')) for item in reversed(messages) if item.get('role') == 'user'), '')
    after_tool = bool(messages) and messages[-1].get('role') == 'tool'
    if tools:
        kind = 'turn'
    elif 'TURNS TO SUMMARIZE' in joined or 'context checkpoint' in joined:
        kind = 'summary'
    else:
        kind = 'aux'
    if 'SLOW' in last_user and kind == 'turn' and not after_tool:
        await asyncio.sleep(4)
    if state['delay']:
        await asyncio.sleep(state['delay'])
    if request.transport is None or request.transport.is_closing():
        # Abandoned by Hermes (interrupted turn): no response, nothing to account.
        return web.Response(status=499)
    if kind == 'summary':
        message, finish = {'role': 'assistant', 'content': 'synthetic-summary'}, 'stop'
    elif kind == 'turn' and 'TOOLS' in last_user and not after_tool:
        message = {'role': 'assistant', 'content': None, 'tool_calls': [
            tool_call(0, 'studio_sql_query', 'SELECT count(*) FROM app.clients'),
            tool_call(1, 'studio_sql_query', 'SELECT 1'),
            tool_call(2, 'terminal', 'id'),
        ]}
        finish = 'tool_calls'
    elif kind == 'turn' and 'METRICS' in last_user and not after_tool:
        # The agent's own SQL access must not reach the usage events.
        message = {'role': 'assistant', 'content': None, 'tool_calls': [
            tool_call(0, 'studio_sql_query', 'SELECT count(*) FROM studio_private.usage_events'),
            tool_call(1, 'studio_sql_query', 'SELECT studio_private.record_usage_event(NULL, NULL)'),
        ]}
        finish = 'tool_calls'
    else:
        message, finish = {'role': 'assistant', 'content': 'Risposta sintetica.'}, 'stop'
    prompt, completion = size // 4, 10 + len(observations) % 7
    usage = {'prompt_tokens': prompt, 'completion_tokens': completion, 'total_tokens': prompt + completion,
             'prompt_tokens_details': {'cached_tokens': 0}, 'completion_tokens_details': {'reasoning_tokens': 0}}
    if not state['omit_cost']:
        usage['cost'] = COST[kind]
        usage['cost_details'] = {'upstream_inference_cost': None}
    observations.append({
        'kind': kind, 'prompt_tokens': prompt, 'completion_tokens': completion,
        'cost': usage.get('cost'), 'reasoning': body.get('reasoning'), 'stream': bool(body.get('stream')),
        'tool_calls': len(message.get('tool_calls') or []),
    })
    base = {'id': f'gen-synthetic-{len(observations)}', 'provider': 'Synthetic', 'object': 'chat.completion',
            'created': 1, 'model': SERVED, 'choices': [{'index': 0, 'message': message, 'finish_reason': finish}],
            'usage': usage}
    if not body.get('stream'):
        return web.json_response(base)
    response = web.StreamResponse(headers={'Content-Type': 'text/event-stream'})
    await response.prepare(request)
    delta = dict(message)
    if delta.get('tool_calls'):
        delta['tool_calls'] = [{**call, 'index': i} for i, call in enumerate(delta['tool_calls'])]
    chunk = {'id': base['id'], 'provider': 'Synthetic', 'object': 'chat.completion.chunk', 'created': 1, 'model': SERVED,
             'choices': [{'index': 0, 'delta': delta, 'finish_reason': None}]}
    await response.write(('data: ' + json.dumps(chunk) + '\n\n').encode())
    chunk['choices'] = [{'index': 0, 'delta': {}, 'finish_reason': finish}]
    chunk['usage'] = usage
    await response.write(('data: ' + json.dumps(chunk) + '\n\ndata: [DONE]\n\n').encode())
    await response.write_eof()
    return response


app = web.Application(client_max_size=32 * 1024 * 1024)
app.router.add_get('/v1/models', models)
app.router.add_get('/v1/observations', observe)
app.router.add_post('/v1/control', control)
app.router.add_post('/v1/chat/completions', chat)
web.run_app(app, host='0.0.0.0', port=8088, print=None, access_log=None)
