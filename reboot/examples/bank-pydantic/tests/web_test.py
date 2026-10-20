"""The bank's tests that drive its web app: the features whose
scenarios include a browser, run through `reboot.bdd`'s web app steps.
Their backend scenarios run here too, against the same application.

The app is served the way it is deployed: at the backend's own
origin, from which it calls the backend. Each scenario starts a Vite
dev server for it, which the backend's Envoy routes to, as `rbt dev
run --web-app` does. Run `cd frontend && npm install` first.
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
from reboot.std.collections.ordered_map.v1.ordered_map import (
    ordered_map_library,
)
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
def application() -> Application:
    development = Development()
    return Application(
        servicers=[
            AccountServicerWithNoInterest,
            BankServicer,
            CustomerServicer,
            UserServicer,
        ],
        libraries=[ordered_map_library()],
        # Signing in constructs the user's `User`, which signs them up
        # with the bank `initialize` creates.
        initialize=initialize,
        oauth=OAuth(
            provider=OAuthProviderByEnvironment(
                dev=development,
                prod=development,
            ),
            # The web app is served at the backend's own origin, so
            # no other origin may act on its session cookie.
            allowed_origins=[],
        ),
    )


scenarios('opening_accounts.feature', 'transfers.feature', 'sign_in.feature')
