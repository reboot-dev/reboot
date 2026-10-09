"""`OAuth(hosts=...)`: the OAuth server answers only under the
hostnames it was given, and refuses every endpoint under any other."""
import httpx
import unittest
from reboot.aio.applications import Application
from reboot.aio.auth.oauth import OAuth
from reboot.aio.auth.oauth_providers import Development
from reboot.aio.tests import OAuthProviderForTest, Reboot
from reboot.ping.ping import CounterServicer


class OAuthHostsTest(unittest.IsolatedAsyncioTestCase):

    async def test_answers_under_the_listed_hosts_only(self) -> None:
        rbt = Reboot()
        await rbt.start()
        self.addAsyncCleanup(rbt.stop)
        await rbt.up(
            Application(
                servicers=[CounterServicer],
                oauth=OAuth(
                    provider=OAuthProviderForTest(Development()),
                    allowed_origins=[],
                    hosts=['localhost', '127.0.0.1'],
                ),
            ),
            local_envoy=True,
        )
        url = rbt.http_localhost_url('/.well-known/oauth-authorization-server')
        async with httpx.AsyncClient() as client:
            self.assertEqual((await client.get(url)).status_code, 200)
            # The name a tunnel would forward under.
            response = await client.get(
                url, headers={'Host': 'tunnel.example'}
            )
            self.assertEqual(response.status_code, 403)
            self.assertEqual(response.json()['error'], 'access_denied')

    def test_hostnames_carry_no_port(self) -> None:
        with self.assertRaisesRegex(ValueError, 'no port'):
            OAuth(
                provider=OAuthProviderForTest(Development()),
                hosts=['localhost:9991'],
            )


if __name__ == '__main__':
    unittest.main()
