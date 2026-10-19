"""The developer dashboard application.

A Reboot application owned by the framework, holding the state the
dashboard needs but which must not be written into the
application under development, and serving the dashboard's page. It
is not part of the Reboot API and nothing imports it; it runs as its
own process, with its own state store, alongside the application
being developed.
"""
import asyncio
import hashlib
import hmac
import json
import time
from pathlib import Path
from rbt.dashboard.v1.dashboard_rbt import Dashboard, Preferences
from rbt.std.collections.ordered_map.v1.ordered_map_rbt import OrderedMap
from rbt.std.presence.v1.presence_rbt import Presence
from reboot.aio.applications import Application
from reboot.aio.auth.authorizers import (
    allow_if,
    has_verified_token,
    is_app_internal,
)
from reboot.aio.auth.oauth import OAuth
from reboot.aio.auth.oauth_providers import (
    Anonymous,
    OAuthProviderByEnvironment,
)
from reboot.aio.external import InitializeContext
from reboot.bdd import recordings
from reboot.crypto import root_keys
from reboot.dashboard.backend.constants import (
    CHANGELOG_ID,
    DASHBOARD_ID,
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
from reboot.std.presence.v1.presence import presence_library
from starlette.exceptions import HTTPException
from starlette.responses import FileResponse, JSONResponse
from urllib.parse import quote, urlencode

# Where the page fetches a scenario's recordings from, followed by the
# recording's path relative to the working directory, the path the
# features state names it by.
RECORDINGS_PATH = '/recordings'

# What a recording may be: a scenario's video or a step's screenshot.
_RECORDING_SUFFIXES = frozenset({'.png', '.webm'})


def _recording(directory: Path, relative: str) -> Path:
    """The recording at the given path relative to the working
    directory, which must be a video or screenshot in a scenario's
    digest directory under a recordings directory beside a feature
    file, so that nothing else under the project is served."""
    path = (directory / relative).resolve()
    try:
        parts = path.relative_to(directory.resolve()).parts
    except ValueError:
        raise HTTPException(status_code=404)
    if (
        len(parts) < 4 or
        not parts[-4].endswith(recordings.RECORDINGS_SUFFIX) or
        path.suffix not in _RECORDING_SUFFIXES or not path.is_file()
    ):
        raise HTTPException(status_code=404)
    return path


# Keep recordings playable throughout a working day. Expiry is still enforced
# on every media request; the UI obtains a fresh signature after a load error.
_RECORDING_URL_EXPIRES_AFTER_SECONDS = 24 * 60 * 60


def _recording_signature(directory: Path, relative: str, expires: int) -> str:
    # A separate purpose from OAuth, scoped to this project even when
    # several dashboards share the same managed root keys.
    key = root_keys.derive_key(
        info=b'reboot.dashboard.recordings', version=root_keys.active_version()
    )
    message = json.dumps(
        [str(directory.resolve()), relative, expires], ensure_ascii=True
    ).encode()
    return hmac.new(key, message, hashlib.sha256).hexdigest()


def application() -> Application:
    """The dashboard application, with its page mounted.

    The OAuth server signs in whoever reaches it as the developer, so
    the dashboard serves this machine alone; a developer who exposes
    it, through a tunnel, to show it in an MCP host must keep its
    address to themselves.
    """
    # `_dashboard_context` in `reboot/cli/commands/dashboard.py` signs
    # in by following this provider's redirects alone; a provider that
    # asks the user anything breaks it.
    developer = Anonymous(user_id='developer')
    application = Application(
        oauth=OAuth(
            provider=OAuthProviderByEnvironment(dev=developer, prod=developer),
            # Only this application's own origin, which serves the
            # page, may act on the session cookie. An MCP host's UI
            # sends a bearer token, which this list does not govern.
            allowed_origins=[],
        ),
        servicers=[
            DashboardServicer,
            PreferencesServicer,
        ],
        libraries=[
            # `is_app_internal` trusts the `x-reboot-caller-id` header,
            # which Envoy removes from every request on the public
            # listener; see
            # `_routes_for_server` in `reboot/routing/envoy_config.py`.
            presence_library(
                authorizer=allow_if(any=[is_app_internal, has_verified_token]),
            ),
            ordered_map_library(
                # The developer's page reads the changelog; only the
                # dashboard itself records what changed.
                authorizer=OrderedMap.Authorizer(
                    search=allow_if(any=[is_app_internal, has_verified_token]),
                    range=allow_if(any=[is_app_internal, has_verified_token]),
                    reverse_range=allow_if(
                        any=[is_app_internal, has_verified_token]
                    ),
                    stringify=allow_if(
                        any=[is_app_internal, has_verified_token]
                    ),
                    create=allow_if(all=[is_app_internal]),
                    insert=allow_if(all=[is_app_internal]),
                    remove=allow_if(all=[is_app_internal]),
                )
            ),
        ],
        initialize=initialize,
    )

    # Sign only after authenticating the developer. Keep this route
    # before the catch-all; the element itself cannot send a bearer header.
    @application.http.get(RECORDINGS_PATH + '/sign', require_oauth_token=True)
    async def sign_recording(path: str) -> JSONResponse:
        directory = Path.cwd()
        _recording(directory, path)
        expires = int(time.time()) + _RECORDING_URL_EXPIRES_AFTER_SECONDS
        query = urlencode(
            {
                'expires': expires,
                'sig': _recording_signature(directory, path, expires),
            }
        )
        return JSONResponse(
            {
                'url': f'{RECORDINGS_PATH}/{quote(path, safe="/")}?{query}',
                'expires': expires
            },
            headers={'Cache-Control': 'no-store'},
        )

    @application.http.get(RECORDINGS_PATH + '/{relative:path}')
    async def recording(
        relative: str, expires: str = '', sig: str = ''
    ) -> FileResponse:
        directory = Path.cwd()
        # Reject malformed credentials without leaking file existence.
        if (
            not expires.isascii() or not expires.isdecimal() or
            len(expires) > 12
        ):
            raise HTTPException(status_code=401)
        expiry = int(expires)
        now = int(time.time())
        if (
            expiry <= now or not hmac.compare_digest(
                _recording_signature(directory, relative, expiry).encode(),
                sig.encode(),
            )
        ):
            raise HTTPException(status_code=401)
        return FileResponse(
            _recording(directory, relative),
            # This browser may keep the file for as long as the URL is
            # valid, so a thumbnail is not fetched again on every render.
            headers={'Cache-Control': f'private, max-age={expiry - now}'},
        )

    # The page itself is served at `/` by the web framework, from
    # `DASHBOARD_DIRECTORY`, which the CLI names in this application's
    # environment the way `--web-app-dist-path` would.

    return application


async def initialize(context: InitializeContext) -> None:
    """Gives `Preferences` the answer somebody who has never clicked
    its notice should get."""
    await Preferences.ref(PREFERENCES_ID).SetSuppressAutomaticOpen(
        context,
        suppress_automatic_open=False,
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

    _ = await dashboard.idempotently().spawn().WatchFeatures(context)


async def main():
    await application().run()


if __name__ == '__main__':
    asyncio.run(main())
