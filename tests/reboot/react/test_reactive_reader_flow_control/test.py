import asyncio
import os
import time
from reboot.aio.external import ExternalContext
from selenium.webdriver.common.by import By
from tests.reboot.greeter_rbt import Greeter
from tests.reboot.react.web_driver_runner import web_driver

STATE_ID = 'greeter-flow-control-test'

# Adjectives to write, in rounds. Every adjective in a round is written
# while the browser holds back the response it is
# showing, so the backend passes through all of them and may send only
# the last.
ROUNDS = [
    [f'round-{round}-adjective-{index}'
     for index in range(10)]
    for round in range(3)
]


async def test(context: ExternalContext, uri: str):
    """Tests that a reactive reader whose consumer is slow to ask for a
    next response skips the states it missed and gets the latest one.

    The app in `index.tsx` consumes the reactive read itself and holds
    each response back until this test releases it,
    so every state change below is known to have completed while the
    backend had no response it was allowed to send. Releasing the
    hold must then produce exactly one response, carrying
    the last state written in the round rather than the first one the
    backend passed through."""
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

        for index, adjectives in enumerate(ROUNDS):
            # Each of these writes has completed by the time the next
            # begins, so by the end of this loop the backend has passed
            # through every one of these states while holding a
            # response the browser has not continued past.
            for adjective in adjectives:
                await greeter.SetAdjective(context, adjective=adjective)

            # Let the browser continue, which is the first moment
            # the backend may produce a next response.
            await asyncio.to_thread(
                driver.execute_script,
                'window.continueQuery()',
            )

            rendered = await asyncio.to_thread(
                wait_for_message_count,
                driver,
                index + 2,
            )

            assert rendered[-1] == message(adjectives[-1]), (
                f"Expected the response after round {index} to carry "
                f"'{adjectives[-1]}', the last state written in it, but "
                f"got '{rendered[-1]}'"
            )

        # One render for the state the browser started from and one per
        # round: every intermediate state was skipped, and none of them
        # was ever rendered.
        assert rendered == [message('tasty')] + [
            message(adjectives[-1]) for adjectives in ROUNDS
        ], rendered
