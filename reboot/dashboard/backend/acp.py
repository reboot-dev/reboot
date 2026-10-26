"""Opt-in local ACP v1 process host. No provider credentials cross HTTP.

The adapter executes with the developer's privileges, NOT in a cwd sandbox.
Only trusted CLI configuration can select commands, environment or workspace.
"""
import asyncio
import contextlib
import json
import os
import secrets
import signal
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from starlette.exceptions import HTTPException
from starlette.requests import Request
from starlette.responses import JSONResponse, StreamingResponse

CONFIG_ENV = 'RBT_DASHBOARD_ACP_CONFIG'
ORIGIN_ENV = 'RBT_DASHBOARD_ACP_ORIGIN'
MAX_BODY = 65536
MAX_FRAME = 2 * 1024 * 1024


@dataclass(frozen=True)
class Config:
    cwd: Path
    providers: dict[str, list[str]]

    @classmethod
    def read(cls, filename: str, cwd: Path) -> 'Config':
        value = json.loads(Path(filename).read_text())
        if not isinstance(value, dict) or set(value) != {'providers'}:
            raise ValueError('ACP config must contain only providers')
        providers = value['providers']
        if not isinstance(providers, dict) or not providers:
            raise ValueError('ACP providers must be a non-empty object')
        for name, command in providers.items():
            if name not in ('claude', 'codex') or not isinstance(command, list) or not command:
                raise ValueError('ACP provider must be claude or codex with an argv array')
            if not all(isinstance(arg, str) and arg and '\x00' not in arg for arg in command):
                raise ValueError('ACP argv must contain non-empty strings')
            if not Path(command[0]).is_absolute() or not os.access(command[0], os.X_OK):
                raise ValueError('ACP executable must be an executable absolute path')
        return cls(cwd.resolve(strict=True), providers)


def local_origin(origin: str) -> bool:
    try:
        url = urlsplit(origin)
        return (url.scheme in ('http', 'https') and url.hostname in ('localhost', '127.0.0.1', '::1')
                and not url.username and not url.password and not url.path and not url.query and not url.fragment
                and url.port is not None)
    except ValueError:
        return False


async def body(request: Request) -> dict:
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > MAX_BODY:
            raise HTTPException(413)
    try:
        value = json.loads(data)
    except (ValueError, UnicodeError):
        raise HTTPException(400)
    if not isinstance(value, dict):
        raise HTTPException(400)
    return value


class Peer:
    """One subprocess, one ACP session and one browser stream."""

    def __init__(self, config: Config, provider: str):
        self.config, self.provider = config, provider
        self.process = None
        self.tasks: list[asyncio.Task] = []
        self.pending: dict[int, asyncio.Future] = {}
        self.permissions: dict[str, tuple[Any, list[dict]]] = {}
        self.events: asyncio.Queue = asyncio.Queue(maxsize=256)
        self.sequence = 0
        self.session = None
        self.capabilities: dict = {}
        self.turn = None
        self.closed = False
        self.channel = secrets.token_urlsafe(32)

    def emit(self, event: dict):
        # Never let a disconnected/slow browser cause unbounded memory growth.
        self.events.put_nowait(event)

    async def write(self, message: dict):
        if self.closed or self.process is None or self.process.stdin is None:
            raise RuntimeError('ACP process is closed')
        self.process.stdin.write((json.dumps({'jsonrpc': '2.0', **message}) + '\n').encode())
        await self.process.stdin.drain()

    async def call(self, method: str, params: dict, timeout: float = 30):
        self.sequence += 1
        number = self.sequence
        future = asyncio.get_running_loop().create_future()
        self.pending[number] = future
        try:
            await self.write({'id': number, 'method': method, 'params': params})
            return await asyncio.wait_for(future, timeout)
        finally:
            self.pending.pop(number, None)

    async def start(self, previous: str | None = None):
        self.process = await asyncio.create_subprocess_exec(
            *self.config.providers[self.provider], cwd=self.config.cwd,
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
            # Adapter diagnostics may contain credentials: don't forward them.
            stderr=asyncio.subprocess.DEVNULL, start_new_session=True,
            limit=MAX_FRAME,
        )
        self.tasks.append(asyncio.create_task(self.read()))
        initialized = await self.call('initialize', {
            'protocolVersion': 1, 'clientCapabilities': {},
            'clientInfo': {'name': 'reboot-dashboard', 'version': '1'},
        })
        if initialized.get('protocolVersion') != 1:
            raise RuntimeError('Adapter does not support ACP v1')
        self.capabilities = initialized.get('agentCapabilities', {})
        params = {'cwd': str(self.config.cwd), 'mcpServers': []}
        if previous:
            if self.capabilities.get('loadSession') is not True:
                raise ValueError('This adapter cannot load previous sessions')
            self.session = previous
            await self.call('session/load', {**params, 'sessionId': previous})
        else:
            result = await self.call('session/new', params)
            self.session = result['sessionId']
            if not isinstance(self.session, str) or not self.session:
                raise RuntimeError('Invalid ACP session')
        self.emit({'type': 'ready', 'channel': self.channel,
                   'provider': self.provider, 'cwd': str(self.config.cwd),
                   'canResume': self.capabilities.get('loadSession') is True})

    async def read(self):
        assert self.process is not None and self.process.stdout is not None
        try:
            while True:
                line = await self.process.stdout.readline()
                if not line:
                    raise RuntimeError('Adapter exited')
                message = json.loads(line)
                if not isinstance(message, dict) or message.get('jsonrpc') != '2.0':
                    raise RuntimeError('Invalid ACP frame')
                if 'method' not in message:
                    future = self.pending.get(message.get('id', -1))
                    if future is not None and not future.done():
                        if 'error' in message:
                            # Raw provider errors may contain auth material.
                            future.set_exception(RuntimeError('ACP request failed; check local adapter authentication/configuration'))
                        else:
                            future.set_result(message['result'])
                    continue
                params = message.get('params', {})
                method = message['method']
                if method == 'session/update' and params.get('sessionId') == self.session:
                    self.emit({'type': 'update', 'update': params['update']})
                elif method == 'session/request_permission' and 'id' in message:
                    if params.get('sessionId') != self.session or self.turn is None:
                        await self.write({'id': message['id'], 'result': {'outcome': {'outcome': 'cancelled'}}})
                        continue
                    options = params['options']
                    if not isinstance(options, list) or not options or len(self.permissions) >= 16:
                        raise RuntimeError('Invalid ACP permissions')
                    key = secrets.token_urlsafe(24)
                    self.permissions[key] = (message['id'], options)
                    self.emit({'type': 'permission', 'request': key, 'toolCall': params['toolCall'], 'options': options})
                elif 'id' in message:
                    await self.write({'id': message['id'], 'error': {'code': -32601, 'message': 'Client capability not supported'}})
        except asyncio.CancelledError:
            raise
        except Exception:
            for future in self.pending.values():
                if not future.done():
                    future.set_exception(RuntimeError('ACP adapter disconnected or sent invalid protocol data'))
            # Make failure terminal even if the bounded queue overflowed.
            while self.events.qsize() > 253:
                self.events.get_nowait()
            self.emit({'type': 'error', 'message': 'ACP adapter disconnected or sent invalid protocol data'})
            self.emit({'type': 'closed'})

    async def permission(self, key: str, option: str):
        pending = self.permissions.get(key)
        if pending is None or option not in [item['optionId'] for item in pending[1]]:
            raise HTTPException(409, 'Unknown or expired permission option')
        self.permissions.pop(key)
        await self.write({'id': pending[0], 'result': {'outcome': {'outcome': 'selected', 'optionId': option}}})

    async def clear_permissions(self):
        for number, _ in list(self.permissions.values()):
            await self.write({'id': number, 'result': {'outcome': {'outcome': 'cancelled'}}})
        self.permissions.clear()
        self.emit({'type': 'permissions_cleared'})

    async def prompt(self, text: str):
        if self.turn is not None:
            raise HTTPException(409, 'A turn is already running')
        async def run():
            try:
                result = await self.call('session/prompt', {'sessionId': self.session, 'prompt': [{'type': 'text', 'text': text}]}, timeout=1800)
                await self.clear_permissions()
                self.emit({'type': 'complete', 'stopReason': result['stopReason']})
            except asyncio.CancelledError:
                raise
            except Exception:
                with contextlib.suppress(asyncio.QueueFull):
                    self.emit({'type': 'error', 'message': 'ACP prompt failed; reconnect to start again'})
                await self.close()
                with contextlib.suppress(asyncio.QueueFull):
                    self.emit({'type': 'closed'})
            finally:
                self.turn = None
        self.turn = asyncio.create_task(run())

    async def cancel(self):
        await self.clear_permissions()
        if self.turn is not None:
            await self.write({'method': 'session/cancel', 'params': {'sessionId': self.session}})
            try:
                await asyncio.wait_for(asyncio.shield(self.turn), 5)
            except asyncio.TimeoutError:
                await self.close()
                with contextlib.suppress(asyncio.QueueFull):
                    self.emit({'type': 'closed'})

    async def close(self):
        if self.closed:
            return
        if self.process is not None and self.process.returncode is None:
            with contextlib.suppress(Exception):
                await self.clear_permissions()
        self.closed = True
        current = asyncio.current_task()
        tasks = [t for t in [*self.tasks, self.turn] if t is not None and t is not current]
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        if self.process is not None:
            # Kill descendants even when the adapter parent has already exited.
            with contextlib.suppress(ProcessLookupError):
                os.killpg(self.process.pid, signal.SIGTERM)
            await asyncio.sleep(0.1)
            with contextlib.suppress(ProcessLookupError):
                os.killpg(self.process.pid, signal.SIGKILL)
            await self.process.wait()
        for future in self.pending.values():
            if not future.done():
                future.cancel()


class Host:
    def __init__(self, config: Config | None, origin: str):
        if config is not None and not local_origin(origin):
            raise ValueError('ACP requires an explicit loopback origin with a port; portless/tunnels are not supported')
        self.config, self.origin = config, origin
        self.active: Peer | None = None
        # Only server-owned sessions can be resumed, within this process.
        self.previous: dict[str, str] = {}

    def guard(self, request: Request):
        # Never trust forwarded headers, Host-derived origins or remote tunnels.
        if request.headers.get('origin') != self.origin or request.headers.get('host') != urlsplit(self.origin).netloc:
            raise HTTPException(403)
        if self.config is None:
            raise HTTPException(404)

    async def connect(self, request: Request):
        self.guard(request)
        assert self.config is not None
        value = await body(request)
        if set(value) != {'provider', 'resume'} or not isinstance(value['provider'], str) or value['provider'] not in self.config.providers or type(value['resume']) is not bool:
            raise HTTPException(400)
        if self.active is not None:
            raise HTTPException(409, 'Another browser owns the agent connection')
        provider = value['provider']
        previous = self.previous.get(provider) if value['resume'] else None
        if value['resume'] and previous is None:
            raise HTTPException(409, 'No server-owned session to resume')
        peer = Peer(self.config, provider)
        self.active = peer

        async def stream():
            try:
                await peer.start(previous)
                assert peer.session is not None
                self.previous[provider] = peer.session
                while True:
                    try:
                        event = await asyncio.wait_for(peer.events.get(), 15)
                    except asyncio.TimeoutError:
                        event = {'type': 'heartbeat'}
                    yield json.dumps(event) + '\n'
                    if event['type'] == 'closed':
                        break
            except asyncio.CancelledError:
                raise
            except Exception:
                yield json.dumps({'type': 'error', 'message': 'Cannot start ACP session. Check the trusted command and local provider login; ACP v1 is required.'}) + '\n'
            finally:
                await peer.close()
                if self.active is peer:
                    self.active = None
        return StreamingResponse(stream(), media_type='application/x-ndjson', headers={'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no'})

    async def action(self, request: Request):
        self.guard(request)
        value = await body(request)
        peer = self.active
        if peer is None or not isinstance(value.get('channel'), str) or not secrets.compare_digest(value['channel'], peer.channel):
            raise HTTPException(409)
        kind = value.get('type')
        fields = {'prompt': {'text'}, 'permission': {'request', 'option'}, 'cancel': set()}
        if not isinstance(kind, str) or kind not in fields or set(value) != {'type', 'channel'} | fields[kind]:
            raise HTTPException(400)
        if kind == 'prompt':
            if not isinstance(value['text'], str) or not value['text'].strip() or len(value['text']) > 32000:
                raise HTTPException(400)
            await peer.prompt(value['text'])
        elif kind == 'permission':
            if not isinstance(value['request'], str) or not isinstance(value['option'], str):
                raise HTTPException(400)
            await peer.permission(value['request'], value['option'])
        else:
            await peer.cancel()
        return JSONResponse({'ok': True}, headers={'Cache-Control': 'no-store'})


def register(http):
    """Register exact authenticated routes, before the dashboard static page."""
    filename = os.environ.get(CONFIG_ENV)
    config = Config.read(filename, Path.cwd()) if filename else None
    host = Host(config, os.environ.get(ORIGIN_ENV, ''))

    @http.post('/__/dashboard/acp/config', require_oauth_token=True)
    async def configuration(request: Request):
        if config is None:
            return JSONResponse({'enabled': False}, headers={'Cache-Control': 'no-store'})
        host.guard(request)
        return JSONResponse({'enabled': True, 'providers': list(config.providers)}, headers={'Cache-Control': 'no-store'})

    http.post('/__/dashboard/acp/connect', require_oauth_token=True)(host.connect)
    http.post('/__/dashboard/acp/action', require_oauth_token=True)(host.action)
