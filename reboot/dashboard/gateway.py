"""The dashboard's front door: a gateway on the dashboard's port, and
the tunnel through which an MCP App reaches it.

`rbt dashboard` runs the dashboard application on a port of its own,
reachable only from this machine, and serves it through the gateway
here on the port the developer knows. The gateway listens on this
machine's loopback interface, for the browser and for MCP hosts on
this machine. Every request it forwards carries the dashboard's
credential, which the application requires of every RPC: the
browser's page is given it, written into the page, and an MCP host is
given it the way every Reboot MCP App is given one, in the result of
the tool that opens the App. Requests forwarded from here also name
the address the App should call the dashboard back on, which is the
tunnel's when there is one.

An MCP host shows the App in a sandbox of its own that cannot reach
this machine, so a Cloudflare quick tunnel forwards the App's calls to
a second listener, on a port of its own. Only the dashboard's RPCs are
forwarded on from there, and the application answers those only with
the credential; no page, recording or MCP endpoint is reachable
through the tunnel.

The credential is minted for each launch and lives in the gateway, the
application and the pages the gateway serves. A page from any other
origin is refused by `Host` and `Origin`, so that a website cannot
acquire the credential by fetching the page, or by rebinding a name of
its own to this machine.
"""
import aiohttp
import asyncio
import json
import re
import shutil
import socket
from aiohttp import web
from collections import deque
from collections.abc import AsyncIterator, Awaitable, Mapping
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from reboot.cli.common.subprocesses import Subprocesses
from typing import Any, TypeVar

# Where every Reboot RPC is served, which is all the tunnel forwards:
# the application serves only the dashboard's own state types, and
# each of them answers only to the credential.
_RPC_PATH_PREFIX = '/__/reboot/rpc/'

# How long a tunnel gets to publish its address before it is given up
# on. Cloudflare usually answers in a few seconds.
_TUNNEL_START_TIMEOUT_SECONDS = 60

# What a Cloudflare quick tunnel prints its address as, somewhere in
# its diagnostics, which is the only place it says it.
_TUNNEL_URL = re.compile(rb'https://[a-z0-9-]+\.trycloudflare\.com')

# Headers that describe one hop rather than the request, which a
# proxy must not forward (RFC 9110, section 7.6.1), plus
# `Content-Length`, which is for the body as it is sent on.
_HOP_BY_HOP_HEADERS = frozenset(
    {
        'connection',
        'content-length',
        'keep-alive',
        'proxy-authenticate',
        'proxy-authorization',
        'te',
        'trailer',
        'transfer-encoding',
        'upgrade',
    }
)

T = TypeVar('T')


class TunnelError(Exception):
    """A tunnel that could not be started, or that stopped."""


def _end_to_end_headers(headers: Mapping[str, str]) -> dict[str, str]:
    """The headers to forward: everything but the hop-by-hop ones,
    including those the `Connection` header names as such."""
    connection = next(
        (
            value for name, value in headers.items()
            if name.lower() == 'connection'
        ),
        '',
    )
    excluded = _HOP_BY_HOP_HEADERS | {
        name.strip().lower() for name in connection.split(',')
    }
    return {
        name: value
        for name, value in headers.items()
        if name.lower() not in excluded
    }


def _with_token(html: str, token: str) -> str:
    """The page with the credential written into it, which the page
    reads from `window.REBOOT_DASHBOARD_TOKEN` before anything else
    runs."""
    script = (
        '<script>window.REBOOT_DASHBOARD_TOKEN=' +
        json.dumps(token).replace('<', '\\u003c') + ';</script>'
    )
    return html.replace('<head>', '<head>' + script, 1)


class DashboardGateway:
    """Forwards requests to the dashboard application; see the module
    docstring."""

    def __init__(
        self,
        *,
        client: aiohttp.ClientSession,
        port: int,
        backend_port: int,
        token: str,
    ):
        self._client = client
        self._port = port
        self._upstream = f'http://127.0.0.1:{backend_port}'
        self._token = token
        # The address an MCP App is told to call the dashboard back
        # on: this machine, until a tunnel says otherwise.
        self.public_url = f'http://127.0.0.1:{port}'

    def _from_this_machine(self, request: web.Request) -> bool:
        """Whether a request comes from a page of ours, or from no page
        at all (an MCP host, `rbt dev run`), rather than from some
        other website's page, which can fetch this machine too, or
        point a name of its own at it; only `Host` and `Origin` tell
        those apart."""
        authorities = {f'localhost:{self._port}', f'127.0.0.1:{self._port}'}
        return (
            request.host in authorities and request.headers.get('Origin')
            in {None, *(f'http://{authority}' for authority in authorities)}
        )

    async def local(self, request: web.Request) -> web.StreamResponse:
        """The listener on the dashboard's port."""
        if not self._from_this_machine(request):
            raise web.HTTPForbidden()
        return await self._forward(request, trusted=True)

    async def public(self, request: web.Request) -> web.StreamResponse:
        """The listener the tunnel forwards to."""
        if not request.path.startswith(_RPC_PATH_PREFIX):
            raise web.HTTPNotFound()
        return await self._forward(request, trusted=False)

    def _request_headers(self, request: web.Request, *,
                         trusted: bool) -> dict[str, str]:
        headers = {
            name: value
            for name, value in _end_to_end_headers(request.headers).items()
            # The upstream has its own `Host`; `Accept-Encoding` is
            # dropped so that a page arrives as text to write the
            # credential into; `X-Forwarded-*` is for this gateway to
            # say; and the WebSocket handshake is the client's own.
            if name.lower() not in {'host', 'accept-encoding'} and
            not name.lower().startswith(('x-forwarded-', 'sec-websocket-'))
        }
        if trusted:
            headers['Authorization'] = f'Bearer {self._token}'
            # What the application tells an MCP App to call back on;
            # see `reboot_url_from_request` in `reboot.mcp.context`.
            scheme, _, host = self.public_url.partition('://')
            headers['X-Forwarded-Proto'] = scheme
            headers['X-Forwarded-Host'] = host
        return headers

    async def _forward(
        self, request: web.Request, *, trusted: bool
    ) -> web.StreamResponse:
        headers = self._request_headers(request, trusted=trusted)
        url = self._upstream + request.raw_path
        try:
            if request.headers.get('Upgrade', '').lower() == 'websocket':
                return await self._relay_websocket(request, url, headers)
            async with self._client.request(
                request.method,
                url,
                headers=headers,
                data=await request.read(),
                allow_redirects=False,
            ) as upstream:
                response_headers = _end_to_end_headers(upstream.headers)
                # Pages carry the credential, so no cache may keep one.
                response_headers['Cache-Control'] = 'no-store'
                if trusted:
                    # The application allows any origin; this listener
                    # allows only its own, checked above.
                    response_headers = {
                        name: value
                        for name, value in response_headers.items()
                        if not name.lower().startswith('access-control-')
                    }
                    if 'text/html' in upstream.headers.get('Content-Type', ''):
                        return web.Response(
                            status=upstream.status,
                            headers=response_headers,
                            body=_with_token(
                                await upstream.text(), self._token
                            ).encode(),
                        )
                response = web.StreamResponse(
                    status=upstream.status, headers=response_headers
                )
                await response.prepare(request)
                async for chunk in upstream.content.iter_any():
                    await response.write(chunk)
                await response.write_eof()
                return response
        except aiohttp.ClientError as error:
            # Nothing of the upstream's response goes into the reply or
            # a log: it could hold the credential.
            raise web.HTTPBadGateway(
                text='Dashboard backend unavailable'
            ) from error

    async def _relay_websocket(
        self, request: web.Request, url: str, headers: dict[str, str]
    ) -> web.WebSocketResponse:
        """Relays frames both ways until either side closes. Reboot's
        reactive reads and writes are WebSockets, carrying their
        credential in their messages."""
        async with self._client.ws_connect(url, headers=headers) as upstream:
            downstream = web.WebSocketResponse()
            await downstream.prepare(request)

            async def relay(source: Any, destination: Any) -> None:
                async for message in source:
                    if message.type == aiohttp.WSMsgType.BINARY:
                        await destination.send_bytes(message.data)
                    elif message.type == aiohttp.WSMsgType.TEXT:
                        await destination.send_str(message.data)
                await destination.close()

            relays = [
                asyncio.create_task(relay(downstream, upstream)),
                asyncio.create_task(relay(upstream, downstream)),
            ]
            try:
                done, _ = await asyncio.wait(
                    relays, return_when=asyncio.FIRST_COMPLETED
                )
                for relay_task in done:
                    await relay_task
            finally:
                for relay_task in relays:
                    relay_task.cancel()
                await asyncio.gather(*relays, return_exceptions=True)
            return downstream


@asynccontextmanager
async def _listen(handler: Any, port: int) -> AsyncIterator[int]:
    """Serves `handler` on loopback at `port`, or at a free port when
    `port` is 0, yielding the port; raises `OSError` when the port is
    taken."""
    app = web.Application()
    app.router.add_route('*', '/{path:.*}', handler)
    # Reboot's reactive reads and MCP's streams stay open on purpose;
    # cancelling a handler when its client goes away is what releases
    # the connection it holds to the application.
    runner = web.AppRunner(app, access_log=None, handler_cancellation=True)
    await runner.setup()
    with socket.socket() as sock:
        try:
            # So that a dashboard restarted on the same port is not
            # refused it while the last one's connections linger.
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind(('127.0.0.1', port))
            await web.SockSite(runner, sock).start()
            yield sock.getsockname()[1]
        finally:
            await runner.cleanup()


@asynccontextmanager
async def dashboard_gateway(
    *,
    port: int,
    backend_port: int,
    token: str,
) -> AsyncIterator[DashboardGateway]:
    """Serves the gateway on `port`, forwarding to the application on
    `backend_port`, until the block ends."""
    async with aiohttp.ClientSession(
        # Forwarded as sent: the upstream was told not to compress.
        auto_decompress=False,
        # Reactive reads and MCP streams are as long as their clients
        # keep them; only connecting has a deadline.
        timeout=aiohttp.ClientTimeout(total=None, sock_connect=10),
        connector=aiohttp.TCPConnector(limit=0),
    ) as client:
        gateway = DashboardGateway(
            client=client,
            port=port,
            backend_port=backend_port,
            token=token,
        )
        async with _listen(gateway.local, port):
            yield gateway


class DashboardTunnel:
    """A running tunnel: its address, and the means to stop with it."""

    def __init__(
        self,
        *,
        url: str,
        process: asyncio.subprocess.Process,
        diagnostics: 'deque[str]',
        drain: asyncio.Task,
    ):
        self.url = url
        self._process = process
        self._diagnostics = diagnostics
        self._drain = drain

    async def run(self, awaitable: Awaitable[T]) -> T:
        """Awaits `awaitable` for as long as the tunnel runs. A tunnel
        that stops first ends it, and is a `TunnelError`: the address
        the MCP App was given no longer reaches the dashboard."""
        task = asyncio.ensure_future(awaitable)
        exited = asyncio.ensure_future(self._process.wait())
        try:
            await asyncio.wait(
                {task, exited}, return_when=asyncio.FIRST_COMPLETED
            )
            if task.done():
                return task.result()
            # Give the last of what the tunnel said time to be read.
            with suppress(asyncio.TimeoutError):
                await asyncio.wait_for(self._drain, timeout=1)
            raise TunnelError(
                'Dashboard tunnel stopped: ' + '\n'.join(self._diagnostics)
            )
        finally:
            task.cancel()
            exited.cancel()
            await asyncio.gather(task, exited, return_exceptions=True)


async def _cloudflared(subprocesses: Subprocesses) -> str:
    """The `cloudflared` executable to run: the developer's own when
    they have one, otherwise the pinned, checksum-verified one the
    Reboot plugin installs, by the plugin's own installer, packaged
    beside this module and sharing the plugin's cache."""
    executable = shutil.which('cloudflared')
    if executable is not None:
        return executable
    async with subprocesses.exec(
        'sh',
        str(Path(__file__).with_name('install_cloudflared.sh')),
        stdout=asyncio.subprocess.PIPE,
    ) as process:
        stdout, _ = await process.communicate()
        if process.returncode != 0:
            raise TunnelError(
                'Could not install cloudflared for the dashboard'
            )
        return str(Path(stdout.decode().strip()) / 'cloudflared')


@asynccontextmanager
async def cloudflare_tunnel(
    gateway: DashboardGateway,
    *,
    subprocesses: Subprocesses,
) -> AsyncIterator[DashboardTunnel]:
    """Runs a Cloudflare quick tunnel to the gateway's public listener
    until the block ends, telling the gateway its address. Raises
    `TunnelError` when no tunnel could be started, with what
    `cloudflared` said about it."""
    async with _listen(gateway.public, 0) as public_port:
        executable = await _cloudflared(subprocesses)
        async with subprocesses.exec(
            executable,
            'tunnel',
            '--url',
            f'http://127.0.0.1:{public_port}',
            '--no-autoupdate',
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        ) as process:
            assert process.stdout is not None
            output = process.stdout
            # The last of what `cloudflared` said, for when it fails.
            diagnostics: deque[str] = deque(maxlen=8)

            async def published_url() -> str:
                while line := await output.readline():
                    diagnostics.append(line.decode(errors='replace').strip())
                    match = _TUNNEL_URL.search(line)
                    if match is not None:
                        return match[0].decode()
                raise TunnelError(
                    'cloudflared exited before publishing a dashboard URL'
                )

            try:
                url = await asyncio.wait_for(
                    published_url(), timeout=_TUNNEL_START_TIMEOUT_SECONDS
                )
            except (asyncio.TimeoutError, TunnelError) as error:
                raise TunnelError(
                    'Dashboard tunnel failed to start: ' +
                    '\n'.join(diagnostics)
                ) from error

            async def drain() -> None:
                async for line in output:
                    diagnostics.append(line.decode(errors='replace').strip())

            drain_task = asyncio.create_task(drain())
            gateway.public_url = url
            try:
                yield DashboardTunnel(
                    url=url,
                    process=process,
                    diagnostics=diagnostics,
                    drain=drain_task,
                )
            finally:
                drain_task.cancel()
                await asyncio.gather(drain_task, return_exceptions=True)
