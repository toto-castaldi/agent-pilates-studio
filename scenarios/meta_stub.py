"""Ephemeral local substitute for the outgoing Meta Graph messages endpoint."""
import secrets
from aiohttp import web

messages = []
aggregate_queries = 0


async def record_aggregate(request):
    global aggregate_queries
    aggregate_queries += 1
    return web.Response(status=204)


async def query_observations(request):
    return web.json_response({'aggregates': aggregate_queries})


async def post_message(request):
    body = await request.json()
    if body.get('type') == 'text':
        text = body.get('text', {}).get('body')
        if isinstance(text, str):
            messages.append({'to': body.get('to'), 'text': text})
    return web.json_response({'messages': [{'id': 'synthetic-out-' + secrets.token_hex(8)}]})


async def observations(request):
    return web.json_response(messages)


app = web.Application(client_max_size=1024 * 1024)
app.router.add_post('/{version}/{phone}/messages', post_message)
app.router.add_get('/observations', observations)
app.router.add_post('/synthetic-aggregate', record_aggregate)
app.router.add_get('/synthetic-query-observations', query_observations)
web.run_app(app, host='0.0.0.0', port=8088, access_log=None, print=None)
