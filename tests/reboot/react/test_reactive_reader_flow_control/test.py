import asyncio
import os
import time
from reboot.aio.external import ExternalContext
from reboot.aio.react import QUERY_RESPONSE_WINDOW
from selenium.webdriver.common.by import By
from tests.reboot.greeter_rbt import Greeter
from tests.reboot.react.web_driver_runner import web_driver

STATE_ID = 'greeter-flow-control-test'

# Adjectives to write while the browser holds back the response it is
# showing; many more than the backend has room to send without hearing
# back, so that most of them must be skipped.
ADJECTIVES = [
    f'adjective-{index}' for index in range(3 * QUERY_RESPONSE_WINDOW)
]


async def test(context: ExternalContext, uri: str):
    """Tests that a reactive reader whose consumer is slow to ask for a
    next response falls no further behind than the room the backend
    has to send responses, and then skips to the latest state.

    The app in `index.tsx` consumes the reactive read itself and holds
    back every response until this test releases it, so every state
    change below is known to have completed while the browser had
    processed nothing beyond the state it started from. The backend
    may therefore send at most a window's worth of responses however
    many states are written, and the response that follows them once
    the browser catches up must carry the last state written rather
    than the next one the backend passed through. Falling that far
    behind must also be reported to the browser's console."""
    await Greeter.idempotently(f"Create '{STATE_ID}'").Create(
        context,
        STATE_ID,
        title='Count',
        name='Chocula',
        adjective='tasty',
    )

    greeter = Greeter.ref(STATE_ID)

    def message(adjective: str) -> str:
        return f'Hi Jonathan, I am Count Chocula the {adjective}'

    def rendered_messages(driver) -> list[str]:
        """Returns every message the browser has rendered, in order."""
        try:
            rendered = driver.find_element(By.ID, 'rendered'
                                          ).get_attribute('textContent')
        except Exception:
            # The app renders nothing at all until it has a first
            # response to show.
            return []
        return [line for line in (rendered or '').split('\n') if line != '']

    # We poll the browser rather than using `reactively()` because what
    # we are waiting for is the browser's rendered DOM, which Reboot
    # cannot observe.
    def wait_for_message_count(driver, count: int) -> list[str]:
        while len(rendered_messages(driver)) < count:
            time.sleep(0.1)
        return rendered_messages(driver)

    def wait_for_latest_message(driver, latest: str) -> list[str]:
        rendered = rendered_messages(driver)
        while len(rendered) == 0 or rendered[-1] != latest:
            time.sleep(0.1)
            rendered = rendered_messages(driver)
        return rendered

    with web_driver(
        uri=uri,
        bundle_js_path=os.path.join(os.path.dirname(__file__), 'bundle.js'),
    ) as (driver, port):
        # Selenium calls block, so run each of them in a separate
        # thread to keep this event loop free for the Reboot calls
        # interleaved between them.
        await asyncio.to_thread(driver.get, f'http://127.0.0.1:{port}/')

        # The browser renders the state it started from and then holds
        # back rather than continuing past it.
        rendered = await asyncio.to_thread(wait_for_message_count, driver, 1)
        assert rendered == [message('tasty')], rendered

        # Each of these writes has completed by the time the next
        # begins, so by the end of this loop the backend has passed
        # through every one of these states while the browser has
        # processed nothing beyond the one it started from.
        for adjective in ADJECTIVES:
            await greeter.SetAdjective(context, adjective=adjective)

        # Let the browser consume, which is the first moment the
        # backend gets room to produce anything beyond what it sent
        # before the writes above began.
        await asyncio.to_thread(driver.execute_script, 'window.stopHolding()')

        rendered = await asyncio.to_thread(
            wait_for_latest_message,
            driver,
            message(ADJECTIVES[-1]),
        )

        # The browser rendered the state it started from, whatever the
        # backend had room to send while the browser was not
        # consuming, and one more response carrying the skip to the
        # latest state. Every state in between was skipped, and none
        # of them was ever rendered.
        assert len(rendered) <= QUERY_RESPONSE_WINDOW + 1, rendered
        assert rendered[0] == message('tasty'), rendered

        # The browser tells its developer that it fell behind, since
        # it did so for long enough that a user would have seen it.
        console = await asyncio.to_thread(driver.get_log, 'browser')

        stalls = [
            entry['message']
            for entry in console
            if 'A reactive query to' in entry['message']
        ]

        assert len(stalls) > 0, console
        assert 'Greet` skipped' in stalls[0], stalls
        assert 'updates because this client fell' in stalls[0], stalls

        # Catching up gave the backend its room back, so the query is
        # not stalled: a state written now still arrives.
        await greeter.SetAdjective(context, adjective='delicious')

        await asyncio.to_thread(
            wait_for_latest_message,
            driver,
            message('delicious'),
        )
