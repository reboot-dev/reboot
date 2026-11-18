import asyncio
import os
from google.protobuf.timestamp_pb2 import Timestamp
from reboot.aio.external import ExternalContext
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.wait import WebDriverWait
from tests.reboot.pydantic_web.protobuf_fields.receipt_pb2 import Receipt
from tests.reboot.pydantic_web.protobuf_fields.servicer_api_rbt import Test
from tests.reboot.react.web_driver_runner import web_driver

STATE_ID = "pydantic-web-test"


async def test(context: ExternalContext, uri: str):
    """
    Test that a React frontend exchanges protobuf messages with a
    Pydantic-based backend: one of Reboot's own (`TaskId`), a
    well-known type (`Timestamp`) and one the application declares
    (`Receipt`), each received from the backend and sent back to it.
    """

    def run_selenium_test():
        with web_driver(
            uri=uri,
            bundle_js_path=os.path.join(
                os.path.dirname(__file__), 'bundle.js'
            ),
        ) as (driver, port):
            driver.get(f'http://127.0.0.1:{port}/')

            wait = WebDriverWait(driver, 10)  # Wait up to 10 seconds.

            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'status'),
                    "not scheduled",
                )
            )

            # The page gets a `TaskId` from `start` and sends it
            # back in `record`, with a `Timestamp` and a `Receipt` it
            # made itself.
            button = wait.until(
                expected_conditions.element_to_be_clickable(
                    (By.ID, 'start-and-record')
                )
            )
            button.click()

            # The page reads fields of each message it got back.
            for element_id, text in (
                ('scheduled-state-type', "Test"),
                ('recorded-state-type', "Test"),
                ('recorded-at', "1"),
                ('receipts', "from the browser"),
            ):
                wait.until(
                    expected_conditions.text_to_be_present_in_element(
                        (By.ID, element_id),
                        text,
                    )
                )

    # We don't have any async code in the test itself so to not block
    # the event loop, we execute the Selenium test in a separate thread.
    await asyncio.to_thread(run_selenium_test)

    # The backend kept exactly the messages the page sent: the task id
    # it had handed out, unchanged by the round trip through the
    # browser, and the two messages the page made.
    state = await Test.ref(STATE_ID).get_state(context)
    assert state.scheduled_task_id is not None
    assert state.recorded_task_id == state.scheduled_task_id
    assert state.recorded_at == Timestamp(seconds=1)
    assert state.receipts == [Receipt(note="from the browser")]
