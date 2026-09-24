import asyncio
import os
import time
from reboot.aio.external import ExternalContext
from selenium.webdriver.common.by import By
from tests.reboot.greeter_rbt import Greeter
from tests.reboot.react.web_driver_runner import web_driver


async def test(context: ExternalContext, uri: str):
    """Tests that a reactive reader observes every one of its own
    mutations whose idempotency keys were merged into a single query
    response, and that it renders that merged response.

    The app in `index.tsx` fires three mutations at once and delays
    every mutation response by several seconds, so the query response
    for the first mutation parks the browser's reactive read loop in
    `await observed(...)` while the query responses for the other two
    arrive and get merged into one response carrying both of their
    idempotency keys. Each mutation only resolves once the reader has
    observed its key, so all three resolving shows that the reader
    observed both keys of that merged response, and the rendered text
    shows that it applied the merged response's (latest) payload.
    """
    state_id = 'greeter-coalescing-test'

    await Greeter.idempotently(f"Create '{state_id}'").Create(
        context,
        state_id,
        title='Count',
        name='Chocula',
        adjective='tasty',
    )

    def wait_for_text(driver, element_id: str, text: str):

        def text_is_present():
            try:
                return text in driver.find_element(By.ID, element_id).text
            except Exception:
                return False

        while not text_is_present():
            time.sleep(0.1)

    with web_driver(
        uri=uri,
        bundle_js_path=os.path.join(os.path.dirname(__file__), 'bundle.js'),
    ) as (driver, port):
        # Selenium calls block, so run each of them in a separate
        # thread to keep this event loop free.
        await asyncio.to_thread(driver.get, f'http://127.0.0.1:{port}/')

        await asyncio.to_thread(
            wait_for_text,
            driver,
            'render',
            'Hi Jonathan, I am Count Chocula the tasty',
        )

        await asyncio.to_thread(driver.find_element(By.ID, 'button').click)

        # The browser must render the last of the three mutations...
        await asyncio.to_thread(
            wait_for_text,
            driver,
            'render',
            'Hi Jonathan, I am Count Chocula the wacky',
        )

        # ...and every one of them must resolve.
        await asyncio.to_thread(wait_for_text, driver, 'resolved', '3')
