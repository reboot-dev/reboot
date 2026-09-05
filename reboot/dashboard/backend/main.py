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
from rbt.dashboard.v1.dashboard_rbt import Dashboard, Preferences
from rbt.std.collections.ordered_map.v1.ordered_map_rbt import OrderedMap
from rbt.std.presence.v1.presence_rbt import Presence
from reboot.aio.applications import Application
from reboot.aio.auth.authorizers import allow, allow_if, is_app_internal
from reboot.aio.external import InitializeContext
from reboot.bdd import recordings
from reboot.dashboard.backend.constants import (
    CHANGELOG_ID,
    DASHBOARD_ID,
    DASHBOARD_PATH,
    PREFERENCES_ID,
    PRESENCE_ID,
)
from reboot.dashboard.backend.servicers import (
    DashboardServicer,
    PreferencesServicer,
)
from reboot.std.collections.ordered_map.v1.ordered_map import (
    ordered_map_library,
)
from reboot.std.presence.v1 import presence
from starlette.exceptions import HTTPException
from starlette.responses import FileResponse
from starlette.staticfiles import StaticFiles

# The built page, beside this module, which is the same arrangement
# `InspectServicer` uses for its own assets. Mounting it directly
# avoids `RBT_FRONTEND_DIST_PATH`, which resolves against a project
# root discovered by walking up from a servicer's file; the servicers
# here come from `reboot.std.presence`, so no such root exists above
# them.
_DASHBOARD_DIRECTORY = Path(__file__).parent / 'dashboard'

# Where the page fetches a scenario's recordings from, followed by the
# recording's path relative to the working directory, the path the
# behaviors state names it by.
RECORDINGS_PATH = '/recordings'

# What a recording may be: a scenario's video or a step's screenshot.
_RECORDING_SUFFIXES = frozenset({'.png', '.webm'})


def _recording(directory: Path, relative: str) -> Path:
    """The recording at the given path relative to the working
    directory, which must be a video or screenshot in a scenario's
    directory under a recordings directory beside a feature file, so
    that nothing else under the project is served."""
    path = (directory / relative).resolve()
    try:
        parts = path.relative_to(directory.resolve()).parts
    except ValueError:
        raise HTTPException(status_code=404)
    if (
        len(parts) < 3 or
        not parts[-3].endswith(recordings.RECORDINGS_SUFFIX) or
        path.suffix not in _RECORDING_SUFFIXES or not path.is_file()
    ):
        raise HTTPException(status_code=404)
    return path


def application() -> Application:
    """The dashboard application, with its page mounted."""
    application = Application(
        servicers=[
            DashboardServicer,
            PreferencesServicer,
        ] + presence.servicers(),
        libraries=[
            ordered_map_library(
                # The page reads the changelog straight from the
                # browser; only the dashboard itself records what
                # changed.
                OrderedMap.Authorizer(
                    search=allow(),
                    range=allow(),
                    reverse_range=allow(),
                    stringify=allow(),
                    create=allow_if(all=[is_app_internal]),
                    insert=allow_if(all=[is_app_internal]),
                    remove=allow_if(all=[is_app_internal]),
                )
            ),
        ],
        initialize=initialize,
    )

    @application.http.get(RECORDINGS_PATH + '/{relative:path}')
    async def recording(relative: str) -> FileResponse:
        """A scenario's video or a step's screenshot, from beside the
        feature file under the working directory."""
        return FileResponse(_recording(Path.cwd(), relative))

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

    # The changelog, empty, for the page that reads it from the
    # moment it opens: a read of a state that does not exist is an
    # abort the application logs about.
    await OrderedMap.ref(CHANGELOG_ID).Create(context)

    # Idempotency is required of every mutation from `initialize`,
    # and needs no alias: the key is derived from the method, the
    # state id and `initialize`'s seed, which is itself derived from
    # the application. So a restart finds the watchers it already
    # spawned rather than starting more.
    dashboard = Dashboard.ref(DASHBOARD_ID)

    _ = await dashboard.idempotently().spawn().WatchApi(context)

    _ = await dashboard.idempotently().spawn().WatchCode(context)

    _ = await dashboard.idempotently().spawn().WatchBehaviors(context)


async def main():
    await application().run()


if __name__ == '__main__':
    asyncio.run(main())
