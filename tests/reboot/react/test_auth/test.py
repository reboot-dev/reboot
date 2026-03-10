import asyncio
import os
from log.log import INFO, get_logger
from reboot.aio.external import ExternalContext
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.wait import WebDriverWait
from tests.reboot.react.web_driver_runner import web_driver

logger = get_logger(__name__)
logger.setLevel(INFO)


async def test(context: ExternalContext, uri: str):
    """Tests that we can reach out to a Reboot service from a Reboot
    frontend with token verification and authorization.
    """

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

            wait = WebDriverWait(driver, 10)

            logger.info(
                "Waiting for auth error to show that we're not logged in"
            )
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'error'),
                    # TODO: we would have preferred to return a 401
                    # Unauthorized here, but the implementation of the auth
                    # system results in a 403 Forbidden instead; see
                    # discussion at:
                    #   https://github.com/reboot-dev/mono/pull/4601#issuecomment-2989091840
                    'PermissionDenied',
                )
            )

            logger.info("Logging in")
            driver.find_element_by_id('login').click()

            logger.info(
                "Waiting for signup button, which shows that we're logged in"
            )
            wait.until(
                expected_conditions.element_to_be_clickable((By.ID, 'signup'))
            )

            # We must wait for a reader to read a sensible value from the Bank
            # before we can be confident that our Bank("(singleton)") is ready for
            # business; otherwise the "signup" click below may fail due to a
            # `StateNotConstructed`.
            logger.info("Waiting for the Bank to respond to a read request")
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'amount'),
                    '0',
                )
            )

            logger.info("Signing up")
            driver.find_element_by_id('signup').click()

            logger.info("Waiting for the amount to change post-signup")
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'amount'),
                    '1234',
                )
            )

            logger.info("Logging out")
            driver.find_element_by_id('logout').click()

            logger.info("Waiting for auth error post-logout")
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'error'),
                    # TODO: we would have preferred to return a 401
                    # Unauthorized here, but the implementation of the auth
                    # system results in a 403 Forbidden instead; see
                    # discussion at:
                    #   https://github.com/reboot-dev/mono/pull/4601#issuecomment-2989091840
                    'PermissionDenied',
                )
            )

    # We execute the Selenium test in a separate thread to not block the
    # event loop.
    await asyncio.to_thread(run_selenium_test)
