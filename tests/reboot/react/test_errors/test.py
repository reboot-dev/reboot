import asyncio
import os
from reboot.aio.external import ExternalContext
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.wait import WebDriverWait
from tests.reboot.bank import SINGLETON_BANK_ID
from tests.reboot.bank_rbt import Account, Bank
from tests.reboot.react.web_driver_runner import web_driver

BENS_ACCOUNT_ID = 'ben'
EMILYS_ACCOUNT_ID = 'emily'

BANK_REF = Bank.ref(SINGLETON_BANK_ID)
BENS_ACCOUNT_REF = Account.ref(BENS_ACCOUNT_ID)
EMILYS_ACCOUNT_REF = Account.ref(EMILYS_ACCOUNT_ID)


async def test(context: ExternalContext, uri: str):
    """Tests that we can get back declared errors."""
    # Create fresh refs for this context (can't reuse module-level refs across
    # contexts).
    bank = Bank.ref(SINGLETON_BANK_ID)

    await bank.idempotently(f"Sign Up '{BENS_ACCOUNT_ID}'").SignUp(
        context,
        account_id=BENS_ACCOUNT_ID,
        initial_deposit=1233,
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
            # here so if the test times out below we can
            # get a better idea of the problem.
            driver.get(f'http://127.0.0.1:{port}/')
            wait = WebDriverWait(driver, 5)

            # Test that we start with a
            # `StateNotConstructed` error.
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'error'),
                    'rbt.v1alpha1.StateNotConstructed',
                )
            )

            # Schedule the async gRPC call on the main
            # event loop from this thread.
            asyncio.run_coroutine_threadsafe(
                bank.idempotently(f"Sign Up '{EMILYS_ACCOUNT_ID}'").SignUp(
                    context,
                    account_id=EMILYS_ACCOUNT_ID,
                    initial_deposit=1,
                ),
                loop,
            ).result()

            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'amount'),
                    '1234',
                )
            )

            # Now click the transfer button which should
            # cause the mutator to fail with an overdraft!
            driver.find_element_by_id('transfer').click()

            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'transferError'),
                    'OverdraftError',
                )
            )

    # We execute the Selenium test in a separate thread to not block the
    # event loop.
    await asyncio.to_thread(run_selenium_test)
