"""Opt-in local ACP v1 process host. No provider credentials cross HTTP.

The adapter executes with the developer's privileges, NOT in a cwd sandbox.
Only trusted CLI configuration can select commands, environment or workspace.
"""
import asyncio
import contextlib
import json
import logging
import os
import secrets
import signal
from dataclasses import dataclass, field
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
logger = logging.getLogger(__name__)


def failure_reason(value: Any) -> str:
    """Classify privately received diagnostics; never echo their contents.

    Even stderr may contain tokens, source, or prompts. Only fixed, actionable
    categories leave this function, including in backend logs.
    """
    text = str(value).lower()
    if ('expired' in text and ('oauth' in text or 'session' in text)) or 'invalid_refresh_token' in text:
        return 'Provider login expired or invalid; sign in again using the local provider CLI'
    if 'authentication required' in text or 'failed to authenticate' in text or 'unauthorized' in text:
        return 'Provider authentication required; sign in using the local provider CLI'
    if 'quota' in text or 'rate limit' in text or 'insufficient credits' in text:
        return 'Provider quota or rate limit reached; check the local provider account'
    return 'ACP request failed; check the trusted adapter command and local provider configuration'


@dataclass(frozen=True)
class Config:
    cwd: Path
    providers: dict[str, list[str]]
    default_models: dict[str, str] = field(default_factory=dict)

    @classmethod
    def read(cls, filename: str, cwd: Path) -> 'Config':
        value = json.loads(Path(filename).read_text())
        if not isinstance(value, dict) or set(value) != {'providers'}:
            raise ValueError('ACP config must contain only providers')
        providers = value['providers']
        if not isinstance(providers, dict) or not providers:
            raise ValueError('ACP providers must be a non-empty object')
        commands, defaults = {}, {}
        for name, entry in providers.items():
            command = entry
            if isinstance(entry, dict):
                if not {'command'} <= set(entry) or set(entry) - {'command', 'default_model'}:
                    raise ValueError('ACP provider accepts only command and optional default_model')
                command = entry['command']
                if 'default_model' in entry:
                    model = entry['default_model']
                    if not isinstance(model, str) or not model or '\x00' in model:
                        raise ValueError('ACP default_model must be a non-empty string')
                    defaults[name] = model
            if name not in ('claude', 'codex') or not isinstance(command, list) or not command:
                raise ValueError('ACP provider must be claude or codex with an argv array')
            if not all(isinstance(arg, str) and arg and '\x00' not in arg for arg in command):
                raise ValueError('ACP argv must contain non-empty strings')
            if not Path(command[0]).is_absolute() or not os.access(command[0], os.X_OK):
                raise ValueError('ACP executable must be an executable absolute path')
            commands[name] = command
        return cls(cwd.resolve(strict=True), commands, defaults)


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
        self.process: asyncio.subprocess.Process | None = None
        self.tasks: list[asyncio.Task] = []
        self.pending: dict[int, asyncio.Future] = {}
        self.permissions: dict[str, tuple[Any, list[dict]]] = {}
        self.events: asyncio.Queue = asyncio.Queue(maxsize=256)
        self.sequence = 0
        self.session: str | None = None
        self.capabilities: dict = {}
        self.turn: asyncio.Task | None = None
        self.cancelling = False
        self.cancellation: asyncio.Task | None = None
        self.closed = False
        self.closing: asyncio.Task | None = None
        self.channel = secrets.token_urlsafe(32)
        self.starting_updates: list[dict] = []
        self.diagnostic: str | None = None
        self.model: dict | None = None
        self.setting_model = False

    def model_options(self, result: dict):
        """Project only an advertised model selector, never permission/mode config.

        ACP v1 configOptions are authoritative; no provider-specific model list
        or legacy unstable set_model calls are guessed when they are absent.
        """
        self.model = None
        for option in result.get('configOptions') or []:
            if not isinstance(option, dict) or option.get('type') != 'select':
                continue
            if option.get('category') != 'model' and not (option.get('category') is None and option.get('id') == 'model'):
                continue
            if not isinstance(option.get('id'), str) or not isinstance(option.get('currentValue'), str):
                raise RuntimeError('Invalid ACP model configuration')
            choices = []
            for item in option.get('options', []):
                # ACP allows flat values or one level of named groups.
                for value in item.get('options', [item]):
                    if not isinstance(value.get('value'), str) or not isinstance(value.get('name'), str):
                        raise RuntimeError('Invalid ACP model option')
                    choices.append({'value': value['value'], 'name': value['name']})
            if len({v['value'] for v in choices}) != len(choices):
                raise RuntimeError('Duplicate ACP model option')
            self.model = {'id': option['id'], 'currentValue': option['currentValue'], 'options': choices}
            break
        self.emit({'type': 'models', 'model': self.model})

    def session_update(self, update: dict):
        if update.get('sessionUpdate') == 'config_option_update':
            self.model_options(update)
        else:
            self.emit({'type': 'update', 'update': update})

    async def set_model(self, value: str):
        if self.closed or self.cancelling or self.turn is not None or self.permissions or self.setting_model or self.session is None:
            raise HTTPException(409, 'Model cannot change while the agent is busy')
        if self.model is None or value not in [item['value'] for item in self.model['options']]:
            raise HTTPException(409, 'Model is not advertised by this agent')
        self.setting_model = True
        try:
            result = await self.call('session/set_config_option', {
                'sessionId': self.session, 'configId': self.model['id'], 'value': value,
            })
            self.model_options(result)
            if self.model is None or self.model['currentValue'] != value:
                raise RuntimeError('Agent did not confirm the selected model')
        except asyncio.CancelledError:
            # An abandoned HTTP action must not unlock prompts while a setter
            # could still be applying in the adapter.
            self.model = None
            await self.close()
            while self.events.full():
                self.events.get_nowait()
            self.emit({'type': 'closed'})
            raise
        except Exception:
            # A timeout/disconnect leaves model state uncertain. Do not let a
            # later prompt run under a silently different model.
            self.model = None
            with contextlib.suppress(asyncio.QueueFull):
                self.emit({'type': 'models', 'model': None})
                self.emit({'type': 'error', 'message': 'Model change failed; reconnect to rediscover agent models'})
            await self.close()
            while self.events.full():
                self.events.get_nowait()
            self.emit({'type': 'closed'})
            raise HTTPException(502, 'Model change failed; reconnect to rediscover agent models')
        finally:
            self.setting_model = False

    async def read_stderr(self):
        assert self.process is not None and self.process.stderr is not None
        # Drain continuously, with bounded chunks (not lines). Retain no raw
        # diagnostics, even in logs; a broken adapter must not fill its pipe.
        while chunk := await self.process.stderr.read(8192):
            reason = failure_reason(chunk.decode(errors='replace'))
            if reason != failure_reason('') and reason != self.diagnostic:
                self.diagnostic = reason
                logger.warning('ACP %s: %s', self.provider, reason)

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
            stderr=asyncio.subprocess.PIPE, start_new_session=True,
            limit=MAX_FRAME,
        )
        self.tasks.append(asyncio.create_task(self.read()))
        self.tasks.append(asyncio.create_task(self.read_stderr()))
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
            result = await self.call('session/load', {**params, 'sessionId': previous})
        else:
            result = await self.call('session/new', params)
            self.session = result['sessionId']
            if not isinstance(self.session, str) or not self.session:
                raise RuntimeError('Invalid ACP session')
        self.model_options(result)
        for notification in self.starting_updates:
            if notification.get('sessionId') == self.session:
                self.session_update(notification['update'])
        self.starting_updates.clear()
        default = self.config.default_models.get(self.provider) if not previous else None
        if default is not None:
            if self.model is None or default not in [item['value'] for item in self.model['options']]:
                self.diagnostic = 'Configured default_model is not advertised by this agent; update the trusted configuration'
                raise ValueError(self.diagnostic)
            await self.set_model(default)
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
                            reason = failure_reason(message['error'])
                            self.diagnostic = reason
                            logger.warning('ACP %s request %s: %s', self.provider, message.get('id'), reason)
                            future.set_exception(RuntimeError(reason))
                        else:
                            future.set_result(message['result'])
                    continue
                params = message.get('params', {})
                method = message['method']
                if method == 'session/update':
                    if self.session is None:
                        # Some adapters notify before session/new returns.
                        if len(self.starting_updates) >= 32:
                            raise RuntimeError('Too many startup updates')
                        self.starting_updates.append(params)
                    elif params.get('sessionId') == self.session:
                        self.session_update(params['update'])
                elif method == 'session/request_permission' and 'id' in message:
                    if self.cancelling or self.closed or params.get('sessionId') != self.session or self.turn is None or self.turn.done():
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
        if self.cancelling or self.closed or pending is None or option not in [item['optionId'] for item in pending[1]]:
            raise HTTPException(409, 'Unknown or expired permission option')
        self.permissions.pop(key)
        await self.write({'id': pending[0], 'result': {'outcome': {'outcome': 'selected', 'optionId': option}}})

    async def clear_permissions(self):
        pending = list(self.permissions.values())
        self.permissions.clear()
        for number, _ in pending:
            await self.write({'id': number, 'result': {'outcome': {'outcome': 'cancelled'}}})
        self.emit({'type': 'permissions_cleared'})

    async def prompt(self, text: str):
        if self.closed or self.cancelling or self.turn is not None or self.setting_model:
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
                    self.emit({'type': 'error', 'message': self.diagnostic or 'ACP prompt failed; reconnect to start again'})
                await self.close()
                with contextlib.suppress(asyncio.QueueFull):
                    self.emit({'type': 'closed'})
            finally:
                self.turn = None
        self.turn = asyncio.create_task(run())

    async def cancel(self):
        if self.closed:
            return
        if self.cancellation is None or self.cancellation.done():
            # Fence both existing handles and late adapter requests before any
            # write/drain can yield to a concurrent browser approval.
            self.cancelling = True
            self.cancellation = asyncio.create_task(self._cancel())
        await asyncio.shield(self.cancellation)

    async def _cancel(self):
        try:
            await asyncio.wait_for(self._cancel_turn(), 5)
        except asyncio.TimeoutError:
            await self.close()
            with contextlib.suppress(asyncio.QueueFull):
                self.emit({'type': 'closed'})
        finally:
            if self.closing is None:
                self.cancelling = False

    async def _cancel_turn(self):
        await self.clear_permissions()
        turn = self.turn
        if turn is not None:
            await self.write({'method': 'session/cancel', 'params': {'sessionId': self.session}})
            await asyncio.shield(turn)

    async def close(self):
        if self.closing is None:
            self.cancelling = True
            self.closing = asyncio.create_task(self._close(asyncio.current_task()))
        await asyncio.shield(self.closing)

    async def _close(self, caller):
        if self.process is not None and self.process.returncode is None:
            with contextlib.suppress(Exception):
                # An adapter that stopped reading stdin must not block reaping.
                await asyncio.wait_for(self.clear_permissions(), .25)
        self.permissions.clear()
        self.closed = True
        tasks = [t for t in [*self.tasks, self.turn, self.cancellation] if t is not None and t is not caller]
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
            # wait() alone does not close pipe transports when the reader was
            # cancelled, especially if an adapter exited with buffered output.
            await self.process.communicate()
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

    async def configuration(self, request: Request):
        if self.config is None:
            return JSONResponse({'enabled': False}, headers={'Cache-Control': 'no-store'})
        self.guard(request)
        # Availability only: never disclose session IDs or the active channel.
        return JSONResponse({'enabled': True, 'providers': list(self.config.providers),
                             'resumable': {name: name in self.previous for name in self.config.providers},
                             'active': self.active is not None}, headers={'Cache-Control': 'no-store'})

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
        cleanup_task: asyncio.Task | None = None

        async def cleanup():
            await peer.close()
            if self.active is peer:
                self.active = None

        async def finish():
            nonlocal cleanup_task
            if cleanup_task is None:
                cleanup_task = asyncio.create_task(cleanup())
            # AnyIO can repeatedly cancel the ASGI caller. The shared asyncio
            # task must outlive it, including subprocess reaping and ownership.
            await asyncio.shield(cleanup_task)

        class AgentResponse(StreamingResponse):
            async def __call__(self, scope, receive, send):
                try:
                    await super().__call__(scope, receive, send)
                finally:
                    # ASGI 2.4 send errors happen while the generator is paused
                    # at yield: its own finally will not run until aclose/GC.
                    await finish()

        async def stream():
            try:
                await peer.start(previous)
                assert peer.session is not None
                if peer.capabilities.get('loadSession') is True:
                    self.previous[provider] = peer.session
                else:
                    self.previous.pop(provider, None)
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
                yield json.dumps({'type': 'error', 'message': peer.diagnostic or 'Cannot start ACP session. Check the trusted command and local provider login; ACP v1 is required.'}) + '\n'
            finally:
                await finish()
        return AgentResponse(stream(), media_type='application/x-ndjson', headers={'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no'})

    async def action(self, request: Request):
        self.guard(request)
        value = await body(request)
        peer = self.active
        if peer is None or not isinstance(value.get('channel'), str) or not secrets.compare_digest(value['channel'], peer.channel):
            raise HTTPException(409)
        kind = value.get('type')
        fields = {'prompt': {'text'}, 'permission': {'request', 'option'}, 'cancel': set(), 'model': {'value'}}
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
        elif kind == 'model':
            if not isinstance(value['value'], str):
                raise HTTPException(400)
            await peer.set_model(value['value'])
        else:
            await peer.cancel()
        return JSONResponse({'ok': True}, headers={'Cache-Control': 'no-store'})


def register(http):
    """Register exact authenticated routes, before the dashboard static page."""
    filename = os.environ.get(CONFIG_ENV)
    config = Config.read(filename, Path.cwd()) if filename else None
    host = Host(config, os.environ.get(ORIGIN_ENV, ''))

    http.post('/__/dashboard/acp/config', require_oauth_token=True)(host.configuration)

    http.post('/__/dashboard/acp/connect', require_oauth_token=True)(host.connect)
    http.post('/__/dashboard/acp/action', require_oauth_token=True)(host.action)
