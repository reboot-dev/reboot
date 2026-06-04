"""OAuth identity providers for the OAuth server."""

from __future__ import annotations

import aiohttp
import hashlib
import hmac
import jwt
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass
from rbt.std.oauth.v1.oauth_rbt import OAuthTokens
from datetime import datetime, timezone
from jinja2 import Template
from log.log import get_logger, log_at_most_once_per
from reboot.aio.exceptions import InputError
from reboot.aio.http import PythonWebFramework
from reboot.crypto import root_keys
from reboot.run_environments import running_rbt_dev
from starlette.requests import Request
from starlette.responses import HTMLResponse
from typing import Any, NewType, Optional
from ulid import ULID
from urllib.parse import urlencode, urlparse, urlunparse

logger = get_logger(__name__)

UserId = NewType("UserId", str)

_DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 24 * 60 * 60  # 24 hours.


@dataclass(frozen=True)
class ExchangeResult:
    """The result of exchanging an identity provider authorization code:
    the resolved user ID and, when the provider captures them, the
    provider's tokens.
    """
    user_id: UserId
    # The provider's tokens, present only when the provider was
    # constructed with `store_tokens=True`; `None` otherwise, so apps
    # that don't opt in never carry these secrets around.
    tokens: Optional[OAuthTokens]


def _expires_at_from_expires_in(expires_in: Any) -> Optional[int]:
    """Convert a token endpoint's `expires_in` (seconds from now) into an
    absolute epoch-seconds expiry, or `None` if absent or unparsable.
    """
    try:
        now = int(datetime.now(timezone.utc).timestamp())
        return now + int(expires_in)
    except (TypeError, ValueError):
        return None


def _scopes_from_response(granted: Any, requested: list[str]) -> list[str]:
    """Parse the granted `scope` string from a token response, falling
    back to the scopes we requested when the provider doesn't echo
    them.
    """
    if isinstance(granted, str) and granted.strip():
        return granted.split()
    return requested


def origin_from_request(request: Request) -> str:
    """
    Derive the server's origin (`scheme://host`) from request headers.

    Respects `X-Forwarded-Proto` and `X-Forwarded-Host` when behind a
    reverse proxy.
    """
    scheme = request.headers.get(
        "x-forwarded-proto",
        request.url.scheme,
    )
    host = request.headers.get(
        "x-forwarded-host",
        request.headers.get("host", "localhost"),
    )
    return f"{scheme}://{host}"


class OAuthProvider(ABC):
    """
    Base class for identity providers.
    """

    def __init__(
        self,
        *,
        access_token_ttl_seconds: int = _DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
    ):
        # How long minted access tokens are valid, in
        # seconds.
        self.access_token_ttl_seconds = access_token_ttl_seconds

    @abstractmethod
    def authorization_url(
        self,
        state: str,
        redirect_uri: str,
    ) -> str:
        """Return the full authorization URL to redirect the user to.

        Args:
            state: An opaque string that the identity provider
                will echo back in the callback; used to
                correlate the callback with the original
                request and prevent CSRF.
            redirect_uri: The URL the identity provider should
                redirect the user to after authorization.
        """
        raise NotImplementedError()

    @abstractmethod
    async def exchange_code(
        self,
        code: str,
        redirect_uri: str,
    ) -> ExchangeResult:
        """Exchange an identity provider authorization code for a user
        ID (and, for providers that capture them, the provider's
        tokens).

        Args:
            code: The authorization code received from the
                identity provider's callback.
            redirect_uri: The redirect URI that was used in the
                original authorization request; required by
                the identity provider to validate the exchange.
        """
        raise NotImplementedError()

    @property
    def stores_tokens(self) -> bool:
        """Whether this provider captures and persists the identity
        provider's tokens. `False` by default; providers that support it
        flip this on when constructed with `store_tokens=True`.
        """
        return False

    @property
    def token_service_id(self) -> str:
        """The `OAuthTokenManager` state id this provider's tokens are
        stored under — names the external third-party service (e.g.
        "google.com"), so application code can read them back via
        `OAuthTokenManager.ref(...)`. Providers that set `stores_tokens`
        must override this.
        """
        raise NotImplementedError()

    def mount_routes(self, http: PythonWebFramework.HTTP) -> None:
        """
        Optional hook to register provider-specific HTTP routes.

        Default: no extra routes.
        """

    def validate(self) -> None:
        """
        Optional hook to verify the provider's configuration.

        Called when this provider will be used in this process (i.e.
        it's been selected). Subclasses override to fail fast on missing
        or invalid configuration; the default is a no-op.
        """


class RegisteredOAuthProvider(OAuthProvider):
    """
    Base class for providers that use pre-registered client credentials.

    These providers require developers to go through some manual
    registration flow once, which produces a `client_id` and
    `client_secret` that we need to know.
    """

    # The scope this provider always requests, on top of any the
    # developer adds, because identity resolution depends on it (e.g.
    # `openid` for Google, `read:user` for GitHub). Subclasses set this.
    _REQUIRED_SCOPE: str = ""

    def __init__(
        self,
        *,
        # `client_id`/`client_secret` are typed `Optional` so a
        # production-only provider can still be constructed in dev
        # processes where it is present but won't be used.
        client_id: Optional[str],
        client_secret: Optional[str],
        # Extra OAuth scopes to request on top of `_REQUIRED_SCOPE`, so
        # the app can call the provider's API on the user's behalf.
        scopes: Optional[list[str]] = None,
        # When `True`, capture the provider's access/refresh tokens
        # during the code exchange and persist them (encrypted) so the
        # app can use them later to call the provider's API. Off by
        # default — opting in requires the `ciphertext` library and
        # `REBOOT_CRYPTO_ROOT_KEYS`.
        store_tokens: bool = False,
    ):

        super().__init__()
        self._client_id = client_id
        self._client_secret = client_secret
        self._extra_scopes = scopes or []
        self._store_tokens = store_tokens

    @property
    def stores_tokens(self) -> bool:
        return self._store_tokens

    def _requested_scopes(self) -> list[str]:
        """The full scope list: the required base scope plus the
        developer's extras (deduplicated, base scope first).
        """
        scopes = [self._REQUIRED_SCOPE]
        for scope in self._extra_scopes:
            if scope not in scopes:
                scopes.append(scope)
        return scopes

    def validate(self) -> None:
        if not self._client_id:
            raise InputError(
                reason=(
                    f"{type(self).__name__} requires a non-empty "
                    "`client_id`."
                ),
            )
        if not self._client_secret:
            raise InputError(
                reason=(
                    f"{type(self).__name__} requires a non-empty "
                    "`client_secret`."
                ),
            )


class Google(RegisteredOAuthProvider):
    """
    Google OAuth provider (OpenID Connect).

    Obtains the user ID from the OIDC ID token's `sub` claim.
    """

    _AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
    _TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"

    # `openid` is the minimum OIDC scope; gives us an ID token with the
    # `sub` claim (the user's ID).
    _REQUIRED_SCOPE = "openid"

    @property
    def token_service_id(self) -> str:
        # Mirrors `reboot.std.oauth.v1.oauth.GOOGLE`.
        return "google.com"

    def authorization_url(
        self,
        state: str,
        redirect_uri: str,
    ) -> str:
        params = {
            "client_id": self._client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": " ".join(self._requested_scopes()),
            "state": state,
            # `offline` asks Google for a refresh token. Google only
            # returns one on the *first* consent (not on later sign-ins),
            # so the token store carries the existing refresh token
            # forward rather than us forcing the consent screen every
            # time with `prompt=consent` (see `OAuthServer._store_idp_tokens`).
            "access_type": "offline",
        }
        return f"{self._AUTHORIZATION_ENDPOINT}?{urlencode(params)}"

    async def exchange_code(
        self,
        code: str,
        redirect_uri: str,
    ) -> ExchangeResult:
        """
        Exchange the Google auth code for a user ID (and tokens).
        """
        data = {
            "code": code,
            "client_id": self._client_id,
            "client_secret": self._client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        }
        async with aiohttp.ClientSession() as session:
            async with session.post(
                self._TOKEN_ENDPOINT,
                data=data,
            ) as response:
                response.raise_for_status()
                token_response = await response.json()

        id_token = token_response.get("id_token")
        if id_token is None:
            raise ValueError(
                "Google token response did not contain an 'id_token'. Ensure "
                "the 'openid' scope is requested."
            )

        # Decode without signature verification: we just
        # received this token directly from Google's token
        # endpoint over TLS, so the transport guarantees
        # authenticity. Full verification would require
        # fetching Google's JWKS from
        # `https://www.googleapis.com/oauth2/v3/certs`,
        # caching the keys with TTL-based rotation, and
        # validating `iss`, `aud`, and `exp` claims — all
        # of which add complexity and an external HTTP
        # dependency at token-exchange time. Since we only
        # use this token to extract the `sub` claim
        # immediately after a direct TLS exchange with
        # Google, the risk is minimal.
        decoded = jwt.decode(
            id_token,
            options={"verify_signature": False},
            algorithms=["RS256"],
        )
        # Since Google is an OpenID provider we can simply obtain the
        # user ID directly from the ID token.
        user_id = decoded.get("sub")
        if user_id is None:
            raise ValueError("Google ID token did not contain a 'sub' claim.")
        return ExchangeResult(
            user_id=UserId(user_id),
            tokens=self._tokens_from_response(token_response),
        )

    def _tokens_from_response(
        self,
        token_response: dict,
    ) -> Optional[OAuthTokens]:
        """Build an `OAuthTokens` from a Google token endpoint response,
        or `None` when token storage isn't enabled or no access token came
        back.
        """
        if not self._store_tokens:
            return None
        access_token = token_response.get("access_token")
        if access_token is None:
            return None
        return OAuthTokens(
            access_token=access_token,
            refresh_token=token_response.get("refresh_token"),
            expires_at=_expires_at_from_expires_in(
                token_response.get("expires_in")
            ),
            scopes=_scopes_from_response(
                token_response.get("scope"),
                self._requested_scopes(),
            ),
        )


class GitHub(RegisteredOAuthProvider):
    """
    GitHub OAuth provider (plain OAuth 2.0).

    Note on refresh tokens (relevant only with `store_tokens=True`):
    whether GitHub issues a `refresh_token` is entirely a property of how
    the credentials were created, not anything we can request:

    - A classic **OAuth App** never issues a refresh token. Its access
      token simply does not expire (so there is nothing to refresh, and
      `OAuthTokens.refresh_token` / `expires_at` come back unset).
    - A **GitHub App** issues a `refresh_token` (and an expiring access
      token) only when "Expire user authorization tokens" is enabled in
      the app's settings. With that opt-out left disabled, its
      user-to-server token behaves like the OAuth App's — no refresh
      token.

    So to get refresh tokens, register a GitHub App and enable expiring
    user tokens; `client_id`/`client_secret` are then that app's
    credentials. We store whatever the token endpoint returns either way.
    """

    _AUTHORIZATION_ENDPOINT = "https://github.com/login/oauth/authorize"
    _TOKEN_ENDPOINT = "https://github.com/login/oauth/access_token"
    _USER_API = "https://api.github.com/user"

    # `read:user`: minimum scope needed to call `GET /user` and obtain
    # the numeric user ID.
    _REQUIRED_SCOPE = "read:user"

    @property
    def token_service_id(self) -> str:
        # Mirrors `reboot.std.oauth.v1.oauth.GITHUB`.
        return "github.com"

    def authorization_url(
        self,
        state: str,
        redirect_uri: str,
    ) -> str:
        params = {
            "client_id": self._client_id,
            "redirect_uri": redirect_uri,
            "scope": " ".join(self._requested_scopes()),
            "state": state,
        }
        return f"{self._AUTHORIZATION_ENDPOINT}?{urlencode(params)}"

    async def exchange_code(
        self,
        code: str,
        redirect_uri: str,
    ) -> ExchangeResult:
        """
        Exchange the GitHub auth code for a user ID (and tokens).
        """
        # Since GitHub isn't an OpenID provider (only plain OAuth), we
        # must first POST to the token endpoint for an access token,
        # then call `GET /user` to obtain the numeric user ID.
        data = {
            "code": code,
            "client_id": self._client_id,
            "client_secret": self._client_secret,
            "redirect_uri": redirect_uri,
        }
        headers = {"Accept": "application/json"}
        async with aiohttp.ClientSession() as session:
            # Exchange code for access token.
            async with session.post(
                self._TOKEN_ENDPOINT,
                data=data,
                headers=headers,
            ) as response:
                response.raise_for_status()
                token_response = await response.json()

            access_token = token_response.get("access_token")
            if access_token is None:
                error = token_response.get(
                    "error_description",
                    token_response.get("error", "unknown"),
                )
                raise ValueError(f"GitHub token exchange failed: {error}")

            # Fetch user info.
            async with session.get(
                self._USER_API,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/json",
                },
            ) as response:
                response.raise_for_status()
                user_info = await response.json()

        user_id = user_info.get("id")
        if user_id is None:
            raise ValueError("GitHub user API did not return an 'id' field.")
        return ExchangeResult(
            user_id=UserId(str(user_id)),
            tokens=self._tokens_from_response(token_response),
        )

    def _tokens_from_response(
        self,
        token_response: dict,
    ) -> Optional[OAuthTokens]:
        """Build an `OAuthTokens` from a GitHub token endpoint response,
        or `None` when token storage isn't enabled. Classic GitHub OAuth
        App tokens don't expire and carry no refresh token; GitHub Apps
        issue expiring tokens with a `refresh_token` and `expires_in`.
        """
        if not self._store_tokens:
            return None
        access_token = token_response.get("access_token")
        if access_token is None:
            return None
        return OAuthTokens(
            access_token=access_token,
            refresh_token=token_response.get("refresh_token"),
            expires_at=_expires_at_from_expires_in(
                token_response.get("expires_in")
            ),
            scopes=_scopes_from_response(
                token_response.get("scope"),
                self._requested_scopes(),
            ),
        )


class Auth0(RegisteredOAuthProvider):
    """
    Auth0 OAuth provider (OpenID Connect).

    Auth0 is an identity broker: a single Auth0 application can let
    users sign in through any of the connections you enable in the
    Auth0 dashboard (Google, GitHub, username/password, enterprise
    SSO, …). To the app it's one OIDC provider — the per-user choice
    of login method happens upstream, in Auth0, not here.

    All endpoints live under your tenant domain (e.g.
    `your-tenant.us.auth0.com`), so unlike `Google`/`GitHub` this
    provider takes a `domain`. Register a "Regular Web Application" in
    Auth0 and add Reboot's callback (`<base>/__/oauth/callback`) to its
    allowed callback URLs; the app's client ID/secret are the
    `client_id`/`client_secret` here.

    Obtains the user ID from the OIDC ID token's `sub` claim (shaped
    like `<connection>|<id>`, e.g. `google-oauth2|108…`), falling back
    to the `/userinfo` endpoint if no ID token is returned.
    """

    # `openid` is the minimum OIDC scope; yields an ID token with the
    # `sub` claim (the user's Auth0 ID). Add `profile`/`email` via
    # `scopes=` if the app needs them.
    _REQUIRED_SCOPE = "openid"

    # Auth0 grants a refresh token only when `offline_access` is
    # requested (the analogue of Google's `access_type=offline`); see
    # `authorization_url`.
    _OFFLINE_ACCESS_SCOPE = "offline_access"

    def __init__(
        self,
        *,
        # The Auth0 tenant domain, e.g. `your-tenant.us.auth0.com`. A
        # full `https://...` URL or a trailing slash is tolerated.
        domain: Optional[str],
        client_id: Optional[str],
        client_secret: Optional[str],
        scopes: Optional[list[str]] = None,
        store_tokens: bool = False,
    ):
        super().__init__(
            client_id=client_id,
            client_secret=client_secret,
            scopes=scopes,
            store_tokens=store_tokens,
        )
        self._domain = self._normalize_domain(domain)

    @staticmethod
    def _normalize_domain(domain: Optional[str]) -> str:
        """Strip a leading scheme and any trailing slash from an Auth0
        `domain` so both `your-tenant.auth0.com` and the full
        `https://your-tenant.auth0.com/` form work; returns `""` for a
        missing domain (caught later by `validate()`).
        """
        if not domain:
            return ""
        parsed = urlparse(domain)
        # `urlparse("tenant.auth0.com")` puts everything in `path` (no
        # scheme), whereas `urlparse("https://tenant.auth0.com")` puts it
        # in `netloc`; take whichever is populated.
        host = parsed.netloc or parsed.path
        return host.strip("/")

    @staticmethod
    def _sub_from_id_token(id_token: Optional[str]) -> Optional[str]:
        """Decode an OIDC ID token and return its `sub` claim, or `None`
        if there's no token or no `sub`.

        Decodes without verifying the signature: we received this token
        directly from the provider's token endpoint over TLS, so the
        transport guarantees authenticity (the same reasoning `Google`
        applies). We don't restrict `algorithms` because the signature
        isn't checked and Auth0 tenants may sign with RS256 or HS256.
        """
        if not id_token:
            return None
        decoded = jwt.decode(id_token, options={"verify_signature": False})
        return decoded.get("sub")

    @property
    def _authorization_endpoint(self) -> str:
        return f"https://{self._domain}/authorize"

    @property
    def _token_endpoint(self) -> str:
        return f"https://{self._domain}/oauth/token"

    @property
    def _userinfo_endpoint(self) -> str:
        return f"https://{self._domain}/userinfo"

    @property
    def token_service_id(self) -> str:
        # Auth0 is a per-tenant identity broker, so the tenant domain
        # (e.g. "your-tenant.us.auth0.com") names the service.
        return self._domain

    def validate(self) -> None:
        # Validate the credentials the base class knows about, then the
        # `domain` that's unique to Auth0 — same fail-fast contract, so
        # a missing `AUTH0_DOMAIN` is caught at selection time, not
        # mid-sign-in.
        super().validate()
        if not self._domain:
            raise InputError(
                reason="Auth0 requires a non-empty `domain`.",
            )

    def authorization_url(
        self,
        state: str,
        redirect_uri: str,
    ) -> str:
        scopes = self._requested_scopes()
        # Auth0 asks for refresh tokens via the `offline_access` scope
        # (where Google uses `access_type=offline`). Only request it
        # when we're actually capturing tokens, to avoid prompting the
        # user for offline access we'd never use.
        if self._store_tokens and self._OFFLINE_ACCESS_SCOPE not in scopes:
            scopes = scopes + [self._OFFLINE_ACCESS_SCOPE]
        params = {
            "client_id": self._client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": " ".join(scopes),
            "state": state,
        }
        return f"{self._authorization_endpoint}?{urlencode(params)}"

    async def exchange_code(
        self,
        code: str,
        redirect_uri: str,
    ) -> ExchangeResult:
        """
        Exchange the Auth0 auth code for a user ID (and tokens).
        """
        data = {
            "grant_type": "authorization_code",
            "client_id": self._client_id,
            "client_secret": self._client_secret,
            "code": code,
            "redirect_uri": redirect_uri,
        }
        async with aiohttp.ClientSession() as session:
            async with session.post(
                self._token_endpoint,
                data=data,
            ) as response:
                response.raise_for_status()
                token_response = await response.json()

            user_id = self._sub_from_id_token(token_response.get("id_token"))
            if user_id is None:
                # No ID token (shouldn't happen with the `openid`
                # scope, but be defensive): fall back to `/userinfo`,
                # which returns the same `sub` for the access token.
                access_token = token_response.get("access_token")
                if access_token is None:
                    raise ValueError(
                        "Auth0 token response contained neither an "
                        "'id_token' nor an 'access_token'; cannot "
                        "resolve the user's identity."
                    )
                async with session.get(
                    self._userinfo_endpoint,
                    headers={"Authorization": f"Bearer {access_token}"},
                ) as response:
                    response.raise_for_status()
                    user_info = await response.json()
                user_id = user_info.get("sub")

        if user_id is None:
            raise ValueError(
                "Auth0 did not return a 'sub' claim; cannot resolve "
                "the user's identity."
            )
        return ExchangeResult(
            user_id=UserId(user_id),
            tokens=self._tokens_from_response(token_response),
        )

    def _tokens_from_response(
        self,
        token_response: dict,
    ) -> Optional[OAuthTokens]:
        """Build an `OAuthTokens` from an Auth0 token endpoint response,
        or `None` when token storage isn't enabled or no access token came
        back. Auth0 only returns a `refresh_token` when `offline_access`
        was requested (see `authorization_url`).
        """
        if not self._store_tokens:
            return None
        access_token = token_response.get("access_token")
        if access_token is None:
            return None
        return OAuthTokens(
            access_token=access_token,
            refresh_token=token_response.get("refresh_token"),
            expires_at=_expires_at_from_expires_in(
                token_response.get("expires_in")
            ),
            scopes=_scopes_from_response(
                token_response.get("scope"),
                self._requested_scopes(),
            ),
        )


class Anonymous(OAuthProvider):
    """
    Anonymous provider — no external identity provider.

    Generates a fresh `anon-{ULID}` user ID for every authorization. The
    `authorization_url` redirects straight back to our own
    `/oauth/callback` with a dummy code, so the user never sees a
    sign-in page.
    """

    def __init__(
        self,
        *,
        _is_dev_default: bool = False,
        access_token_ttl_seconds: int = _DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
    ):
        super().__init__(access_token_ttl_seconds=access_token_ttl_seconds)
        self._is_dev_default = _is_dev_default

    def authorization_url(
        self,
        state: str,
        redirect_uri: str,
    ) -> str:
        # Redirect right back to our callback with a dummy code; no
        # external identity provider involved.
        params = {"code": "anonymous", "state": state}
        return f"{redirect_uri}?{urlencode(params)}"

    async def exchange_code(
        self,
        code: str,
        redirect_uri: str,
    ) -> ExchangeResult:
        """Generate a fresh anonymous user ID."""
        if self._is_dev_default:
            log_at_most_once_per(
                seconds=60,
                log_method=logger.warning,
                message=(
                    "*** Using default Anonymous OAuth for development. *** In "
                    "production, set `Application(oauth=Anonymous(), ...)` (or "
                    "another provider) explicitly."
                ),
            )
        # ULID rather than UUIDv7: same entropy, but the Crockford
        # base32 encoding is shorter and easier on the human eye —
        # relevant here because anonymous user IDs are likely to be seen
        # by humans.
        return ExchangeResult(user_id=UserId(f"anon-{ULID()}"), tokens=None)


# The five fake identities offered by the `Development` login page. We
# deliberately keep this a small, hardcoded set: it's for local
# development only.
_DEVELOPMENT_IDENTITIES: tuple[str, ...] = (
    "Alice",
    "Ben",
    "Carlos",
    "Dani",
    "Esi",
)

# HKDF `info` (domain separator) for the key that derives opaque
# development user ids. Distinct from the OAuth signing key: this is a
# separate purpose, so it gets its own root-derived key.
_DEV_USER_ID_INFO = b"reboot.oauth.dev-user-id"

# Avatar colors for the login page, drawn from the Reboot brand palette.
# Cycled per identity so each account is visually distinct.
_DEVELOPMENT_AVATAR_COLORS: tuple[str, ...] = (
    "#103761",
    "#266AB2",
    "#3285DE",
    "#007367",
    "#A39382",
)

# Path of the `Development` login page's HTTP route. Prefixed with
# `__/oauth/` to match the other OAuth endpoints and to avoid colliding
# with developer-specified routes.
_DEVELOPMENT_LOGIN_PATH = "/__/oauth/dev-login"

_DEVELOPMENT_LOGIN_PAGE_TEMPLATE_PATH = os.path.join(
    os.path.dirname(__file__),
    "development_login_page.html.j2",
)


class Development(OAuthProvider):
    """
    Development provider — a fake "pick an account" login page.

    Shows the developer a Google-style account picker with a handful of
    hardcoded fake identities (no passwords); whichever they pick
    becomes their identity. Unlike `Anonymous` the developer can pick
    the same identity twice, logging them in under the *same* user ID,
    so multi-user, multi-client, and returning-user behavior can be
    exercised locally.

    For local development only; do not use in production.
    """

    def __init__(
        self,
        *,
        access_token_ttl_seconds: int = _DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
    ):
        super().__init__(access_token_ttl_seconds=access_token_ttl_seconds)
        self._login_page_template: Optional[Template] = None

    def mount_routes(self, http: PythonWebFramework.HTTP) -> None:
        # Read and compile the login page template now, rather than at
        # module import or `__init__`, so only apps that actually use
        # `Development()` pay for it.
        with open(_DEVELOPMENT_LOGIN_PAGE_TEMPLATE_PATH) as template_file:
            self._login_page_template = Template(
                template_file.read(),
                # Make interpolated values (notably the per-identity
                # links built from the `state` JWT and callback URI)
                # safe in HTML/attribute context.
                autoescape=True,
            )

        http.get(_DEVELOPMENT_LOGIN_PATH)(self._dev_login)

    def authorization_url(
        self,
        state: str,
        redirect_uri: str,
    ) -> str:
        # Redirect the browser to our own login page, carrying the OAuth
        # `state` and the server's callback URI (passed in as
        # `redirect_uri`) so the page can build links straight to the
        # callback. We build an absolute URL by reusing the scheme and
        # host of the callback URI, so we stay correct behind a reverse
        # proxy without needing to know the callback path here.
        parsed = urlparse(redirect_uri)
        return urlunparse(
            parsed._replace(
                path=_DEVELOPMENT_LOGIN_PATH,
                query=urlencode(
                    {
                        "state": state,
                        "redirect_uri": redirect_uri,
                    }
                ),
            )
        )

    async def _dev_login(self, request: Request) -> HTMLResponse:
        """Render the fake account-picker login page."""
        log_at_most_once_per(
            seconds=60,
            log_method=logger.warning,
            message=(
                "*** Using Development OAuth. *** This shows a fake "
                "account picker for local development only; do not use "
                "`Development()` in production."
            ),
        )
        # The callback URI (where each identity link points) and the
        # signed `state` JWT to echo back to it.
        callback_uri = request.query_params.get("redirect_uri", "")
        state = request.query_params.get("state", "")

        # `callback_uri` is reflected into every per-identity `href`
        # below. In the normal flow it's this server's own OAuth
        # callback, but the endpoint is reachable directly, so a crafted
        # `redirect_uri` could turn this page into an XSS (e.g. a
        # `javascript:` scheme — HTML autoescaping does NOT neutralize a
        # dangerous URL scheme) or open-redirect gadget. Require it to be
        # same-origin over http(s); reject anything else with a 400. The
        # legit callback is always built from `origin_from_request`, so
        # the legitimate flow always passes.
        parsed_callback = urlparse(callback_uri)
        if (
            parsed_callback.scheme not in ("http", "https") or
            f"{parsed_callback.scheme}://{parsed_callback.netloc}"
            != origin_from_request(request)
        ):
            return HTMLResponse(
                "Invalid `redirect_uri`: must be same-origin.",
                status_code=400,
            )

        accounts: list[dict[str, str]] = []
        for index, name in enumerate(_DEVELOPMENT_IDENTITIES):
            # Build the link straight to the OAuth callback. Use
            # `urlencode` (never hand-concatenate the JWT `state`); the
            # template autoescapes it into the `href` attribute.
            query = urlencode({"code": name, "state": state})
            color = _DEVELOPMENT_AVATAR_COLORS[index %
                                               len(_DEVELOPMENT_AVATAR_COLORS)]
            accounts.append(
                {
                    "name": name,
                    "email": f"{name.lower()}@example.com",
                    "initial": name[0],
                    "href": f"{callback_uri}?{query}",
                    "color": color,
                }
            )
        # Invariant: `mount_routes` is inherently called before any HTTP
        #            request is served, so the login page template has
        #            been loaded.
        assert self._login_page_template is not None
        return HTMLResponse(
            self._login_page_template.render(accounts=accounts)
        )

    async def exchange_code(
        self,
        code: str,
        redirect_uri: str,
    ) -> ExchangeResult:
        """Derive a stable, per-app user ID for the chosen identity."""
        if code not in _DEVELOPMENT_IDENTITIES:
            # Only our own login page produces these codes; anything else
            # is bogus. The OAuth server turns this into a graceful
            # `access_denied` redirect.
            raise ValueError(f"Unknown development identity: {code!r}")
        # Key the HMAC by a per-app key derived from the root keys so
        # the ID is opaque and differs per app — deliberately NOT
        # `dev-{name}`, so nobody hardcodes user IDs into authorization
        # logic or tests and is instead pushed toward looking up the
        # authenticated user ID at runtime.
        #
        # We derive from the active root key version, so this ID
        # changes if the root keys rotate. That is fine since this is
        # dev-only (in production the user subject comes from the IdP,
        # not this HMAC), and currently a "rotation" only occurs from
        # an expunge, which means all of the user's data has also been
        # deleted, so getting a new ID is just fine.
        digest = hmac.new(
            root_keys.derive_key(
                info=_DEV_USER_ID_INFO,
                version=root_keys.active_version(),
            ),
            code.encode(),
            hashlib.sha256,
        ).hexdigest()
        return ExchangeResult(
            user_id=UserId(f"dev-{digest[:16]}"),
            tokens=None,
        )


# Message raised when a selector has no provider for the current
# environment.
_NO_PROVIDER_REASON = (
    "No OAuth provider is configured for this environment. Pass "
    "`Application(oauth=OAuthProviderByEnvironment(dev=..., prod=...))` "
    "with a provider for the current environment — e.g. `Development()` "
    "for local `rbt dev`, and `Google(...)` / `GitHub(...)` for "
    "production."
)


class OAuthProviderSelector(ABC):
    """
    Chooses the `OAuthProvider` an `Application` should use.

    The selection is resolved lazily, via `get()`, so that the choice
    can be made based on the environment, and only when the application
    actually needs a provider to identify users (i.e. it has a
    `User`-typed auto-construct servicer).
    """

    def get(self) -> OAuthProvider:
        """
        Return the `OAuthProvider` to use, or raise if none is
        configured for the current environment.
        """
        provider = self._select()
        # The provider has been selected; validate it before anyone
        # tries to actually use it.
        provider.validate()
        return provider

    @abstractmethod
    def _select(self) -> OAuthProvider:
        """
        Choose the provider for the current environment.
        """
        raise NotImplementedError()


class OAuthProviderByEnvironment(OAuthProviderSelector):
    """
    Selects an OAuth provider based on the run environment.

    `get()` returns the `dev` arm only under `rbt dev run`, and the
    `prod` arm everywhere else — `rbt serve`, Reboot Cloud, and any
    environment we can't classify (which defaults to the more secure
    `prod`, never the local-dev arm). Unit tests don't use this
    selector: the test `Application` (`reboot.aio.tests.Application`)
    wires a concrete provider via `OAuthProviderForTest` instead.

    Both `dev` and `prod` must be passed explicitly (so the choice for
    each environment is deliberate), but either may be `None`. If
    `get()` is reached and the selected arm is `None`, it raises — so an
    application that never chose a provider for the current environment
    fails to start with a clear message rather than shipping without
    sensible auth. A typical production app uses
    `OAuthProviderByEnvironment(dev=Development(), prod=Google(...))`;
    under `rbt dev` that transparently uses `Development` without needing
    the real provider's credentials.
    """

    def __init__(
        self,
        *,
        dev: Optional[OAuthProvider],
        prod: Optional[OAuthProvider],
    ):
        self._dev = dev
        self._prod = prod

    def _select(self) -> OAuthProvider:
        provider = self._dev if running_rbt_dev() else self._prod
        if provider is None:
            raise InputError(reason=_NO_PROVIDER_REASON)
        return provider
