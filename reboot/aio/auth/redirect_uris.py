"""The redirect URIs an application signs users in to without asking
them to approve the client first.

A client that Reboot has not met before registers itself dynamically
(RFC 7591) and receives the authorization code at a redirect URI of
its own — a mobile app's custom scheme like `myapp://redirect`, or an
MCP client's URL. Nothing about that registration proves who
registered, so by default the user is asked to vouch for the client on
the consent screen before the flow continues.

Listing a redirect URI here is the application developer stating that
they already trust whoever receives a code there, which lets sign-in
skip that question.
"""

import re
from reboot.run_environments import running_rbt_dev
from typing import Optional, Sequence
from urllib.parse import urlparse

# Full-string regexes for the redirect URIs that skip the consent
# screen automatically under `rbt dev run`. Expo (React Native's
# toolchain) serves a project from the development machine, so the
# redirect URI it hands the app carries that machine's address and a
# port — both of which change with the machine, the network, and the
# run. There is no stable string for a developer to put in
# `OAuth(skip_consent_for_redirect_uris=...)`, so we match the shape
# instead, and only in local development.
#
# Deliberately specific to Expo's scheme rather than covering localhost
# the way `allowed_origins` does in development. MCP clients register
# localhost redirect URIs, so trusting localhost here would stop them
# from showing the consent screen under `rbt dev run` — and a developer
# who never sees it locally is one who meets it for the first time in
# production.
DEV_REDIRECT_URI_REGEXES = (r"exp://[^/]+/--(/.*)?",)

# URI schemes never accepted, whatever the allow-list says: each one
# executes or reads local content rather than naming an app to hand an
# authorization code to.
_FORBIDDEN_SCHEMES = frozenset(["javascript", "data", "vbscript", "file"])

# A URI scheme per RFC 3986: a letter followed by letters, digits, and
# `+`, `-`, or `.`.
_SCHEME_REGEX = r"[a-zA-Z][a-zA-Z0-9+.\-]*"


def validate_redirect_uris(
    redirect_uris: Sequence[str],
    field_name: str,
) -> None:
    """Raise `ValueError` if any entry of `redirect_uris` is not usable
    as a redirect URI that an application claims as its own.
    `field_name` is the name of the parameter the list came from, used
    to point the error at what the developer wrote."""
    for redirect_uri in redirect_uris:
        if not isinstance(redirect_uri, str):
            raise ValueError(
                f"`{field_name}` must be a list of strings; got entry "
                f"of type {type(redirect_uri).__name__}"
            )
        match = re.match(f"({_SCHEME_REGEX}):", redirect_uri)
        if match is None:
            raise ValueError(
                f"`{field_name}` entry {redirect_uri!r} must be a full "
                "URI beginning with a scheme, e.g. 'myapp://redirect' "
                "for a custom-scheme app link or "
                "'https://app.example.com/redirect' for a verified "
                "App Link / Universal Link"
            )
        scheme = match.group(1).lower()
        if scheme in _FORBIDDEN_SCHEMES:
            raise ValueError(
                f"`{field_name}` entry {redirect_uri!r} uses the "
                f"forbidden '{scheme}' scheme"
            )
        if "*" in redirect_uri:
            raise ValueError(
                f"`{field_name}` entry {redirect_uri!r} must not "
                "contain a wildcard: entries are compared for exact "
                "equality against the `redirect_uri` a client "
                "registers, because that URI is where an authorization "
                "code for one of your users is delivered"
            )


def _origin(uri: str) -> Optional[tuple[str, str, int]]:
    """The scheme, host and port that `uri` names, with the scheme's
    default port filled in, or `None` when `uri` is not an `http(s)`
    URI with a host."""
    parsed = urlparse(uri)
    scheme = parsed.scheme.lower()
    if scheme not in ("http", "https") or not parsed.hostname:
        return None
    try:
        port = parsed.port
    except ValueError:
        return None
    if port is None:
        port = 443 if scheme == "https" else 80
    return (scheme, parsed.hostname.lower(), port)


def skips_consent(
    redirect_uri: str,
    *,
    skip_consent_for_redirect_uris: Sequence[str],
    resource: Optional[str] = None,
) -> bool:
    """Whether a client receiving its authorization code at
    `redirect_uri` signs users in without a consent screen: an exact
    match against the explicit allow-list
    `skip_consent_for_redirect_uris`; a `redirect_uri` with the same
    scheme, host and port as `resource`, the RFC 8707 resource the
    client asked for a token for; or — under `rbt dev run` — a
    development redirect URI whose shape only a local toolchain
    produces.

    The resource rule is safe because the code, and so the token, can
    only reach the very host the token is for: a token for another
    resource is good there and nowhere else, so the confused-deputy
    attack the consent screen guards against — a registered client
    harvesting a token for this application at a redirect URI of its
    own — gains nothing."""
    if redirect_uri in skip_consent_for_redirect_uris:
        return True
    if resource is not None:
        origin = _origin(redirect_uri)
        if origin is not None and origin == _origin(resource):
            return True
    if running_rbt_dev():
        return any(
            re.fullmatch(regex, redirect_uri) is not None
            for regex in DEV_REDIRECT_URI_REGEXES
        )
    return False
