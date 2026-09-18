import asyncio
import os
import time
from reboot.aio.external import ExternalContext
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.wait import WebDriverWait
from tests.reboot.react.test_reactive_reader_final_error.test_rbt import Test
from tests.reboot.react.web_driver_runner import web_driver

# Longer than the longest backoff a retrying reactive reader waits
# between attempts, so that a reader which does retry would have made
# at least one more attempt within it.
NO_RETRY_WINDOW_SECONDS = 5


async def test(context: ExternalContext, uri: str):
    """
    Verifies that a reactive reader settles on an error the backend
    answered with, rather than retrying it, and reads again once a
    mutation on the state may have changed that answer.

    The frontend mounts a reactive reader on a state that has not been
    constructed, which surfaces as `StateNotConstructed`. It then
    constructs the state through the frontend, after which the reader
    raises a declared error, `NoMessageYet`, that surfaces as `aborted`
    and is not retried. Finally a writer called through the frontend
    sets the message and the reader shows it.
    """

    state_id = 'actor-test'

    loop = asyncio.get_running_loop()

    def attempts() -> int:
        return asyncio.run_coroutine_threadsafe(
            Test.ref(state_id).Attempts(context),
            loop,
        ).result().attempts

    def run_selenium_test():
        with web_driver(
            uri=uri,
            bundle_js_path=os.path.join(
                os.path.dirname(__file__), 'bundle.js'
            ),
        ) as (driver, port):
            driver.get(f'http://127.0.0.1:{port}/')

            wait = WebDriverWait(driver, 10)  # Wait up to 10 seconds.

            # The state has not been constructed; the reader settles on
            # that error rather than keep loading.
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'error'),
                    'rbt.v1alpha1.StateNotConstructed',
                )
            )
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'loading'),
                    'settled',
                )
            )

            # Constructing the state through the frontend wakes the
            # reader, which now runs and raises its declared error.
            driver.find_element_by_id('create').click()

            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'error'),
                    'tests.reboot.react.test_reactive_reader_final_error.'
                    'NoMessageYet',
                )
            )
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'loading'),
                    'settled',
                )
            )

            # A declared error is final: the reader does not retry it.
            # Not retrying can only be observed by the absence of
            # attempts over a window of time, hence the sleep.
            attempts_after_declared_error = attempts()
            time.sleep(NO_RETRY_WINDOW_SECONDS)
            assert attempts() == attempts_after_declared_error

            # A writer called through the frontend wakes the reader
            # again, and this time it succeeds.
            driver.find_element_by_id('set').click()

            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'message'),
                    'Hello, Reboot!',
                )
            )
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'loading'),
                    'settled',
                )
            )
            assert driver.find_element_by_id('error').text == ''
            assert attempts() > attempts_after_declared_error

    # We execute the Selenium test in a separate thread to not block the
    # event loop.
    await asyncio.to_thread(run_selenium_test)
