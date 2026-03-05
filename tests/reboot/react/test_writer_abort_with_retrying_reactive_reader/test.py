import asyncio
import os
from reboot.aio.external import ExternalContext
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.wait import WebDriverWait
from tests.reboot.react.test_writer_abort_with_retrying_reactive_reader.test_rbt import (
    Test,
)
from tests.reboot.react.web_driver_runner import web_driver


async def test(context: ExternalContext, uri: str):
    """
    This test was inspired by
    https://github.com/reboot-dev/mono/issues/4621.

    In this test, we are verifying that, in the frontend, we can
    properly handle a reactive reader that is continuously retrying
    while a writer simultaneously aborts.

    In the frontend, we run a reactive reader while calling a writer.
    The reactive reader will receive an initial response (an error) from
    the backend due to the first render. Until the writer we are calling
    indicates to the reader that it has aborted once, the reactive
    reader will continuously receive errors and be forced to retry.
    Eventually, the writer will run, immediately abort, and notify the
    reader that it has aborted. The backend can then begin sending
    valid responses to the reactive reader, which will be displayed
    in the frontend for this test to verify. Prior to the bug fix, the
    program would hang indefinitely in the frontend, which is why it
    is important to verify that the reactive reader can continue
    processing responses.
    """

    state_id = 'actor-test-132'

    test, _ = await Test.idempotently(f"Create '{state_id}'").Create(
        context,
        state_id,
    )

    def run_selenium_test():
        with web_driver(
            uri=uri,
            bundle_js_path=os.path.join(
                os.path.dirname(__file__), 'bundle.js'
            ),
        ) as (driver, port):
            driver.get(f'http://127.0.0.1:{port}/')

            wait = WebDriverWait(driver, 10)  # Wait up to 10 seconds.

            # Test that a reactive reader can properly observe an aborted
            # writer while it is retrying.
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'message'),
                    "This is a response from the test servicer.",
                )
            )

    # We execute the Selenium test in a separate thread to not block the
    # event loop.
    await asyncio.to_thread(run_selenium_test)
