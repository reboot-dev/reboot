import asyncio
import os
from reboot.aio.external import ExternalContext
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.wait import WebDriverWait
from tests.reboot.react.web_driver_runner import web_driver

STATE_ID = "pydantic-web-errors-test"


async def test(context: ExternalContext, uri: str):
    """
    Test that Pydantic declared errors are properly converted to Zod types
    on the frontend. This tests:
    1. MyError (Pydantic) - should have message and code fields
    2. AnotherError (Pydantic) - should have reason field
    3. FailedPrecondition (Protobuf) - standard protobuf error
    4. No error case
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

            # Verify that "not initialized" is displayed when state doesn't
            # exist.
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'status'),
                    "not initialized",
                )
            )

            # Click the `Initialize` button to create state.
            initialize_button = wait.until(
                expected_conditions.element_to_be_clickable(
                    (By.ID, 'initialize')
                )
            )
            initialize_button.click()

            # Wait for initialization to complete.
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'status'),
                    "initialized",
                )
            )

            # Test triggering `MyError`.
            my_error_button = wait.until(
                expected_conditions.element_to_be_clickable(
                    (By.ID, 'trigger-my-error')
                )
            )
            my_error_button.click()

            # Verify `MyError` is displayed with correct data.
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'error-result'),
                    "MyError: This is my error (code: 42)",
                )
            )

            # Test triggering `AnotherError`.
            another_error_button = wait.until(
                expected_conditions.element_to_be_clickable(
                    (By.ID, 'trigger-another-error')
                )
            )
            another_error_button.click()

            # Verify `AnotherError` is displayed with correct data.
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'error-result'),
                    "AnotherError: This is another error reason",
                )
            )

            # Test triggering Protobuf `FailedPrecondition`.
            failed_precondition_button = wait.until(
                expected_conditions.element_to_be_clickable(
                    (By.ID, 'trigger-failed-precondition')
                )
            )
            failed_precondition_button.click()

            # Verify `FailedPrecondition` is displayed.
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'error-result'),
                    "FailedPrecondition",
                )
            )

            # Test no error case.
            no_error_button = wait.until(
                expected_conditions.element_to_be_clickable(
                    (By.ID, 'trigger-none')
                )
            )
            no_error_button.click()

            # Verify no error is displayed.
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'error-result'),
                    "No error",
                )
            )

    # We execute the Selenium test in a separate thread to not block the
    # event loop.
    await asyncio.to_thread(run_selenium_test)
