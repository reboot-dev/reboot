import asyncio
import os
import time
from reboot.aio.external import ExternalContext
from selenium.webdriver.common.by import By
from tests.reboot.greeter_rbt import Greeter
from tests.reboot.react.web_driver_runner import web_driver

STATE_ID = 'greeter-flow-control-test'

# Adjectives to write, in rounds. Every round is written while the
# browser is still busy with the first response of that round.
ROUNDS = [
    [f'round-{round}-adjective-{index}' for index in range(10)]
    for round in range(3)
]


async def test(context: ExternalContext, uri: str):
    """Tests that a reactive reader whose consumer can't keep up with
    the rate of state changes still ends up showing the latest state.

    The app in `index.tsx` blocks the browser's main thread for a
    second on every response it renders, so the state changes this test
    makes land on a client that is busy: the backend's next response
    arrives while nothing in the browser can process it, and while the
    reactive read loop hasn't yet asked for it. The browser must
    nonetheless end each round showing the last state written in that
    round."""
    await Greeter.idempotently(f"Create '{STATE_ID}'").Create(
        context,
        STATE_ID,
        title='Count',
        name='Chocula',
        adjective='tasty',
    )

    greeter = Greeter.ref(STATE_ID)

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

        for adjectives in ROUNDS:
            for adjective in adjectives:
                await greeter.SetAdjective(context, adjective=adjective)

            await asyncio.to_thread(
                wait_for_render_text,
                driver,
                f'Hi Jonathan, I am Count Chocula the {adjectives[-1]}',
            )
