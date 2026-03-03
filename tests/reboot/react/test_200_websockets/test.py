import asyncio
import math
import os
import time
from reboot.aio.external import ExternalContext
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.wait import WebDriverWait
from tests.reboot.bank import SINGLETON_BANK_ID
from tests.reboot.bank_rbt import Bank
from tests.reboot.react.web_driver_runner import web_driver

# NOTE: as of the writing of this test we are only using Chrome but
# when we test against other browsers we'll need to change this.
CHROME_WEBSOCKET_LIMIT = 255
ACCOUNTS = math.floor((CHROME_WEBSOCKET_LIMIT - 2) / 2)


async def test(context: ExternalContext, uri: str):
    bank = Bank.ref(SINGLETON_BANK_ID)

    for i in range(0, ACCOUNTS):
        await bank.idempotently(f"Sign Up '{i + 1}'").SignUp(
            context,
            account_id=f'{i + 1}',
            initial_deposit=i + 1,
        )

    loop = asyncio.get_running_loop()

    def run_selenium_test():
        with web_driver(
            uri=uri,
            bundle_js_path=os.path.join(
                os.path.dirname(__file__), 'bundle.js'
            ),
        ) as (driver, port):
            # TODO: Make WebDriver emit any browser errors
            # here so if the test times out below we can get
            # a better idea of the problem.
            driver.get(f'http://127.0.0.1:{port}/')
            wait = WebDriverWait(driver, 10)

            # We should be able to create `ACCOUNTS`
            # websockets without our `console.warn` showing
            # up, accounting for 1 for `useBank` mutations
            # and 1 for `useAssetsUnderManagement`.
            for i in range(0, ACCOUNTS):
                wait.until(
                    expected_conditions.text_to_be_present_in_element(
                        (By.ID, f'Account {i + 1}'),
                        f'{i + 1}',
                    )
                )

            def look_for_warning():
                snippet = (
                    'You can solve this by using HTTP/2'
                    ' which allows an unlimited'
                )
                deadline = time.perf_counter() + 5
                while time.perf_counter() < deadline:
                    for line in driver.get_log('browser'):
                        if snippet in line['message']:
                            return True
                    time.sleep(0.1)
                return False

            if look_for_warning():
                raise RuntimeError(
                    'Not expecting to see the console'
                    ' warning'
                )

            # Now add one more account and we should be
            # over the limit. Schedule the async gRPC call
            # on the main event loop from this thread.
            asyncio.run_coroutine_threadsafe(
                bank.idempotently(f"Sign Up '{ACCOUNTS + 1}'").SignUp(
                    context,
                    account_id=f'{ACCOUNTS + 1}',
                    initial_deposit=ACCOUNTS + 1,
                ),
                loop,
            ).result()

            found = look_for_warning()

            # If we're using TLS then we _do not_ expect
            # to see the warning and instead expect a
            # timeout, otherwise we didn't see the warning
            # we are expecting.
            if not found and not uri.startswith('https:'):
                raise RuntimeError('Expecting to see the console warning')

    # We execute the Selenium test in a separate thread to not block the
    # event loop.
    await asyncio.to_thread(run_selenium_test)
