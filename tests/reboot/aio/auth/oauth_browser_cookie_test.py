"""In-process OAuth routes with real JWT/PKCE and a cookie-aware client.

These are HTTP transport regressions, not real-browser/IdP acceptance.
"""
import httpx
import unittest
from http.cookies import SimpleCookie
from reboot.aio.auth import (
    PENDING_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
    SESSION_COOKIE_NAME,
)
from reboot.aio.auth.oauth_providers import Anonymous
from reboot.aio.auth.oauth_server import OAuthServer
from starlette.applications import Starlette
from starlette.routing import Route
from unittest.mock import patch


class BrowserCookieTest(unittest.IsolatedAsyncioTestCase):

    def make_client(self, origin, headers=None):
        with patch(
            'reboot.aio.auth.oauth_server.signing_secret',
            return_value=b'cookie-test-key-not-for-production'
        ):
            server = OAuthServer(
                provider=Anonymous(user_id='test-user'),
                protected_resources=[], application_title='Cookie test'
            )
        routes = [
            Route(
                '/__/oauth/' + name, getattr(server, name), methods=[
                    'POST' if name
                    in ('refresh', 'signout', 'consent', 'register') else 'GET'
                ]
            ) for name in (
                'start', 'authorize', 'callback', 'finish', 'refresh',
                'signout', 'whoami', 'consent', 'register'
            )
        ]

        # Token minting needs a context only when an application hook is
        # installed. No native cluster or authorization bypass is needed.
        async def app(scope, receive, send):
            scope['state'] = {'reboot_external_context': None}
            await Starlette(routes=routes)(scope, receive, send)

        return server, httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url=origin,
            headers=headers
        )

    def assert_cookies(self, response, secure, session=False):
        headers = response.headers.get_list('set-cookie')
        self.assertTrue(headers)
        for header in headers:
            cookie = next(iter(SimpleCookie(header).values()))
            self.assertEqual(bool(cookie['secure']), secure)
            self.assertTrue(cookie['httponly'])
            self.assertFalse(cookie['domain'])
            expected_site = 'none' if secure and cookie.key != PENDING_COOKIE_NAME else 'lax'
            self.assertEqual(cookie['samesite'], expected_site)
            self.assertIn(cookie['path'], ('/', '/__/oauth/'))
        if session:
            self.assertEqual(len(headers), 3)

    async def to_finish(self, client):
        response = await client.get('/__/oauth/start?return_to=/dashboard')
        self.assertEqual(response.status_code, 302)
        start = response
        for _ in range(2):  # authorize -> Anonymous -> real callback -> finish
            response = await client.get(response.headers['location'])
            self.assertEqual(response.status_code, 302)
        return start, response

    async def test_http_loopback_start_finish_roundtrip(self):
        _, client = self.make_client('http://127.0.0.1:9871')
        async with client:
            _, callback = await self.to_finish(client)
            finish = await client.get(callback.headers['location'])
            # httpx does not send Secure cookies over plain HTTP, just
            # as browsers without a loopback exception do not.
            self.assertEqual(
                finish.status_code,
                302,
                finish.json().get('error_description')
                if finish.status_code == 400 else None,
            )
            self.assertTrue(
                (await client.get('/__/oauth/whoami')).json()['authenticated']
            )

    async def test_cookie_lifecycle(self):
        for origin in (
            'http://127.0.0.1:9871', 'http://localhost:9871',
            'http://[::1]:9871', 'https://app.example',
            'https://localhost:9871'
        ):
            with self.subTest(origin=origin):
                secure = origin.startswith('https:')
                _, client = self.make_client(origin)
                async with client:
                    start, callback = await self.to_finish(client)
                    self.assert_cookies(start, secure)
                    self.assert_cookies(callback, secure, session=True)
                    # Install a legacy root cookie; finish must delete it.
                    client.cookies.extract_cookies(
                        httpx.Response(
                            200, headers={
                                'set-cookie':
                                    SESSION_COOKIE_NAME + '=legacy; Path=/'
                            }, request=httpx.Request('GET', origin + '/')
                        )
                    )
                    finish = await client.get(callback.headers['location'])
                    self.assertEqual(finish.status_code, 302)
                    self.assertEqual(finish.headers['location'], '/dashboard')
                    self.assert_cookies(finish, secure)
                    self.assertFalse(
                        any(
                            c.name == PENDING_COOKIE_NAME
                            for c in client.cookies.jar
                        )
                    )
                    self.assertFalse(
                        any(
                            c.name == SESSION_COOKIE_NAME and c.path == '/'
                            for c in client.cookies.jar
                        )
                    )
                    self.assertTrue(
                        (await client.get('/__/oauth/whoami')
                        ).json()['authenticated']
                    )
                    refresh = await client.post(
                        '/__/oauth/refresh', headers={'origin': origin}
                    )
                    self.assertEqual(refresh.status_code, 200)
                    self.assert_cookies(refresh, secure, session=True)
                    for action in ('refresh', 'signout'):
                        denied = await client.post(
                            '/__/oauth/' + action,
                            headers={'origin': 'https://evil.example'}
                        )
                        self.assertEqual(denied.status_code, 403)
                        self.assertNotIn('set-cookie', denied.headers)
                    logout = await client.post(
                        '/__/oauth/signout', headers={'origin': origin}
                    )
                    self.assertEqual(logout.status_code, 204)
                    self.assert_cookies(logout, secure, session=True)
                    self.assertFalse(
                        (await client.get('/__/oauth/whoami')
                        ).json()['authenticated']
                    )
                    self.assertEqual(
                        (await client.post('/__/oauth/refresh')).status_code,
                        401
                    )

    async def test_no_remote_or_forwarded_header_downgrade(self):
        cases = [
            ('http://app.example', {}),
            ('http://192.168.1.2:9871', {}),
            ('http://localhost.evil.example', {}),
            ('http://127.0.0.1.evil.example', {}),
            ('http://app.example', {
                'origin': 'http://localhost'
            }),
            (
                'http://app.example', {
                    'x-forwarded-host': 'localhost',
                    'x-forwarded-proto': 'http'
                }
            ),
            (
                'http://localhost', {
                    'x-forwarded-host': 'app.example',
                    'x-forwarded-proto': 'http'
                }
            ),
            (
                'http://localhost', {
                    'x-forwarded-host': 'localhost',
                    'x-forwarded-proto': 'https'
                }
            ),
            ('https://localhost', {
                'x-forwarded-proto': 'http'
            }),
        ]
        for origin, headers in cases:
            with self.subTest(origin=origin, headers=headers):
                _, client = self.make_client(origin, headers)
                async with client:
                    self.assert_cookies(
                        await client.get('/__/oauth/start'), True
                    )
                    logout = await client.post('/__/oauth/signout')
                    if 'origin' in headers:
                        self.assertEqual(logout.status_code, 403)
                    else:
                        self.assert_cookies(logout, True)

    async def test_finish_rejects_missing_tampered_expired_or_other_flow_cookie(
        self
    ):
        for failure in ('missing', 'tampered', 'expired', 'other-flow'):
            with self.subTest(failure=failure):
                server, client = self.make_client('http://127.0.0.1:9871')
                async with client:
                    _, callback = await self.to_finish(client)
                    pending = client.cookies.get(PENDING_COOKIE_NAME)
                    assert pending is not None
                    client.cookies.clear()
                    if failure == 'tampered':
                        client.cookies.set(
                            PENDING_COOKIE_NAME, pending + 'broken',
                            path='/__/oauth/'
                        )
                    elif failure == 'expired':
                        data = server._verify_jwt(pending, 'pending-browser')
                        assert data is not None
                        client.cookies.set(
                            PENDING_COOKIE_NAME,
                            server._make_jwt(data, ttl_seconds=-1),
                            path='/__/oauth/'
                        )
                    elif failure == 'other-flow':
                        await client.get('/__/oauth/start')
                    response = await client.get(callback.headers['location'])
                    self.assertEqual(response.status_code, 400)
                    self.assert_cookies(response, False)
                    self.assertFalse(
                        (await client.get('/__/oauth/whoami')
                        ).json()['authenticated']
                    )
                    if failure == 'other-flow':
                        self.assertEqual(
                            response.json()['error_description'],
                            'PKCE verification failed.'
                        )

    async def test_invalid_code_and_provider_error_clear_pending(self):
        for query in ('code=invalid', 'error=access_denied', ''):
            _, client = self.make_client('http://localhost:9871')
            async with client:
                await client.get('/__/oauth/start')
                response = await client.get('/__/oauth/finish?' + query)
                self.assertEqual(response.status_code, 400)
                self.assert_cookies(response, False)
                self.assertFalse(
                    any(
                        c.name == PENDING_COOKIE_NAME
                        for c in client.cookies.jar
                    )
                )

    async def test_invalid_refresh_clears_session(self):
        for origin in ('http://localhost:9871', 'https://app.example'):
            _, client = self.make_client(origin)
            async with client:
                client.cookies.set(
                    REFRESH_COOKIE_NAME, 'invalid', path='/__/oauth/'
                )
                response = await client.post('/__/oauth/refresh')
                self.assertEqual(response.status_code, 401)
                self.assert_cookies(
                    response, origin.startswith('https:'), session=True
                )

    async def test_consent_cookie_transport_and_csrf(self):
        for origin in (
            'http://localhost:9871', 'https://app.example',
            'http://app.example'
        ):
            _, client = self.make_client(origin)
            async with client:
                registered = await client.post(
                    '/__/oauth/register', json={
                        'redirect_uris': ['https://client.example/callback']
                    }
                )
                self.assertEqual(registered.status_code, 201)
                response = await client.get(
                    '/__/oauth/authorize', params={
                        'client_id': registered.json()['client_id'],
                        'redirect_uri': 'https://client.example/callback',
                        'response_type': 'code',
                        'code_challenge': 'challenge',
                        'code_challenge_method': 'S256'
                    }
                )
                self.assertEqual(response.status_code, 200)
                cookie = next(
                    iter(
                        SimpleCookie(response.headers['set-cookie']).values()
                    )
                )
                self.assertEqual(
                    bool(cookie['secure']),
                    not origin.startswith('http://localhost')
                )
                self.assertEqual(cookie['samesite'], 'strict')
                self.assertTrue(cookie['httponly'])
                # A forged consent form cannot bypass the signed token check.
                denied = await client.post(
                    '/__/oauth/consent', data={
                        'consent': 'invalid',
                        'action': 'approve'
                    }
                )
                self.assertEqual(denied.status_code, 400)

    async def test_invalid_callback_state_does_not_create_session(self):
        _, client = self.make_client('http://localhost:9871')
        async with client:
            for query in ('code=anonymous', 'code=anonymous&state=invalid'):
                response = await client.get('/__/oauth/callback?' + query)
                self.assertEqual(response.status_code, 400)
                self.assertNotIn('set-cookie', response.headers)

    async def test_untrusted_return_to_rejected(self):
        _, client = self.make_client('http://localhost:9871')
        async with client:
            for target in (
                'https://evil.example', '//evil.example', 'javascript:alert(1)'
            ):
                response = await client.get(
                    '/__/oauth/start', params={'return_to': target}
                )
                self.assertEqual(response.status_code, 400)
                self.assertNotIn('set-cookie', response.headers)


if __name__ == '__main__':
    unittest.main()
