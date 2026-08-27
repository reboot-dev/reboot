"""The dashboard application serves its page, and that page describes
the application under development.

These tests run the dashboard under the `Reboot()` harness, write the
API state directly, and drive the served page with a browser.
"""
import asyncio
import json
import socket
import unittest
from google.protobuf.json_format import ParseDict
from rbt.dashboard.v1.dashboard_pb2 import StateType
from rbt.dashboard.v1.dashboard_rbt import API, Preferences
from reboot.aio.tests import Reboot
from reboot.dashboard.constants import (
    API_ID,
    DASHBOARD_PATH,
    PREFERENCES_ID,
    PRESENCE_ID,
)
from reboot.dashboard.main import application
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


# One state type as `api_reader` describes it: methods name entries in
# `dataTypes`, and each model's shape is its JSON Schema as text.
_SCHEMAS = {
    'ShopState':
        {
            'type': 'object',
            'properties': {
                'name': {
                    'type': 'string'
                }
            },
        },
    'LookRequest':
        {
            'type': 'object',
            'properties': {
                'item': {
                    'type': 'string'
                }
            },
        },
    'LookResponse':
        {
            'type': 'object',
            'properties':
                {
                    'found': {
                        'type': 'boolean'
                    },
                    'shelf': {
                        '$ref': '#/$defs/Shelf'
                    },
                },
        },
    # No method names `Shelf`; only `LookResponse.shelf` refers to it.
    'Shelf':
        {
            'type': 'object',
            'title': 'Shelf',
            'description': 'Where an item sits.',
            'properties': {
                'aisle': {
                    'type': 'integer'
                }
            },
        },
}

_SHOP = {
    'name':
        'shop.v1.Shop',
    'filename':
        'api/shop/v1/shop.py',
    'schema':
        json.dumps(_SCHEMAS['ShopState']),
    'methods':
        [
            {
                'name': 'look',
                'kind': 'READER',
                'factory': False,
                'mcp': False,
                'errors': [],
                'request': 'LookRequest',
                'response': 'LookResponse',
            },
        ],
    'dataTypes':
        [
            {
                'name': name,
                'schema': json.dumps(schema),
            } for name, schema in _SCHEMAS.items() if name != 'ShopState'
        ],
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
        await API.ref(API_ID).Update(
            context,
            state_types=[ParseDict(_SHOP, StateType())],
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
        # The page shows a state type because a file on disk declares
        # one, with no generated code, no build and no running
        # application. A half-written file is the normal case while
        # someone is typing, so the page shows the error beside the
        # state types it last parsed rather than in place of them.
        def body(driver):
            driver.get(f'{self.url}{DASHBOARD_PATH}/#/state')
            WebDriverWait(driver, 60).until(
                expected_conditions.presence_of_element_located(
                    (By.CSS_SELECTOR, '[id="/state/shop.v1.Shop"]')
                )
            )
            return driver.page_source

        context = self.rbt.create_external_context(name=self.id())
        await API.ref(API_ID).Update(
            context,
            state_types=[ParseDict(_SHOP, StateType())],
            error='shop.py: SyntaxError: invalid syntax',
        )

        page = await asyncio.to_thread(self._run_in_browser, body)

        # The method's name, kind, and source file come from the _SHOP
        # declaration, not from anything built into the page, and the
        # page shows them as the declaration wrote them.
        self.assertIn('look', page)
        self.assertIn('reader', page)
        self.assertIn('shop/v1/shop.py', page)

        # The page groups state types by proto package, which is the
        # directory the developer wrote them in.
        self.assertIn('shop.v1', page)

        # The sidebar shows both counts in one column, and they count
        # different things, so each label names what it counts. The
        # fixture declares one of each, so these also check the singular.
        self.assertIn('1 state type', page)
        self.assertIn('1 method', page)

        # The page shows the error alongside the description, not in
        # place of it.
        self.assertIn('shop.py: SyntaxError: invalid syntax', page)

    # The banner's one link shows one of these labels, and clicking it
    # does what the label says.
    _TURN_OFF = "Don't reopen this dashboard on restart"
    _TURN_ON = 'Open this dashboard on every restart'

    def _click_the_banner(self, driver, showing: str, becomes: str) -> None:
        """Clicks the banner's link once it reads `showing`, then waits
        until it reads `becomes`: the new label comes from the reactive
        read of `Preferences`, so seeing it is how the test knows the
        choice reached the application and came back.
        """
        button = (By.CLASS_NAME, 'banner-link')

        WebDriverWait(driver, 60).until(
            expected_conditions.text_to_be_present_in_element(button, showing)
        )
        driver.find_element(*button).click()
        WebDriverWait(driver, 60).until(
            expected_conditions.text_to_be_present_in_element(button, becomes)
        )

    async def _read_suppress_open_on_restart(self) -> bool:
        context = self.rbt.create_external_context(name=self.id())
        response = await Preferences.ref(PREFERENCES_ID).Get(context)
        return response.suppress_open_on_restart

    async def test_the_banner_turns_reopening_off_and_back_on(self) -> None:
        # The banner writes the preference `rbt dev run` reads before
        # deciding whether to open a dashboard; `open_dashboard_tests`
        # covers that read. The test clicks in both directions because
        # the page loaded after a click offers the opposite choice.

        def body(driver):
            driver.get(f'{self.url}{DASHBOARD_PATH}/')
            self._click_the_banner(
                driver,
                showing=self._TURN_OFF,
                becomes=self._TURN_ON,
            )

        await asyncio.to_thread(self._run_in_browser, body)

        self.assertTrue(await self._read_suppress_open_on_restart())

        def back_on(driver):
            driver.get(f'{self.url}{DASHBOARD_PATH}/')
            self._click_the_banner(
                driver,
                showing=self._TURN_ON,
                becomes=self._TURN_OFF,
            )

        await asyncio.to_thread(self._run_in_browser, back_on)

        self.assertFalse(await self._read_suppress_open_on_restart())

    # The two labels a state type's one button shows.
    _EXPAND = 'Expand details'
    _HIDE = 'Hide details'

    def _click_to_expand(self, driver, showing: str, becomes: str) -> None:
        """Clicks a state type's button once it reads `showing`.

        Waits for `becomes` afterwards: the label and the detail's
        height come from the same state, so the new label proves the
        click registered.
        """
        button = (By.CLASS_NAME, 'expand-button')

        WebDriverWait(driver, 60).until(
            expected_conditions.text_to_be_present_in_element(button, showing)
        )
        driver.find_element(*button).click()
        WebDriverWait(driver, 60).until(
            expected_conditions.text_to_be_present_in_element(button, becomes)
        )

    @staticmethod
    def _detail_height(driver) -> float:
        """Rendered height of the first method's detail.

        The detail stays in the document whether or not its state type
        is open; closing collapses the grid row around it to zero
        height, and that collapse is what the height animation
        transitions.
        """
        return driver.execute_script(
            'const detail = document.querySelector(".method-detail-inner");'
            'return detail === null'
            '  ? -1'
            '  : detail.getBoundingClientRect().height;'
        )

    def _wait_for_detail(self, driver, opened: bool) -> None:
        """Waits for the detail's open or close animation to finish."""
        WebDriverWait(
            driver, 60
        ).until(lambda driver: (self._detail_height(driver) > 0) == opened)

    async def _read_expanded_state_types(self) -> list[str]:
        context = self.rbt.create_external_context(name=self.id())
        response = await Preferences.ref(PREFERENCES_ID).Get(context)
        return list(response.expanded_state_types)

    async def test_a_state_type_stays_expanded_across_a_load(self) -> None:
        # The click must store the choice in the dashboard
        # application, which is what a previous `rbt dev run` left
        # behind and so what a fresh page reads the choice back from.
        await self._record_state_types()

        def body(driver):
            driver.get(f'{self.url}{DASHBOARD_PATH}/#/state')
            self._click_to_expand(
                driver,
                showing=self._EXPAND,
                becomes=self._HIDE,
            )
            self._wait_for_detail(driver, opened=True)

            # The detail's height is animated, not switched.
            self.assertIn(
                'grid-template-rows',
                driver.execute_script(
                    'const detail ='
                    '  document.querySelector(".method-detail");'
                    'return getComputedStyle(detail).transitionProperty;'
                ),
            )

        await asyncio.to_thread(self._run_in_browser, body)

        self.assertEqual(
            await self._read_expanded_state_types(), ['shop.v1.Shop']
        )

        # `_run_in_browser` starts a new browser, so the expanded state can only
        # have come from the Preferences actor, not from the tab.
        def reloaded(driver):
            driver.get(f'{self.url}{DASHBOARD_PATH}/#/state')
            WebDriverWait(driver, 60).until(
                expected_conditions.text_to_be_present_in_element(
                    (By.CLASS_NAME, 'expand-button'),
                    self._HIDE,
                )
            )
            self._wait_for_detail(driver, opened=True)

        await asyncio.to_thread(self._run_in_browser, reloaded)

    async def test_a_deep_link_lands_on_a_type_that_nothing_names(
        self
    ) -> None:
        # No method names `Shelf`: it is reached only as a field of
        # `LookResponse`, so the data page is the only place that
        # writes it out. The section's `id` equals the route, so the
        # browser looks able to scroll to it on its own. It cannot: the
        # section is not rendered yet when the browser reads the
        # fragment on load, so the page scrolls to it itself.
        await self._record_state_types()

        def body(driver):
            # A viewport this small leaves Shelf, the last of three
            # types, off screen, so the page has to scroll to reach it.
            driver.set_window_size(900, 600)
            driver.get(f'{self.url}{DASHBOARD_PATH}/#/data/shop.v1.Shelf')
            WebDriverWait(driver, 60).until(
                expected_conditions.presence_of_element_located(
                    (By.CSS_SELECTOR, '[id="/data/shop.v1.Shelf"]')
                )
            )
            # The field row whose type is `Shelf` links to it by that
            # name.
            link = driver.find_element(
                By.CSS_SELECTOR,
                '.type-block a[href="#/data/shop.v1.Shelf"]',
            )
            self.assertEqual(link.text, 'Shelf')
            return driver.execute_script(
                'const pane = document.querySelector(".pane");'
                'const shelf ='
                '  document.querySelector(\'[id="/data/shop.v1.Shelf"]\');'
                'const box = shelf.getBoundingClientRect();'
                'return {'
                '  scrolled: pane.scrollTop,'
                '  top: box.top,'
                '  height: window.innerHeight,'
                '  page: document.documentElement.outerHTML,'
                '};'
            )

        landed = await asyncio.to_thread(self._run_in_browser, body)

        self.assertGreater(landed['scrolled'], 0)
        self.assertGreaterEqual(landed['top'], 0)
        self.assertLess(landed['top'], landed['height'])

        page = landed['page']

        # The data page lists every type the file declares except the
        # state type's own state, which the state page shows.
        self.assertIn('LookRequest', page)
        self.assertIn('LookResponse', page)
        self.assertIn('Where an item sits.', page)
        self.assertNotIn('/data/shop.v1.ShopState', page)

        # And the field or method that contains each type, so the page
        # lists both what a type contains and what contains it.
        self.assertIn('LookResponse.shelf', page)
        self.assertIn('Shop.look (takes)', page)

    async def test_a_contained_type_is_followed_to_the_data_page(self) -> None:
        # The convention is one level deep: a page names the type a
        # field contains, and the link on that name goes to the type's
        # data page.
        await self._record_state_types()

        def body(driver):
            driver.get(f'{self.url}{DASHBOARD_PATH}/#/state')
            self._click_to_expand(
                driver,
                showing=self._EXPAND,
                becomes=self._HIDE,
            )
            self._wait_for_detail(driver, opened=True)

            driver.find_element(
                By.CSS_SELECTOR,
                '.method-signature a[href="#/data/shop.v1.Shelf"]',
            ).click()

            # The link changes the hash to a page that was not rendered
            # yet, so wait for that page to render the Shelf section
            # before it scrolls to it.
            WebDriverWait(driver, 60).until(
                expected_conditions.presence_of_element_located(
                    (By.CSS_SELECTOR, '[id="/data/shop.v1.Shelf"]')
                )
            )
            return driver.page_source

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
