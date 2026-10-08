"""An HTTP route with `authenticated=True` serves a request signed in
with the application's access token and no other, and does so from
any origin, with no credentials allowed; see `HTTP._api_route`.
"""
import httpx
import unittest
from reboot.aio.applications import Application
from reboot.aio.auth.oauth import OAuth
from reboot.aio.auth.oauth_providers import Development
from reboot.aio.exceptions import InputError
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

    @application.http.get('/private/{name}', authenticated=True)
    async def private(name: str) -> PlainTextResponse:
        return PlainTextResponse(f'hello {name}')

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
            self.assertEqual(
                response.headers['Access-Control-Allow-Origin'], '*'
            )
            self.assertEqual(response.headers['WWW-Authenticate'], 'Bearer')

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
            self.assertEqual(response.status_code, 204)
            self.assertEqual(
                response.headers['Access-Control-Allow-Origin'], '*'
            )
            self.assertIn(
                'authorization',
                response.headers['Access-Control-Allow-Headers'],
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
            self.assertEqual(
                response.headers['Access-Control-Allow-Origin'], '*'
            )

    async def test_needs_an_oauth_server(self) -> None:
        with self.assertRaisesRegex(InputError, 'authenticated=True'):
            await self.rbt.up(
                _application(oauth=False), local_envoy=True, inject_oauth=False
            )


if __name__ == '__main__':
    unittest.main()
