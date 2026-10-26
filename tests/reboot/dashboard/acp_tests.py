import asyncio
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from starlette.exceptions import HTTPException
from starlette.requests import Request
from reboot.dashboard.backend.acp import Config, Host, Peer, body, local_origin

FIXTURE = Path(__file__).with_name('acp_fixture.py').resolve()
ORIGIN = 'http://127.0.0.1:9999'


def request(value=None, origin=ORIGIN, host='127.0.0.1:9999'):
    async def receive():
        return {'type': 'http.request', 'body': json.dumps(value).encode(), 'more_body': False}
    return Request({'type': 'http', 'method': 'POST', 'path': '/', 'headers': [(b'origin', origin.encode()), (b'host', host.encode())]}, receive)


class ACPTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.cwd = Path(self.temp.name)
        (self.cwd / 'app.py').write_text("def greeting(): return 'hello'\n")
        self.config = Config(self.cwd, {'codex': [sys.executable, str(FIXTURE)]})
        self.peer = Peer(self.config, 'codex')

    async def asyncTearDown(self):
        await self.peer.close()
        self.temp.cleanup()

    async def event(self, kind):
        while True:
            event = await asyncio.wait_for(self.peer.events.get(), 3)
            if event['type'] == kind:
                return event

    async def test_edit_approval_diff_and_reload(self):
        await self.peer.start()
        await self.peer.prompt('edit')
        permission = await self.event('permission')
        self.assertIn('hello', (self.cwd / 'app.py').read_text())
        with self.assertRaises(HTTPException):
            await self.peer.permission(permission['request'], 'invented-choice')
        await self.peer.permission(permission['request'], 'allow')
        await self.event('complete')
        self.assertIn('edited', (self.cwd / 'app.py').read_text())
        namespace = {}
        exec((self.cwd / 'app.py').read_text(), namespace)
        self.assertEqual(namespace['greeting'](), 'edited')
        with self.assertRaises(HTTPException):
            await self.peer.permission(permission['request'], 'allow')

    async def test_deny_does_not_edit(self):
        await self.peer.start()
        await self.peer.prompt('edit')
        permission = await self.event('permission')
        await self.peer.permission(permission['request'], 'deny')
        await self.event('complete')
        self.assertIn('hello', (self.cwd / 'app.py').read_text())

    async def test_cancel_resolves_permission_and_turn(self):
        await self.peer.start()
        await self.peer.prompt('edit')
        await self.event('permission')
        await self.peer.cancel()
        self.assertFalse(self.peer.permissions)
        self.assertIsNone(self.peer.turn)
        self.assertIn('hello', (self.cwd / 'app.py').read_text())

    async def test_busy(self):
        await self.peer.start()
        await self.peer.prompt('edit')
        with self.assertRaises(HTTPException):
            await self.peer.prompt('another')

    async def test_crash_fails_pending_request(self):
        await self.peer.start()
        await self.peer.prompt('crash')
        await self.event('error')
        await self.event('closed')

    async def test_invalid_frame(self):
        await self.peer.start()
        await self.peer.prompt('malformed')
        await self.event('error')

    async def test_version_mismatch(self):
        self.config.providers['codex'].append('v2')
        with self.assertRaisesRegex(RuntimeError, 'v1'):
            await self.peer.start()

    async def test_resume_gated(self):
        self.config.providers['codex'].append('no-load')
        with self.assertRaisesRegex(ValueError, 'cannot load'):
            await self.peer.start('fixture-session')

    async def test_resume_server_owned(self):
        host = Host(self.config, ORIGIN)
        with self.assertRaises(HTTPException) as error:
            await host.connect(request({'provider': 'codex', 'resume': True}))
        self.assertEqual(error.exception.status_code, 409)

    async def test_security_guards(self):
        host = Host(self.config, ORIGIN)
        for origin, hostname in [('https://evil.test', '127.0.0.1:9999'), ('null', '127.0.0.1:9999'), (ORIGIN, 'evil.test')]:
            with self.assertRaises(HTTPException) as error:
                await host.connect(request({}, origin, hostname))
            self.assertEqual(error.exception.status_code, 403)
        self.assertIsNone(host.active)
        for value in [
            {'provider': 'codex', 'resume': False, 'command': ['/bin/sh']},
            {'provider': 'codex', 'resume': False, 'cwd': '/etc'},
            {'provider': 'codex', 'resume': False, 'sessionId': 'foreign'},
            {'provider': 'unconfigured', 'resume': False},
        ]:
            with self.assertRaises(HTTPException):
                await host.connect(request(value))
        self.assertIsNone(host.active)
        with self.assertRaises(HTTPException):
            await host.action(request({'channel': 'forged', 'type': 'cancel'}))

    async def test_body_bound(self):
        with self.assertRaises(HTTPException) as error:
            await body(request({'text': 'x' * 70000}))
        self.assertEqual(error.exception.status_code, 413)

    async def test_disconnect_reaps_process(self):
        await self.peer.start()
        pid = self.peer.process.pid
        await self.peer.close()
        with self.assertRaises(ProcessLookupError):
            os.kill(pid, 0)

    async def test_stream_disconnect_releases_host(self):
        host = Host(self.config, ORIGIN)
        response = await host.connect(request({'provider': 'codex', 'resume': False}))
        await anext(response.body_iterator)
        peer = host.active
        await response.body_iterator.aclose()
        self.assertTrue(peer.closed)
        self.assertIsNone(host.active)

    def test_loopback_only(self):
        for origin in ['https://evil.test:443', 'http://127.0.0.1:9999/path', 'http://localhost', 'http://user@localhost:42', 'http://dashboard.localhost:80']:
            self.assertFalse(local_origin(origin))
            with self.assertRaises(ValueError):
                Host(self.config, origin)

    def test_config_rejects_commands(self):
        path = self.cwd / 'config.json'
        for value in [{'providers': {'codex': 'shell command'}}, {'providers': {'codex': ['sh', '-c', 'true']}}, {'providers': {'unknown': ['/bin/true']}}, {'providers': {'codex': ['/bin/true']}, 'cwd': '/etc'}]:
            path.write_text(json.dumps(value))
            with self.assertRaises(ValueError):
                Config.read(str(path), self.cwd)


if __name__ == '__main__':
    unittest.main()
