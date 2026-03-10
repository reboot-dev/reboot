import asyncio
import os
from reboot.aio.external import ExternalContext
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.wait import WebDriverWait
from tests.reboot.react.web_driver_runner import web_driver

STATE_ID = "pydantic-web-test"


async def test(context: ExternalContext, uri: str):
    """
    Test that a React frontend can interact with a Pydantic-based backend.
    State is initialized from the web (not from Python).
    """

    def run_selenium_test():
        with web_driver(
            uri=uri,
            bundle_js_path=os.path.join(
                os.path.dirname(__file__), 'bundle.js'
            ),
        ) as (driver, port):
            driver.get(f'http://127.0.0.1:{port}/')

            wait = WebDriverWait(driver, 10)  # Wait up to 10 seconds.

            # Verify that "not initialized" is displayed when state doesn't exist.
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'message'),
                    "not initialized",
                )
            )

            # Click the `Initialize` button to create state with undefined values.
            initialize_button = wait.until(
                expected_conditions.element_to_be_clickable(
                    (By.ID, 'initialize')
                )
            )
            initialize_button.click()

            # Verify that `undefined` is displayed when state values are not set.
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'message'),
                    "undefined",
                )
            )

            # Click the button to set message and counter.
            button = wait.until(
                expected_conditions.element_to_be_clickable(
                    (By.ID, 'set-and-counter')
                )
            )
            button.click()

            # Verify that the message from the button click is displayed.
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'message'),
                    "Hello from button!",
                )
            )

            # Verify the counter has been set to 5.
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'counter'),
                    "Counter: 5",
                )
            )

    # We don't have any async code in the test itself so to not block
    # the event loop, we execute the Selenium test in a separate thread.
    await asyncio.to_thread(run_selenium_test)
