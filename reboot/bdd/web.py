"""The built-in steps for what a user does in the web app and sees in
it, driven with Playwright.

    When "alice" opens the web app
    And "alice" fills "Initial Deposit ($)" in the web app with `1000`
    And "alice" clicks the "Open Account" button in the web app
    Then "alice" eventually sees "$1000" in the "Your Accounts" table in the web app within 10 seconds

Each step names the user acting, a user the scenario declared. Each
user gets a browser of their own, so two users can be in the app at
once. An
element is named by what it is and what it says, 'the "Open Account"
button', or a field by its label, never by a selector; the one step
that reads a value out of the app, 'saves the text of the
"account-id" element', names it by its test id.

The web app is the scenario's `frontend` fixture, served against the
scenario's backend since 'the application is up'. The steps are plain
`def`s: Playwright's sync API runs on pytest's main thread, while the
backend steps run on the scenario's event loop.
"""
import pytest
import re
import time
from dataclasses import dataclass, field
from playwright.sync_api import Locator, Page, expect
from pytest_bdd import parsers
from pytest_playwright.pytest_playwright import CreateContextCallback
from reboot.aio.auth import SESSION_COOKIE_NAME, WHOAMI_PATH
from reboot.bdd import given, then, when
from reboot.bdd.fixtures import World
from reboot.bdd.frontend import Frontend, backend_url
from reboot.bdd.grammar import (
    CHECKS_IN_WEB_APP,
    CLICKS_IN_WEB_APP,
    FILLS_IN_WEB_APP,
    IS_SIGNED_IN_TO_WEB_APP,
    IS_SIGNED_OUT_OF_WEB_APP,
    OPENS_WEB_APP,
    PRESSES_IN_WEB_APP,
    SAVES_TEXT_IN_WEB_APP_AS,
    SEES_ENABLED_IN_WEB_APP,
    SEES_IN_WEB_APP,
    SEES_WEB_APP_AT,
    SELECTS_IN_WEB_APP,
)
from reboot.bdd.loop import run
from reboot.bdd.steps import _parsed_seconds, _parsed_value, _saved_value
from typing import Any, Optional, cast
from urllib.parse import urlparse

# Where a saved value is named inside quoted text: 'Signed in as
# <user_id>'.
_VARIABLE = re.compile(r'<(?P<name>\w+)>')


def _with_saved(world: World, text: str) -> str:
    """The quoted text with each '<name>' replaced by the string saved
    under that name."""

    def replacement(match: re.Match[str]) -> str:
        value = _saved_value(world, match['name'])
        if not isinstance(value, str):
            raise ValueError(
                f"Expecting the value saved as `{match['name']}` to be a "
                f"string, but it is {value!r}"
            )
        return value

    return _VARIABLE.sub(replacement, text)


@dataclass
class WebApp:
    """The web app as the scenario's users see it: a browser page per
    user who has opened it."""

    world: World
    frontend: Frontend
    new_context: CreateContextCallback

    # The page of each user who opened the app.
    pages: dict[str, Page] = field(default_factory=dict)

    def open(self, *, user: str, path: str) -> Page:
        """Opens the app at the given path in a browser of the user's
        own, as the user: their token, minted when the scenario
        declared them, becomes the session cookie on the backend's
        host, which the app's `/__/oauth/whoami` call turns back into
        its bearer."""
        assert self.world.rbt is not None, (
            "The application is not up; start the scenario with "
            "'Given the application is up'"
        )
        assert self.frontend.origin is not None, (
            'The frontend has no origin for a browser to load it from'
        )
        run(self.frontend.ready())
        context = self.new_context()
        token = self.world.token(user)
        if token is not None:
            host = urlparse(backend_url(self.world.rbt)).hostname
            assert host is not None
            # The attributes the backend's own cookie has, so that the
            # browser sends it cross-site. Set by domain, not URL:
            # Chromium keeps a `Secure` cookie for the loopback host
            # but drops one added for an `http://` URL without a word.
            context.add_cookies(
                [
                    {
                        'name': SESSION_COOKIE_NAME,
                        'value': token,
                        'domain': host,
                        'path': '/',
                        'httpOnly': True,
                        'secure': True,
                        'sameSite': 'None',
                    }
                ]
            )
        page = context.new_page()
        page.goto(self.frontend.origin + path)
        self.pages[user] = page
        return page

    def whoami(self, *, user: str) -> dict[str, Any]:
        """The backend's answer to `/__/oauth/whoami` for the user's
        browser session, fetched from inside their page with the
        session cookie the way the app fetches it."""
        assert self.world.rbt is not None
        return self.page(user=user).evaluate(
            "(url) => fetch(url, {credentials: 'include'})"
            ".then((response) => response.json())",
            backend_url(self.world.rbt) + WHOAMI_PATH,
        )

    def page(self, *, user: str) -> Page:
        """The page of the user who opened the app; raises for one who
        has not."""
        page = self.pages.get(user)
        if page is None:
            raise ValueError(
                f'"{user}" has not opened the web app; say '
                f'\'When "{user}" opens the web app\' first'
            )
        return page


@pytest.fixture
def web_app(
    world: World,
    frontend: Frontend,
    new_context: CreateContextCallback,
) -> WebApp:
    return WebApp(world=world, frontend=frontend, new_context=new_context)


def _element(page: Page, role: str, name: str) -> Locator:
    """The element of the given role with exactly the given accessible
    name. The role is one the grammar's closed list allows, each of
    which Playwright knows."""
    return page.get_by_role(cast(Any, role), name=name, exact=True)


def _timeout(within: Optional[str]) -> Optional[float]:
    """Playwright's timeout in milliseconds for a 'within' bound, and
    `None` for Playwright's default when there is none."""
    if within is None:
        return None
    return _parsed_seconds(within) * 1000


@when(parsers.re(OPENS_WEB_APP))
def _opens_web_app(
    web_app: WebApp,
    user: str,
    path: Optional[str],
) -> None:
    web_app.open(user=user, path='/' if path is None else path)


@when(parsers.re(CLICKS_IN_WEB_APP))
def _clicks_in_web_app(
    world: World,
    web_app: WebApp,
    user: str,
    name: str,
    role: str,
) -> None:
    _element(web_app.page(user=user), role, _with_saved(world, name)).click()


@when(parsers.re(FILLS_IN_WEB_APP))
def _fills_in_web_app(
    world: World,
    web_app: WebApp,
    user: str,
    label: str,
    value: str,
) -> None:
    filled: Any = _parsed_value(world, f'"{label}"', value)
    web_app.page(user=user).get_by_label(label, exact=True).fill(str(filled))


@when(parsers.re(SELECTS_IN_WEB_APP))
def _selects_in_web_app(
    world: World,
    web_app: WebApp,
    user: str,
    option: str,
    label: str,
) -> None:
    web_app.page(user=user).get_by_label(label, exact=True).select_option(
        label=_with_saved(world, option),
    )


@when(parsers.re(CHECKS_IN_WEB_APP))
def _checks_in_web_app(
    web_app: WebApp,
    user: str,
    action: str,
    label: str,
) -> None:
    box = web_app.page(user=user).get_by_label(label, exact=True)
    if action == 'checks':
        box.check()
    else:
        box.uncheck()


@when(parsers.re(PRESSES_IN_WEB_APP))
def _presses_in_web_app(web_app: WebApp, user: str, key: str) -> None:
    web_app.page(user=user).keyboard.press(key)


@then(parsers.re(SEES_IN_WEB_APP))
def _sees_in_web_app(
    world: World,
    web_app: WebApp,
    user: str,
    eventually: Optional[str],
    negated: Optional[str],
    text: str,
    name: Optional[str],
    role: Optional[str],
    within: Optional[str],
) -> None:
    if within is not None and eventually is None:
        raise ValueError(
            "Almost: 'within' goes with 'eventually sees', which waits "
            "for the text; 'sees' looks now"
        )
    if eventually is not None and within is None:
        raise ValueError(
            "Almost: 'eventually sees' takes a bound, e.g. 'within 10 "
            "seconds'"
        )
    page = web_app.page(user=user)
    text = _with_saved(world, text)
    timeout = _timeout(within)
    if name is not None and role is not None:
        element = _element(page, role, _with_saved(world, name))
        if negated is not None:
            expect(element).not_to_contain_text(text, timeout=timeout)
        else:
            expect(element).to_contain_text(text, timeout=timeout)
        return
    shown = page.get_by_text(text)
    if negated is not None:
        expect(shown).not_to_be_visible(timeout=timeout)
    else:
        expect(shown).to_be_visible(timeout=timeout)


@then(parsers.re(SEES_ENABLED_IN_WEB_APP))
def _sees_enabled_in_web_app(
    world: World,
    web_app: WebApp,
    user: str,
    name: str,
    role: str,
    state: str,
) -> None:
    element = _element(web_app.page(user=user), role, _with_saved(world, name))
    if state == 'enabled':
        expect(element).to_be_enabled()
    else:
        expect(element).to_be_disabled()


@then(parsers.re(SEES_WEB_APP_AT))
def _sees_web_app_at(
    world: World,
    web_app: WebApp,
    user: str,
    path: str,
) -> None:
    assert web_app.frontend.origin is not None
    expect(web_app.page(user=user)).to_have_url(
        web_app.frontend.origin + _with_saved(world, path),
    )


# How long a sign-in or sign-out started in the app may take to
# reach the backend: the redirects of signing in, the request of
# signing out.
_SESSION_CHANGE_TIMEOUT_MILLISECONDS = 30_000


@given(parsers.re(IS_SIGNED_IN_TO_WEB_APP))
@when(parsers.re(IS_SIGNED_IN_TO_WEB_APP))
@then(parsers.re(IS_SIGNED_IN_TO_WEB_APP))
def _is_signed_in_to_web_app(world: World, web_app: WebApp, user: str) -> None:
    """The user's browser has come back to the web app signed in,
    after the sign-in the scenario clicked through: the backend
    answers their session with a user, whom the user calls as from
    here on."""
    page = web_app.page(user=user)
    origin = web_app.frontend.origin
    assert origin is not None
    # Signing in ends in redirects back to the app; the session is
    # settled once the browser is back on the app's origin.
    expect(page).to_have_url(
        re.compile('^' + re.escape(origin)),
        timeout=_SESSION_CHANGE_TIMEOUT_MILLISECONDS,
    )
    session = web_app.whoami(user=user)
    if not session.get('authenticated'):
        raise AssertionError(
            f'"{user}" is not signed in to the web app: the backend '
            'answers their browser session with nobody'
        )
    world.sign_in(
        user,
        user_id=session['user_id'],
        bearer_token=session['access_token'],
    )


@given(parsers.re(IS_SIGNED_OUT_OF_WEB_APP))
@when(parsers.re(IS_SIGNED_OUT_OF_WEB_APP))
@then(parsers.re(IS_SIGNED_OUT_OF_WEB_APP))
def _is_signed_out_of_web_app(
    world: World,
    web_app: WebApp,
    user: str,
) -> None:
    """The user's browser session is nobody's, after the sign-out
    the scenario clicked, which the app reports to the backend in
    its own time; the user calls with no token from here on."""
    page = web_app.page(user=user)
    deadline = time.monotonic() + _SESSION_CHANGE_TIMEOUT_MILLISECONDS / 1000
    while web_app.whoami(user=user).get('authenticated'):
        if time.monotonic() >= deadline:
            raise AssertionError(
                f'"{user}" is still signed in to the web app: the backend '
                'answers their browser session with a user'
            )
        page.wait_for_timeout(100)
    world.sign_out(user)


@when(parsers.re(SAVES_TEXT_IN_WEB_APP_AS))
def _saves_text_in_web_app_as(
    world: World,
    web_app: WebApp,
    user: str,
    test_id: str,
    name: str,
) -> None:
    world.save(
        name,
        web_app.page(user=user).get_by_test_id(test_id).inner_text()
    )
