import asyncio
import os
from reboot.aio.external import ExternalContext
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.wait import WebDriverWait
from tests.reboot.bank import SINGLETON_BANK_ID
from tests.reboot.bank_rbt import Bank
from tests.reboot.react.web_driver_runner import web_driver

BANK_REF = Bank.ref(SINGLETON_BANK_ID)


async def test(context: ExternalContext, uri: str):
    """Tests that we can call a mutator even when we don't have any
    readers, i.e., that our websockets can properly connect.
    """
    # Create fresh ref for this context (can't reuse module-level refs across
    # contexts).
    bank = Bank.ref(SINGLETON_BANK_ID)

    # The Bank must be ready to serve before we can start the test, because
    # writers like the `SignUp` that will be called by our frontend will not
    # retry if they hit a `StateNotConstructed` error (application serving but
    # init method has not run yet).
    while True:
        try:
            await bank.AssetsUnderManagement(context)
            # Great, the Bank is ready to serve.
            break
        except Exception as e:
            print(f"Bank not ready yet; waiting to start test: {e}...")
            await asyncio.sleep(0.5)
            continue

    def run_selenium_test():
        with web_driver(
            uri=uri,
            bundle_js_path=os.path.join(
                os.path.dirname(__file__), 'bundle.js'
            ),
        ) as (driver, port):
            # TODO: Make WebDriver emit any browser errors here so if the
            # test times out below we can get a better idea of the problem.
            driver.get(f'http://127.0.0.1:{port}/')

            wait = WebDriverWait(driver, 10)

            driver.find_element_by_id('sign-up').click()

            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'signed-up'),
                    'true',
                )
            )

    # We execute the Selenium test in a separate thread to not block the
    # event loop.
    await asyncio.to_thread(run_selenium_test)
