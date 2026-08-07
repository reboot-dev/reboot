"""The inspect dashboard's companion application.

A Reboot application owned by the framework, holding the state the
inspect dashboard needs but which must not be written into the
application under development, and serving the dashboard itself. It is
not part of the Reboot API and nothing imports it; it runs as its own
process, with its own state store, alongside the application being
developed.
"""
import asyncio
from pathlib import Path
from reboot.aio.applications import Application
from reboot.inspect.companion_app.constants import DASHBOARD_PATH
from reboot.inspect.companion_app.servicers import servicers
from starlette.staticfiles import StaticFiles

# The built page, beside this module -- the same arrangement
# `InspectServicer` uses for its own assets. Mounting it directly
# avoids `RBT_FRONTEND_DIST_PATH`, which resolves against a project
# root discovered by walking up from a servicer's file; the servicers
# here come from `reboot.std.presence`, so no such root exists above
# them.
_DASHBOARD_DIRECTORY = Path(__file__).parent / 'dashboard'


def application() -> Application:
    """The companion application, with the dashboard mounted."""
    application = Application(servicers=servicers())

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


async def main():
    await application().run()


if __name__ == '__main__':
    asyncio.run(main())
