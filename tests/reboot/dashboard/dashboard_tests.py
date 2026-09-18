"""The dashboard application serves its page, and that page describes
the application under development.

These tests run the dashboard under the `Reboot()` harness, write the
API state directly, and drive the served page with a browser: the
models page, whose types pane shows a state type named in the URL's
`type` parameter and a data type named in its `data` parameter, and
the features page, which shows one feature file's scenarios.
"""
import asyncio
import copy
import socket
import time
import unittest
from google.protobuf.json_format import ParseDict
from google.protobuf.timestamp_pb2 import Timestamp
from rbt.dashboard.v1.dashboard_pb2 import Check, Servicer
from rbt.dashboard.v1.dashboard_rbt import Dashboard, Preferences
from rbt.v1alpha1.api import api_pb2
from rbt.v1alpha1.bdd import feature_pb2
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

# The API with two writers past `look`, and what analyzing their code
# found: `restock` calls `stock`, `stock` calls `look`, and `look`
# schedules itself, so `look` has a direct caller, a caller one call
# further away, and a call to itself.
_STATE_TYPE = 'shop.v1.Shop'

_API_WITH_CALLS = copy.deepcopy(_API)
_API_WITH_CALLS['stateTypes'][0]['methods'].extend(
    [
        {
            'name': 'stock',
            'writer': {},
            'factory': False,
            'errors': [],
            'description': 'Add stock of an item.',
        },
        {
            'name': 'restock',
            'writer': {},
            'factory': False,
            'errors': [],
        },
    ]
)


def _call(
    method: str, how: 'Servicer.Method.Call.How'
) -> Servicer.Method.Call:
    return Servicer.Method.Call(state_type=_STATE_TYPE, method=method, how=how)


_SERVICER = Servicer(
    state_type=_STATE_TYPE,
    filename='backend/src/shop_servicer.py',
    methods=[
        Servicer.Method(
            name='restock',
            calls=[_call('stock', Servicer.Method.Call.CALL)],
        ),
        Servicer.Method(
            name='stock',
            calls=[_call('look', Servicer.Method.Call.CALL)],
        ),
        Servicer.Method(
            name='look',
            calls=[_call('look', Servicer.Method.Call.SCHEDULE)],
        ),
    ],
)

# A feature taller than the window: a gallery of the first
# screenshot of each of its scenarios, then the scenarios, enough of
# them that the page scrolls.
_FEATURE_FILENAME = 'tests/shopping.feature'
_SCENARIO_LINES = [10 * number for number in range(1, 13)]


def _scenario(line: int) -> feature_pb2.Scenario:
    return feature_pb2.Scenario(
        keyword='Scenario',
        name=f'Shopping on line {line}',
        line=line,
        steps=[
            feature_pb2.Step(
                keyword='When',
                text=f'"alice" opens the web app at "/aisle/{line}"',
                line=line + 1,
                screenshot=f'tests/shopping.recordings/{line}/1.png',
            ),
            feature_pb2.Step(
                keyword='Then',
                text=f'"alice" sees "Aisle {line}" in the web app',
                line=line + 2,
                screenshot=f'tests/shopping.recordings/{line}/2.png',
            ),
        ],
    )


_FEATURE = feature_pb2.Feature(
    keyword='Feature',
    name='People can go shopping',
    scenarios=[_scenario(line) for line in _SCENARIO_LINES],
)


def _scenario_path(line: int) -> str:
    """The route of a scenario, and so the `id` of its row."""
    return f'/features/{_FEATURE_FILENAME}/scenarios/{line}'


# Where a scenario's row sits in the pane, and whether it is open.
_SCENARIO_STATE = """
const [path] = arguments;
const row = document.getElementById(path);
const pane = row.closest('.pane');
const rowBox = row.getBoundingClientRect();
const paneBox = pane.getBoundingClientRect();
return {
  top: rowBox.top - paneBox.top,
  paneHeight: pane.clientHeight,
  scrollTop: pane.scrollTop,
  expanded: row.querySelector('.scenario-head').getAttribute(
    'aria-expanded'),
};
"""


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

    async def _record_feature(self) -> None:
        """Writes one feature file's scenarios straight into the
        application, beside the state types the page needs before it
        shows anything. Reading feature files is covered by
        `features_watcher_tests`."""
        await self._record_state_types()
        at = Timestamp()
        at.GetCurrentTime()
        context = self.rbt.create_external_context(name=self.id())
        await Dashboard.ref(DASHBOARD_ID).UpdateFeatures(
            context,
            features={_FEATURE_FILENAME: _FEATURE},
            check=Check(at=at),
        )

    def _open_feature(self, driver, path: str = '') -> None:
        """Opens the feature's page, or one of its sections by `path`,
        and waits for its scenarios."""
        driver.get(
            f'{self.url}{DASHBOARD_PATH}/#/features/{_FEATURE_FILENAME}{path}'
        )
        WebDriverWait(driver, 60).until(
            lambda driver: len(
                driver.find_elements(By.CLASS_NAME, 'scenario-name')
            ) == len(_SCENARIO_LINES)
        )

    def _wait_for_scenario_in_view(self, driver, line: int) -> dict:
        """Waits until the scenario is open with its top in the pane,
        and returns where it is."""

        def in_view(driver):
            state = driver.execute_script(
                _SCENARIO_STATE, _scenario_path(line)
            )
            if (
                state['expanded'] == 'true' and 0 <= state['top'] and
                state['top'] < state['paneHeight']
            ):
                return state
            return False

        state = WebDriverWait(driver, 60).until(in_view)
        # A smooth scroll may still be settling once the row is in
        # view; wait it out, so what is counted is the whole scroll.
        time.sleep(1)
        return {
            **state,
            'scrolls':
                driver.execute_script('return window.scrolls;'),
        }

    def _click_gallery_card(self, driver, line: int) -> None:
        """Clicks the scenario's card, counting the pane's scroll events
        from then on in `window.scrolls`."""
        driver.execute_script(
            'window.scrolls = 0;'
            'document.querySelector(".pane").onscroll = '
            '  () => { window.scrolls += 1; };'
        )
        driver.find_element(
            By.CSS_SELECTOR,
            '.feature-gallery-item'
            f'[href="#{_scenario_path(line)}"]',
        ).click()

    def _scroll_to_top(self, driver) -> None:
        driver.execute_script(
            'document.querySelector(".pane").scrollTo(0, 0);'
        )
        WebDriverWait(driver, 60).until(
            lambda driver: driver.execute_script(
                'return document.querySelector(".pane").scrollTop;'
            ) == 0
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
        #
        # The page's own path, not the root, as `rbt dev run` opens it:
        # the root is served through Envoy's gRPC-JSON transcoder, which
        # fails a request carrying a query parameter its method has no
        # field for, so `/?opened=automatically` never reaches the page.
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

    async def test_a_method_pane_lists_its_callers_and_calls(self) -> None:
        # The pane on a method: its head names it with its state type
        # and carries what the API declares of it; under that, the
        # methods that call it directly, then the methods it calls.
        # Each listed name is a link that chooses that method, in the
        # graph and in the pane, as a click on its row in the graph
        # does. The graph is the models page, with no heading over it.
        def body(driver):
            driver.get(
                f'{self.url}{DASHBOARD_PATH}/#/models/shop.v1.Shop.look'
                '?type=shop.v1.Shop.look'
            )
            WebDriverWait(driver, 60).until(
                expected_conditions.presence_of_element_located(
                    (By.CSS_SELECTOR, '.method-group .method-link')
                )
            )
            pane = driver.find_element(
                By.CSS_SELECTOR, '[id="/type/shop.v1.Shop.look"]'
            )
            heading = pane.find_element(By.TAG_NAME, 'h2').text
            signature = pane.find_element(
                By.CLASS_NAME, 'method-pane-signature'
            ).text
            sections = [
                section.text.lower() for section in driver.find_elements(
                    By.CSS_SELECTOR, '.types-pane-body .eyebrow.section'
                )
            ]
            links = [
                (link.text, link.get_attribute('href')) for link in driver.
                find_elements(By.CSS_SELECTOR, '.method-group .method-link')
            ]
            headings_over_the_graph = driver.find_elements(
                By.CSS_SELECTOR, '.pane > header'
            )

            # Following a listed name chooses that method.
            driver.find_element(
                By.XPATH,
                '//*[contains(@class, "method-group")]'
                '//a[contains(@class, "method-link") and text()="stock"]',
            ).click()
            WebDriverWait(driver, 60).until(
                expected_conditions.presence_of_element_located(
                    (By.CSS_SELECTOR, '[id="/type/shop.v1.Shop.stock"]')
                )
            )
            chosen_rows = [
                row.text for row in driver.
                find_elements(By.CSS_SELECTOR, '.graph-method.selected')
            ]
            return {
                'heading': heading,
                'signature': signature,
                'sections': sections,
                'links': links,
                'headings_over_the_graph': len(headings_over_the_graph),
                'chosen_rows': chosen_rows,
                'url_after_click': driver.current_url,
            }

        context = self.rbt.create_external_context(name=self.id())
        await Dashboard.ref(DASHBOARD_ID).UpdateApi(
            context,
            api_directory='api',
            api_files={},
            apis={_FILENAME: ParseDict(_API_WITH_CALLS, api_pb2.API())},
        )
        at = Timestamp()
        at.GetCurrentTime()
        await Dashboard.ref(DASHBOARD_ID).UpdateCode(
            context,
            servicers=[_SERVICER],
            code_files={},
            generated={},
            changes=[],
            check=Check(at=at),
        )

        seen = await asyncio.to_thread(self._run_in_browser, body)

        # The head: the state type and the method's name, and the
        # signature the API declares.
        self.assertEqual(seen['heading'], 'Shop.look')
        self.assertIn('item', seen['signature'])
        self.assertIn('found', seen['signature'])

        # The callers are `stock` and `look` itself, in the graph's
        # order; `restock`, which calls `stock`, is not among them. The
        # only call is `look`'s own.
        self.assertEqual(seen['sections'], ['called by', 'calls'])

        def link_to(method: str) -> str:
            return (
                f'{self.url}{DASHBOARD_PATH}/#/models/shop.v1.Shop.{method}'
                f'?type=shop.v1.Shop.{method}'
            )

        self.assertEqual(
            seen['links'],
            [
                ('look', link_to('look')),
                ('stock', link_to('stock')),
                ('look', link_to('look')),
            ],
        )

        self.assertEqual(seen['headings_over_the_graph'], 0)

        # The click on `stock` took the graph and the pane to it.
        self.assertEqual(seen['url_after_click'], link_to('stock'))
        self.assertEqual(len(seen['chosen_rows']), 1)
        self.assertTrue(seen['chosen_rows'][0].startswith('stock'))

    async def test_a_feature_opens_at_its_top(self) -> None:
        # The feature's name, gallery, and the methods it uses are at
        # the top of its page, above its scenarios, and that is where
        # it opens, however far down its scenarios reach.
        await self._record_feature()

        def body(driver):
            self._open_feature(driver)
            WebDriverWait(driver, 60).until(
                expected_conditions.presence_of_element_located(
                    (By.CLASS_NAME, 'feature-gallery-item')
                )
            )
            # The page scrolls to what a URL names once it has
            # rendered, so give it the moment it would take.
            time.sleep(1)
            return driver.execute_script(
                'const pane = document.querySelector(".pane"); '
                'return [pane.scrollTop, '
                'pane.scrollHeight - pane.clientHeight];'
            )

        scroll_top, max_scroll_top = await asyncio.to_thread(
            self._run_in_browser, body
        )

        # The page is long enough that a scroll would have shown.
        self.assertGreater(max_scroll_top, 0)
        self.assertEqual(scroll_top, 0)

    async def test_a_gallery_card_opens_its_scenario(self) -> None:
        # A card in the gallery stands for one scenario, and a click on
        # it takes the reader to that scenario, open, with its steps'
        # screenshots, scrolling there so the reader sees where it is:
        # every time it is clicked, whatever the scenario's state.
        await self._record_feature()
        line = _SCENARIO_LINES[-1]
        head = (
            By.CSS_SELECTOR,
            f'[id="{_scenario_path(line)}"] .scenario-head',
        )

        def expanded(driver) -> str:
            return driver.execute_script(
                _SCENARIO_STATE, _scenario_path(line)
            )['expanded']

        def body(driver):
            seen = {}

            # Closed.
            self._open_feature(driver)
            self._click_gallery_card(driver, line)
            seen['closed'] = self._wait_for_scenario_in_view(driver, line)
            seen['url'] = driver.current_url
            seen['open'] = [
                head.get_attribute('aria-expanded') for head in
                driver.find_elements(By.CSS_SELECTOR, '.scenario-head')
            ]

            # Open, from the click before, and scrolled away from.
            self._scroll_to_top(driver)
            self._click_gallery_card(driver, line)
            seen['open and scrolled away from'] = (
                self._wait_for_scenario_in_view(driver, line)
            )

            # Closed again by hand, and scrolled away from.
            driver.find_element(*head).click()
            WebDriverWait(driver, 60
                         ).until(lambda driver: expanded(driver) == 'false')
            self._scroll_to_top(driver)
            self._click_gallery_card(driver, line)
            seen['closed by hand'] = self._wait_for_scenario_in_view(
                driver, line
            )

            # Opened by hand on the feature's own page, where the URL
            # names no scenario, and scrolled away from. Loaded afresh:
            # going there from the scenario's URL changes only the
            # fragment, and the row on screen until the page has caught
            # up is the one opened above.
            self._open_feature(driver)
            driver.refresh()
            WebDriverWait(driver, 60).until(
                expected_conditions.presence_of_element_located(head)
            )
            driver.find_element(*head).click()
            WebDriverWait(driver,
                          60).until(lambda driver: expanded(driver) == 'true')
            self._scroll_to_top(driver)
            self._click_gallery_card(driver, line)
            seen['opened by hand'] = self._wait_for_scenario_in_view(
                driver, line
            )
            return seen

        seen = await asyncio.to_thread(self._run_in_browser, body)

        # The URL names the scenario, so the reader can share it.
        self.assertTrue(
            seen['url'].endswith(f'#{_scenario_path(line)}'), seen['url']
        )
        # Only the chosen scenario opened.
        self.assertEqual(
            seen['open'],
            ['false'] * (len(_SCENARIO_LINES) - 1) + ['true'],
        )
        for case in [
            'closed',
            'open and scrolled away from',
            'closed by hand',
            'opened by hand',
        ]:
            # Each click scrolled the pane down to the last scenario,
            # smoothly: a jump is one scroll event, a smooth scroll
            # many.
            self.assertGreater(seen[case]['scrollTop'], 0, case)
            self.assertGreater(seen[case]['scrolls'], 1, case)

    async def test_a_link_to_a_scenario_opens_it(self) -> None:
        # A scenario has a URL of its own, which opens the page on
        # that scenario, open. The steps of the scenarios left closed,
        # and their screenshots' links, cannot be seen or clicked, so
        # they are out of the accessibility tree and the tab order.
        await self._record_feature()
        line = _SCENARIO_LINES[len(_SCENARIO_LINES) // 2]

        def body(driver):
            self._open_feature(driver, path=f'/scenarios/{line}')
            state = self._wait_for_scenario_in_view(driver, line)
            inert = {
                row.get_attribute('id'):
                    row.find_element(By.CLASS_NAME,
                                     'scenario-detail').get_attribute('inert')
                    is not None
                for row in driver.find_elements(By.CLASS_NAME, 'scenario')
            }
            return state, inert

        state, inert = await asyncio.to_thread(self._run_in_browser, body)

        self.assertGreater(state['scrollTop'], 0)
        self.assertEqual(
            inert,
            {
                _scenario_path(other): other != line
                for other in _SCENARIO_LINES
            },
        )

    async def test_the_sidebar_is_links(self) -> None:
        # The sidebar lists the pages and, on the features page, the
        # features, each a link that keyboard focus reaches, so a
        # keyboard or a screen reader can follow it, not only a mouse.
        await self._record_feature()

        def body(driver):
            self._open_feature(driver)
            return driver.execute_script(
                'return [...document.querySelectorAll("nav a")].map('
                '  (link) => {'
                '    link.focus();'
                '    const focused = document.activeElement === link;'
                '    link.blur();'
                # The name, without a "new" beside it.
                '    return [link.innerText.split("\\n")[0], focused];'
                '  });'
            )

        links = await asyncio.to_thread(self._run_in_browser, body)

        names = [name for name, _ in links]
        self.assertIn('MODELS', names)
        self.assertIn('FEATURES', names)
        self.assertIn('People can go shopping', names)
        self.assertEqual(
            [name for name, focused in links if not focused],
            [],
        )

    async def test_a_call_edge_names_its_methods(self) -> None:
        # The graph draws one edge per call, and more than one may
        # join the same two boxes, so each says which methods it
        # joins, not only which boxes, to a screen reader.
        def body(driver):
            driver.get(f'{self.url}{DASHBOARD_PATH}/#/models')
            WebDriverWait(driver, 60).until(
                expected_conditions.presence_of_element_located(
                    (By.CSS_SELECTOR, '.react-flow__edge')
                )
            )
            return sorted(
                edge.get_attribute('aria-label') for edge in
                driver.find_elements(By.CSS_SELECTOR, '.react-flow__edge')
            )

        context = self.rbt.create_external_context(name=self.id())
        await Dashboard.ref(DASHBOARD_ID).UpdateApi(
            context,
            api_directory='api',
            api_files={},
            apis={_FILENAME: ParseDict(_API_WITH_CALLS, api_pb2.API())},
        )
        at = Timestamp()
        at.GetCurrentTime()
        await Dashboard.ref(DASHBOARD_ID).UpdateCode(
            context,
            servicers=[_SERVICER],
            code_files={},
            generated={},
            changes=[],
            check=Check(at=at),
        )

        labels = await asyncio.to_thread(self._run_in_browser, body)

        self.assertEqual(
            labels,
            [
                'shop.v1.Shop.look calls shop.v1.Shop.look',
                'shop.v1.Shop.restock calls shop.v1.Shop.stock',
                'shop.v1.Shop.stock calls shop.v1.Shop.look',
            ],
        )

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
