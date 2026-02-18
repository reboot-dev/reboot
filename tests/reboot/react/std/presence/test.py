import asyncio
import os
from reboot.aio.external import ExternalContext
from reboot.std.presence.v1.presence import Presence, Subscriber
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.wait import WebDriverWait
from tests.reboot.react.web_driver_runner import web_driver

PRESENCE_REF = Presence.ref('presence')
SUBSCRIBER_REF = Subscriber.ref('subscriber')


async def test(context: ExternalContext, uri: str):

    def run_selenium_test():
        with web_driver(
            uri=uri,
            bundle_js_path=os.path.join(
                os.path.dirname(__file__), 'bundle.js'
            ),
        ) as (driver, port):
            driver.get(f'http://127.0.0.1:{port}/')

            wait = WebDriverWait(driver, 10)

            # Test that we successfully made the connection.
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'subscriber_ids'),
                    SUBSCRIBER_REF.state_id,
                )
            )

            # Test that status is true.
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'status'),
                    'true',
                )
            )

    # We execute the Selenium test in a separate thread to not block the
    # event loop.
    await asyncio.to_thread(run_selenium_test)

    # Test that subscriber is not present after disconnect.
    async for response in SUBSCRIBER_REF.reactively().Status(context):
        if not response.present:
            break

    async for response in PRESENCE_REF.reactively().List(context):
        if response.subscriber_ids == []:
            break
