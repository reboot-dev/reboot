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

    async def test_forwards_to_root(self) -> None:
        await self.rbt.up(
            Application(servicers=[MyGreeterServicer], root='/app/'),
            local_envoy=True,
        )

        page = await self.root_page()
        self.assertIn(
            '<script>location.replace("/app/" + '
            'location.search + location.hash);</script>',
            page,
        )
        self.assertIn(
            '<meta http-equiv="refresh" content="0; url=/app/">',
            page,
        )

    async def test_serves_reboot_root_page_without_root(self) -> None:
        await self.rbt.up(
            Application(servicers=[MyGreeterServicer]),
            local_envoy=True,
        )

        page = await self.root_page()
        self.assertIn('/__/rootpage/bundle.js', page)
        self.assertNotIn('location.replace', page)

    def test_root_must_be_a_path(self) -> None:
        for root in ['app/', '//elsewhere.example/', 'https://example.com/']:
            with self.subTest(root=root):
                with self.assertRaises(ValueError):
                    Application(servicers=[MyGreeterServicer], root=root)


if __name__ == '__main__':
    unittest.main()
