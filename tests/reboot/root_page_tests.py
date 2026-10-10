import aiohttp
import unittest
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot
from tests.reboot.greeter_servicers import MyGreeterServicer


class RootPageTest(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def root_page(self) -> str:
        async with aiohttp.ClientSession() as session:
            async with session.get(self.rbt.url() + '/') as response:
                self.assertEqual(response.status, 200)
                return await response.text()

    async def test_redirects_to_root(self) -> None:
        await self.rbt.up(
            Application(servicers=[MyGreeterServicer], root='/app/'),
            local_envoy=True,
        )

        async with aiohttp.ClientSession() as session:
            async with session.get(
                self.rbt.url() + '/',
                allow_redirects=False,
            ) as response:
                self.assertEqual(response.status, 307)
                self.assertEqual(response.headers['Location'], '/app/')

            # The query comes along, e.g. `/?opened=automatically`.
            async with session.get(
                self.rbt.url() + '/?opened=automatically',
                allow_redirects=False,
            ) as response:
                self.assertEqual(response.status, 307)
                self.assertEqual(
                    response.headers['Location'],
                    '/app/?opened=automatically',
                )

    async def test_serves_reboot_root_page_without_root(self) -> None:
        await self.rbt.up(
            Application(servicers=[MyGreeterServicer]),
            local_envoy=True,
        )

        page = await self.root_page()
        self.assertIn('/__/rootpage/bundle.js', page)

        async with aiohttp.ClientSession() as session:
            # The page's assets, and the install wizard's probe, come
            # from the same server.
            async with session.get(
                self.rbt.url() + '/__/rootpage/bundle.js'
            ) as response:
                self.assertEqual(response.status, 200)
                self.assertTrue(
                    response.headers['Content-Type'].
                    startswith('text/javascript')
                )
            async with session.get(self.rbt.url() + '/__/probe') as response:
                self.assertEqual(response.status, 200)
            # Only the page's own assets, not the package's sources.
            async with session.get(
                self.rbt.url() + '/__/rootpage/page.py'
            ) as response:
                self.assertEqual(response.status, 404)

    def test_root_must_be_a_path(self) -> None:
        for root in ['app/', '//elsewhere.example/', 'https://example.com/']:
            with self.subTest(root=root):
                with self.assertRaises(ValueError):
                    Application(servicers=[MyGreeterServicer], root=root)


if __name__ == '__main__':
    unittest.main()
