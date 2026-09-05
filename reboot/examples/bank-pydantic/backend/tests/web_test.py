"""The bank's web app tests: the Gherkin scenarios in `web.feature`,
driven through a browser by the steps in `web_steps.py`.

The app is served the way it is deployed: from its own origin, here a
Vite dev server on `localhost`, calling the backend cross-origin at
its `127.0.0.1` Envoy address. The browser treats those as different
sites, so the session cookie, `/__/oauth/whoami`, and Envoy's CORS
allow-list are all exercised the way production exercises them. Run
`cd frontend && npm install` first.
"""

import os
import pytest
import socket
import subprocess
import time
import urllib.error
import urllib.request
from account_servicer import AccountServicer
from bank_servicer import BankServicer
from customer_servicer import CustomerServicer
from main import initialize
from pathlib import Path
from reboot.aio.applications import Application
from reboot.aio.auth.oauth import OAuth
from reboot.aio.auth.oauth_providers import (
    Development,
    OAuthProviderByEnvironment,
)
from reboot.aio.contexts import WriterContext
from reboot.bdd import scenarios
from reboot.std.collections.v1.sorted_map import sorted_map_library
from typing import Iterator
from user_servicer import UserServicer
from web_steps import *  # noqa: F401,F403
from web_steps import APP_PATH

FRONTEND = Path(__file__).parents[2] / 'frontend'

pytestmark = pytest.mark.skipif(
    not (FRONTEND / 'node_modules' / '.bin' / 'vite').exists(),
    reason="The frontend's dependencies are not installed; run "
    "`cd frontend && npm install`",
)


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


@pytest.fixture(scope='session')
def vite_origin() -> Iterator[str]:
    """The origin of a Vite dev server serving the web app for the
    whole session. `VITE_REBOOT_URL` is emptied so the app finds the
    backend from the `rebootUrl` query parameter instead of the
    `.env.development` address, since each scenario's backend gets
    its own port."""
    port = _free_port()
    origin = f'http://localhost:{port}'
    vite = subprocess.Popen(
        ['npx', 'vite', '--port',
         str(port), '--strictPort'],
        cwd=FRONTEND,
        env={
            **os.environ, 'VITE_REBOOT_URL': ''
        },
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        # Its own process group, so that stopping it also stops the
        # `node` it spawns.
        start_new_session=True,
    )
    try:
        deadline = time.monotonic() + 60
        while True:
            try:
                with urllib.request.urlopen(
                    f'{origin}{APP_PATH}', timeout=1
                ) as response:
                    if response.status == 200:
                        break
            except (urllib.error.URLError, ConnectionError, OSError):
                if time.monotonic() > deadline:
                    raise RuntimeError(
                        f"Vite did not start serving {origin} in time"
                    )
                time.sleep(0.2)
        yield origin
    finally:
        os.killpg(vite.pid, 15)
        vite.wait()


class AccountServicerWithNoInterest(AccountServicer):

    async def interest(
        self,
        context: WriterContext,
    ) -> None:
        # Interest would move the balances the scenarios assert on.
        pass


@pytest.fixture
def application(vite_origin: str) -> Application:
    development = Development()
    return Application(
        servicers=[
            AccountServicerWithNoInterest,
            BankServicer,
            CustomerServicer,
            UserServicer,
        ],
        libraries=[sorted_map_library()],
        # Signing in constructs the user's `User`, which signs them up
        # with the bank `initialize` creates.
        initialize=initialize,
        # The app's origin is the only one Envoy lets read `/whoami`
        # cross-origin, as a deployment would list its web host.
        oauth=OAuth(
            provider=OAuthProviderByEnvironment(
                dev=development,
                prod=development,
            ),
            allowed_origins=[vite_origin],
        ),
    )


scenarios('web.feature')
