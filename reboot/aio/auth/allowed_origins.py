"""The set of browser origins an application trusts for credentialed
traffic.

Envoy's CORS configuration and the OAuth server's browser-redirect
validation must agree on this set: an origin that CORS lets make
credentialed requests must also be a valid sign-in destination, and
vice versa.
"""

import os
import re
from reboot.portless import hostname, vite_hostname
from reboot.run_environments import running_rbt_dev
from reboot.settings import ENVVAR_RBT_NAME, ENVVAR_RBT_PORTLESS
from typing import Optional, Sequence

# RE2-compatible full-string regexes for the local-development origins
# that are trusted automatically under `rbt dev run`, so a frontend dev
# server (Vite, webpack, parcel, ...) works on any port without the
# developer enumerating ports in `Application(allowed_origins=...)`.
DEV_ORIGIN_REGEXES = (
    r"http://localhost(:\d+)?",
    r"http://127\.0\.0\.1(:\d+)?",
)


def portless_dev_origins() -> list[str]:
    """The origins `rbt dev run --portless` trusts exactly: the
    application's own, `https://<name>.localhost`, and its frontend
    dev server's, `https://vite.<name>.localhost`, where
    `portless vite.<name> vite` serves it (the web app opened from
    there, rather than at the application's own `/`, is
    cross-origin). Exact, not a wildcard over `.localhost`: a
    frontend registered with portless under any other name is
    refused, so the two names can't drift apart without the app
    visibly breaking. Empty when not under `--portless`."""
    if os.environ.get(ENVVAR_RBT_PORTLESS) != 'true':
        return []
    name = os.environ.get(ENVVAR_RBT_NAME)
    if not name:
        return []
    return [
        f"https://{hostname(name)}",
        f"https://{vite_hostname(name)}",
    ]


def is_allowed_origin(
    origin: str,
    *,
    allowed_origins: Sequence[str],
    own_origin: Optional[str] = None,
) -> bool:
    """Whether credentialed browser traffic from `origin` is trusted by
    an application whose explicit allow-list is `allowed_origins`: an
    exact allow-list match, the application's own origin (`own_origin`,
    when the caller knows it), or — under `rbt dev run` — any localhost
    origin, and under `--portless` the two named `.localhost` origins
    (see `portless_dev_origins`)."""
    if origin in allowed_origins:
        return True
    if own_origin is not None and origin == own_origin:
        return True
    if running_rbt_dev():
        if origin in portless_dev_origins():
            return True
        return any(
            re.fullmatch(regex, origin) is not None
            for regex in DEV_ORIGIN_REGEXES
        )
    return False
