"""The developer dashboard application.

A Reboot application owned by the framework, holding the state the
dashboard needs but which must not be written into the
application under development, and serving the dashboard's page. It
is not part of the Reboot API and nothing imports it; it runs as its
own process, with its own state store, alongside the application
being developed.
"""
import asyncio
from pathlib import Path
from rbt.dashboard.v1.dashboard_rbt import API, Implementation, Preferences
from rbt.std.presence.v1.presence_rbt import Presence
from reboot.aio.applications import Application
from reboot.aio.external import InitializeContext
from reboot.dashboard.constants import (
    API_ID,
    DASHBOARD_PATH,
    IMPLEMENTATION_ID,
    PREFERENCES_ID,
    PRESENCE_ID,
)
from reboot.dashboard.servicers import servicers
from starlette.staticfiles import StaticFiles

# The built page, beside this module, which is the same arrangement
# `InspectServicer` uses for its own assets. Mounting it directly
# avoids `RBT_FRONTEND_DIST_PATH`, which resolves against a project
# root discovered by walking up from a servicer's file; the servicers
# here come from `reboot.std.presence`, so no such root exists above
# them.
_DASHBOARD_DIRECTORY = Path(__file__).parent / 'dashboard'


def application() -> Application:
    """The dashboard application, with its page mounted."""
    application = Application(
        servicers=servicers(),
        initialize=initialize,
    )

    application.http.mount(
        DASHBOARD_PATH,
        app=StaticFiles(
            directory=str(_DASHBOARD_DIRECTORY),
            # `html=True` so the directory URL serves `index.html`.
            # `check_dir=False` so a not-yet-built page doesn't stop
            # the application starting. `follow_symlink=True` because
            # under Bazel runfiles the built page is a symlink into
            # `bazel-out`, which Starlette's default `realpath` check
            # rejects as escaping the served directory.
            html=True,
            check_dir=False,
            follow_symlink=True,
        ),
    )

    return application


async def initialize(context: InitializeContext) -> None:
    """Gives `Preferences` the answer somebody who has never clicked
    its banner should get."""
    await Preferences.ref(PREFERENCES_ID).SetSuppressOpenOnRestart(
        context,
        suppress_open_on_restart=False,
    )

    # Construct the `Presence` instance, empty, so that a read of
    # who is looking at a dashboard has an answer from the moment the
    # dashboard is up.
    await Presence.ref(PRESENCE_ID).Create(context)

    # Idempotency is required of every mutation from `initialize`,
    # and needs no alias: the key is derived from the method, the
    # state id and `initialize`'s seed, which is itself derived from
    # the application. So a restart finds the watchers it already
    # spawned rather than starting more.
    _ = await API.ref(API_ID).idempotently().spawn().Watch(context)

    _ = await Implementation.ref(IMPLEMENTATION_ID
                                ).idempotently().spawn().Watch(context)


async def main():
    await application().run()


if __name__ == '__main__':
    asyncio.run(main())
