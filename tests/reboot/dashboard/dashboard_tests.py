"""The dashboard application serves its page, and that page describes
the application under development.

It is itself a Reboot application, so it can describe itself: pointing
the page at its own address exercises the whole path (config route,
API read, and rendering) in one process.
"""
import asyncio
import socket
import unittest
from google.protobuf.json_format import ParseDict
from google.protobuf.struct_pb2 import Value
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


# One state type, spelled the way `api_reader` spells it: types by
# `$ref` into the state type's own `$defs`.
_SHOP = {
    'name': 'shop.v1.Shop',
    'file': 'api/shop/v1/shop.py',
    'state': {
        '$ref': '#/$defs/ShopState'
    },
    'methods':
        [
            {
                'name': 'look',
                'kind': 'reader',
                'factory': False,
                'mcp': False,
                'errors': [],
                'request': {
                    '$ref': '#/$defs/LookRequest'
                },
                'response': {
                    '$ref': '#/$defs/LookResponse'
                },
            },
        ],
    '$defs':
        {
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
                    'properties': {
                        'found': {
                            'type': 'boolean'
                        }
                    },
                },
        },
}


class DashboardTest(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        # The page is served by the dashboard application, so the
        # test needs its
        # address to point a browser at it.
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
        """Polls until presence satisfies `satisfied`.

        Polling rather than reading reactively because `List` aborts
        with `StateNotConstructed` until somebody has subscribed at
        least once, which is where a fresh application starts.

        Reports what it sees as it goes, including anything the page
        logged. This wait has no deadline, so when it does not finish
        the test is killed with its `finally` unrun. Printing only at
        the end would mean printing nothing in the one case worth
        explaining.
        """
        polls = 0
        while True:
            context = self.rbt.create_external_context(name=self.id())
            # A fresh reference per context; one cannot be shared.
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
        """Puts what an API file would yield into the application.

        The reading of files is covered by `api_reader_tests` and
        `api_watcher_tests`. What is left to show here is that the
        page renders whatever the application holds, so this writes
        that directly, and the test keeps no watcher, no observer
        thread and no subprocess alive alongside a browser.
        """
        context = self.rbt.create_external_context(name=self.id())
        await API.ref(API_ID).Update(
            context,
            state_types=ParseDict([_SHOP], Value()),
        )

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

    async def test_describes_what_the_api_files_declare(self) -> None:
        # Nothing here is generated, built or serving: the page shows
        # a state type because a file on disk declares one.
        def body(driver):
            driver.get(f'{self.url}{DASHBOARD_PATH}/')
            WebDriverWait(driver, 60).until(
                expected_conditions.presence_of_element_located(
                    (By.ID, 'shop.v1.Shop')
                )
            )
            return driver.page_source

        await self._record_state_types()

        page = await asyncio.to_thread(self._run, body)

        # A method, its kind, and its source file all come from the
        # file rather than from anything the page knew in advance,
        # spelled the way its author spelled them.
        self.assertIn('look', page)
        self.assertIn('reader', page)
        self.assertIn('shop/v1/shop.py', page)

        # State types are grouped by their proto package, which is the
        # directory the developer wrote them in.
        self.assertIn('shop.v1', page)

        # The sidebar's two counts sit in the same column and count
        # different things, so each says what it counts. The fixture
        # declares one of each, which also covers the singular.
        self.assertIn('1 state type', page)
        self.assertIn('1 method', page)

    async def test_says_why_a_file_could_not_be_read(self) -> None:
        # A half-written file is the normal case while someone is
        # typing, so the page says what went wrong while keeping the
        # shape it last read beside it.
        def body(driver):
            driver.get(f'{self.url}{DASHBOARD_PATH}/')
            WebDriverWait(driver, 60).until(
                expected_conditions.presence_of_element_located(
                    (By.CLASS_NAME, 'error')
                )
            )
            return driver.page_source

        context = self.rbt.create_external_context(name=self.id())
        await API.ref(API_ID).Update(
            context,
            state_types=ParseDict([_SHOP], Value()),
            error='shop.py: SyntaxError: invalid syntax',
        )

        page = await asyncio.to_thread(self._run, body)

        self.assertIn('shop.py: SyntaxError: invalid syntax', page)

        # The error does not blank the page: what was last read is
        # still there to work against.
        self.assertIn('shop.v1.Shop', page)

    # The two labels the banner's one link shows, which are also the
    # two things it does.
    _TURN_OFF = "Don't reopen this dashboard on restart"
    _TURN_ON = 'Open this dashboard on every restart'

    def _click_the_banner(self, driver, showing: str, becomes: str) -> None:
        """Clicks the banner's link once it reads `showing`.

        Waits for `becomes` afterwards rather than returning as soon as
        the click lands: the new label comes from the reactive read of
        `Preferences`, so seeing it is how the test knows the choice
        reached the application and came back.
        """
        button = (By.CLASS_NAME, 'banner-link')

        WebDriverWait(driver, 60).until(
            expected_conditions.text_to_be_present_in_element(button, showing)
        )
        driver.find_element(*button).click()
        WebDriverWait(driver, 60).until(
            expected_conditions.text_to_be_present_in_element(button, becomes)
        )

    async def _suppress_open_on_restart(self) -> bool:
        context = self.rbt.create_external_context(name=self.id())
        response = await Preferences.ref(PREFERENCES_ID).Get(context)
        return response.suppress_open_on_restart

    async def test_the_banner_turns_reopening_off(self) -> None:
        # What the banner writes is exactly what `rbt dev run` reads
        # before deciding whether to open a dashboard, which is what
        # `open_dashboard_tests` covers from the other side.

        def body(driver):
            driver.get(f'{self.url}{DASHBOARD_PATH}/')
            self._click_the_banner(
                driver,
                showing=self._TURN_OFF,
                becomes=self._TURN_ON,
            )

        await asyncio.to_thread(self._run, body)

        self.assertTrue(await self._suppress_open_on_restart())

    async def test_the_banner_turns_reopening_back_on(self) -> None:
        # A developer who clicked once is not stuck with it: the page
        # they load next offers the choice the other way round.

        context = self.rbt.create_external_context(name=self.id())
        await Preferences.ref(PREFERENCES_ID).SetSuppressOpenOnRestart(
            context,
            suppress_open_on_restart=True,
        )

        def body(driver):
            driver.get(f'{self.url}{DASHBOARD_PATH}/')
            self._click_the_banner(
                driver,
                showing=self._TURN_ON,
                becomes=self._TURN_OFF,
            )

        await asyncio.to_thread(self._run, body)

        self.assertFalse(await self._suppress_open_on_restart())

    # The two labels a state type's one button shows.
    _EXPAND = 'Expand details'
    _HIDE = 'Hide details'

    def _click_to_expand(self, driver, showing: str, becomes: str) -> None:
        """Clicks a state type's button once it reads `showing`.

        Waits for `becomes` afterwards, which is how the test knows
        the click was taken, since the label comes from the same state
        the detail's height does.
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
        """How tall the first method's detail is drawn.

        Measured rather than asked of `is_displayed()`, because the
        detail stays in the document whether or not its state type is
        open: what closing does is collapse the grid row it sits in to
        nothing, which is what makes the height animate at all.
        """
        return driver.execute_script(
            'const detail = document.querySelector(".method-detail-inner");'
            'return detail === null'
            '  ? -1'
            '  : detail.getBoundingClientRect().height;'
        )

    def _wait_for_detail(self, driver, opened: bool) -> None:
        """Waits out the animation, rather than sleeping its duration."""
        WebDriverWait(
            driver, 60
        ).until(lambda driver: (self._detail_height(driver) > 0) == opened)

    async def _expanded_state_types(self) -> list[str]:
        context = self.rbt.create_external_context(name=self.id())
        response = await Preferences.ref(PREFERENCES_ID).Get(context)
        return list(response.expanded_state_types)

    async def test_expanding_a_state_type_opens_its_method_detail(
        self
    ) -> None:
        await self._record_state_types()

        def body(driver):
            driver.get(f'{self.url}{DASHBOARD_PATH}/')
            self._click_to_expand(
                driver,
                showing=self._EXPAND,
                becomes=self._HIDE,
            )
            self._wait_for_detail(driver, opened=True)

            # The height is transitioned rather than switched. Read
            # off the property list rather than by sampling a height
            # part-way through, which would be a race against the
            # animation this is checking for.
            self.assertIn(
                'grid-template-rows',
                driver.execute_script(
                    'const detail ='
                    '  document.querySelector(".method-detail");'
                    'return getComputedStyle(detail).transitionProperty;'
                ),
            )

        await asyncio.to_thread(self._run, body)

        # And the click reached the application, which is what makes
        # it
        # outlast the tab it was made in.
        self.assertEqual(await self._expanded_state_types(), ['shop.v1.Shop'])

    async def test_a_state_type_expanded_earlier_is_open_on_load(self) -> None:
        # The state a previous `rbt dev run` left behind, which is the
        # whole reason the choice lives in the dashboard application.
        await self._record_state_types()

        context = self.rbt.create_external_context(name=self.id())
        await Preferences.ref(PREFERENCES_ID).SetExpanded(
            context,
            state_type='shop.v1.Shop',
            expanded=True,
        )

        def body(driver):
            driver.get(f'{self.url}{DASHBOARD_PATH}/')
            WebDriverWait(driver, 60).until(
                expected_conditions.text_to_be_present_in_element(
                    (By.CLASS_NAME, 'expand-button'),
                    self._HIDE,
                )
            )
            self._wait_for_detail(driver, opened=True)

        await asyncio.to_thread(self._run, body)

    async def test_the_page_holds_presence(self) -> None:
        # `rbt dev run` decides whether to open a dashboard by asking
        # who is looking at one, so the page being counted while it is
        # up and dropped once it is gone is what that decision rests
        # on.
        driver = await asyncio.to_thread(_driver)
        try:
            await asyncio.to_thread(driver.get, f'{self.url}{DASHBOARD_PATH}/')

            # Wait for the viewer to register, rather than assuming a
            # page load is enough.
            await self._wait_for_viewers(
                lambda viewers: viewers != [],
                driver=driver,
            )
        finally:
            await asyncio.to_thread(driver.quit)

        # With the browser gone the viewer must drain, which is what
        # makes presence usable as a liveness signal at all.
        await self._wait_for_viewers(lambda viewers: viewers == [])


if __name__ == '__main__':
    unittest.main()
