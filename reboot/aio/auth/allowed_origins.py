"""The set of browser origins an application trusts for credentialed
traffic.

Envoy's CORS configuration and the OAuth server's browser-redirect
validation must agree on this set: an origin that CORS lets make
credentialed requests must also be a valid sign-in destination, and
vice versa.
"""

import os
import re
from reboot.run_environments import running_rbt_dev
from reboot.settings import ENVVAR_RBT_FRONTEND_URL
from typing import Optional, Sequence
from urllib.parse import urlparse

# RE2-compatible full-string regexes for the local-development origins
# that are trusted automatically under `rbt dev run`, so a frontend dev
# server (Vite, webpack, parcel, ...) works on any port without the
# developer enumerating ports in `Application(allowed_origins=...)`.
DEV_ORIGIN_REGEXES = (
    r"http://localhost(:\d+)?",
    r"http://127\.0\.0\.1(:\d+)?",
)

# The OAuth server's path prefix. Only paths under it act on a
# browser's session cookie from a cross-origin request, so only they
# get a credentialed CORS policy restricted to the trusted origins;
# every other path answers any origin without credentials.
OAUTH_PATH_PREFIX = "/__/oauth/"


def frontend_dev_origin() -> Optional[str]:
    """Under `rbt dev run`, the origin of the frontend dev server it
    routes to (`--frontend-url`), where a browser may open the web app
    too, e.g., `https://frontend-<app>.localhost` under `--portless`.
    Trusted exactly: it is the dev server we were told about, not a
    pattern. `None` without one, or outside `rbt dev run`."""
    if not running_rbt_dev():
        return None
    frontend_url = os.environ.get(ENVVAR_RBT_FRONTEND_URL)
    if not frontend_url:
        return None
    parsed = urlparse(frontend_url)
    if not parsed.scheme or not parsed.netloc:
        return None
    return f"{parsed.scheme}://{parsed.netloc}"


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
    origin. Under `rbt dev run` the allow-list also holds the frontend
    dev server's origin (see `frontend_dev_origin`)."""
    if origin in allowed_origins:
        return True
    if own_origin is not None and origin == own_origin:
        return True
    if running_rbt_dev():
        return any(
            re.fullmatch(regex, origin) is not None
            for regex in DEV_ORIGIN_REGEXES
        )
    return False
