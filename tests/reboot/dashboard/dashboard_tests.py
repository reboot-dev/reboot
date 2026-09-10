"""The dashboard application serves its page, and that page describes
the application under development.

These tests run the dashboard under the `Reboot()` harness, write the
API state directly, and drive the served page with a browser: the
models page, whose types pane shows a state type named in the URL's
`type` parameter and a data type named in its `data` parameter.
"""
import asyncio
import socket
import unittest
from google.protobuf.json_format import ParseDict
from rbt.dashboard.v1.dashboard_rbt import Dashboard, Preferences
from rbt.v1alpha1.api import api_pb2
from reboot.aio.tests import Reboot
from reboot.dashboard.backend.constants import (
    DASHBOARD_ID,
    DASHBOARD_PATH,
    PREFERENCES_ID,
    PRESENCE_ID,
)
from reboot.dashboard.backend.main import application
from reboot.std.presence.v1.presence import Presence
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.wait import WebDriverWait
from testing.web import webtest


def _new_driver():
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


# What one API file declares, as `api_reader` describes it: its state
# type and methods name entries in `schemas` by reference name, each
# a model's shape in proto JSON, and every model but the state model
# is a data type.
_MODULE = 'shop.v1.shop'
_FILENAME = 'shop/v1/shop.py'


def _schema(name: str, properties: list[dict], **rest) -> dict:
    return {
        'name': name,
        'module': _MODULE,
        'properties': properties,
        **rest,
    }


_SCHEMAS = {
    'ShopState':
        _schema(
            'ShopState',
            [
                {
                    'name': 'name',
                    'tag': 1,
                    'type': {
                        'scalar': 'STRING'
                    },
                    'required': True,
                }
            ],
        ),
    'LookRequest':
        _schema(
            'LookRequest',
            [
                {
                    'name': 'item',
                    'tag': 1,
                    'type': {
                        'scalar': 'STRING'
                    },
                    'required': True,
                }
            ],
        ),
    'LookResponse':
        _schema(
            'LookResponse',
            [
                {
                    'name': 'found',
                    'tag': 1,
                    'type': {
                        'scalar': 'BOOLEAN'
                    },
                    'required': True,
                },
                {
                    'name': 'shelf',
                    'tag': 2,
                    'type': {
                        'reference': {
                            'name': f'{_MODULE}.Shelf'
                        }
                    },
                    'required': True,
                },
            ],
        ),
    # No method names `Shelf`; only `LookResponse.shelf` refers to it.
    'Shelf':
        _schema(
            'Shelf',
            [
                {
                    'name': 'aisle',
                    'tag': 1,
                    'type': {
                        'scalar': 'INTEGER'
                    },
                    'required': True,
                }
            ],
            description='Where an item sits.',
        ),
}

_API = {
    'filename': _FILENAME,
    'package': 'shop.v1',
    'module': _MODULE,
    'stateTypes':
        [
            {
                'name':
                    'Shop',
                'reference': {
                    'name': f'{_MODULE}.ShopState'
                },
                'methods':
                    [
                        {
                            'name': 'look',
                            'reader': {},
                            'factory': False,
                            'errors': [],
                            'request': {
                                'name': f'{_MODULE}.LookRequest'
                            },
                            'response': {
                                'name': f'{_MODULE}.LookResponse'
                            },
                        },
                    ],
            },
        ],
    'dataTypes':
        [
            {
                'name': f'{_MODULE}.{name}'
            } for name in _SCHEMAS if name != 'ShopState'
        ],
    'schemas':
        {
            f'{_MODULE}.{name}': schema for name, schema in _SCHEMAS.items()
        },
}


class DashboardTest(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        # The dashboard application serves the page, so the test picks
        # the port itself to know the address a browser will open.
        with socket.socket() as probe:
            probe.bind(('127.0.0.1', 0))
            port = probe.getsockname()[1]

        self.url = f'http://127.0.0.1:{port}'

        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(
            application(),
            local_envoy=True,
            local_envoy_port=port,
        )

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def _wait_for_viewers(self, satisfied, driver=None) -> None:
        """`List` aborts with `StateNotConstructed` until somebody has
        subscribed at least once, which is where a fresh application
        starts, so an abort means no viewers.

        The wait has no deadline: when it never finishes, the harness
        kills the test with its `finally` unrun, so the loop prints what
        it sees, including anything the page logged, as it goes.
        """
        polls = 0
        while True:
            context = self.rbt.create_external_context(name=self.id())
            # A reference binds to the first context that uses it, so
            # each context needs its own.
            presence = Presence.ref(PRESENCE_ID)
            viewers: list[str] = []
            try:
                response = await presence.List(context)
                viewers = list(response.subscriber_ids)
                if satisfied(viewers):
                    return
            except Presence.ListAborted:
                if satisfied([]):
                    return

            polls += 1
            if polls % 10 == 0:
                print(f'##### still waiting, {polls} polls, viewers={viewers}')
                if driver is not None:
                    for entry in await asyncio.to_thread(
                        driver.get_log, 'browser'
                    ):
                        print(f'##### page: {entry}')
                    text = await asyncio.to_thread(
                        lambda: driver.find_element(By.TAG_NAME, 'body').text
                    )
                    print(f'##### page text: {text[:300]!r}')

            await asyncio.sleep(0.5)

    async def _record_state_types(self) -> None:
        """Writes the state types an API file would yield straight into
        the application, so the tests here show only that the page
        renders whatever the application's state contains. Reading
        files is covered by `api_reader_tests` and `api_watcher_tests`.
        """
        context = self.rbt.create_external_context(name=self.id())
        await Dashboard.ref(DASHBOARD_ID).UpdateApi(
            context,
            api_directory='api',
            api_files={},
            apis={_FILENAME: ParseDict(_API, api_pb2.API())},
        )

    def _run_in_browser(self, body):
        driver = _new_driver()
        try:
            return body(driver)
        finally:
            print("##### Browser logs #####")
            for entry in driver.get_log('browser'):
                print(entry)
            print("##### End of browser logs #####")
            driver.quit()

    async def test_describes_what_the_api_files_declare(self) -> None:
        # The types pane shows a state type because a file on disk
        # declares one, with no generated code, no build and no
        # running application. A half-written file is the normal case
        # while someone is typing, so the page shows the error beside
        # the state types it last parsed rather than in place of them.
        def body(driver):
            driver.get(
                f'{self.url}{DASHBOARD_PATH}/#/models?type=shop.v1.Shop'
            )
            WebDriverWait(driver, 60).until(
                expected_conditions.presence_of_element_located(
                    (By.CSS_SELECTOR, '[id="/type/shop.v1.Shop"]')
                )
            )
            return driver.page_source

        context = self.rbt.create_external_context(name=self.id())
        await Dashboard.ref(DASHBOARD_ID).UpdateApi(
            context,
            api_directory='api',
            api_files={},
            apis={_FILENAME: ParseDict(_API, api_pb2.API())},
            error='shop.py: SyntaxError: invalid syntax',
        )

        page = await asyncio.to_thread(self._run_in_browser, body)

        # The method's name, kind, and source file come from the _SHOP
        # declaration, not from anything built into the page, and the
        # pane shows them as the declaration wrote them.
        self.assertIn('look', page)
        self.assertIn('reader', page)
        self.assertIn('shop/v1/shop.py', page)

        # The pane counts what the state type declares, and names what
        # it counts. The fixture declares one method, so this also
        # checks the singular.
        self.assertIn('1 method', page)

        # The page shows the error alongside the description, not in
        # place of it.
        self.assertIn('shop.py: SyntaxError: invalid syntax', page)

    # The notice's two buttons: one writes the preference and closes
    # the notice, the other only closes it.
    _SUPPRESS = "Don't reopen automatically"
    _CLOSE = 'Close'

    def _dismiss_the_notice(self, driver, label: str) -> None:
        """Clicks the notice's button reading `label` once the notice
        shows, then waits for the notice to go."""
        notice = (By.CLASS_NAME, 'opened-notice')
        WebDriverWait(driver, 60).until(
            expected_conditions.presence_of_element_located(notice)
        )
        # The buttons are read by what the page wrote, not by what
        # the browser renders, which the styling may uppercase.
        buttons = [
            button for button in driver.find_elements(
                By.CLASS_NAME,
                'opened-notice-button',
            ) if button.get_attribute('textContent') == label
        ]
        self.assertEqual(len(buttons), 1, f'no one button reads {label!r}')
        buttons[0].click()
        WebDriverWait(driver, 60).until(
            expected_conditions.invisibility_of_element_located(notice)
        )

    async def _wait_for_suppress_open_on_restart(self, expected: bool) -> None:
        """Returns once the preference reads `expected`: the notice's
        write is what the page sends after the click, so seeing it is
        how the test knows the choice reached the application."""
        context = self.rbt.create_external_context(name=self.id())
        async for response in Preferences.ref(PREFERENCES_ID
                                             ).reactively().Get(context):
            if response.suppress_open_on_restart == expected:
                return

    async def test_the_notice_turns_reopening_off(self) -> None:
        # The CLI opens the page with `?opened=automatically`, and the
        # notice that says so offers not to be reopened: that button
        # writes the preference `rbt dev run` reads before deciding
        # whether to open a dashboard, which `open_dashboard_tests`
        # covers. Closing the notice writes nothing, so the test
        # closes first, then suppresses, and the preference must only
        # change on the second.
        def close(driver):
            driver.get(f'{self.url}{DASHBOARD_PATH}/?opened=automatically')
            self._dismiss_the_notice(driver, self._CLOSE)

        await asyncio.to_thread(self._run_in_browser, close)

        await self._wait_for_suppress_open_on_restart(False)

        def suppress(driver):
            driver.get(f'{self.url}{DASHBOARD_PATH}/?opened=automatically')
            self._dismiss_the_notice(driver, self._SUPPRESS)

        await asyncio.to_thread(self._run_in_browser, suppress)

        await self._wait_for_suppress_open_on_restart(True)

    # Where the pane shows the data type `Shelf`, the way it shows a
    # state type.
    _SHELF = (By.CSS_SELECTOR, '[id="/type/shop.v1.shop.Shelf"]')

    async def test_a_data_type_opens_in_the_pane(self) -> None:
        # No method names `Shelf`: it is reached only as a property of
        # `LookResponse`. A data type is a type of the pane's own, so a
        # link to it, from a changelog row or anywhere else, names it
        # in the URL the way a state type is named.
        await self._record_state_types()

        def body(driver):
            driver.get(
                f'{self.url}{DASHBOARD_PATH}/#/models?type=shop.v1.shop.Shelf'
            )
            WebDriverWait(driver, 60).until(
                expected_conditions.presence_of_element_located(self._SHELF)
            )
            return driver.page_source

        page = await asyncio.to_thread(self._run_in_browser, body)

        # The pane shows what the file declares about the type, its
        # description and its properties, and what contains it.
        self.assertIn('Where an item sits.', page)
        self.assertIn('aisle', page)
        self.assertIn('LookResponse.shelf', page)

    async def test_a_contained_type_opens_from_the_signature(self) -> None:
        # The convention is one level deep: a signature names the type
        # a property contains, and clicking that name opens the type
        # in the pane, from which the browser's back returns to the
        # state type.
        await self._record_state_types()

        shop = (By.CSS_SELECTOR, '[id="/type/shop.v1.Shop"]')

        def body(driver):
            driver.get(
                f'{self.url}{DASHBOARD_PATH}/#/models?type=shop.v1.Shop'
            )
            WebDriverWait(driver, 60).until(
                expected_conditions.presence_of_element_located(shop)
            )
            shelves = [
                name for name in driver.find_elements(
                    By.CSS_SELECTOR,
                    '.method-signature .type-name',
                ) if name.get_attribute('textContent') == 'Shelf'
            ]
            self.assertEqual(len(shelves), 1)
            shelves[0].click()
            WebDriverWait(driver, 60).until(
                expected_conditions.presence_of_element_located(self._SHELF)
            )
            page = driver.page_source
            driver.back()
            WebDriverWait(driver, 60).until(
                expected_conditions.presence_of_element_located(shop)
            )
            return page

        page = await asyncio.to_thread(self._run_in_browser, body)

        self.assertIn('aisle', page)

    async def test_the_page_holds_presence(self) -> None:
        # `rbt dev run` opens a dashboard only when `Presence` lists no
        # viewer, so the page must subscribe while it is open and be
        # unlisted once it is closed.
        driver = await asyncio.to_thread(_new_driver)
        try:
            await asyncio.to_thread(driver.get, f'{self.url}{DASHBOARD_PATH}/')

            await self._wait_for_viewers(
                lambda viewers: viewers != [],
                driver=driver,
            )
        finally:
            await asyncio.to_thread(driver.quit)

        await self._wait_for_viewers(lambda viewers: viewers == [])


if __name__ == '__main__':
    unittest.main()
