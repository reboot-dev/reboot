import asyncio
import os
from reboot.aio.external import ExternalContext
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.wait import WebDriverWait
from tests.reboot.react.web_driver_runner import web_driver

STATE_ID = "default-values-test"


async def test(context: ExternalContext, uri: str):
    """
    Test that default values are properly set via implicit constructor
    and that they are correctly converted to Zod for frontend usage.
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

            # Phase 1: Verify initial state shows "not-initialized".
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'phase'),
                    "not-initialized",
                )
            )

            # Click initialize button to create state with defaults.
            initialize_button = wait.until(
                expected_conditions.element_to_be_clickable(
                    (By.ID, 'initialize')
                )
            )
            initialize_button.click()

            # Phase 2: Verify default values are displayed.
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'phase'),
                    "initialized-with-defaults",
                )
            )

            # Verify each default value.
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'text'),
                    'text: ""',
                )
            )
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'number'),
                    "number: 0",
                )
            )
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'flag'),
                    "flag: false",
                )
            )
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'status'),
                    "status: first",
                )
            )
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'items'),
                    "items: []",
                )
            )
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'mapping'),
                    "mapping: {}",
                )
            )
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'optional-text'),
                    "optionalText: undefined",
                )
            )
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'variant'),
                    "variant: undefined",
                )
            )

            # Click update button to set specified values.
            update_button = wait.until(
                expected_conditions.element_to_be_clickable((By.ID, 'update'))
            )
            update_button.click()

            # Phase 3: Verify updated values are displayed.
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'phase'),
                    "updated",
                )
            )

            # Verify each updated value.
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'text'),
                    'text: "hello"',
                )
            )
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'number'),
                    "number: 42",
                )
            )
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'flag'),
                    "flag: true",
                )
            )
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'status'),
                    "status: second",
                )
            )
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'items'),
                    "items: [a, b, c]",
                )
            )

            # Check for both key-value pairs separately since map order is not
            # guaranteed through protobuf serialization.
            # https://protobuf.dev/programming-guides/proto3/#maps
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'mapping'),
                    '"key1":"value1"',
                )
            )
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'mapping'),
                    '"key2":"value2"',
                )
            )
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'optional-text'),
                    'optionalText: "optional-value"',
                )
            )
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'variant'),
                    '"kind":"A"',
                )
            )
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'variant'),
                    '"valueA":"variant-value"',
                )
            )

    # We execute the Selenium test in a separate thread to not block the
    # event loop.
    await asyncio.to_thread(run_selenium_test)
