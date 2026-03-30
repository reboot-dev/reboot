"""OAuth identity providers for the OAuth server."""

from __future__ import annotations

import aiohttp
import jwt
from abc import ABC, abstractmethod
from log.log import get_logger, log_at_most_once_per
from typing import NewType
from ulid import ULID
from urllib.parse import urlencode

logger = get_logger(__name__)

UserId = NewType("UserId", str)

_DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 24 * 60 * 60  # 24 hours.


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
    ) -> UserId:
        """Exchange an identity provider authorization code for
        a user ID.

        Args:
            code: The authorization code received from the
                identity provider's callback.
            redirect_uri: The redirect URI that was used in the
                original authorization request; required by
                the identity provider to validate the exchange.
        """
        raise NotImplementedError()


class RegisteredOAuthProvider(OAuthProvider):
    """
    Base class for providers that use pre-registered client credentials.
    
    These providers require developers to go through some manual
    registration flow once, which produces a `client_id` and
    `client_secret` that we need to know.
    """

    def __init__(self, *, client_id: str, client_secret: str):
        super().__init__()
        if not client_id:
            raise ValueError(
                f"{type(self).__name__} requires a non-empty `client_id`."
            )
        if not client_secret:
            raise ValueError(
                f"{type(self).__name__} requires a non-empty `client_secret`."
            )
        self._client_id = client_id
        self._client_secret = client_secret


class Google(RegisteredOAuthProvider):
    """
    Google OAuth provider (OpenID Connect).

    Obtains the user ID from the OIDC ID token's `sub` claim.
    """

    _AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
    _TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"

    def authorization_url(
        self,
        state: str,
        redirect_uri: str,
    ) -> str:
        params = {
            "client_id": self._client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            # `openid` is the minimum OIDC scope; gives us an ID token
            # with the `sub` claim (the user's ID).
            "scope": "openid",
            "state": state,
            "access_type": "offline",
        }
        return f"{self._AUTHORIZATION_ENDPOINT}?{urlencode(params)}"

    async def exchange_code(
        self,
        code: str,
        redirect_uri: str,
    ) -> UserId:
        """
        Exchange the Google auth code for user ID.
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
        return UserId(user_id)


class GitHub(RegisteredOAuthProvider):
    """
    GitHub OAuth provider (plain OAuth 2.0).
    """

    _AUTHORIZATION_ENDPOINT = "https://github.com/login/oauth/authorize"
    _TOKEN_ENDPOINT = "https://github.com/login/oauth/access_token"
    _USER_API = "https://api.github.com/user"

    def authorization_url(
        self,
        state: str,
        redirect_uri: str,
    ) -> str:
        params = {
            "client_id": self._client_id,
            "redirect_uri": redirect_uri,
            # `read:user`: minimum scope needed to call `GET /user` and
            # obtain the numeric user ID.
            "scope": "read:user",
            "state": state,
        }
        return f"{self._AUTHORIZATION_ENDPOINT}?{urlencode(params)}"

    async def exchange_code(
        self,
        code: str,
        redirect_uri: str,
    ) -> UserId:
        """
        Exchange the GitHub auth code for user ID.
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
        return UserId(str(user_id))


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
    ) -> UserId:
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
        return UserId(f"anon-{ULID()}")
