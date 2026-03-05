import asyncio
import os
import time
from reboot.aio.external import ExternalContext
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.wait import WebDriverWait
from tests.reboot.greeter_rbt import Greeter
from tests.reboot.react.web_driver_runner import web_driver
from typing import Optional
from urllib.parse import urlparse

num_ten_second_fetches_per_batch = 4
total_long_running_outstanding_fetches_threshold = 4

STATE_ID = 'actor-test-132'
GREETER_REF = Greeter.ref(STATE_ID)


async def test(context: ExternalContext, uri: str):
    """Tests long running fetches detection."""
    if uri.startswith('https:'):
        # If we're using TLS then we will not track
        # long running fetches.
        return

    await Greeter.idempotently(f"Create '{STATE_ID}'").Create(
        context,
        STATE_ID,
        title='Count',
        name='Chocula',
        adjective='tasty',
    )

    def run_selenium_test():
        with web_driver(
            uri=uri,
            bundle_js_path=os.path.join(
                os.path.dirname(__file__), 'bundle.js'
            ),
        ) as (driver, port):
            driver.get(f'http://127.0.0.1:{port}/')

            parsed_uri = urlparse(uri)

            def look_for_warning(
                *,
                expected: bool,
                total_fetches: Optional[int] = None,
                timeout: float,
            ) -> bool:
                # If we're looking for the warning and it's not expected
                #  we don't need to look for a specific number of
                # fetches we just want to look for the snippet that
                # implies that the warning is still present when it
                # shouldn't be.
                if not expected:
                    snippet = (
                        "are either long-running or queued "
                        "because your browser limits the "
                        "total number of simultaneous "
                        "connections to the same host "
                        f"({parsed_uri.hostname}"
                        f":{parsed_uri.port}). You can "
                        "solve this by ensuring you use "
                        "HTTP/2 which requires TLS. See "
                        "https://docs.reboot.dev/tools"
                        "/cli/#bring-your-own-certificate"
                        "-with-rbt-dev-run for details on "
                        "how to use TLS with 'rbt dev' "
                        "(which works similarly for "
                        "'rbt serve')."
                    )
                else:
                    assert total_fetches is not None
                    snippet = (
                        "Reboot is currently making "
                        f"{total_fetches} outstanding "
                        "HTTP fetches calling your reader "
                        "methods, of which it appears as "
                        f"though {total_fetches} are "
                        "either long-running or queued "
                        "because your browser limits the "
                        "total number of simultaneous "
                        "connections to the same host "
                        f"({parsed_uri.hostname}"
                        f":{parsed_uri.port}). You can "
                        "solve this by ensuring you use "
                        "HTTP/2 which requires TLS. See "
                        "https://docs.reboot.dev/tools"
                        "/cli/#bring-your-own-certificate"
                        "-with-rbt-dev-run for details on "
                        "how to use TLS with 'rbt dev' "
                        "(which works similarly for "
                        "'rbt serve')."
                    )

                deadline = time.perf_counter() + timeout
                while time.perf_counter() < deadline:
                    for line in driver.get_log('browser'):
                        if snippet in line['message']:
                            return True
                    time.sleep(0.1)
                return False

            # First check if we see all long running
            # connections.
            if not look_for_warning(
                expected=True,
                total_fetches=num_ten_second_fetches_per_batch,
                timeout=30,
            ):
                raise AssertionError(
                    'Did not find long running fetch warning.'
                )

            # Wait initially for completing long running
            # fetches, so the test will timeout by Bazel if
            # the fetches will not complete.
            wait_forever = WebDriverWait(driver, float('inf'))

            # Wait for the first batch of long running
            # fetches to complete.
            for i in range(num_ten_second_fetches_per_batch):
                wait_forever.until(
                    expected_conditions.presence_of_element_located(
                        (
                            By.ID,
                            f'long-running-connection-{i}',
                        )
                    )
                )

            # After the first batch of fetches is completed,
            # we should not see the warning about long
            # running fetches.
            if look_for_warning(expected=False, timeout=10):
                raise RuntimeError(
                    'Not expecting to see the console '
                    'warning'
                )

            # Initiate the second batch of fetches.
            driver.find_element(By.ID, 'show-second-batch-button').click()

            # Check that we see the warning after the second
            # batch of fetches is started.
            if not look_for_warning(
                expected=True,
                total_fetches=num_ten_second_fetches_per_batch,
                timeout=30,
            ):
                raise AssertionError(
                    'Did not find long running fetch '
                    'warning.'
                )

            # Wait for the second batch of long running
            # fetches to complete.
            for i in range(
                num_ten_second_fetches_per_batch,
                num_ten_second_fetches_per_batch +
                num_ten_second_fetches_per_batch,
            ):
                wait_forever.until(
                    expected_conditions.presence_of_element_located(
                        (
                            By.ID,
                            f'long-running-connection-{i}',
                        )
                    )
                )

            # Now check that we no longer see the warning
            # after all fetches finish.
            if look_for_warning(expected=False, timeout=10):
                raise RuntimeError(
                    'Not expecting to see the console '
                    'warning'
                )

    # We execute the Selenium test in a separate thread to not block the
    # event loop.
    await asyncio.to_thread(run_selenium_test)
