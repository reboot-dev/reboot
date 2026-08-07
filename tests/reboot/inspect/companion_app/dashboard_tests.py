"""The companion serves the dashboard, and that page describes the
application under development.

The companion is itself a Reboot application, so it can describe
itself: pointing the page at the companion's own address exercises the
whole path -- config route, `Inspect.GetSchema`, and rendering -- in
one process.
"""
import asyncio
import os
import socket
import time
import unittest
from rbt.inspect.companion_app.v1.dashboard_pb2 import StateTypeInfo
from rbt.inspect.companion_app.v1.dashboard_rbt import Schema
from reboot.aio.tests import Reboot
from reboot.inspect.companion_app.constants import (
    DASHBOARD_PATH,
    ENVVAR_RBT_APPLICATION_URL,
    SCHEMA_ID,
)
from reboot.inspect.companion_app.main import application
from reboot.inspect.companion_app.watcher import watch
from reboot.std.presence.v1.presence import Presence
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.wait import WebDriverWait
from testing.web import webtest
from typing import Optional
from unittest.mock import patch

PRESENCE_ID = 'dashboard'


def _driver():
    return webtest.new_webdriver_session(
        capabilities={
            'goog:chromeOptions':
                {
                    'args':
                        [
                            '--headless',
                            '--no-sandbox',
                            '--disable-dev-shm-usage',
                        ],
                },
            'goog:loggingPrefs': {
                'browser': 'ALL',
            },
        }
    )


class DashboardTest(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        # The companion describes itself, so it needs its own address
        # before it starts -- the servers are subprocesses and read the
        # environment they inherit.
        with socket.socket() as probe:
            probe.bind(('127.0.0.1', 0))
            port = probe.getsockname()[1]

        self.url = f'http://127.0.0.1:{port}'
        self._environment = patch.dict(
            os.environ,
            {ENVVAR_RBT_APPLICATION_URL: self.url},
        )
        self._environment.start()

        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(
            application(),
            local_envoy=True,
            local_envoy_port=port,
        )

        # The companion watches itself, which exercises the whole path
        # -- watcher, state, reactive read -- in one process.
        self.watcher = asyncio.create_task(
            watch(application_url=self.url, companion_url=self.url)
        )

    async def asyncTearDown(self) -> None:
        self.watcher.cancel()
        await self.rbt.stop()
        self._environment.stop()

    async def _wait_for_viewers(self, satisfied) -> None:
        """Polls until presence satisfies `satisfied`.

        Polling rather than reading reactively because `List` aborts
        with `StateNotConstructed` until somebody has subscribed at
        least once, which is where a fresh application starts.
        """
        while True:
            context = self.rbt.create_external_context(name=self.id())
            # A fresh reference per context; one cannot be shared.
            presence = Presence.ref(PRESENCE_ID)
            try:
                response = await presence.List(context)
                if satisfied(list(response.subscriber_ids)):
                    return
            except Presence.ListAborted:
                if satisfied([]):
                    return
            await asyncio.sleep(0.5)

    def _run(self, body):
        driver = _driver()
        try:
            return body(driver)
        finally:
            print("##### Browser logs #####")
            for entry in driver.get_log('browser'):
                print(entry)
            print("##### End of browser logs #####")
            driver.quit()

    async def test_the_watcher_records_the_application(self) -> None:
        # The companion watches the application and records its shape,
        # so a browser never has to reach that application itself.
        # Here the companion watches itself, which exercises the whole
        # path in one process.
        while True:
            context = self.rbt.create_external_context(name=self.id())
            try:
                response = await Schema.ref(SCHEMA_ID).Get(context)
                if len(response.state_types) > 0:
                    break
            except Exception:
                pass
            await asyncio.sleep(0.5)

        names = [state_type.name for state_type in response.state_types]
        self.assertIn('rbt.inspect.companion_app.v1.Dashboard', names)
        self.assertTrue(response.connected)

    async def test_describes_the_application(self) -> None:
        # The companion describes itself, so the page should show the
        # state types this very application registers.
        def body(driver):
            driver.get(f'{self.url}{DASHBOARD_PATH}/')
            WebDriverWait(driver, 60).until(
                expected_conditions.presence_of_element_located(
                    (By.ID, 'rbt.inspect.companion_app.v1.Dashboard')
                )
            )
            return driver.page_source

        page = await asyncio.to_thread(self._run, body)

        # A method, its kind, and its source file all come from the
        # schema rather than from anything the page knew in advance.
        #
        # Note the method reads `RecordOpened`, not the `record_opened`
        # its author wrote: the descriptors carry PascalCase. See the
        # naming note under "The dashboard: application overview".
        self.assertIn('RecordOpened', page)
        self.assertIn('reader', page)
        self.assertIn('dashboard.proto', page)

        # State types are grouped by their proto package, which is the
        # directory the developer wrote them in.
        self.assertIn('rbt.inspect.companion_app.v1', page)
        self.assertIn('rbt.std.presence.v1', page)

    async def test_the_page_holds_presence(self) -> None:
        # Presence no longer decides whether to open a dashboard, but
        # the page still mounts it so the fix is exercised when it
        # lands. See "Presence: measured, and deferred".
        driver = await asyncio.to_thread(_driver)
        try:
            await asyncio.to_thread(driver.get, f'{self.url}{DASHBOARD_PATH}/')

            # Wait for the viewer to register, rather than assuming a
            # page load is enough.
            await self._wait_for_viewers(lambda viewers: viewers != [])
        finally:
            await asyncio.to_thread(driver.quit)

        # With the browser gone the viewer must drain, which is what
        # makes presence usable as a liveness signal at all.
        await self._wait_for_viewers(lambda viewers: viewers == [])


class _Relay:
    """A TCP relay that can be broken and restored on one port.

    Stands in for whatever sits between two parties -- a server that
    restarts, a forwarded port -- so a test can take a connection away
    and give it back without stopping either end.
    """

    def __init__(self, upstream_port: int) -> None:
        self._upstream_port = upstream_port
        self._server: Optional[asyncio.AbstractServer] = None
        self._connections: list[asyncio.StreamWriter] = []

        with socket.socket() as probe:
            probe.bind(('127.0.0.1', 0))
            self.port = probe.getsockname()[1]

    async def open(self) -> None:
        self._server = await asyncio.start_server(
            self._handle,
            '127.0.0.1',
            self.port,
        )

    async def close(self) -> None:
        """Ends every relayed connection and refuses new ones."""
        if self._server is not None:
            self._server.close()
            self._server = None
        for writer in self._connections:
            writer.close()
        self._connections = []

    async def _handle(self, reader, writer) -> None:
        upstream_reader, upstream_writer = await asyncio.open_connection(
            '127.0.0.1', self._upstream_port
        )
        self._connections += [writer, upstream_writer]

        async def pump(source, sink) -> None:
            try:
                while True:
                    data = await source.read(65536)
                    if len(data) == 0:
                        break
                    sink.write(data)
                    await sink.drain()
            except Exception:
                pass
            finally:
                sink.close()

        await asyncio.gather(
            pump(reader, upstream_writer),
            pump(upstream_reader, writer),
        )


class WatcherReconnectTest(unittest.IsolatedAsyncioTestCase):
    """Restarting the application must not empty the dashboard.

    The shape recorded before a restart is the same shape after it in
    almost every case, so it is shown throughout, marked as no longer
    current. Dropping it would blank the dashboard exactly when it is
    being read most.
    """

    async def asyncSetUp(self) -> None:
        with socket.socket() as probe:
            probe.bind(('127.0.0.1', 0))
            self.port = probe.getsockname()[1]

        self.url = f'http://127.0.0.1:{self.port}'
        self._environment = patch.dict(
            os.environ,
            {ENVVAR_RBT_APPLICATION_URL: self.url},
        )
        self._environment.start()

        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(
            application(),
            local_envoy=True,
            local_envoy_port=self.port,
        )

        # The watcher reaches the application through a relay this test
        # owns, so its stream can be broken while the companion it
        # writes to stays up. That is what a restart of the application
        # under development looks like from the watcher's side.
        self.relay = _Relay(self.port)
        await self.relay.open()

        self.watcher = asyncio.create_task(
            watch(
                application_url=f'http://127.0.0.1:{self.relay.port}',
                companion_url=self.url,
            )
        )

    async def asyncTearDown(self) -> None:
        self.watcher.cancel()
        await self.relay.close()
        await self.rbt.stop()
        self._environment.stop()

    async def _schema(self):
        context = self.rbt.create_external_context(name=self.id())
        return await Schema.ref(SCHEMA_ID).Get(context)

    async def _wait_for(self, satisfied):
        while True:
            try:
                schema = await self._schema()
                if satisfied(schema):
                    return schema
            except Exception:
                pass
            await asyncio.sleep(0.1)

    async def test_the_shape_survives_a_restart(self) -> None:
        recorded = await self._wait_for(
            lambda schema: len(schema.state_types) > 0 and schema.connected
        )
        names = [state_type.name for state_type in recorded.state_types]

        await self.relay.close()

        # The application is gone, and the dashboard is told so -- but
        # it still has something to show.
        lost = await self._wait_for(lambda schema: not schema.connected)
        self.assertEqual(
            names,
            [state_type.name for state_type in lost.state_types],
        )

        # And when the application comes back the same shape is marked
        # current again, rather than arriving as though it were new.
        await self.relay.open()

        found = await self._wait_for(lambda schema: schema.connected)
        self.assertEqual(
            names,
            [state_type.name for state_type in found.state_types],
        )


class PageRecoveryMeasurement(unittest.IsolatedAsyncioTestCase):
    """How long a page takes to show a change it could not see happen.

    Measures the last link in the chain on its own -- the page's
    reactive read of the companion -- by writing the schema directly
    and never running a watcher. The page reaches the companion
    through a relay, so its connection can be taken away and given
    back while the companion itself stays up, which is what the
    companion restarting with `rbt dev run` looks like from the page.

    Prints two numbers and asserts only that the page arrives, since
    a duration assertion would be flaky on a loaded machine.
    """

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(application(), local_envoy=True)

        self.port = self.rbt.envoy_port()
        self.relay = _Relay(self.port)
        await self.relay.open()
        self.dashboard_url = (
            f'http://127.0.0.1:{self.relay.port}{DASHBOARD_PATH}/'
        )

    async def asyncTearDown(self) -> None:
        await self.relay.close()
        await self.rbt.stop()

    async def _record(self, name: str) -> None:
        context = self.rbt.create_external_context(name=self.id())
        await Schema.ref(SCHEMA_ID).Record(
            context,
            state_types=[
                StateTypeInfo(name=name, file='measured.proto'),
            ],
            connected=True,
        )

    async def _seconds_until_shown(self, driver, name: str) -> float:
        """Polls the page until `name` is rendered, returning how long."""
        started = time.monotonic()
        while True:
            shown = await asyncio.to_thread(driver.find_elements, By.ID, name)
            if len(shown) > 0:
                return time.monotonic() - started
            await asyncio.sleep(0.05)

    async def test_how_long_a_page_takes_to_catch_up(self) -> None:
        await self._record('measured.v1.First')

        driver = await asyncio.to_thread(_driver)
        try:
            await asyncio.to_thread(driver.get, self.dashboard_url)
            load = await self._seconds_until_shown(driver, 'measured.v1.First')

            # With the page connected, how long does a write take to
            # arrive? This is the push on its own, with no reconnect.
            await self._record('measured.v1.Connected')
            push = await self._seconds_until_shown(
                driver, 'measured.v1.Connected'
            )

            # Now the case that matters: the change happens while the
            # page cannot see it, and the page has to notice by itself
            # once its connection comes back.
            await self.relay.close()
            await self._record('measured.v1.WhileAway')
            await self.relay.open()

            recovery = await self._seconds_until_shown(
                driver, 'measured.v1.WhileAway'
            )
        finally:
            await asyncio.to_thread(driver.quit)

        print(f'##### first load:        {load:.2f}s')
        print(f'##### push while joined: {push:.2f}s')
        print(f'##### after a break:     {recovery:.2f}s')


if __name__ == '__main__':
    unittest.main()
