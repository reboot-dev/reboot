"""The bank's tests that drive its web app: the features whose
scenarios include a browser, run through `reboot.bdd`'s web app steps.
Their backend scenarios run here too, against the same application.

The app is served the way it is deployed: from its own origin, here a
Vite dev server on `localhost` started for each scenario, calling the
backend cross-origin at its `127.0.0.1` Envoy address. The browser
treats those as different sites, so the session cookie,
`/__/oauth/whoami`, and Envoy's CORS allow-list are all exercised the
way production exercises them. Run `cd frontend && npm install`
first.
"""

import pytest
from account_servicer import AccountServicer
from bank_servicer import BankServicer
from customer_servicer import CustomerServicer
from main import initialize
from reboot.aio.applications import Application
from reboot.aio.auth.oauth import OAuth
from reboot.aio.auth.oauth_providers import (
    Development,
    OAuthProviderByEnvironment,
)
from reboot.aio.contexts import WriterContext
from reboot.bdd import scenarios
from reboot.bdd.frontend import Frontend
from reboot.bdd.vite import vite
from reboot.std.collections.v1.sorted_map import sorted_map_library
from typing import Iterator
from user_servicer import UserServicer


@pytest.fixture
def frontend() -> Iterator[Frontend]:
    with vite(directory='frontend') as frontend:
        yield frontend


class AccountServicerWithNoInterest(AccountServicer):

    async def interest(
        self,
        context: WriterContext,
    ) -> None:
        # Interest would move the balances the scenarios assert on.
        pass


@pytest.fixture
def application(frontend: Frontend) -> Application:
    # A web app calls the backend from its own origin.
    assert frontend.origin is not None
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
            allowed_origins=[frontend.origin],
        ),
    )


scenarios('opening_accounts.feature', 'transfers.feature', 'sign_in.feature')
