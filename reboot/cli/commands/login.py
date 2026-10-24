"""`rbt login` and `rbt logout`: a person's sign-in to the Reboot
Cloud, which the commands that talk to it use in place of an API key.

Signing in is the OAuth authorization code grant with PKCE, as a
public client registered on the spot: `rbt` opens the Cloud's sign-in
in a browser, which sends the code back to a loopback port, or, when
no browser can be opened (a remote workstation), the person pastes
the code from the page the Cloud shows them.
"""

import aiohttp
import argparse
import asyncio
import secrets
import time
import webbrowser
from aiohttp import web
from reboot.aio.auth.oauth_client import (
    OAuthClient,
    OAuthClientError,
    discover,
    pkce_pair,
    register,
)
from reboot.aio.auth.oauth_server import CODE_PAGE_PATH
from reboot.cli.common import credentials, terminal
from reboot.cli.common.credentials import DEFAULT_REBOOT_CLOUD_URL
from reboot.cli.common.rc import ArgumentParser
from typing import Awaitable, Callable, Optional

# How long to wait for the browser to come back before giving up.
_SIGN_IN_TIMEOUT_SECONDS = 10 * 60


def login_subcommands() -> list[str]:
    return ['login', 'logout']


def register_login(parser: ArgumentParser) -> None:
    for subcommand in login_subcommands():
        parser.subcommand(subcommand).add_argument(
            '--cloud-url',
            type=str,
            help="the URL of the Reboot cloud API",
            default=DEFAULT_REBOOT_CLOUD_URL,
            non_empty_string=True,
        )
    parser.subcommand('login').add_argument(
        '--no-browser',
        type=bool,
        default=False,
        help=(
            "don't open a browser: print the sign-in URL to open "
            "elsewhere, and paste the code it ends with back here "
            "(for a remote workstation whose browser is on another "
            "machine)"
        ),
    )


async def handle_login_subcommand(
    args: argparse.Namespace,
) -> Optional[int]:
    if args.subcommand == 'login':
        await login(cloud_url=args.cloud_url, no_browser=args.no_browser)
        return 0
    elif args.subcommand == 'logout':
        logout(cloud_url=args.cloud_url)
        return 0
    return None


class _Loopback:
    """The redirect URI of a browser sign-in: an HTTP server on a
    loopback port that receives the authorization code."""

    def __init__(self) -> None:
        self._code: asyncio.Future[tuple[
            str, str]] = (asyncio.get_running_loop().create_future())
        self._runner: Optional[web.AppRunner] = None
        self.redirect_uri = ""

    async def __aenter__(self) -> "_Loopback":
        app = web.Application()
        app.router.add_get("/callback", self._callback)
        self._runner = web.AppRunner(app)
        await self._runner.setup()
        site = web.TCPSite(self._runner, "127.0.0.1", 0)
        await site.start()
        assert site._server is not None
        port = site._server.sockets[0].getsockname()[
            1]  # type: ignore[attr-defined]
        self.redirect_uri = f"http://127.0.0.1:{port}/callback"
        return self

    async def __aexit__(self, *exception: object) -> None:
        assert self._runner is not None
        await self._runner.cleanup()

    async def code(self) -> tuple[str, str]:
        """The code and `state` the browser brought back."""
        return await self._code

    async def _callback(self, request: web.Request) -> web.Response:
        code = request.query.get("code")
        state = request.query.get("state", "")
        if code is None:
            error = request.query.get("error", "unknown error")
            if not self._code.done():
                self._code.set_exception(
                    OAuthClientError(
                        error=error,
                        description=request.query.get("error_description", ""),
                    )
                )
            return web.Response(
                text=f"Sign-in failed ({error}). You can close this tab.",
                content_type="text/plain",
            )
        if not self._code.done():
            self._code.set_result((code, state))
        return web.Response(
            text="You're signed in to Reboot. You can close this tab.",
            content_type="text/plain",
        )


async def _read_line(prompt: str) -> str:
    """`input(prompt)`, off the event loop."""
    return await asyncio.get_running_loop().run_in_executor(
        None, input, prompt
    )


async def login(
    *,
    cloud_url: str,
    no_browser: bool,
    open_browser: Callable[[str], object] = webbrowser.open,
    read_line: Callable[[str], Awaitable[str]] = _read_line,
) -> credentials.Credentials:
    """Sign in to the Cloud at `cloud_url` and keep the sign-in.
    `open_browser` opens the sign-in URL and `read_line` asks the
    person for the pasted code; both are what they sound like outside
    of tests."""
    cloud_url = cloud_url.rstrip('/')
    try:
        metadata = await discover(cloud_url)
    except OAuthClientError as e:
        terminal.fail(f"Could not reach the Reboot Cloud at {cloud_url}: {e}")
    if metadata.registration_endpoint is None:
        terminal.fail(
            f"The Reboot Cloud at {cloud_url} does not register clients, "
            "so `rbt` cannot sign in to it."
        )

    async def sign_in(
        redirect_uri: str,
        wait_for_code: Callable[[], Awaitable[tuple[str, str]]],
        tell: Callable[[str], None],
    ) -> credentials.Credentials:
        assert metadata.registration_endpoint is not None
        client_id = await register(
            metadata.registration_endpoint,
            redirect_uris=[redirect_uri],
            client_name="rbt",
        )
        client = OAuthClient(
            authorization_endpoint=metadata.authorization_endpoint,
            token_endpoint=metadata.token_endpoint,
            client_id=client_id,
        )
        verifier, challenge = pkce_pair()
        state = secrets.token_urlsafe(16)
        tell(
            client.authorization_url(
                redirect_uri=redirect_uri,
                state=state,
                code_challenge=challenge,
            )
        )
        try:
            code, returned_state = await asyncio.wait_for(
                wait_for_code(), _SIGN_IN_TIMEOUT_SECONDS
            )
        except asyncio.TimeoutError:
            terminal.fail("Timed out waiting for the sign-in to finish.")
        if returned_state and returned_state != state:
            terminal.fail(
                "The sign-in that came back is not the one that was "
                "started; try again."
            )
        try:
            tokens = await client.exchange_code(
                code=code,
                redirect_uri=redirect_uri,
                code_verifier=verifier,
            )
        except OAuthClientError as e:
            terminal.fail(f"The Reboot Cloud did not accept the sign-in: {e}")
        user_id = await _whoami(cloud_url, str(tokens['access_token']))
        return credentials.Credentials(
            user_id=user_id,
            access_token=str(tokens['access_token']),
            refresh_token=str(tokens['refresh_token']),
            expires_at=int(time.time()) + int(tokens.get('expires_in', 0)),
            client_id=client_id,
        )

    if no_browser:

        def tell(url: str) -> None:
            terminal.info(
                "Open this URL in a browser, sign in, and paste the code "
                f"it shows you here:\n\n  {url}\n"
            )

        async def wait_for_pasted_code() -> tuple[str, str]:
            while True:
                code = (await read_line("Code: ")).strip()
                if code:
                    return code, ""

        signed_in = await sign_in(
            f"{cloud_url}{CODE_PAGE_PATH}", wait_for_pasted_code, tell
        )
    else:
        async with _Loopback() as loopback:

            def tell_browser(url: str) -> None:
                terminal.info(
                    "Opening your browser to sign in to Reboot. If it "
                    f"does not open, go to:\n\n  {url}\n"
                )
                open_browser(url)

            signed_in = await sign_in(
                loopback.redirect_uri, loopback.code, tell_browser
            )

    credentials.save(cloud_url, signed_in)
    terminal.info(
        f"Signed in to {cloud_url} as {signed_in.user_id}. Your sign-in is "
        f"kept in {credentials.credentials_path()}; `rbt logout` forgets it."
    )
    return signed_in


async def _whoami(cloud_url: str, access_token: str) -> str:
    """Who `access_token` is, per the Cloud's `/__/oauth/whoami`."""
    async with aiohttp.ClientSession() as session:
        async with session.get(
            f"{cloud_url}/__/oauth/whoami",
            headers={"Authorization": f"Bearer {access_token}"},
        ) as response:
            body = await response.json(content_type=None)
    user_id = body.get("user_id") if isinstance(body, dict) else None
    if not isinstance(user_id, str) or not user_id:
        terminal.fail(
            "The Reboot Cloud signed you in but did not say who you are; "
            "please report this bug to the maintainers."
        )
    return user_id


def logout(*, cloud_url: str) -> None:
    """Forget the sign-in to the Cloud at `cloud_url`."""
    cloud_url = cloud_url.rstrip('/')
    if credentials.delete(cloud_url):
        terminal.info(f"Signed out of {cloud_url}.")
    else:
        terminal.info(f"You were not signed in to {cloud_url}.")
