import aiohttp
import os
import shutil
import tempfile
import unittest
from pathlib import Path
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot
from reboot.settings import ENVVAR_RBT_WEB_APP, ENVVAR_RBT_WEB_APP_DIST_PATH
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

    async def test_web_app_and_application_root_mount_conflict(self) -> None:
        self._web_dist()

        async def app(scope, receive, send) -> None:
            pass

        application = Application(servicers=[MyGreeterServicer])
        application.http.mount('/', app=app)
        with self.assertRaises(Exception) as raised:
            await self.rbt.up(application, local_envoy=True)
        self.assertIn('mounts `/` itself', str(raised.exception))

    async def test_web_app_switch_and_application_root_mount_conflict(
        self
    ) -> None:
        # `--web-app` has Envoy give `/` to the frontend's dev server;
        # an application that mounts `/` itself is refused just the
        # same.
        os.environ[ENVVAR_RBT_WEB_APP] = "true"
        self.addCleanup(os.environ.pop, ENVVAR_RBT_WEB_APP, None)

        async def app(scope, receive, send) -> None:
            pass

        application = Application(servicers=[MyGreeterServicer])
        application.http.mount('/', app=app)
        with self.assertRaises(Exception) as raised:
            await self.rbt.up(application, local_envoy=True)
        self.assertIn('`--web-app` was set', str(raised.exception))


if __name__ == '__main__':
    unittest.main()
