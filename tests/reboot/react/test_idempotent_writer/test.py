import asyncio
import os
from reboot.aio.external import ExternalContext
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.wait import WebDriverWait
from tests.reboot.greeter_rbt import Greeter
from tests.reboot.react.web_driver_runner import web_driver


async def test(context: ExternalContext, uri: str):
    """Tests that we can perform mutations."""
    state_id = 'actor-test-132'

    # Call the constructor for this actor so we have state to receive
    # when .Greet is called.
    await Greeter.idempotently(f"Create '{state_id}'").Create(
        context,
        state_id,
        title='Count',
        name='Chocula',
        adjective='tasty',
    )

    def wait_for_elements(
        wait,
        response_adjective,
        request_adjective,
        number_of_times_pending_cleared,
    ):
        wait.until(
            expected_conditions.text_to_be_present_in_element(
                (By.ID, 'render'),
                f'Hi Jonathan, I am Count Chocula the {response_adjective}',
            )
        )

        wait.until(
            expected_conditions.text_to_be_present_in_element(
                (By.ID, 'pendingSetAdjectiveMutations'),
                request_adjective,
            )
        )

        wait.until(
            expected_conditions.text_to_be_present_in_element(
                (By.ID, 'numberOfTimesPendingCleared'),
                str(number_of_times_pending_cleared),
            ),
        )

    def run_selenium_test():
        with web_driver(
            uri=uri,
            bundle_js_path=os.path.join(
                os.path.dirname(__file__), 'bundle.js'
            ),
        ) as (driver, port):
            driver.get(f'http://127.0.0.1:{port}/')
            wait = WebDriverWait(driver, 5)  # Wait up to 5 seconds.

            # Test the we hit the backend and receive state back.
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'render'),
                    'Hi Jonathan, I am Count Chocula the tasty'
                )
            )

            # Test that we fire a mutation into pending*Mutations.
            driver.find_element_by_id('button').click()

            wait_for_elements(
                wait,
                response_adjective='funky',
                request_adjective='funky',
                number_of_times_pending_cleared=1,
            )

            driver.find_element_by_id('button').click()

            # Check that we still see the same response for the idempotent
            # writer even if request changes and make sure we cleared the
            # pending mutation.
            wait_for_elements(
                wait,
                response_adjective='funky',
                request_adjective='happy',
                number_of_times_pending_cleared=2,
            )

    # We execute the Selenium test in a separate thread to not block the
    # event loop.
    await asyncio.to_thread(run_selenium_test)
