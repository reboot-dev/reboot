import asyncio
import os
from reboot.aio.external import ExternalContext
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.wait import WebDriverWait
from tests.reboot.bank import SINGLETON_BANK_ID
from tests.reboot.bank_rbt import Account, Bank
from tests.reboot.react.web_driver_runner import web_driver


async def test(context: ExternalContext, uri: str):
    bens_account_id = 'ben'
    emilys_account_id = 'emily'

    bank = Bank.ref(SINGLETON_BANK_ID)

    await bank.idempotently(f"Sign Up '{bens_account_id}'").SignUp(
        context,
        account_id=bens_account_id,
        initial_deposit=1,
    )

    await bank.idempotently(f"Sign Up '{emilys_account_id}'").SignUp(
        context,
        account_id=emilys_account_id,
        initial_deposit=41,
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

            # Test that we start with the initially
            # deposited assets.
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'amount'),
                    '42',
                )
            )

            # Should not see element with ID 'amount42'
            # since it is contained in the same suspense
            # boundary as 'amount1234'.
            assert not driver.find_elements(By.ID, 'amount42')
            assert not driver.find_elements(By.ID, 'amount1234')

            emilys_account = Account.ref(emilys_account_id)
            # Schedule the async gRPC call on the main
            # event loop from this thread.
            asyncio.run_coroutine_threadsafe(
                emilys_account.idempotently(
                    f"Deposit into '{emilys_account_id}'",
                ).Deposit(
                    context,
                    amount=1192,
                ),
                loop,
            ).result()

            # And now the assets should have grown!
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'amount'),
                    '1234',
                )
            )

            # And suspense should now show the other
            # elements.
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'amount42'),
                    '1234',
                )
            )

            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'amount1234'),
                    '1234',
                )
            )

    # We execute the Selenium test in a separate thread to not block the
    # event loop.
    await asyncio.to_thread(run_selenium_test)
