"""Relay the synthetic gateway credential to a host Unix socket, without a real key."""
from aiohttp import ClientSession, ClientTimeout, UnixConnector, web


async def relay(request):
    if request.method not in ('GET', 'POST') or not request.path.startswith('/api/v1/'):
        return web.Response(status=403)
    headers = {key: value for key, value in request.headers.items()
               if key.lower() not in ('host', 'connection', 'transfer-encoding')}
    async with ClientSession(connector=UnixConnector(path='/run/host-proxy/socket'),
                             timeout=ClientTimeout(total=180), trust_env=False,
                             auto_decompress=False) as session:
        body = request.content.iter_chunked(65536) if request.can_read_body else None
        async with session.request(request.method, 'http://localhost' + str(request.rel_url),
                                   headers=headers, data=body) as upstream:
            forwarded = {key: value for key, value in upstream.headers.items()
                         if key.lower() not in ('connection', 'transfer-encoding')}
            response = web.StreamResponse(status=upstream.status, headers=forwarded)
            await response.prepare(request)
            async for chunk in upstream.content.iter_chunked(65536):
                await response.write(chunk)
            await response.write_eof()
            return response


app = web.Application(client_max_size=8 * 1024 * 1024)
app.router.add_route('*', '/{path:.*}', relay)
web.run_app(app, host='0.0.0.0', port=8089, access_log=None, print=None)
