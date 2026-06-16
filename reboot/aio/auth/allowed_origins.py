"""The set of browser origins an application trusts for credentialed
traffic.

Envoy's CORS configuration and the OAuth server's browser-redirect
validation must agree on this set: an origin that CORS lets make
credentialed requests must also be a valid sign-in destination, and
vice versa.
"""

import re
from reboot.run_environments import running_rbt_dev
from typing import Optional, Sequence

# RE2-compatible full-string regexes for the local-development origins
# that are trusted automatically under `rbt dev run`, so a frontend dev
# server (Vite, webpack, parcel, ...) works on any port without the
# developer enumerating ports in `Application(allowed_origins=...)`.
DEV_ORIGIN_REGEXES = (
    r"http://localhost(:\d+)?",
    r"http://127\.0\.0\.1(:\d+)?",
)


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
    origin."""
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
