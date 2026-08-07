"""The companion serves the dashboard, and that page holds presence.

This is what makes it possible for `rbt dev run` to tell an
already-open dashboard from none at all: the page and the presence
data are served by the same application, so the browser reaches both
on one origin.
"""
import asyncio
import unittest
from reboot.aio.tests import Reboot
from reboot.inspect.companion_app.main import DASHBOARD_PATH, application
from reboot.std.presence.v1.presence import Presence
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.wait import WebDriverWait
from testing.web import webtest

PRESENCE_REF = Presence.ref('dashboard')


class DashboardTest(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(application(), local_envoy=True)

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_the_served_page_holds_presence(self) -> None:
        url = f'http://127.0.0.1:{self.rbt.envoy_port()}'

        def run_selenium_test():
            driver = webtest.new_webdriver_session(
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
            try:
                driver.get(f'{url}{DASHBOARD_PATH}/')

                # The page reports how many viewers presence knows
                # about, so waiting for it to reach one waits for the
                # whole handshake.
                WebDriverWait(driver, 60).until(
                    expected_conditions.text_to_be_present_in_element(
                        (By.ID, 'viewers'),
                        '1',
                    )
                )
            finally:
                print("##### Browser logs #####")
                for entry in driver.get_log('browser'):
                    print(entry)
                print("##### End of browser logs #####")
                driver.quit()

        await asyncio.to_thread(run_selenium_test)

        # With the browser gone the viewer must drain, which is what
        # tells `rbt dev run` that a dashboard was closed.
        context = self.rbt.create_external_context(name=self.id())

        async for response in PRESENCE_REF.reactively().List(context):
            if list(response.subscriber_ids) == []:
                break


if __name__ == '__main__':
    unittest.main()
