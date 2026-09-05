"""Browser steps for the bank's web app, driven by Playwright.

A spike of what built-in browser steps in `reboot.bdd` would look
like: each step names an element by its ARIA role and accessible name
(or its label), never by a CSS selector, and maps to one Playwright
call. The steps are plain `def`s: Playwright's sync API runs on
pytest's main thread, while `reboot.bdd`'s `async def` steps run on
the scenario's event loop thread.
"""
import json5
import re
from playwright.sync_api import BrowserContext, Page, expect
from pytest_bdd import parsers, then, when
from reboot.aio.auth import SESSION_COOKIE_NAME
from reboot.bdd.fixtures import World
from typing import Optional

# Where Vite serves the web app under its origin.
APP_PATH = '/__/frontend/web/'

# The element roles a step may name, as Playwright's `get_by_role`
# knows them.
ROLE = r'button|link|tab|checkbox|radio|menuitem|option|row|table'

USER_OPENS_THE_APP = 'the user opens the app'
USER_CLICKS = rf'the user clicks the "(?P<name>[^"]+)" (?P<role>{ROLE})$'
USER_FILLS = r'the user fills "(?P<label>[^"]+)" with `(?P<value>[^`]+)`$'
USER_SELECTS = r'the user selects "(?P<option>[^"]+)" in "(?P<label>[^"]+)"$'
PAGE_SHOWS = (
    r'the page (?:(?P<eventually>eventually) )?shows "(?P<text>[^"]+)"'
    r'(?: within (?P<seconds>\d+) seconds)?$'
)
ELEMENT_SHOWS = (
    rf'the "(?P<name>[^"]+)" (?P<role>{ROLE}) (?:(?P<eventually>eventually) )?'
    r'shows "(?P<text>[^"]+)"(?: within (?P<seconds>\d+) seconds)?$'
)
TEXT_IS_SAVED_AS = (
    r'the text of the "(?P<test_id>[^"]+)" element is saved as '
    r'`(?P<name>\w+)`$'
)

VARIABLE = re.compile(r'<(?P<name>\w+)>')


def _text(world: World, text: str) -> str:
    """The quoted text with each `<name>` variable replaced by the
    value saved under that name."""
    return VARIABLE.sub(
        lambda variable: str(world.saved[variable.group('name')]),
        text,
    )


def _value(world: World, text: str) -> object:
    """The JSON5 value written in backticks, or the value saved under
    the name when the text is a `<name>` variable."""
    variable = VARIABLE.fullmatch(text)
    if variable is not None:
        return world.saved[variable.group('name')]
    return json5.loads(text)


def _timeout(seconds: Optional[str]) -> Optional[float]:
    """Playwright's timeout in milliseconds for a `within N seconds`
    clause, and `None` for Playwright's default when there is none."""
    return None if seconds is None else float(seconds) * 1000


def _backend_url(world: World) -> str:
    """The backend's address for the browser, on `127.0.0.1` so that it
    is a different site from the app's `localhost` origin."""
    assert world.rbt is not None, (
        "The application is not up; start the scenario with "
        "'Given the application is up'"
    )
    return f'http://127.0.0.1:{world.rbt.envoy_port()}'


@when(USER_OPENS_THE_APP)
def _the_user_opens_the_app(
    world: World,
    page: Page,
    context: BrowserContext,
    vite_origin: str,
) -> None:
    """Opens the web app as the scenario's user: the bearer token that
    'the authenticated user is ...' minted becomes the browser's
    session cookie for the backend's host, which the app's credentialed
    `/__/oauth/whoami` call turns back into its bearer. The app learns
    the backend's address from `rebootUrl`, the way an app deployed on
    its own host is told where its backend is."""
    backend_url = _backend_url(world)
    if world.bearer_token is not None:
        # The attributes the backend's own cookie has, so that the
        # browser sends it cross-site. Set by `domain`, not `url`:
        # Chromium keeps a `Secure` cookie for the loopback host but
        # drops one added for an `http://` URL without a word.
        context.add_cookies(
            [
                {
                    'name': SESSION_COOKIE_NAME,
                    'value': world.bearer_token,
                    'domain': '127.0.0.1',
                    'path': '/',
                    'httpOnly': True,
                    'secure': True,
                    'sameSite': 'None',
                }
            ]
        )
    page.goto(f'{vite_origin}{APP_PATH}?rebootUrl={backend_url}')


@when(parsers.re(USER_CLICKS))
def _the_user_clicks(world: World, page: Page, name: str, role: str) -> None:
    page.get_by_role(
        role,  # type: ignore[arg-type]
        name=_text(world, name),
        exact=True,
    ).click()


@when(parsers.re(USER_FILLS))
def _the_user_fills(world: World, page: Page, label: str, value: str) -> None:
    page.get_by_label(label, exact=True).fill(str(_value(world, value)))


@when(parsers.re(USER_SELECTS))
def _the_user_selects(
    world: World, page: Page, option: str, label: str
) -> None:
    page.get_by_label(label, exact=True).select_option(
        label=_text(world, option),
    )


@then(parsers.re(PAGE_SHOWS))
def _the_page_shows(
    world: World,
    page: Page,
    eventually: Optional[str],
    text: str,
    seconds: Optional[str],
) -> None:
    expect(page.get_by_text(_text(world, text))).to_be_visible(
        timeout=_timeout(seconds),
    )


@then(parsers.re(ELEMENT_SHOWS))
def _the_element_shows(
    world: World,
    page: Page,
    name: str,
    role: str,
    eventually: Optional[str],
    text: str,
    seconds: Optional[str],
) -> None:
    expect(
        page.get_by_role(
            role,  # type: ignore[arg-type]
            name=_text(world, name),
            exact=True,
        ),
    ).to_contain_text(_text(world, text), timeout=_timeout(seconds))


@when(parsers.re(TEXT_IS_SAVED_AS))
def _the_text_is_saved_as(
    world: World,
    page: Page,
    test_id: str,
    name: str,
) -> None:
    world.save(name, page.get_by_test_id(test_id).inner_text())
