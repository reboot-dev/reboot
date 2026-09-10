import asyncio
import math
import os
import time
from reboot.aio.external import ExternalContext
from tests.reboot.bank import SINGLETON_BANK_ID
from tests.reboot.bank_rbt import Bank
from tests.reboot.react.web_driver_runner import web_driver
from typing import Optional

# NOTE: as of the writing of this test we are only using Chrome but
# when we test against other browsers we'll need to change this.
CHROME_WEBSOCKET_LIMIT = 255
ACCOUNTS = math.floor((CHROME_WEBSOCKET_LIMIT - 2) / 2)

# How long the check that the "too many WebSockets" warning stays
# absent while still under the limit keeps watching the console. A
# bounded window is inherent to asserting that something does not
# happen; every other wait in this test polls until its condition
# holds and leaves Bazel's per-test timeout as the only backstop,
# because a fixed in-test deadline is exactly what turns a loaded CI
# runner into a failed test.
WARNING_ABSENT_WINDOW_SECONDS = 5

# How often the account wait reports what is still missing, so that a
# stall is visible in the test log if Bazel ends the test.
PROGRESS_REPORT_INTERVAL_SECONDS = 10


async def test(context: ExternalContext, uri: str):
    bank = Bank.ref(SINGLETON_BANK_ID)

    for i in range(0, ACCOUNTS):
        await bank.idempotently(f"Sign Up '{i + 1}'").SignUp(
            context,
            account_id=f'{i + 1}',
            initial_deposit=i + 1,
        )

    loop = asyncio.get_running_loop()

    def run_selenium_test():
        with web_driver(
            uri=uri,
            bundle_js_path=os.path.join(
                os.path.dirname(__file__), 'bundle.js'
            ),
        ) as (driver, port):
            driver.get(f'http://127.0.0.1:{port}/')

            def rendered_accounts() -> dict[str, str]:
                """Returns the text of every rendered account element,
                keyed by element ID, in a single round trip to the
                browser."""
                return driver.execute_script(
                    'return Object.fromEntries('
                    'Array.from('
                    'document.querySelectorAll(\'h1[id^="Account "]\')'
                    ').map((element) => [element.id, element.textContent])'
                    ')'
                )

            def wait_for_accounts(count: int):
                """Polls until every account from `1` to `count` shows
                its balance, reporting the ones still missing at a
                steady interval."""
                missing = {f'{i + 1}' for i in range(count)}
                last_report = time.perf_counter()
                while True:
                    rendered = rendered_accounts()
                    # An account's balance is its initial deposit,
                    # which is also its ID.
                    missing = {
                        account_id for account_id in missing if account_id
                        not in (rendered.get(f'Account {account_id}') or '')
                    }
                    if len(missing) == 0:
                        return
                    now = time.perf_counter()
                    if now - last_report >= PROGRESS_REPORT_INTERVAL_SECONDS:
                        shown = sorted(missing, key=int)[:10]
                        print(
                            f'Still waiting for {len(missing)} of {count} '
                            f'accounts to render; missing: {shown}'
                            f'{" ..." if len(missing) > 10 else ""}'
                        )
                        last_report = now
                    time.sleep(0.25)

            # We should be able to create `ACCOUNTS`
            # websockets without our `console.warn` showing
            # up, accounting for 1 for `useBank` mutations
            # and 1 for `useAssetsUnderManagement`.
            wait_for_accounts(ACCOUNTS)

            def look_for_warning(*, window_seconds: Optional[float]) -> bool:
                """Watches the browser console for the "too many
                WebSockets" warning: for `window_seconds` when a window
                is given, otherwise until the warning appears."""
                snippet = (
                    'You can solve this by using HTTP/2'
                    ' which allows an unlimited'
                )
                deadline = (
                    time.perf_counter() +
                    window_seconds if window_seconds is not None else None
                )
                while deadline is None or time.perf_counter() < deadline:
                    for line in driver.get_log('browser'):
                        if snippet in line['message']:
                            return True
                    time.sleep(0.1)
                return False

            if look_for_warning(window_seconds=WARNING_ABSENT_WINDOW_SECONDS):
                raise RuntimeError(
                    'Not expecting to see the console'
                    ' warning'
                )

            # Now add one more account and we should be
            # over the limit. Schedule the async gRPC call
            # on the main event loop from this thread.
            asyncio.run_coroutine_threadsafe(
                bank.idempotently(f"Sign Up '{ACCOUNTS + 1}'").SignUp(
                    context,
                    account_id=f'{ACCOUNTS + 1}',
                    initial_deposit=ACCOUNTS + 1,
                ),
                loop,
            ).result()

            # Only cleartext WebSockets are subject to the browser's
            # limit (over TLS it uses HTTP/2), so only the cleartext
            # case has a warning to wait for: the extra account pushes
            # the browser past its limit, and the warning follows once
            # it tries to open the WebSockets for that account.
            if not uri.startswith('https:'):
                look_for_warning(window_seconds=None)

    # We execute the Selenium test in a separate thread to not block the
    # event loop.
    await asyncio.to_thread(run_selenium_test)
