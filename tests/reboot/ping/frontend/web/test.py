"""End-to-end browser test for the Ping standalone SPA.

Drives WebDriver against the *real* SPA the backend serves at
`/__/frontend/web/` (the same build the MCP clicker's "Open in web
app" button lands on) through the full cross-host OAuth dance, the
reactive read of the empty counter list, a `createCounter` mutation
(which goes through the WebSocket multiplex carrying the bearer JWT
in the request payload), and a `Counter.increment` mutation (same
path), then asserts the counter's value reads back as `1` over the
reactive subscription.

The SPA document is served on `localhost` while its API/OAuth origin
(passed via `?rebootUrl=`) is `127.0.0.1` — Chrome treats these as
distinct hosts, so the flow is genuinely cross-origin (see
`_drive_spa`). Because the ping app is `oauth=` with no
`allowed_origins`, Envoy's CORS filter trusts those loopback origins
only under `rbt dev` (the `DEV_ORIGIN_REGEXES`); the harness sets
`RBT_DEV=true` so credentialed cross-origin traffic is echoed.

This is the smallest test that simultaneously exercises:

* `/__/oauth/whoami` returns `access_token`, the React provider
  feeds it to `setBearerToken`, and from there mutations carry the
  bearer in the proto field over the WebSocket multiplex.
* The same `User` actor materializes the first time we touch it
  (the `_authenticated` hook auto-constructs it on token mint), even
  though no manual setup call was made.
"""

import asyncio
import time
from contextlib import contextmanager
from log.log import INFO, get_logger
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.wait import WebDriverWait
from testing.web import webtest

logger = get_logger(__name__)
logger.setLevel(INFO)


def _new_driver():
    return webtest.new_webdriver_session(
        capabilities={
            'goog:chromeOptions':
                {
                    'args':
                        [
                            '--headless',
                            '--no-sandbox',
                            '--disable-dev-shm-usage',
                            '--ignore-certificate-errors',
                        ],
                },
            'goog:loggingPrefs': {
                'browser': 'ALL',
            },
        }
    )


@contextmanager
def _drive_spa(spa_url: str):
    """Open a headless-Chrome WebDriver on the real SPA the backend
    serves at `spa_url`, and yield `(driver, wait)`. `spa_url` is on
    the `localhost` host and carries `?rebootUrl=http://127.0.0.1:...`
    so the provider talks to the backend cross-host. On exit, dump the
    browser console — it surfaces any React / network errors the
    assertions might have missed — and quit the driver."""
    driver = _new_driver()
    try:
        logger.info("Loading SPA at %s", spa_url)
        driver.get(spa_url)
        yield driver, WebDriverWait(driver, 30)
    finally:
        print("##### Browser logs #####")
        for entry in driver.get_log('browser'):
            print(entry)
        print("##### End of browser logs #####")
        driver.quit()


def _sign_in_as_alice(driver, wait) -> None:
    """Click the SPA's sign-in button, pick "Alice" on the dev IdP
    picker, and wait until the SPA renders her resolved user id."""
    logger.info(
        "Waiting for sign-in button (whoami probe resolved "
        "to unauthenticated)"
    )
    # The unauthenticated view is `<main class="signin-prompt">` with
    # a single "Sign in" button; wait for it rather than grabbing it
    # immediately, since the provider first renders a `loading` view
    # behind the `/__/oauth/whoami` probe.
    wait.until(
        expected_conditions.element_to_be_clickable(
            (By.CSS_SELECTOR, 'main.signin-prompt button')
        )
    ).click()

    logger.info("Waiting for dev IdP picker, then selecting Alice")
    # The picker page lives on the backend origin. The Dev provider
    # renders each identity as an `<a class="account">` containing a
    # nested span for the avatar letter, name, and email — the
    # link's full visible text is therefore "A Alice
    # alice@example.com", not "Alice", so we match on the `<span
    # class="name">` inside.
    alice_link = WebDriverWait(driver, 10).until(
        expected_conditions.element_to_be_clickable(
            (
                By.XPATH,
                "//a[contains(@class, 'account') and "
                ".//span[contains(@class, 'name') and "
                "normalize-space(text())='Alice']]",
            )
        )
    )
    alice_link.click()

    logger.info("Waiting for the SPA to come back authenticated")
    # The signed-in identity is rendered as `<code>` inside the
    # header's `.identity` once `/whoami` returns `{authenticated:
    # true, access_token, ...}` and the provider has plumbed the
    # bearer into `setBearerToken`. The dev provider mints user ids
    # of the form `dev-<digest>`, so wait for that prefix to appear.
    wait.until(
        expected_conditions.text_to_be_present_in_element(
            (By.CSS_SELECTOR, '.identity code'),
            'dev-',
        )
    )


def _create_counter(driver, wait, description: str) -> str:
    """Create a counter through the SPA's form (the writer goes via
    the WebSocket multiplex, bearer in the request payload), wait for
    it to appear in the reactive list, and return its id."""
    driver.find_element(
        By.CSS_SELECTOR,
        'form.create-row input[placeholder="What does this counter count?"]',
    ).send_keys(description)
    driver.find_element(
        By.CSS_SELECTOR,
        'form.create-row button[type="submit"]',
    ).click()

    def find_counter(driver_):
        elems = driver_.find_elements(
            By.CSS_SELECTOR,
            'ul.counters li.counter',
        )
        return elems[0] if elems else False

    counter = wait.until(find_counter)
    counter_id = counter.find_element(
        By.CSS_SELECTOR,
        '.counter-id',
    ).text
    assert counter_id, "Counter list item is missing its `.counter-id` code."
    return counter_id


async def test(spa_url: str) -> None:
    """Drive the SPA through sign-in, create-counter, increment.

    `spa_url` is the backend-served SPA URL, on the `localhost` host
    and carrying `?rebootUrl=http://127.0.0.1:...` so the React
    provider talks to the backend cross-host (whoami / refresh /
    RPCs).
    """

    def drive() -> None:
        with _drive_spa(spa_url) as (driver, wait):
            _sign_in_as_alice(driver, wait)

            # Cross-host confirmation: the session cookie lives on
            # the backend host (`127.0.0.1`), so the SPA's own
            # origin (`localhost`) cannot see it in `document.cookie`
            # — yet we just authenticated and are about to mutate.
            # That is the auth story working without the SPA ever
            # reading the cookie: the bearer came from `/whoami`, not
            # from JS reading `rbt_session`. If this assertion fails,
            # the SPA and backend have drifted onto the same host and
            # the test is no longer cross-host.
            spa_visible_cookies = driver.execute_script(
                "return document.cookie;"
            )
            assert "rbt_session" not in spa_visible_cookies, (
                "The backend's `rbt_session` cookie is visible to "
                "the SPA origin's `document.cookie` "
                f"({spa_visible_cookies!r}); the test is no longer "
                "exercising the cross-host auth path (are the SPA "
                "and backend on the same host?)."
            )

            counter_id = _create_counter(driver, wait, 'Steps')
            logger.info("Counter materialized with id %s", counter_id)

            logger.info(
                "Opening the counter, then incrementing — the "
                "mutation must succeed and the reactive read must "
                "observe the new value of 1"
            )
            driver.find_element(
                By.CSS_SELECTOR,
                'ul.counters li.counter button.counter-open',
            ).click()

            wait.until(
                expected_conditions.element_to_be_clickable(
                    (
                        By.XPATH,
                        "//section[contains(@class, 'counter-detail')]"
                        "//button[normalize-space(text())='Increment']",
                    )
                )
            ).click()

            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.CSS_SELECTOR, '.counter-detail-value'),
                    '1',
                )
            )

            logger.info("End-to-end browser flow succeeded")

    await asyncio.to_thread(drive)


async def test_proactive_refresh(
    spa_url: str,
    access_token_ttl_seconds: int,
) -> None:
    """Verify the `RebootClientProvider`'s proactive-refresh timer
    keeps a SPA's access JWT current past the configured TTL.

    The reactive-reads + mutations path travels through the
    WebSocket multiplex carrying the bearer in the request
    payload — there's no 401-retry hook downstream of the
    framework, so a JWT that lapses mid-tab silently breaks
    every subsequent mutation. The provider's mitigation is to
    fire `refreshBearer(...)` ~5 s ahead of `expires_at`, off
    the same value `/__/oauth/whoami` and `/__/oauth/refresh`
    surface.

    This test signs in with a short `access_token_ttl_seconds`,
    sleeps just past the refresh deadline, then performs a
    mutation after the original TTL would have expired. That
    mutation can only succeed if the timer fired and minted a
    fresh bearer in the meantime — a WebSocket-multiplex mutation
    on a lapsed JWT would 401 silently and the counter would
    never appear.

    `access_token_ttl_seconds` must give the timer enough room
    to fire (≥ `REFRESH_MARGIN_MS` / 1000 + a few seconds of
    setup slack). 10 seconds works comfortably in CI.
    """

    def drive() -> None:
        with _drive_spa(spa_url) as (driver, wait):
            _sign_in_as_alice(driver, wait)

            # Wait past the proactive-refresh point. The
            # provider fires at `expires_at - 5 s`; the
            # backend's TTL is `access_token_ttl_seconds`. So
            # the refresh hits at roughly
            # `access_token_ttl_seconds - 5 s` after sign-in.
            # Sleep TTL+2 s to land just past the original
            # expiry, by which time both the timer should have
            # fired AND the bearer it minted should still be
            # valid (the freshly-minted bearer has another full
            # TTL ahead of it).
            pause_seconds = access_token_ttl_seconds + 2
            logger.info(
                "Sleeping %d s past sign-in (TTL=%d s) so the "
                "proactive-refresh deadline elapses",
                pause_seconds,
                access_token_ttl_seconds,
            )
            time.sleep(pause_seconds)

            # Positive control: a mutation past the original
            # TTL must still succeed. Without proactive
            # refresh, the WebSocket-multiplex mutation would
            # 401 silently and the counter would never appear.
            logger.info(
                "Creating a counter past the original TTL "
                "deadline to confirm the freshly-minted bearer "
                "is in flight"
            )
            counter_id = _create_counter(driver, wait, 'PostTtlCounter')
            logger.info(
                "Mutation past original TTL succeeded: counter "
                "%s created",
                counter_id,
            )

    await asyncio.to_thread(drive)
