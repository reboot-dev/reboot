import asyncio
import json
import os
import sys
import tempfile
import unittest
from unittest.mock import patch
from typing import Any

import anyio
from importlib.resources import files
from jsonschema import Draft202012Validator
from pathlib import Path
from starlette.exceptions import HTTPException
from starlette.requests import ClientDisconnect, Request
from reboot.dashboard.backend.acp import Config, Host, Peer, body, failure_reason, local_origin

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

    async def test_models_and_standard_config_rpc_for_both_providers(self):
        self.config.providers['codex'].append('models')
        for provider in ('codex', 'claude'):
            self.config.providers[provider] = self.config.providers['codex']
            peer = Peer(self.config, provider)
            try:
                await peer.start()
                assert peer.model is not None
                self.assertEqual(peer.model['currentValue'], 'fixture-small')
                self.assertEqual([v['value'] for v in peer.model['options']], ['fixture-small', 'fixture-large'])
                await peer.set_model('fixture-large')
                self.assertEqual(peer.model['currentValue'], 'fixture-large')
                self.assertEqual(json.loads((self.cwd / 'model-request.json').read_text()),
                                 {'sessionId': 'fixture-session', 'configId': 'fixture-model', 'value': 'fixture-large'})
            finally:
                await peer.close()

    async def test_model_changes_require_advertisement_and_idle(self):
        self.config.providers['codex'].append('models')
        await self.peer.start()
        for value in ('invented', 'ask'):
            with self.assertRaises(HTTPException) as error:
                await self.peer.set_model(value)
            self.assertEqual(error.exception.status_code, 409)
        self.assertFalse((self.cwd / 'model-request.json').exists())
        await self.peer.prompt('edit')
        await self.event('permission')
        with self.assertRaises(HTTPException):
            await self.peer.set_model('fixture-large')
        await self.peer.cancel()
        await self.peer.set_model('fixture-large')

    async def test_model_change_fences_prompts_and_concurrent_changes(self):
        self.config.providers['codex'].append('models')
        await self.peer.start()
        entered, release = asyncio.Event(), asyncio.Event()
        original = self.peer.call

        async def delayed_call(*args, **kwargs):
            entered.set()
            await release.wait()
            return await original(*args, **kwargs)

        with patch.object(self.peer, 'call', delayed_call):
            change = asyncio.create_task(self.peer.set_model('fixture-large'))
            await entered.wait()
            try:
                with self.assertRaises(HTTPException):
                    await self.peer.prompt('edit')
                with self.assertRaises(HTTPException):
                    await self.peer.set_model('fixture-small')
            finally:
                release.set()
                await change

    def test_model_projection_ignores_other_config_and_unknown_types(self):
        model: dict[str, Any] = {'id': 'model', 'type': 'select', 'currentValue': 'one',
                 'options': [{'value': 'one', 'name': 'One'}]}
        self.peer.model_options({'configOptions': [model]})
        self.assertEqual(self.peer.model, {key: value for key, value in model.items() if key != 'type'})
        self.peer.model_options({'configOptions': [{**model, 'category': 'mode'}]})
        self.assertIsNone(self.peer.model)
        self.peer.model_options({'configOptions': [{**model, 'type': 'future-type'}]})
        self.assertIsNone(self.peer.model)
        with self.assertRaises(RuntimeError):
            self.peer.model_options({'configOptions': [{**model, 'options': model['options'] * 2}]})

    async def test_model_change_requires_confirmation_without_fallback(self):
        self.config.providers['codex'].append('models')
        await self.peer.start()
        async def unconfirmed(*args, **kwargs):
            return {'configOptions': []}
        with patch.object(self.peer, 'call', unconfirmed):
            with self.assertRaises(HTTPException) as error:
                await self.peer.set_model('fixture-large')
        self.assertEqual(error.exception.status_code, 502)
        self.assertTrue(self.peer.closed)
        self.assertIsNone(self.peer.model)

    async def test_cancelled_model_action_closes_uncertain_session(self):
        self.config.providers['codex'].append('models')
        await self.peer.start()
        entered = asyncio.Event()
        async def blocked(*args, **kwargs):
            entered.set()
            await asyncio.Event().wait()
        with patch.object(self.peer, 'call', blocked):
            change = asyncio.create_task(self.peer.set_model('fixture-large'))
            await entered.wait()
            change.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await change
        self.assertTrue(self.peer.closed)
        self.assertFalse(self.peer.setting_model)
        self.assertIsNone(self.peer.model)
        with self.assertRaises(HTTPException):
            await self.peer.prompt('edit')

    async def test_unavailable_models_do_not_guess_legacy_api(self):
        await self.peer.start()
        self.assertIsNone(self.peer.model)
        with self.assertRaises(HTTPException):
            await self.peer.set_model('invented')

    async def test_default_model_applies_only_to_new_sessions(self):
        self.config.providers['codex'].append('models')
        self.config.default_models['codex'] = 'fixture-large'
        await self.peer.start()
        assert self.peer.model is not None
        self.assertEqual(self.peer.model['currentValue'], 'fixture-large')
        self.assertTrue((self.cwd / 'model-request.json').exists())
        await self.peer.close()
        (self.cwd / 'model-request.json').unlink()
        self.config.default_models['codex'] = 'fixture-small'
        self.peer = Peer(self.config, 'codex')
        await self.peer.start('fixture-session')
        assert self.peer.model is not None
        self.assertEqual(self.peer.model['currentValue'], 'fixture-large')
        self.assertFalse((self.cwd / 'model-request.json').exists())

    async def test_unadvertised_default_fails_without_fallback(self):
        self.config.default_models['codex'] = 'not-advertised'
        with self.assertRaisesRegex(ValueError, 'not advertised'):
            await self.peer.start()
        self.assertFalse((self.cwd / 'model-request.json').exists())

    async def test_model_error_is_sanitized_and_connection_closed(self):
        self.config.providers['codex'].extend(['models', 'model-error'])
        await self.peer.start()
        with self.assertRaises(HTTPException) as error:
            await self.peer.set_model('fixture-large')
        self.assertEqual(error.exception.status_code, 502)
        self.assertNotIn('private-test-token', str(error.exception))
        self.assertTrue(self.peer.closed)
        self.assertIsNone(self.peer.model)

    async def test_model_failure_with_full_queue_still_reaps(self):
        self.config.providers['codex'].extend(['models', 'model-error'])
        await self.peer.start()
        while not self.peer.events.full():
            self.peer.emit({'type': 'heartbeat'})
        with self.assertRaises(HTTPException):
            await self.peer.set_model('fixture-large')
        self.assertTrue(self.peer.closed)
        assert self.peer.process is not None
        self.assertIsNotNone(self.peer.process.returncode)
        await self.event('closed')

    async def test_model_update_replaces_choices_and_can_remove_support(self):
        self.config.providers['codex'].extend(['models', 'model-update'])
        await self.peer.start()
        while self.peer.model is not None and self.peer.model['currentValue'] != 'fixture-large':
            await self.event('models')
        assert self.peer.model is not None
        self.peer.session_update({'sessionUpdate': 'config_option_update', 'configOptions': []})
        self.assertIsNone(self.peer.model)

    async def test_model_http_action_is_bound_and_not_arbitrary_config(self):
        self.config.providers['codex'].append('models')
        await self.peer.start()
        host = Host(self.config, ORIGIN)
        host.active = self.peer
        for value in [
            {'type': 'model', 'channel': 'foreign', 'value': 'fixture-large'},
            {'type': 'model', 'channel': self.peer.channel, 'value': 'fixture-large', 'configId': 'mode'},
            {'type': 'model', 'channel': self.peer.channel, 'value': False},
            {'type': 'model', 'channel': self.peer.channel, 'value': 'ask'},
        ]:
            with self.assertRaises(HTTPException):
                await host.action(request(value))
        response = await host.action(request({'type': 'model', 'channel': self.peer.channel, 'value': 'fixture-large'}))
        self.assertEqual(response.status_code, 200)
        assert self.peer.model is not None
        self.assertEqual(self.peer.model['currentValue'], 'fixture-large')

    def test_typed_provider_config_and_schema_agree(self):
        schema = json.loads(files('reboot.dashboard.backend').joinpath('acp_config.schema.json').read_text())
        validator = Draft202012Validator(schema)
        path = self.cwd / 'config.json'
        valid_entries: list[Any] = [[sys.executable], {'command': [sys.executable]},
                                   {'command': [sys.executable], 'default_model': 'advertised-value'}]
        for entry in valid_entries:
            value = {'providers': {'codex': entry}}
            validator.validate(value)
            path.write_text(json.dumps(value))
            config = Config.read(str(path), self.cwd)
            self.assertEqual(config.providers['codex'], [sys.executable])
            self.assertEqual(config.default_models, {'codex': 'advertised-value'} if isinstance(entry, dict) and 'default_model' in entry else {})
        for entry in [{'command': [sys.executable], 'default_model': ''},
                      {'command': [sys.executable], 'default_model': None},
                      {'command': [sys.executable], 'default_model': 1},
                      {'command': [sys.executable], 'default_model': 'bad\x00value'},
                      {'command': [sys.executable], 'environment': {}},
                      {'default_model': 'missing-command'}]:
            value = {'providers': {'codex': entry}}
            self.assertFalse(validator.is_valid(value))
            path.write_text(json.dumps(value))
            with self.assertRaises(ValueError):
                Config.read(str(path), self.cwd)

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

    async def test_cancel_rejects_late_adapter_permission(self):
        self.config.providers['codex'].append('late-permission')
        await self.peer.start()
        await self.peer.prompt('edit')
        await self.event('permission')
        await asyncio.wait_for(self.peer.cancel(), 2)
        self.assertEqual(json.loads((self.cwd / 'late-outcome.json').read_text()),
                         {'outcome': {'outcome': 'cancelled'}})
        self.assertFalse(self.peer.permissions)
        self.assertIsNone(self.peer.turn)
        self.assertIn('hello', (self.cwd / 'app.py').read_text())
        while not self.peer.events.empty():
            self.assertNotEqual(self.peer.events.get_nowait()['type'], 'permission')

    async def test_cancel_invalidates_handles_before_first_write_await(self):
        await self.peer.start()
        await self.peer.prompt('edit')
        permission = await self.event('permission')
        writing, release = asyncio.Event(), asyncio.Event()
        original = self.peer.write

        async def delayed_write(message):
            writing.set()
            await release.wait()
            await original(message)

        with patch.object(self.peer, 'write', delayed_write):
            cancel = asyncio.create_task(self.peer.cancel())
            await writing.wait()
            try:
                with self.assertRaises(HTTPException) as error:
                    await asyncio.wait_for(self.peer.permission(permission['request'], 'allow'), .2)
                self.assertEqual(error.exception.status_code, 409)
                with self.assertRaises(HTTPException):
                    await self.peer.prompt('another')
            finally:
                release.set()
                await asyncio.wait_for(cancel, 2)
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

    async def test_configuration_refresh_resume_and_channel_isolation(self):
        self.config.providers['codex'].append('models')
        self.config.default_models['codex'] = 'fixture-large'
        self.config.providers['claude'] = [sys.executable, str(FIXTURE)]
        host = Host(self.config, ORIGIN)

        async def status():
            response = await host.configuration(request())
            self.assertEqual(response.headers['cache-control'], 'no-store')
            return json.loads(response.body)

        self.assertEqual((await status())['resumable'], {'codex': False, 'claude': False})
        response = await host.connect(request({'provider': 'codex', 'resume': False}))
        await anext(response.body_iterator)
        old = host.active
        self.assertIsNotNone(old)
        self.assertEqual((await status())['resumable'], {'codex': True, 'claude': False})
        self.assertTrue((await status())['active'])
        self.assertNotIn(old.channel, json.dumps(await status()))
        self.assertNotIn(old.session, json.dumps(await status()))
        with self.assertRaises(HTTPException) as error:
            await host.connect(request({'provider': 'codex', 'resume': True}))
        self.assertEqual(error.exception.status_code, 409)
        await response.body_iterator.aclose()
        self.assertFalse((await status())['active'])
        self.assertIsNotNone(old.process.returncode)
        # A new browser has only provider/boolean metadata, not an old channel.
        self.config.default_models['codex'] = 'fixture-small'
        response = await host.connect(request({'provider': 'codex', 'resume': True}))
        try:
            await anext(response.body_iterator)
            loaded = host.active
            self.assertNotEqual(loaded.channel, old.channel)
            self.assertEqual(loaded.model['currentValue'], 'fixture-large')
            self.assertIsNone(loaded.turn)  # loading never submits a prompt
            with self.assertRaises(HTTPException):
                await host.action(request({'channel': old.channel, 'type': 'cancel'}))
            with self.assertRaises(HTTPException):
                await host.action(request({'channel': 'forged', 'type': 'cancel'}))
        finally:
            await response.body_iterator.aclose()
        self.assertFalse((await status())['active'])
        self.assertEqual((await status())['resumable'], {'codex': True, 'claude': False})
        self.assertEqual(json.loads((await Host(self.config, ORIGIN).configuration(request())).body)['resumable'],
                         {'codex': False, 'claude': False})

    async def test_new_session_replaces_only_selected_provider_resume_target(self):
        host = Host(self.config, ORIGIN)
        host.previous = {'codex': 'old-owned-session', 'claude': 'other-provider-session'}
        response = await host.connect(request({'provider': 'codex', 'resume': False}))
        try:
            await anext(response.body_iterator)
            self.assertEqual(host.previous, {'codex': 'fixture-session', 'claude': 'other-provider-session'})
        finally:
            await response.body_iterator.aclose()

    async def test_configuration_guards_and_capability_gating(self):
        self.config.providers['codex'].append('no-load')
        host = Host(self.config, ORIGIN)
        for origin, hostname in [('https://evil.test', '127.0.0.1:9999'), ('null', '127.0.0.1:9999'), (ORIGIN, 'evil.test')]:
            with self.assertRaises(HTTPException) as error:
                await host.configuration(request(None, origin, hostname))
            self.assertEqual(error.exception.status_code, 403)
        response = await host.connect(request({'provider': 'codex', 'resume': False}))
        try:
            await anext(response.body_iterator)
            self.assertEqual(json.loads((await host.configuration(request())).body)['resumable'], {'codex': False})
        finally:
            await response.body_iterator.aclose()
        with self.assertRaises(HTTPException):
            await host.connect(request({'provider': 'codex', 'resume': True}))

    def test_all_routes_require_oauth_including_configuration(self):
        from reboot.dashboard.backend.acp import register
        routes = {}
        class HTTP:
            def post(self, path, *, require_oauth_token):
                self_outer.assertTrue(require_oauth_token)
                def decorate(handler):
                    routes[path] = handler
                    return handler
                return decorate
        self_outer = self
        with patch.dict(os.environ, {}, clear=True):
            register(HTTP())
        self.assertEqual(set(routes), {'/__/dashboard/acp/config', '/__/dashboard/acp/connect', '/__/dashboard/acp/action'})

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

    async def test_early_session_notifications_are_preserved(self):
        await self.peer.start()
        update = await self.event('update')
        self.assertEqual(update['update']['sessionUpdate'], 'available_commands_update')

    async def test_concurrent_close_waits_for_reaping(self):
        await self.peer.start()
        await asyncio.gather(self.peer.close(), self.peer.close())
        assert self.peer.process is not None and self.peer.closing is not None
        self.assertIsNotNone(self.peer.process.returncode)
        self.assertTrue(self.peer.closing.done())

    async def test_cancelled_close_still_reaps_process(self):
        await self.peer.start()
        closing = asyncio.create_task(self.peer.close())
        while not self.peer.closed:
            await asyncio.sleep(0)
        closing.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await closing
        await self.peer.close()
        assert self.peer.process is not None
        self.assertIsNotNone(self.peer.process.returncode)

    async def test_close_bounds_blocked_permission_drain_and_cancel(self):
        await self.peer.start()
        await self.peer.prompt('edit')
        await self.event('permission')
        writing = asyncio.Event()

        async def blocked_write(message):
            writing.set()
            await asyncio.Event().wait()

        with patch.object(self.peer, 'write', blocked_write):
            cancelling = asyncio.create_task(self.peer.cancel())
            await writing.wait()
            await asyncio.wait_for(asyncio.gather(self.peer.close(), self.peer.close()), 2)
            await asyncio.gather(cancelling, return_exceptions=True)
        self.assertTrue(self.peer.closing.done())
        self.assertTrue(self.peer.cancellation.done())
        self.assertIsNotNone(self.peer.process.returncode)
        self.assertFalse(self.peer.permissions)

    async def test_turn_and_external_close_do_not_wait_on_each_other(self):
        await self.peer.start()
        closing_started, release = asyncio.Event(), asyncio.Event()
        original = self.peer._close

        async def delayed_close(caller):
            closing_started.set()
            await release.wait()
            await original(caller)

        with patch.object(self.peer, '_close', delayed_close):
            # A failed prompt enters close from the turn itself; a simultaneous
            # disconnect joins the same cleanup task rather than waiting in a cycle.
            await self.peer.prompt('crash')
            await closing_started.wait()
            external = asyncio.create_task(self.peer.close())
            release.set()
            await asyncio.wait_for(external, 2)
            if self.peer.turn is not None:
                await asyncio.wait_for(self.peer.turn, 2)
        self.assertTrue(self.peer.closing.done())
        self.assertIsNone(self.peer.turn)
        self.assertIsNotNone(self.peer.process.returncode)

    async def test_auth_diagnostics_do_not_echo_secrets(self):
        self.config.providers['codex'].append('auth-error')
        with self.assertLogs('reboot.dashboard.backend.acp', level='WARNING') as logs:
            with self.assertRaisesRegex(RuntimeError, 'authentication required') as error:
                await self.peer.start()
            await self.peer.close()
        self.assertNotIn('private-test-token', str(error.exception))
        self.assertNotIn('private-test-token', '\n'.join(logs.output))
        self.assertIn('local provider CLI', str(error.exception))

    def test_diagnostic_allowlist(self):
        self.assertIn('expired', failure_reason('OAuth session expired Bearer secret'))
        self.assertIn('invalid', failure_reason('invalid_refresh_token secret'))
        self.assertIn('quota', failure_reason('quota exhausted secret'))
        self.assertNotIn('secret', failure_reason('unrecognized provider failure secret'))

    def test_packaged_config_schema(self):
        schema = json.loads(files('reboot.dashboard.backend').joinpath('acp_config.schema.json').read_text())
        Draft202012Validator.check_schema(schema)
        validator = Draft202012Validator(schema)
        validator.validate({'providers': {'codex': ['/bin/true', '--argument']}})
        for value in [{'providers': {}}, {'providers': {'other': ['/bin/true']}},
                      {'providers': {'codex': ['relative']}},
                      {'providers': {'codex': ['/bin/true', '']}},
                      {'providers': {'codex': ['/bin/tr\x00ue']}},
                      {'providers': {'codex': ['/bin/true']}, 'cwd': '/etc'}]:
            self.assertFalse(validator.is_valid(value), value)

    async def test_stream_disconnect_releases_host(self):
        host = Host(self.config, ORIGIN)
        response = await host.connect(request({'provider': 'codex', 'resume': False}))
        await anext(response.body_iterator)
        peer = host.active
        await response.body_iterator.aclose()
        self.assertTrue(peer.closed)
        self.assertIsNone(host.active)

    async def test_asgi_send_failure_reaps_and_releases_ownership(self):
        host = Host(self.config, ORIGIN)
        response = await host.connect(request({'provider': 'codex', 'resume': False}))
        peer = host.active
        assert peer is not None

        async def send(message):
            if message['type'] == 'http.response.body':
                raise OSError('browser disconnected')

        scope = {**request().scope, 'asgi': {'version': '3.0', 'spec_version': '2.4'}}
        try:
            with self.assertRaises(ClientDisconnect):
                await response(scope, request().receive, send)
            with anyio.fail_after(2):
                while host.active is not None:
                    await asyncio.sleep(.01)
            assert peer.process is not None and peer.closing is not None
            self.assertTrue(peer.closing.done())
            self.assertIsNotNone(peer.process.returncode)
        finally:
            await response.body_iterator.aclose()

    async def test_asgi_disconnect_reaps_and_releases_ownership(self):
        await self.check_asgi_disconnect(cancel_scope=False)

    async def test_asgi_cancel_scope_reaps_and_releases_ownership(self):
        await self.check_asgi_disconnect(cancel_scope=True)

    async def check_asgi_disconnect(self, cancel_scope):
        host = Host(self.config, ORIGIN)
        baseline = asyncio.all_tasks()
        for reconnect in range(2):
            response = await host.connect(request({'provider': 'codex', 'resume': bool(reconnect)}))
            peer = host.active
            disconnect, ready, permission = asyncio.Event(), asyncio.Event(), asyncio.Event()

            async def receive():
                await disconnect.wait()
                return {'type': 'http.disconnect'}

            async def send(message):
                if message['type'] == 'http.response.body' and message.get('body'):
                    event = json.loads(message['body'])
                    if event['type'] == 'ready':
                        ready.set()
                    elif event['type'] == 'permission':
                        permission.set()

            scope = {**request().scope, 'asgi': {'version': '3.0', 'spec_version': '2.3'}}
            with anyio.fail_after(3):
                async with anyio.create_task_group() as group:
                    group.start_soon(response, scope, receive, send)
                    await ready.wait()
                    await peer.prompt('edit')
                    await permission.wait()
                    pid = peer.process.pid
                    if cancel_scope:
                        group.cancel_scope.cancel()
                    else:
                        disconnect.set()
            # The response can return before shielded cleanup finishes; ownership
            # must stay reserved until reaping, then admit a real resumed stream.
            with anyio.fail_after(3):
                while host.active is not None:
                    await asyncio.sleep(.01)
            self.assertTrue(peer.closing.done())
            self.assertIsNotNone(peer.process.returncode)
            self.assertTrue(all(task.done() for task in peer.tasks))
            self.assertIsNone(peer.turn)
            self.assertFalse(peer.permissions)
            with self.assertRaises(ProcessLookupError):
                os.kill(pid, 0)
        await asyncio.sleep(0)
        self.assertFalse([t for t in asyncio.all_tasks() - baseline if not t.done()])

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
