"""An HTTP route with `require_oauth_token=True` serves only a request
that carries the application's access token, and Envoy lets any
origin call it without credentials; see `HTTP._api_route`.
"""
import httpx
import unittest
from reboot.aio.applications import Application
from reboot.aio.auth.oauth import OAuth
from reboot.aio.auth.oauth_providers import Development
from reboot.aio.exceptions import InputError
from reboot.aio.external import ExternalContext
from reboot.aio.http import InjectExternalContext
from reboot.aio.tests import OAuthProviderForTest, Reboot
from reboot.ping.ping import CounterServicer
from starlette.responses import PlainTextResponse


def _application(*, oauth: bool) -> Application:
    application = Application(
        servicers=[CounterServicer],
        oauth=OAuth(
            provider=OAuthProviderForTest(Development()),
            allowed_origins=[],
        ) if oauth else None,
    )

    @application.http.get('/private/{name}', require_oauth_token=True)
    async def private(name: str) -> PlainTextResponse:
        return PlainTextResponse(f'hello {name}')

    # Whether the context the handler calls Reboot methods with carries
    # the token the route accepted.
    @application.http.get('/context', require_oauth_token=True)
    async def context(
        context: ExternalContext = InjectExternalContext,
    ) -> PlainTextResponse:
        return PlainTextResponse(
            'none' if context.bearer_token is None else 'bearer'
        )

    return application


class AuthenticatedRoutesTest(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        self.addAsyncCleanup(self.rbt.stop)

    async def test_only_the_access_token_gets_in(self) -> None:
        await self.rbt.up(_application(oauth=True), local_envoy=True)
        url = self.rbt.http_localhost_url('/private/you')
        foreign = {'Origin': 'https://sandbox.example'}
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=foreign)
            self.assertEqual(response.status_code, 401)
            # Envoy's policy, which echoes the origin; the route sends
            # no CORS headers of its own.
            self.assertEqual(
                response.headers['Access-Control-Allow-Origin'],
                foreign['Origin'],
            )
            challenge = response.headers['WWW-Authenticate']
            self.assertTrue(challenge.startswith('Bearer resource_metadata='))
            self.assertIn('/.well-known/oauth-protected-resource', challenge)

            response = await client.get(
                url, headers={
                    **foreign, 'Authorization': 'Bearer wrong'
                }
            )
            self.assertEqual(response.status_code, 401)

            response = await client.options(
                url,
                headers={
                    **foreign,
                    'Access-Control-Request-Method': 'GET',
                    'Access-Control-Request-Headers': 'authorization',
                },
            )
            # Envoy answers the preflight itself.
            self.assertEqual(response.status_code, 200)
            self.assertEqual(
                response.headers['Access-Control-Allow-Origin'],
                foreign['Origin'],
            )
            self.assertIn(
                'authorization',
                response.headers['Access-Control-Allow-Headers'].lower(),
            )
            self.assertNotIn(
                'Access-Control-Allow-Credentials', response.headers
            )

            token = await self.rbt.make_valid_oauth_access_token()
            response = await client.get(
                url, headers={
                    **foreign, 'Authorization': f'Bearer {token}'
                }
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.text, 'hello you')

            # The session cookie holds the access JWT. The route accepts
            # it on a same-origin request and rejects it cross-site.
            cookie = {'Cookie': f'rbt_session={token}'}
            response = await client.get(url, headers=cookie)
            self.assertEqual(response.status_code, 200)
            response = await client.get(
                url, headers={
                    **cookie, 'Sec-Fetch-Site': 'cross-site'
                }
            )
            self.assertEqual(response.status_code, 401)

            # The handler's context carries the token the route
            # accepted, from the header or from the cookie.
            context_url = self.rbt.http_localhost_url('/context')
            for headers in ({'Authorization': f'Bearer {token}'}, cookie):
                response = await client.get(context_url, headers=headers)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.text, 'bearer')

    async def test_needs_an_oauth_server(self) -> None:
        with self.assertRaisesRegex(InputError, 'require_oauth_token=True'):
            await self.rbt.up(
                _application(oauth=False), local_envoy=True, inject_oauth=False
            )


if __name__ == '__main__':
    unittest.main()
