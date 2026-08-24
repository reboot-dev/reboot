"""How an application signs its users in."""

from dataclasses import dataclass
from reboot.aio.auth.oauth_providers import OAuthProviderSelector
from reboot.aio.auth.redirect_uris import validate_redirect_uris
from typing import Optional, Sequence
from urllib.parse import urlparse


@dataclass(frozen=True)
class OAuth:
    """The OAuth configuration of an `Application`: which provider
    identifies users, which browser origins may carry credentials, and
    which clients sign users in without a consent screen.

    :param provider: an `OAuthProviderSelector` (e.g.
        `OAuthProviderByEnvironment(dev=Development(),
        prod=Google(...))`) that chooses the OAuth provider for
        authenticating users. Works for both MCP chat clients and
        browser SPAs. Resolved (and a `TokenVerifier` created
        automatically) whenever it is set, even for an app with
        nothing to auto-construct. May be combined with
        `Application(token_verifier=...)`; see there for the ordering
        semantics.
    :param allowed_origins: exact-match list of HTTP origins
        (`scheme://host[:port]`, e.g. `"https://app.example.com"`)
        that browsers are allowed to talk to this backend from when
        the request needs to carry credentials (the OAuth session
        cookie or, post sign-in, the bearer JWT minted by
        `/__/oauth/whoami`). The backend's own origin is always
        trusted on top of this list, so same-origin browser clients
        work no matter what; `allowed_origins` only ever *widens*
        trust to additional, cross-origin SPAs. An explicit empty list
        (`[]`) means *no* cross-origin credentialed traffic; only
        same-origin browser clients can sign in or call RPCs. An
        application with no `oauth=...` at all keeps serving
        permissive CORS (any origin): without browser credentials
        there is nothing an allow-list would protect.

        Two environment-driven defaults sit on top of this:

        - **Dev (`rbt dev run`)**: `http://localhost(:*)?` and
          `http://127.0.0.1(:*)?` are allowed automatically, so a
          Vite/webpack/parcel dev server on any port works without
          ceremony.

        - **Prod**: omitting `allowed_origins` entirely (leaving it at
          the default `None`) is a hard error at construction time.
          Pass `[]` explicitly to opt into same-origin-only browser
          auth; pass the SPA's real origin to enable cross-origin
          sign-in. The default-`None` case almost always means "the
          developer forgot", and we'd rather raise loudly than
          silently CORS-block every sign-in attempt in production.
    :param skip_consent_for_redirect_uris: exact-match list of the
        redirect URIs whose clients sign a user in directly, with no
        consent screen — the same treatment the browser SPA gets.
        Typically your own first-party apps: a mobile app's custom
        scheme (e.g. `"myapp://redirect"`), an `https://` App Link /
        Universal Link, or the redirect URI of an MCP client you
        already trust.

        A client that cannot use the browser sign-in flow registers
        itself dynamically (RFC 7591) and completes an ordinary
        authorization-code flow with PKCE instead. Registration proves
        nothing about who is registering, so by default such a client
        is treated as third-party: the user is shown a consent screen
        naming it, and the flow only continues once they approve. That
        screen is what stands between a user and an attacker who
        registers a client with *their own* `redirect_uri`, sends the
        user an `/__/oauth/authorize` link on this trusted origin, and
        collects an access token for the user's identity once they
        sign in. PKCE is no help there, because in that attack the
        attacker is the registered client.

        Listing a redirect URI here says you already trust whoever
        receives a code there. It is safe for exactly one reason: an
        authorization code issued for one of these URIs is delivered
        to *that* app, so an attacker registering the same URI gains
        nothing. Entries are therefore compared for exact equality,
        and wildcards are refused.

        Under `rbt dev run`, Expo's `exp://<host>/--/...` development
        URIs skip consent automatically, because they carry the
        development machine's address and port and so have no stable
        spelling to list here.

        Note that a custom scheme is claimed on a first-come basis on
        some platforms, so a hostile app on the same device can
        register `myapp://` too. PKCE contains that: the code it
        intercepts is useless without the verifier, which never leaves
        your app. An `https://` App Link / Universal Link, which the
        operating system verifies against your domain, avoids the race
        entirely and is the stronger choice where you can use one.
    """

    provider: OAuthProviderSelector
    allowed_origins: Optional[Sequence[str]] = None
    skip_consent_for_redirect_uris: Sequence[str] = ()

    def __post_init__(self) -> None:
        # Copy both sequences into tuples so that `frozen=True` means
        # what it says: a list handed in here would otherwise stay
        # mutable through the caller's reference, and would make an
        # `OAuth` unhashable despite the generated `__hash__`.
        object.__setattr__(
            self,
            "allowed_origins",
            None
            if self.allowed_origins is None else tuple(self.allowed_origins),
        )
        object.__setattr__(
            self,
            "skip_consent_for_redirect_uris",
            tuple(self.skip_consent_for_redirect_uris),
        )
        # Light validation: surface obvious typos at construction
        # rather than waiting for a browser to silently fail a CORS
        # preflight at runtime.
        for origin in self.allowed_origins or []:
            if not isinstance(origin, str):
                raise ValueError(
                    "`allowed_origins` must be a list of strings; "
                    f"got entry of type {type(origin).__name__}"
                )
            if not (
                origin.startswith("http://") or origin.startswith("https://")
            ):
                raise ValueError(
                    f"`allowed_origins` entry {origin!r} must be a full "
                    "origin starting with 'http://' or 'https://' (e.g. "
                    "'https://app.example.com'); paths, wildcards, and "
                    "bare hostnames are not accepted"
                )
            if origin.endswith("/"):
                raise ValueError(
                    f"`allowed_origins` entry {origin!r} must not have "
                    "a trailing slash (CORS `Origin` headers never carry "
                    "one)"
                )
            # Reject anything beyond `scheme://host[:port]` — a path,
            # query, or fragment would slip past validation but never
            # match the browser's `Origin: scheme://host[:port]` header
            # at Envoy's exact-match CORS filter, producing a silent
            # cross-origin block with no diagnostic.
            parsed = urlparse(origin)
            if parsed.path not in ("", "/") or parsed.query or parsed.fragment:
                raise ValueError(
                    f"`allowed_origins` entry {origin!r} must be just "
                    "an origin (`scheme://host[:port]`) — no path, "
                    "query string, or fragment. CORS `Origin` headers "
                    "never carry them, so an entry with a path would "
                    "never match."
                )
        validate_redirect_uris(
            self.skip_consent_for_redirect_uris,
            "skip_consent_for_redirect_uris",
        )
