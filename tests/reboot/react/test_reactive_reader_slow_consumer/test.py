import asyncio
import os
import time
from reboot.aio.external import ExternalContext
from selenium.webdriver.common.by import By
from tests.reboot.greeter_rbt import Greeter
from tests.reboot.react.web_driver_runner import web_driver


async def test(context: ExternalContext, uri: str):
    """Tests that a reactive reader applies a query response that
    arrives while the client is busy observing an in-flight mutation.

    The app in `index.tsx` delays every mutation response by several
    seconds, so after the browser's `setAdjective` mutation commits,
    the browser's reactive read loop blocks in `await observed(...)`
    waiting for that response while further query responses keep
    arriving on the reader websocket. A write made from outside the
    browser during that window must still be rendered by the browser
    once the mutation resolves.
    """
    state_id = 'greeter-slow-consumer-test'

    await Greeter.factory.idempotently(f"Create '{state_id}'").Create(
        context,
        state_id,
        title='Count',
        name='Chocula',
        adjective='tasty',
    )

    greeter = Greeter.ref(state_id)

    def wait_for_render_text(driver, text: str):

        def text_is_present():
            try:
                return text in driver.find_element(By.ID, 'render').text
            except Exception:
                return False

        while not text_is_present():
            time.sleep(0.1)

    with web_driver(
        uri=uri,
        bundle_js_path=os.path.join(os.path.dirname(__file__), 'bundle.js'),
    ) as (driver, port):
        # Selenium calls block, so run each of them in a separate
        # thread to keep this event loop free for the Reboot calls
        # interleaved between them.
        await asyncio.to_thread(driver.get, f'http://127.0.0.1:{port}/')

        await asyncio.to_thread(
            wait_for_render_text,
            driver,
            'Hi Jonathan, I am Count Chocula the tasty',
        )

        # Fire a mutation from the browser; its delayed response
        # holds the browser's read loop in `await observed(...)`.
        await asyncio.to_thread(driver.find_element(By.ID, 'button').click)

        # Wait until the browser's mutation has committed...
        while True:
            response = await greeter.Greet(context, name='Jonathan')
            if 'funky' in response.message:
                break
            await asyncio.sleep(0.05)

        # ...then write from outside the browser, so that the
        # resulting query response reaches the browser while its read
        # loop is still blocked on the delayed mutation response.
        await greeter.SetAdjective(context, adjective='silly')

        # The browser must eventually render the outside write.
        await asyncio.to_thread(
            wait_for_render_text,
            driver,
            'Hi Jonathan, I am Count Chocula the silly',
        )
