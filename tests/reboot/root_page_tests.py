import aiohttp
import os
import shutil
import tempfile
import unittest
from aiohttp import web
from pathlib import Path
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot
from reboot.settings import (
    ENVVAR_RBT_WEB_APP_DIST_PATH,
    ENVVAR_RBT_WEB_APP_URL,
)
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

    async def test_serves_reboot_root_page(self) -> None:
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

    async def test_serves_web_app_from_dev_server(self) -> None:
        # A stand-in for the Vite dev server: the page, with the path
        # and query it was asked for, at `/` and at any path a browser
        # navigates to; one `public/` file; 404 for anything else.
        async def dev_server(request: web.Request) -> web.Response:
            if request.path == '/favicon.svg':
                return web.Response(
                    text='<svg/>', content_type='image/svg+xml'
                )
            if 'text/html' in request.headers.get('Accept', ''):
                return web.Response(
                    text=f'<html>{request.path_qs}</html>',
                    content_type='text/html',
                )
            return web.Response(status=404)

        app = web.Application()
        app.router.add_route('*', '/{path:.*}', dev_server)
        runner = web.AppRunner(app)
        await runner.setup()
        self.addAsyncCleanup(runner.cleanup)
        site = web.TCPSite(runner, '127.0.0.1', 0)
        await site.start()
        port = site._server.sockets[0].getsockname()[1]

        os.environ[ENVVAR_RBT_WEB_APP_URL] = f'http://127.0.0.1:{port}'
        self.addCleanup(os.environ.pop, ENVVAR_RBT_WEB_APP_URL, None)
        await self.rbt.up(
            Application(servicers=[MyGreeterServicer]),
            local_envoy=True,
        )

        async with aiohttp.ClientSession() as session:
            html = {'Accept': 'text/html'}
            async with session.get(
                self.rbt.url() + '/', headers=html
            ) as response:
                self.assertEqual(response.status, 200)
                self.assertTrue(
                    response.headers['Content-Type'].startswith('text/html')
                )
                self.assertEqual(await response.text(), '<html>/</html>')

            # A deep link, with its query, as the dev server answers
            # it, so the app's own routing works on a reload.
            async with session.get(
                self.rbt.url() + '/counters/42?tab=history', headers=html
            ) as response:
                self.assertEqual(response.status, 200)
                self.assertEqual(
                    await response.text(),
                    '<html>/counters/42?tab=history</html>',
                )

            # The web app's `public/` files, and the dev server's own
            # 404 for an asset that isn't there.
            async with session.get(
                self.rbt.url() + '/favicon.svg'
            ) as response:
                self.assertEqual(response.status, 200)
                self.assertEqual(await response.text(), '<svg/>')
            async with session.get(self.rbt.url() + '/missing.js') as response:
                self.assertEqual(response.status, 404)

            # Reboot's own paths are untouched.
            async with session.get(
                self.rbt.url() + '/__/rootpage/favicon.svg'
            ) as response:
                self.assertEqual(response.status, 200)

    async def test_says_when_the_dev_server_is_down(self) -> None:
        os.environ[ENVVAR_RBT_WEB_APP_URL] = 'http://127.0.0.1:1'
        self.addCleanup(os.environ.pop, ENVVAR_RBT_WEB_APP_URL, None)
        await self.rbt.up(
            Application(servicers=[MyGreeterServicer]),
            local_envoy=True,
        )

        async with aiohttp.ClientSession() as session:
            async with session.get(self.rbt.url() + '/') as response:
                self.assertEqual(response.status, 502)
                self.assertIn('http://127.0.0.1:1', await response.text())

    def _web_dist(self) -> Path:
        """A built web app: an `index.html` and one asset, in a
        directory `--web-app-dist-path` is pointed at (absolute, so the
        project root it is joined onto doesn't matter)."""
        directory = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, directory)
        (directory / 'index.html').write_text('<html>the web app</html>')
        (directory / 'app.js').write_text('console.log("the web app")')
        os.environ[ENVVAR_RBT_WEB_APP_DIST_PATH] = str(directory)
        self.addCleanup(os.environ.pop, ENVVAR_RBT_WEB_APP_DIST_PATH, None)
        return directory

    async def test_serves_web_app_at_root(self) -> None:
        self._web_dist()
        await self.rbt.up(
            Application(servicers=[MyGreeterServicer]),
            local_envoy=True,
        )

        async with aiohttp.ClientSession() as session:
            # `/` is the web app, not Reboot's page.
            async with session.get(self.rbt.url() + '/') as response:
                self.assertEqual(response.status, 200)
                self.assertEqual(
                    await response.text(), '<html>the web app</html>'
                )

            # Its files are served beside it.
            async with session.get(self.rbt.url() + '/app.js') as response:
                self.assertEqual(response.status, 200)
                self.assertIn('the web app', await response.text())

            # A navigation to a path the app has no file for is the
            # web app too, so its own routing works on reload...
            async with session.get(
                self.rbt.url() + '/accounts/42',
                headers={'Accept': 'text/html,*/*'},
            ) as response:
                self.assertEqual(response.status, 200)
                self.assertEqual(
                    await response.text(), '<html>the web app</html>'
                )

            # ...but a request for something that isn't a page 404s,
            # so a typo isn't masked.
            async with session.get(
                self.rbt.url() + '/accounts/42',
                headers={'Accept': 'application/json'},
            ) as response:
                self.assertEqual(response.status, 404)

            # Reboot's own paths still win.
            async with session.get(
                self.rbt.url() + '/__/rootpage/favicon.svg'
            ) as response:
                self.assertEqual(response.status, 200)


if __name__ == '__main__':
    unittest.main()
