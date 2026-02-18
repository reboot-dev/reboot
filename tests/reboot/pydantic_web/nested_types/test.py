import asyncio
import os
from reboot.aio.external import ExternalContext
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.wait import WebDriverWait
from tests.reboot.react.web_driver_runner import web_driver

STATE_ID = "nested-types-test"


async def test(context: ExternalContext, uri: str):
    """
    Test that nested types from shared modules are properly imported
    and that the cross-file Zod imports work correctly, including errors.
    """

    def run_selenium_test():
        with web_driver(
            uri=uri,
            bundle_js_path=os.path.join(
                os.path.dirname(__file__), 'bundle.js'
            ),
        ) as (driver, port):
            driver.get(f'http://127.0.0.1:{port}/')

            wait = WebDriverWait(driver, 10)

            # Verify initial state shows "not-initialized".
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'phase'),
                    "not-initialized",
                )
            )

            # Click initialize button to create state.
            initialize_button = wait.until(
                expected_conditions.element_to_be_clickable(
                    (By.ID, 'initialize')
                )
            )
            initialize_button.click()

            # Verify initial values are displayed.
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'phase'),
                    "initialized",
                )
            )

            # Verify initial address values (from shared `Address` model).
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'name'),
                    'name: "John Doe"',
                )
            )
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'street'),
                    'street: "123 Main St"',
                )
            )
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'city'),
                    'city: "Anytown"',
                )
            )
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'zip-code'),
                    'zipCode: "12345"',
                )
            )
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'phone'),
                    "phone: undefined",
                )
            )

            # Click trigger-error button to test error handling.
            trigger_error_button = wait.until(
                expected_conditions.element_to_be_clickable(
                    (By.ID, 'trigger-error')
                )
            )
            trigger_error_button.click()

            # Verify error is displayed.
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'phase'),
                    "error-triggered",
                )
            )

            # Verify the error message from `InvalidPhoneError`.
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'error-message'),
                    'error: "Invalid phone number: invalid-123"',
                )
            )

            # Click update button to change address with valid data.
            update_button = wait.until(
                expected_conditions.element_to_be_clickable((By.ID, 'update'))
            )
            update_button.click()

            # Verify updated values are displayed.
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'phase'),
                    "updated",
                )
            )

            # Verify updated address values.
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'street'),
                    'street: "456 Oak Ave"',
                )
            )
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'city'),
                    'city: "New City"',
                )
            )
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'zip-code'),
                    'zipCode: "67890"',
                )
            )

    # We don't have any async code in the test itself so to not block
    # the event loop, we execute the Selenium test in a separate thread.
    await asyncio.to_thread(run_selenium_test)
