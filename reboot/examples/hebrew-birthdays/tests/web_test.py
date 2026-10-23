"""The app's tests that drive its web app: the features whose
scenarios include a browser, run through `reboot.bdd`'s web app steps.
Their backend scenarios run here too, against the same application.

The app is served the way it is deployed: at the backend's own
origin, from which it calls the backend. Each scenario starts a Vite
dev server for it, which the backend's Envoy routes to, as `rbt dev
run --web-app` does. Run `cd frontend && npm install` first.
"""

import pytest
from person_servicer import PersonServicer
from reboot.aio.applications import Application
from reboot.aio.auth.oauth import OAuth
from reboot.aio.auth.oauth_providers import (
    Development,
    OAuthProviderByEnvironment,
)
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


@pytest.fixture
def application() -> Application:
    development = Development()
    return Application(
        servicers=[PersonServicer, UserServicer],
        libraries=[ordered_map_library()],
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


scenarios('tracking_birthdays.feature')
