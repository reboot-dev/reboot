import asyncio
import os
from reboot.aio.external import ExternalContext
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.wait import WebDriverWait
from tests.reboot.bank import SINGLETON_BANK_ID
from tests.reboot.bank_rbt import Bank
from tests.reboot.react.web_driver_runner import web_driver


async def test(context: ExternalContext, uri: str):
    """Tests what happens when we get an undeclared error."""
    bens_account_id = 'ben'

    bank = Bank.ref(SINGLETON_BANK_ID)

    await bank.idempotently(f"Sign Up '{bens_account_id}'").SignUp(
        context,
        account_id=bens_account_id,
        initial_deposit=1,
    )

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
            wait = WebDriverWait(driver, 5)  # Wait up to 5 seconds.

            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'message'),
                    "AttributeError: this_field_does_not_exist",
                )
            )

    # We execute the Selenium test in a separate thread to not block the
    # event loop.
    await asyncio.to_thread(run_selenium_test)
