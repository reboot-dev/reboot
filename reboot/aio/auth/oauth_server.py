"""MCP OAuth Authorization Server.

Implements the OAuth 2.0 Authorization Server endpoints needed for MCP
client authentication. All state is encoded into signed JWTs (HS256) so
that any server process can handle any request.
"""

from __future__ import annotations

import base64
import hashlib
import json
import jwt
import logging
import os
import rbt.v1alpha1.errors_pb2
import secrets
import time
from jinja2 import Template
from mcp.server.auth.provider import AccessToken
from reboot.aio.auth import (
    PENDING_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
    SESSION_COOKIE_NAME,
    Auth,
)
from reboot.aio.auth.allowed_origins import is_allowed_origin
from reboot.aio.auth.oauth_providers import (
    ClaimsChanged,
    OAuthProvider,
    OAuthTokens,
    UserId,
    origin_from_request,
)
from reboot.aio.auth.token_verifiers import TokenVerifier, VerifyTokenResult
from reboot.aio.contexts import ReaderContext
from reboot.aio.external import ExternalContext
from reboot.aio.http import PythonWebFramework, external_context
from reboot.crypto import root_keys
from starlette.requests import Request
from starlette.responses import (
    HTMLResponse,
    JSONResponse,
    RedirectResponse,
    Response,
)
from typing import Any, Awaitable, Callable, Mapping, Optional, Sequence
from urllib.parse import urlencode, urlparse

logger = logging.getLogger(__name__)

# Token TTLs in seconds.
_AUTH_CODE_TTL_SECONDS = 300  # 5 minutes.
_REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60  # 30 days.
# How long a user has to complete the identity provider sign-in
# flow (from the authorize redirect to the callback). 10 minutes
# is generous for an interactive login but short enough to limit
# the window for state-token replay.
_PENDING_STATE_TTL_SECONDS = 600  # 10 minutes.

# JWT algorithm.
_ALGORITHM = "HS256"

# Audience claim for access tokens.
_AUDIENCE = "reboot-mcp"

# OAuth endpoint paths. Prefixed with `__/oauth/` to avoid collisions
# with developer-specified routes. The `/.well-known/` discovery paths
# (mandated by RFC 8414 / RFC 9728) stay at their standard locations.
_AUTHORIZE_PATH = "/__/oauth/authorize"
_CONSENT_PATH = "/__/oauth/consent"
_TOKEN_PATH = "/__/oauth/token"
_REGISTER_PATH = "/__/oauth/register"
_CALLBACK_PATH = "/__/oauth/callback"

# Name of the CSRF cookie set when the consent screen is rendered. See
# below for more details on how this cookie is used.
_CONSENT_CSRF_COOKIE = "rbt_oauth_consent"

_CONSENT_PAGE_TEMPLATE_PATH = os.path.join(
    os.path.dirname(__file__),
    "consent_page.html.j2",
)

# Cap on the optional RFC 7591 display metadata (`client_name`,
# `client_uri`) we copy into the signed `client_id`. These are
# attacker-controlled and purely cosmetic on the consent screen, so a
# generous-but-finite limit keeps a hostile registration from bloating
# the JWT (and the `/authorize` URLs that carry it).
_MAX_CLIENT_METADATA_LENGTH = 256

# Browser-flow endpoints for standalone SPAs. They wrap the same
# `/authorize` → IdP → `/callback` → token-minting machinery the MCP
# flow uses, plus the cookie-based session that browser apps need.
_START_PATH = "/__/oauth/start"
_FINISH_PATH = "/__/oauth/finish"
_REFRESH_PATH = "/__/oauth/refresh"
_SIGNOUT_PATH = "/__/oauth/signout"
_WHOAMI_PATH = "/__/oauth/whoami"

# `client_id` JWT type used for the internal "browser client" we
# register on the fly in `/start`. Kept distinct from the MCP-client
# `type=client` so that a public MCP client_id (handed out via DCR)
# can't be used to drive the browser flow and vice versa.
_BROWSER_CLIENT_TYPE = "browser-client"

# CORS headers for browser-based MCP clients (e.g. MCPJam, MCP
# Inspector). Allow any origin since the server is an OAuth
# Authorization Server that public clients talk to.
_CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, MCP-Protocol-Version",
}

# HKDF `info` (domain separator) for the OAuth server's token-signing key.
_SIGNING_INFO = b"reboot.oauth.signing"


def signing_secret() -> bytes:
    """The MCP OAuth server's HS256 token-signing key, derived from
    Reboot's managed cryptographic root keys (see `reboot.crypto.root_keys`).

    Signs and verifies the access/refresh/authorization-code JWTs this
    server issues to MCP clients, so it is exercised on every authenticated
    MCP request — including in production behind an external IdP, where the
    IdP authenticates the user but this key protects the session token the
    app then issues.

    Rotating the root keys changes this value, invalidating outstanding
    tokens so clients re-authenticate. That is acceptable: it carries no
    persistent identity (production user subjects come from the IdP).
    """
    return root_keys.derive_key(
        info=_SIGNING_INFO, version=root_keys.active_version()
    )


def _compute_code_challenge(code_verifier: str) -> str:
    """The PKCE S256 code challenge for `code_verifier` (RFC 7636
    4.2): the URL-safe, unpadded base64 of its SHA-256 digest."""
    return base64.urlsafe_b64encode(
        hashlib.sha256(code_verifier.encode()).digest()
    ).rstrip(b"=").decode()


def _oauth_error(
    *,
    error: str,
    description: str,
    status_code: int,
) -> JSONResponse:
    """Return an OAuth-compliant error response (RFC 6749 5.2)."""
    return JSONResponse(
        status_code=status_code,
        content={
            "error": error,
            "error_description": description,
        },
        headers=_CORS_HEADERS,
    )


class OAuthTokenVerifier(TokenVerifier):
    """Verifies access tokens minted by the `OAuthServer`.

    Decodes the HS256 JWT and checks `type`, `aud`, and `exp`.
    Returns `Auth(user_id=...)` on success, `None` otherwise.
    """

    def __init__(self, signing_secret: bytes):
        self._signing_secret = signing_secret

    async def verify_token(
        self,
        context: ReaderContext,
        token: Optional[str],
    ) -> VerifyTokenResult:
        if token is None:
            return None
        try:
            decoded = jwt.decode(
                token,
                self._signing_secret,
                algorithms=[_ALGORITHM],
                audience=_AUDIENCE,
            )
            if decoded.get("type") != "access":
                return None
            user_id: UserId = UserId(decoded.get("sub", ""))
            if not user_id:
                return None
            return Auth(user_id=user_id)
        except jwt.ExpiredSignatureError:
            return rbt.v1alpha1.errors_pb2.Unauthenticated(
                message="Access token has expired."
            )
        except jwt.exceptions.PyJWTError:
            # Only a token whose signature verifies as ours can be
            # rejected authoritatively (PyJWT raises
            # `ExpiredSignatureError` only after the signature checks
            # out). Anything else — perhaps not a JWT at all — is
            # indistinguishable from another identity provider's
            # token, which must fall through to a composed
            # `token_verifier=`.
            return None


class MCPSDKOAuthTokenVerifier:
    """
    Verifies OAuth JWTs for the MCP SDK's HTTP auth layer.

    Implements the MCP SDK's `TokenVerifier` protocol, where
    `verify_token(token) -> AccessToken | None`. The SDK's
    `BearerAuthBackend` checks `expires_at` itself and returns HTTP 401
    with a proper `WWW-Authenticate` header on expiry.

    We therefore skip expiry verification during decode (so we can
    return `expires_at` for the SDK to check) but do verify the
    signature, audience, and type.
    """

    def __init__(self, signing_secret: bytes):
        self._signing_secret = signing_secret

    async def verify_token(  # type: ignore[override]
        self, token: str
    ) -> Optional[Any]:
        try:
            decoded = jwt.decode(
                token,
                self._signing_secret,
                algorithms=[_ALGORITHM],
                audience=_AUDIENCE,
                # Don't verify expiry here — let the MCP SDK's
                # `BearerAuthBackend` check `expires_at` so it returns a
                # proper 401 with `WWW-Authenticate`.
                options={"verify_exp": False},
            )
            if decoded.get("type") != "access":
                return None
            return AccessToken(
                token=token,
                client_id=decoded.get("sub", ""),
                scopes=[],
                expires_at=decoded.get("exp"),
            )
        except jwt.exceptions.PyJWTError:
            return None


class OAuthServer:
    """OAuth 2.0 Authorization Server for MCP.

    All state is encoded into signed JWTs so no shared storage is needed
    across server processes.

    Expected flow:

    0. **Unauthenticated request.** The MCP client connects to the
       protected resource (e.g. `POST /mcp`) without a token and
       receives HTTP 401 with a `WWW-Authenticate` header. This tells
       the client that OAuth is required and where to find the resource
       metadata.

    1. **Discovery.** The MCP client fetches `GET
       /.well-known/oauth-protected-resource/<path>` (RFC 9728) to find
       our authorization server. We could have handed off to an external
       authorization server at this point (e.g. Auth0), but then all
       application development would have to start by signing up for
       e.g. Auth0, so instead we implement a basic authorization server
       ourselves. Next, the client does a `GET
       /.well-known/oauth-authorization-server` (RFC 8414) for endpoints
       and capabilities.

    2. **Dynamic client registration.** The client `POST /register` (RFC
       7591) with its `redirect_uris`. We return a `client_id` (a signed
       JWT encoding the registered URIs).

    3. **Authorization.** The client redirects the user to `GET
       /authorize` with PKCE parameters. Because clients register
       dynamically (step 2), we don't redirect to the identity provider
       straight away: we first show a **consent screen** naming the
       client and, prominently, the `redirect_uri` host its tokens will
       be sent to, so the user can catch an unknown client trying to
       harvest their identity (an "open client" / confused-deputy
       attack — see
       https://github.com/reboot-dev/mono/issues/5560). Only after the
       user approves (`POST /consent`) do we redirect to the identity
       provider (Google, GitHub, or straight back for Anonymous).

    4. **identity provider callback.** The identity provider redirects
       to `GET /oauth/callback` with an authorization code. We exchange
       that code at the identity provider's token endpoint, receiving
       the identity provider's access token (and for OIDC providers like
       Google, an ID token). We extract the user ID (from the ID token's
       `sub` claim for Google, or via the user API for GitHub) and then
       discard the identity provider tokens — we don't store them, as
       they are sensitive. We mint our own authorization code JWT
       containing the user ID and redirect back to the client's
       `redirect_uri`.

    5. **Token exchange.** The client `POST /token` with
       `grant_type=authorization_code`, the code, and the PKCE verifier.
       We return an access token and a refresh token (both signed JWTs).

    6. **Refresh.** When the access token expires, the client `POST
       /token` with `grant_type=refresh_token` to get a new
       access/refresh token pair. This OAuth server does NOT re-authorize
       with the identity provider on refresh: token storage
       (`store_tokens=True`) exists for the application to call the
       provider's API, not to drive re-authorization here.
    """

    def __init__(
        self,
        *,
        provider: OAuthProvider,
        protected_resources: list[str],
        # The application's human-readable title, e.g. "Hipster Chat".
        application_title: str,
        auto_construct_state_type_full_names: Optional[Sequence[str]] = None,
        authenticated: Optional[
            Callable[[ExternalContext, str, Optional[Mapping[str, Any]]],
                     Awaitable[None]]] = None,
        claims_changed: Optional[ClaimsChanged] = None,
        allowed_origins: Optional[Sequence[str]] = None,
    ):
        """`authenticated`, if given, runs right after each fresh
        access token is minted for a user, receiving an app-internal
        `ExternalContext`, the `user_id` the token was minted for, and
        the user's verified identity claims when they are freshly
        available (only at an identity provider code exchange, and
        only when the provider was constructed to deliver claims via
        `claims=`; `None` on refreshes and other mints that don't
        consult the provider). It must be idempotent and inexpensive —
        it can run on every mint for the same user.

        `claims_changed`, if given, is wired into the provider
        (via `use_claims_changed`) so that provider-mounted
        routes firing outside a sign-in — e.g. an identity provider
        webhook — can deliver claims to a user whose state already
        exists, without ever materializing state for an identity that
        never signed in.

        `allowed_origins` is `Application(allowed_origins=...)`'s
        explicit allow-list (with `None` meaning it, like `oauth=`,
        was never set); browser-flow redirect targets are validated
        against the same trusted-origins set Envoy's CORS uses.
        """
        self._provider = provider
        self._protected_resources = protected_resources
        self._application_title = application_title
        self._allowed_origins: list[str] = list(allowed_origins or [])
        self._auto_construct_state_type_full_names: list[str] = list(
            auto_construct_state_type_full_names or []
        )
        self._authenticated = authenticated
        self._claims_changed = claims_changed
        self._access_token_ttl_seconds = provider.access_token_ttl_seconds
        # Derived from the Reboot-managed cryptographic root keys; raises
        # if `REBOOT_CRYPTO_ROOT_KEYS` is unset/malformed (fail fast at
        # construction rather than per-request).
        self._signing_secret = signing_secret()
        self._token_verifier = OAuthTokenVerifier(self._signing_secret)
        # The consent page template, compiled lazily on first render so
        # only apps that actually serve an OAuth flow pay for it.
        self._consent_page_template: Optional[Template] = None

    @property
    def token_verifier(self) -> OAuthTokenVerifier:
        """
        Verifier for access tokens minted by this server.
        """
        return self._token_verifier

    @property
    def mcp_sdk_token_verifier(self) -> MCPSDKOAuthTokenVerifier:
        """
        Return something implementing the MCP SDK's `TokenVerifier`

        For use with the SDK's `BearerAuthBackend` /
        `RequireAuthMiddleware`.
        """
        return MCPSDKOAuthTokenVerifier(self._signing_secret)

    def mount_routes(self, http: PythonWebFramework.HTTP) -> None:
        """Register all OAuth endpoints on `http`."""
        # RFC 9728: Protected Resource Metadata. MCP
        # clients discover auth servers through this.
        # Register both root-level and per-resource paths.
        http.get("/.well-known/oauth-protected-resource")(
            self.protected_resource_metadata
        )
        for resource in self._protected_resources:
            path = resource.strip("/")
            http.get(f"/.well-known/oauth-protected-resource/{path}")(
                self.protected_resource_metadata
            )

        # RFC 8414: Authorization Server Metadata.
        http.get("/.well-known/oauth-authorization-server")(self.metadata)

        # RFC 7591: Dynamic Client Registration.
        http.post(_REGISTER_PATH)(self.register)
        http.options(_REGISTER_PATH)(self.cors_preflight)

        # Authorization and token endpoints.
        http.get(_AUTHORIZE_PATH)(self.authorize)
        # The consent screen `/authorize` renders POSTs the user's
        # decision here (same-origin form submission, so no CORS
        # preflight is needed).
        http.post(_CONSENT_PATH)(self.consent)
        # The callback persists the provider's tokens (when
        # `store_tokens=True`) via the app-internal-only `Ciphertext` /
        # `OrderedMap` servicers, so it opts in to an app-internal context
        # with `app_internal=True`. That's safe here because the callback
        # runs only after the identity provider has redirected back with an
        # authorization code that we exchange and validate before doing any
        # app-internal work.
        http.get(_CALLBACK_PATH, app_internal=True)(self.callback)
        http.post(_TOKEN_PATH, app_internal=True)(self.token)
        http.options(_TOKEN_PATH)(self.cors_preflight)

        # Browser-flow endpoints. Envoy's CORS filter (configured in
        # `reboot/routing/envoy_config.py`) echoes the request's
        # `Origin` and sets `Access-Control-Allow-Credentials: true`
        # for these paths, so a cross-origin SPA can complete the
        # `credentials: "include"` flow without per-route headers
        # here.
        http.get(_START_PATH)(self.start)
        http.get(_FINISH_PATH, app_internal=True)(self.finish)
        http.post(_REFRESH_PATH, app_internal=True)(self.refresh)
        http.post(_SIGNOUT_PATH)(self.signout)
        http.get(_WHOAMI_PATH)(self.whoami)

        # Let the provider register any additional routes it needs,
        # wiring in the set-claims-if-exists entrypoint first so those
        # routes (e.g. an identity provider webhook) can deliver claims
        # to existing users outside a sign-in.
        if self._claims_changed is not None:
            self._provider.use_claims_changed(self._claims_changed)
        self._provider.mount_routes(http)

    # ---- Helpers ----

    async def _mint_tokens_for_user(
        self,
        *,
        user_id: UserId,
        client_id: str,
        base: str,
        context: ExternalContext,
        claims: Optional[Mapping[str, Any]] = None,
    ) -> dict[str, Any]:
        """Mint a fresh access/refresh token pair for `user_id` and
        return the standard OAuth token response body (`access_token`,
        `token_type`, `expires_in`, `refresh_token`).

        Every JWT this server hands out is minted here: using a Reboot
        app always requires the user to authenticate, and this is the
        one place that mints the token proving it. After minting,
        `authenticated` (if set) is fired with `context` and `claims`;
        given the idempotent `authenticated` its contract requires,
        this method is in turn safe to call repeatedly for the same
        user.

        `claims` are the user's verified identity claims, passed only
        by the identity provider code exchange (the one moment they
        are freshly available), and only when the provider was
        constructed to deliver claims (`claims=`); every other mint
        leaves them `None`, which delivers no claims but still
        ensures the user's state exists.

        `context` is an app-internal `ExternalContext`: the routes that
        mint are `app_internal=True`, so the auto-construct Writer that
        `authenticated` runs is trusted app code rather than a call
        made as the (not-yet-existent) user.
        """
        access_token = self._make_jwt(
            {
                "type": "access",
                "sub": user_id,
                "iss": base,
                "aud": _AUDIENCE,
            },
            ttl_seconds=self._access_token_ttl_seconds,
        )
        refresh_token = self._make_jwt(
            {
                "type": "refresh",
                "sub": user_id,
                "client_id": client_id,
            },
            ttl_seconds=_REFRESH_TOKEN_TTL_SECONDS,
        )
        # Fire the authenticated hook before returning the tokens,
        # so a failure surfaces as a 500 with no token body /
        # `Set-Cookie` rather than handing back a token whose
        # authenticated side effects never ran. If the hook raises
        # we propagate it.
        if self._authenticated is not None:
            await self._authenticated(context, user_id, claims)
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "expires_in": self._access_token_ttl_seconds,
            "refresh_token": refresh_token,
        }

    def _set_session_cookies(
        self,
        response: Response,
        *,
        access_token: str,
        refresh_token: str,
        expires_in: int,
    ) -> None:
        """Set the three session cookies on `response`.

        `SameSite=None; Secure` because Reboot's only deployment mode
        today serves the SPA on a different origin than the backend,
        and `SameSite=Lax` cookies aren't sent on cross-site fetches.
        Users with strict tracking prevention (Safari ITP, Firefox
        ETP, Chrome 3PC blocking) may have these stripped and be
        unable to sign in. TODO: prefer `SameSite=Lax; Secure`
        (optionally with `Domain=` set to a shared parent) when the
        SPA and backend share an origin or share a registrable
        domain. We can detect this at cookie-set time by comparing
        the request's `Origin` header against the backend's own
        origin. Same-site is robust against tracking prevention and
        should be the default for production deployments that can
        arrange a shared parent domain.
        Note that `Secure` is enforced by all major browsers *except*
        on `http://localhost` (and `http://127.0.0.1`), so dev under
        `rbt dev` continues to work without HTTPS; production
        requires HTTPS.
        """
        response.set_cookie(
            key=SESSION_COOKIE_NAME,
            value=access_token,
            max_age=expires_in,
            path="/",
            secure=True,
            httponly=True,
            samesite="none",
        )
        # Refresh cookie's path is restricted so the browser only
        # sends it on requests to the OAuth endpoints, never on RPC.
        response.set_cookie(
            key=REFRESH_COOKIE_NAME,
            value=refresh_token,
            max_age=_REFRESH_TOKEN_TTL_SECONDS,
            path="/__/oauth/",
            secure=True,
            httponly=True,
            samesite="none",
        )

    def _clear_session_cookies(self, response: Response) -> None:
        """Clear all session-related cookies on `response`.

        Match the `Path` / `SameSite` / `Secure` attributes of the
        original `set_cookie` calls; browsers won't honor a
        delete-cookie request whose attributes don't match.
        """
        for name, path in (
            (SESSION_COOKIE_NAME, "/"),
            (REFRESH_COOKIE_NAME, "/__/oauth/"),
        ):
            response.delete_cookie(
                key=name,
                path=path,
                secure=True,
                httponly=True,
                samesite="none",
            )

    def _verify_session_cookie(
        self,
        request: Request,
    ) -> Optional[UserId]:
        """The user id from the access JWT in `request`'s
        `rbt_session` cookie, or `None` when the cookie is absent or
        its JWT is invalid."""
        decoded = self._decode_session_cookie(request)
        if decoded is None:
            return None
        sub = decoded.get("sub", "")
        if not sub:
            return None
        return UserId(sub)

    def _decode_session_cookie(
        self,
        request: Request,
    ) -> Optional[dict[str, Any]]:
        """The decoded access-JWT claims from `request`'s
        `rbt_session` cookie, or `None` when the cookie is absent or
        its JWT is invalid."""
        token = request.cookies.get(SESSION_COOKIE_NAME)
        if token is None:
            return None
        return self._verify_jwt(token, "access")

    def _make_jwt(self, payload: dict[str, Any], ttl_seconds: int) -> str:
        """Sign a payload as a JWT with the given TTL."""
        now = int(time.time())
        payload = {
            **payload,
            "iat": now,
            "exp": now + ttl_seconds,
        }
        return jwt.encode(payload, self._signing_secret, algorithm=_ALGORITHM)

    def _redirect_with_auth_code(
        self,
        *,
        user_id: str,
        client_id: str,
        redirect_uri: str,
        code_challenge: str,
        state: str,
    ) -> RedirectResponse:
        """Mint a short-lived authorization-code JWT for `user_id` and
        302 the client to `redirect_uri` carrying the `code` (plus the
        client's opaque `state`, echoed verbatim per RFC 6749)."""
        auth_code = self._make_jwt(
            {
                "type": "code",
                "sub": user_id,
                "client_id": client_id,
                "redirect_uri": redirect_uri,
                "code_challenge": code_challenge,
            },
            ttl_seconds=_AUTH_CODE_TTL_SECONDS,
        )
        query = urlencode({"code": auth_code, "state": state})
        return RedirectResponse(
            url=f"{redirect_uri}?{query}",
            status_code=302,
        )

    def _verify_jwt(
        self,
        token: str,
        *expected_types: str,
    ) -> Optional[dict[str, Any]]:
        """Verify and decode a JWT, checking that its `type` claim is
        one of `expected_types`.

        Returns the decoded payload, or `None` if invalid.
        """
        try:
            # Access tokens have an `aud` claim; others don't.
            kwargs: dict[str, Any] = {}
            if "access" in expected_types:
                kwargs["audience"] = _AUDIENCE
            else:
                kwargs["options"] = {"verify_aud": False}

            decoded = jwt.decode(
                token,
                self._signing_secret,
                algorithms=[_ALGORITHM],
                **kwargs,
            )
            if decoded.get("type") not in expected_types:
                return None
            return decoded
        except jwt.exceptions.PyJWTError:
            return None

    def _render_consent_page(self, **context: Any) -> str:
        """Render the consent screen HTML, compiling the template on
        first use. `autoescape` is on because every interpolated value
        (client name/URI, redirect URI, the app origin) is
        attacker-influenced — anyone can register a client.
        """
        if self._consent_page_template is None:
            with open(_CONSENT_PAGE_TEMPLATE_PATH) as template_file:
                self._consent_page_template = Template(
                    template_file.read(),
                    autoescape=True,
                )
        return self._consent_page_template.render(**context)

    def _redirect_to_idp(
        self,
        *,
        request: Request,
        client_id_token: str,
        redirect_uri: str,
        code_challenge: str,
        code_challenge_method: str,
        mcp_state: str,
    ) -> RedirectResponse:
        """Mint the `pending` state JWT and redirect the user to the
        identity provider to sign in. Reached only after the user
        approves on the consent screen; the `pending` token carries
        everything needed to resume in `/callback` once the provider
        redirects back.

        OAuth's `state` parameter is an opaque string that the identity
        provider passes back unchanged in the callback. We use it to
        carry a signed JWT with everything we need to resume:
        `client_id`, `redirect_uri`, PKCE challenge, and the MCP
        client's own state. This avoids server-side session storage, and
        is safe because...
        1. The communication with the identity provider is over TLS
           (required by the OAuth spec), so it won't be observed in
           transit.
        2. None of the fields are secret to either the client or the
           identity provider.
        3. Since the token is signed, the identity provider can't alter
           it to e.g. misdirect the redirect.
        """
        pending = self._make_jwt(
            {
                "type": "pending",
                "client_id": client_id_token,
                "redirect_uri": redirect_uri,
                "code_challenge": code_challenge,
                "code_challenge_method": code_challenge_method,
                "mcp_state": mcp_state,
            },
            ttl_seconds=_PENDING_STATE_TTL_SECONDS,
        )

        # Our own callback URL.
        callback_uri = f"{origin_from_request(request)}{_CALLBACK_PATH}"

        idp_url = self._provider.authorization_url(
            state=pending,
            redirect_uri=callback_uri,
        )
        return RedirectResponse(url=idp_url, status_code=302)

    async def _store_oauth_tokens(
        self,
        request: Request,
        user_id: UserId,
        tokens: OAuthTokens,
    ) -> None:
        """Persist the provider's tokens (encrypted) for `user_id`, under
        the `OAuthTokenManager` for this provider's external service.

        Best-effort: a storage failure (e.g. a misconfigured ciphertext
        key) is logged but does not block the sign-in, so auth never
        breaks because the token vault is misconfigured.
        """
        from rbt.std.oauth.v1.oauth_rbt import OAuthTokenManager
        service = self._provider.token_service_id
        context = external_context(request)
        try:
            # Carry an existing refresh token forward when this sign-in
            # didn't return one (some providers, e.g. Google, issue a
            # refresh token only on the first consent, so a later sign-in
            # would otherwise drop it). `fetch` and `store` are separate
            # transactions, so this can't live inside `store`, which writes
            # the same per-user index it would have to read.
            if not tokens.HasField("refresh_token"):
                try:
                    existing = await OAuthTokenManager.ref(service).fetch(
                        context, user_id=user_id
                    )
                except OAuthTokenManager.FetchAborted:
                    # Nothing stored for this service yet (the manager is
                    # constructed lazily by the first store).
                    existing = None
                if (
                    existing is not None and existing.found and
                    existing.tokens.HasField("refresh_token")
                ):
                    merged = OAuthTokens()
                    merged.CopyFrom(tokens)
                    merged.refresh_token = existing.tokens.refresh_token
                    tokens = merged
            await OAuthTokenManager.ref(service).store(
                context,
                user_id=user_id,
                tokens=tokens,
            )
        except Exception as e:
            logger.error(
                "Failed to store identity provider tokens for user "
                "'%s': %s",
                user_id,
                e,
                exc_info=True,
            )

    # ---- Route handlers ----

    async def cors_preflight(
        self,
        request: Request,
    ) -> JSONResponse:
        """Handle OPTIONS preflight requests for CORS."""
        return JSONResponse(
            content=None,
            status_code=204,
            headers=_CORS_HEADERS,
        )

    async def protected_resource_metadata(
        self,
        request: Request,
    ) -> JSONResponse:
        """GET /.well-known/oauth-protected-resource[/<path>]

        Returns RFC 9728 OAuth 2.0 Protected Resource Metadata.
        Tells MCP clients which authorization server to use.
        """
        base = origin_from_request(request)
        # Derive the resource path from the request URL:
        #   "/.well-known/oauth-protected-resource/mcp" → "/mcp".
        prefix = "/.well-known/oauth-protected-resource"
        resource = request.url.path.removeprefix(prefix) or "/"
        return JSONResponse(
            {
                "resource": f"{base}{resource}",
                "authorization_servers": [base],
                "bearer_methods_supported": ["header"],
            },
            headers=_CORS_HEADERS,
        )

    async def metadata(self, request: Request) -> JSONResponse:
        """GET /.well-known/oauth-authorization-server

        Returns RFC 8414 OAuth Authorization Server Metadata.
        """
        base = origin_from_request(request)
        return JSONResponse(
            {
                "issuer": base,
                "authorization_endpoint": f"{base}{_AUTHORIZE_PATH}",
                "token_endpoint": f"{base}{_TOKEN_PATH}",
                "registration_endpoint": f"{base}{_REGISTER_PATH}",
                # We only support the authorization code flow (no
                # implicit or client credentials).
                "response_types_supported": ["code"],
                # Authorization code for initial login; refresh tokens
                # for long-lived sessions.
                "grant_types_supported":
                    [
                        "authorization_code",
                        "refresh_token",
                    ],
                # Public clients (MCP apps running in the user's
                # browser/CLI) — no client secret.
                "token_endpoint_auth_methods_supported": ["none"],
                # PKCE with S256 is required for all authorization
                # requests (RFC 7636).
                "code_challenge_methods_supported": ["S256"],
            },
            headers=_CORS_HEADERS,
        )

    async def register(self, request: Request) -> JSONResponse:
        """POST /register

        RFC 7591 Dynamic Client Registration. The returned
        `client_id` is a signed JWT encoding the registered
        `redirect_uris`.
        """
        try:
            body = await request.json()
        except json.JSONDecodeError:
            return _oauth_error(
                error="invalid_request",
                description="Request body must be valid JSON.",
                status_code=400,
            )

        redirect_uris = body.get("redirect_uris")
        if not redirect_uris or not isinstance(redirect_uris, list):
            return _oauth_error(
                error="invalid_request",
                description="The 'redirect_uris' field is required and "
                "must be a non-empty list.",
                status_code=400,
            )

        # The client_id is a signed JWT encoding the registered
        # `redirect_uris`. This lets the server verify them statelessly
        # in `/authorize` without needing a database. Client
        # registrations are normally permanent, but JWTs require an
        # `exp`, so we use an effectively-forever TTL.
        client_metadata: dict[str, Any] = {
            "type": "client",
            "redirect_uris": redirect_uris,
        }
        # RFC 7591 client metadata we surface on the consent screen so a
        # user can recognize who's asking. Optional and
        # attacker-controlled (anyone can register), so they're shown
        # only as hints next to the authoritative `redirect_uri` host,
        # never trusted. Carried in the signed `client_id` so they're
        # available statelessly at `/authorize`.
        # Over-limit values are dropped (not truncated), leaving the
        # consent screen to fall back to the authoritative
        # `redirect_uri` host.
        client_name = body.get("client_name")
        if isinstance(client_name, str
                     ) and (len(client_name) <= _MAX_CLIENT_METADATA_LENGTH):
            client_metadata["client_name"] = client_name
        client_uri = body.get("client_uri")
        if isinstance(client_uri, str
                     ) and (len(client_uri) <= _MAX_CLIENT_METADATA_LENGTH):
            client_metadata["client_uri"] = client_uri

        client_id = self._make_jwt(
            client_metadata,
            ttl_seconds=1000 * 365 * 24 * 3600,  # ~1000 years.
        )

        return JSONResponse(
            status_code=201,
            content={
                "client_id": client_id,
                "redirect_uris": redirect_uris,
                "token_endpoint_auth_method": "none",
            },
            headers=_CORS_HEADERS,
        )

    async def authorize(self, request: Request):
        """GET /authorize

        Validates the request, then renders a consent screen naming the
        client and its `redirect_uri` host. The flow only continues to
        the identity provider once the user approves via `POST /consent`.
        """
        params = request.query_params

        response_type = params.get("response_type")
        if response_type != "code":
            return _oauth_error(
                error="unsupported_response_type",
                description="Only 'code' response_type is supported.",
                status_code=400,
            )

        client_id_token = params.get("client_id")
        if client_id_token is None:
            return _oauth_error(
                error="invalid_request",
                description="The 'client_id' parameter is required.",
                status_code=400,
            )

        # Decode the client_id JWT. Accept both DCR-registered MCP
        # clients (`type=client`) and the internal browser client
        # minted by `/__/oauth/start` (`type=browser-client`); they
        # carry the same `redirect_uris` shape.
        client_data = self._verify_jwt(
            client_id_token,
            "client",
            _BROWSER_CLIENT_TYPE,
        )
        if client_data is None:
            return _oauth_error(
                error="invalid_client",
                description="The 'client_id' is invalid.",
                status_code=400,
            )

        redirect_uri = params.get("redirect_uri")
        if redirect_uri is None:
            return _oauth_error(
                error="invalid_request",
                description="The 'redirect_uri' parameter is required.",
                status_code=400,
            )

        if redirect_uri not in client_data.get("redirect_uris", []):
            return _oauth_error(
                error="invalid_request",
                description="The 'redirect_uri' is not registered for "
                "this client.",
                status_code=400,
            )

        code_challenge = params.get("code_challenge")
        code_challenge_method = params.get("code_challenge_method")
        if code_challenge is None or code_challenge_method != "S256":
            return _oauth_error(
                error="invalid_request",
                description="PKCE is required: provide 'code_challenge' "
                "with 'code_challenge_method=S256'.",
                status_code=400,
            )

        mcp_state = params.get("state", "")

        # The first-party browser client (minted by `/__/oauth/start`)
        # skips the consent screen: it's server-minted with a fixed,
        # same-origin `redirect_uri`, so the confused-deputy attack the
        # consent screen guards against — an attacker registering a
        # client with their own `redirect_uri` — can't arise. Go
        # straight to the browser-flow behavior: reuse an existing
        # session if there is one, otherwise sign in at the IdP.
        if client_data.get("type") == _BROWSER_CLIENT_TYPE:
            existing_user_id = self._verify_session_cookie(request)
            if existing_user_id is not None:
                return self._redirect_with_auth_code(
                    user_id=existing_user_id,
                    client_id=client_id_token,
                    redirect_uri=redirect_uri,
                    code_challenge=str(code_challenge),
                    state=mcp_state,
                )
            return self._redirect_to_idp(
                request=request,
                client_id_token=client_id_token,
                redirect_uri=redirect_uri,
                code_challenge=code_challenge,
                code_challenge_method=code_challenge_method,
                mcp_state=mcp_state,
            )

        # Don't redirect to the identity provider yet: show a consent
        # screen first. Clients register dynamically (RFC 7591), so the
        # `client_id` and `redirect_uri` are whatever some caller asked
        # for — absent this checkpoint an attacker can register a client
        # with their own `redirect_uri`, send a victim an `/authorize`
        # link on this trusted origin, and harvest an access token for
        # the victim's identity once they sign in (an "open client" /
        # confused-deputy attack;
        # https://github.com/reboot-dev/mono/issues/5560). PKCE doesn't
        # help — the attacker is the registered client, so they hold the
        # verifier. The consent screen gives the user a chance to notice
        # the unfamiliar `redirect_uri` host before signing in.
        #
        # See the discussion on `_CONSENT_CSRF_COOKIE` below for info on
        # how the `nonce` helps prevent CSRF attacks.
        nonce = secrets.token_urlsafe(32)
        consent_token = self._make_jwt(
            {
                "type": "consent",
                "client_id": client_id_token,
                "redirect_uri": redirect_uri,
                "code_challenge": code_challenge,
                "code_challenge_method": code_challenge_method,
                "mcp_state": mcp_state,
                "nonce": nonce,
            },
            ttl_seconds=_PENDING_STATE_TTL_SECONDS,
        )

        origin = origin_from_request(request)
        parsed_redirect = urlparse(redirect_uri)
        # The prominent host on the consent screen is what the user
        # checks, so strip any `userinfo@` from the netloc: a
        # `redirect_uri` like `https://trusted.example@evil.com/cb`
        # would otherwise show the trusted-looking left side while the
        # tokens actually go to `evil.com`.
        redirect_host = parsed_redirect.netloc.rsplit("@", 1)[-1]
        client_uri = client_data.get("client_uri")
        # Only render `client_uri` as a clickable link when it's an
        # http(s) URL; a `javascript:`/`data:` scheme would be an XSS
        # vector even with autoescaping, which doesn't neutralize a
        # dangerous URL scheme.
        client_uri_safe = (
            isinstance(client_uri, str) and
            urlparse(client_uri).scheme in ("http", "https")
        )
        html = self._render_consent_page(
            application_title=self._application_title,
            client_name=client_data.get("client_name") or None,
            client_uri=client_uri if isinstance(client_uri, str) else None,
            client_uri_safe=client_uri_safe,
            redirect_uri=redirect_uri,
            redirect_origin=f"{parsed_redirect.scheme}://{redirect_host}",
            consent_token=consent_token,
            consent_path=_CONSENT_PATH,
        )
        response = HTMLResponse(html)
        response.set_cookie(
            _CONSENT_CSRF_COOKIE,
            nonce,
            max_age=_PENDING_STATE_TTL_SECONDS,
            path=_CONSENT_PATH,
            httponly=True,
            # `Strict`: the only request that ever consumes this cookie
            # is the same-site `POST /consent` triggered by a user
            # click; our CSRF protection relies on this cookie never
            # getting delivered cross-site.
            samesite="strict",
            # Only mark `Secure` over https; in local `http://` dev a
            # `Secure` cookie would be silently dropped by the browser,
            # breaking the double-submit check.
            secure=origin.startswith("https://"),
        )
        return response

    async def consent(self, request: Request):
        """POST /consent

        Receives the user's decision from the consent screen rendered by
        `/authorize`. On approval, resumes the flow by redirecting to the
        identity provider; on denial (or any non-approval), redirects
        back to the client with an `access_denied` error per RFC 6749
        4.1.2.1.
        """
        form = await request.form()

        consent_token = form.get("consent")
        if consent_token is None:
            return _oauth_error(
                error="invalid_request",
                description="The 'consent' parameter is required.",
                status_code=400,
            )

        # `_verify_jwt` checks the HS256 signature (and `type`/`exp`)
        # with our signing secret, so from here the token's `nonce` is
        # known to be one we issued, not an attacker's.
        consent_data = self._verify_jwt(str(consent_token), "consent")
        if consent_data is None:
            return _oauth_error(
                error="invalid_request",
                description="Invalid or expired consent request.",
                status_code=400,
            )

        # CSRF defense — the "double-submit cookie" pattern. When the
        # consent page was rendered (in `authorize`) we generated one
        # random `nonce` and put it in two places: the
        # `rbt_oauth_consent` cookie (set on that GET response) and,
        # signed, inside the consent token in the form. `/consent`
        # requires the two to match — the same secret arrives once via
        # the cookie and once via the form body.
        #
        # This protects against a cross-site attacker (a different
        # site): they can mint a valid consent token for their own
        # client (so they control the form half), but they can't read
        # our cookie or make the browser send it. `SameSite=Strict`
        # keeps the cookie off every cross-site request, so a forged
        # POST from their page carries no cookie of ours to pair with
        # their token — reject.
        #
        # Putting our nonce into our _signed_ token additionally covers
        # a *same-site* attacker — e.g. a compromised sibling subdomain,
        # which can write a parent-domain cookie. In that case they
        # could set both the cookie and the form field, but they still
        # wouldn't be able to forge our signature. We already validated
        # the token signature above, so here we just need to check that
        # the cookie matches.
        cookie_nonce = request.cookies.get(_CONSENT_CSRF_COOKIE)
        if cookie_nonce is None or not secrets.compare_digest(
            cookie_nonce, str(consent_data.get("nonce", ""))
        ):
            return _oauth_error(
                error="access_denied",
                description="Consent could not be verified; please restart "
                "the sign-in.",
                status_code=403,
            )

        redirect_uri = consent_data["redirect_uri"]
        mcp_state = consent_data.get("mcp_state", "")

        if form.get("action") != "approve":
            # Anything that isn't an explicit approval — the "Cancel"
            # button, a malformed submission — is reported to the client
            # as a denial.
            query = urlencode({"error": "access_denied", "state": mcp_state})
            denied = RedirectResponse(
                url=f"{redirect_uri}?{query}",
                status_code=302,
            )
            denied.delete_cookie(_CONSENT_CSRF_COOKIE, path=_CONSENT_PATH)
            return denied

        # Web→MCP SSO: the user has approved consent, so the
        # confused-deputy check the consent screen exists for is
        # satisfied. If their browser already carries a valid
        # `rbt_session` cookie (from a prior browser sign-in via
        # `/finish` or an earlier MCP `/callback`), skip the
        # identity-provider round-trip and mint an authorization code
        # directly — they've already proven who they are; only their
        # consent was still needed.
        existing_user_id = self._verify_session_cookie(request)
        if existing_user_id is not None:
            sso = self._redirect_with_auth_code(
                user_id=existing_user_id,
                client_id=str(consent_data["client_id"]),
                redirect_uri=redirect_uri,
                code_challenge=str(consent_data["code_challenge"]),
                state=mcp_state,
            )
            sso.delete_cookie(_CONSENT_CSRF_COOKIE, path=_CONSENT_PATH)
            return sso

        response = self._redirect_to_idp(
            request=request,
            client_id_token=consent_data["client_id"],
            redirect_uri=redirect_uri,
            code_challenge=consent_data["code_challenge"],
            code_challenge_method=consent_data["code_challenge_method"],
            mcp_state=mcp_state,
        )
        response.delete_cookie(_CONSENT_CSRF_COOKIE, path=_CONSENT_PATH)
        return response

    async def callback(self, request: Request):
        """GET /oauth/callback

        Handles the identity provider redirect. Exchanges the identity provider code for a user ID,
        mints an auth code JWT, and redirects back to the MCP client.
        """
        params = request.query_params

        # Check for identity provider error.
        idp_error = params.get("error")
        if idp_error is not None:
            # Try to recover enough state to redirect back to the MCP
            # client.
            state_token = params.get("state")
            if state_token is not None:
                pending = self._verify_jwt(state_token, "pending")
                if pending is not None:
                    redirect_uri = pending["redirect_uri"]
                    mcp_state = pending.get("mcp_state", "")
                    query = urlencode(
                        {
                            "error": "access_denied",
                            "state": mcp_state,
                        }
                    )
                    return RedirectResponse(
                        url=f"{redirect_uri}?{query}",
                        status_code=302,
                    )
            return _oauth_error(
                error="access_denied",
                description=f"Identity provider returned error: {idp_error}",
                status_code=400,
            )

        state_token = params.get("state")
        if state_token is None:
            return _oauth_error(
                error="invalid_request",
                description="Missing 'state' parameter.",
                status_code=400,
            )

        pending = self._verify_jwt(state_token, "pending")
        if pending is None:
            return _oauth_error(
                error="invalid_request",
                description="Invalid or expired state parameter.",
                status_code=400,
            )

        idp_code = params.get("code")
        if idp_code is None:
            return _oauth_error(
                error="invalid_request",
                description="Missing 'code' parameter from identity "
                "provider.",
                status_code=400,
            )

        # Exchange identity provider code for a user ID (and, for
        # providers that capture them, the provider's tokens).
        callback_uri = f"{origin_from_request(request)}{_CALLBACK_PATH}"
        try:
            result = await self._provider.exchange_code(
                code=idp_code,
                redirect_uri=callback_uri,
            )
        except Exception as e:
            logger.error(
                "Failed to exchange identity provider code: %s",
                e,
                exc_info=True,
            )
            # Per RFC 6749 Section 4.1.2.1, authorization errors are
            # reported back to the client via redirect with `error` and
            # `state` query params. The MCP client (Claude, MCPJam,
            # etc.) receives this and typically shows an "authentication
            # failed" message or prompts the user to retry.
            redirect_uri = pending["redirect_uri"]
            mcp_state = pending.get("mcp_state", "")
            query = urlencode({
                "error": "access_denied",
                "state": mcp_state,
            })
            return RedirectResponse(
                url=f"{redirect_uri}?{query}",
                status_code=302,
            )

        user_id = result.user_id

        # If the provider captured the identity provider's tokens
        # (`store_tokens=True`), persist them, encrypted, so the app can
        # use them to call the provider's API.
        if result.tokens is not None:
            await self._store_oauth_tokens(request, user_id, result.tokens)

        response = self._redirect_with_auth_code(
            user_id=user_id,
            client_id=str(pending["client_id"]),
            redirect_uri=str(pending["redirect_uri"]),
            code_challenge=str(pending["code_challenge"]),
            state=pending.get("mcp_state", ""),
        )
        # MCP→web SSO: also set the browser session cookies on the
        # callback response. The callback is reached via a top-level
        # navigation through the user's browser, so the cookies land
        # in the Reboot backend's first-party jar — usable by the
        # standalone SPA on the same Reboot origin next time the
        # user opens it, even when the original MCP flow was launched
        # from inside an MCP host like Claude. For pure-MCP-client
        # flows that don't go through a browser these cookies are
        # set but ignored (the MCP client doesn't process
        # `Set-Cookie`).
        #
        # The identity provider code exchange just above is the one
        # moment the user's verified claims are fresh, so this is the
        # mint that delivers them; refresh grants and session-cookie
        # SSO never reach here and so deliver no claims. `None` means
        # claim delivery is off — the provider was constructed
        # without `claims=` or has no verified claims source (e.g.
        # `Anonymous`) — and delivers nothing; an empty mapping is
        # the provider's complete, current claim set, and clears any
        # previously delivered claims.
        tokens = await self._mint_tokens_for_user(
            user_id=user_id,
            client_id=str(pending["client_id"]),
            base=origin_from_request(request),
            context=external_context(request),
            claims=result.claims,
        )
        self._set_session_cookies(
            response,
            access_token=tokens["access_token"],
            refresh_token=tokens["refresh_token"],
            expires_in=tokens["expires_in"],
        )
        return response

    async def token(self, request: Request) -> JSONResponse:
        """POST /token

        Handles both `authorization_code` and `refresh_token` grant
        types.
        """
        # Parse form-encoded body (standard for token endpoint).
        form = await request.form()
        grant_type = form.get("grant_type")

        if grant_type == "authorization_code":
            return await self._token_authorization_code(request, form)
        elif grant_type == "refresh_token":
            return await self._token_refresh(request, form)
        else:
            return _oauth_error(
                error="unsupported_grant_type",
                description="Supported grant types: 'authorization_code', "
                "'refresh_token'.",
                status_code=400,
            )

    async def _token_authorization_code(
        self,
        request: Request,
        form: Any,
    ) -> JSONResponse:
        """Handle `grant_type=authorization_code`."""
        code_token = form.get("code")
        if code_token is None:
            return _oauth_error(
                error="invalid_request",
                description="The 'code' parameter is required.",
                status_code=400,
            )

        code_data = self._verify_jwt(str(code_token), "code")
        if code_data is None:
            return _oauth_error(
                error="invalid_grant",
                description="The authorization code is invalid or expired.",
                status_code=400,
            )

        # Verify client_id matches.
        client_id = form.get("client_id")
        if client_id != code_data.get("client_id"):
            return _oauth_error(
                error="invalid_grant",
                description="The 'client_id' does not match the authorization "
                "code.",
                status_code=400,
            )

        # Verify redirect_uri matches.
        redirect_uri = form.get("redirect_uri")
        if redirect_uri != code_data.get("redirect_uri"):
            return _oauth_error(
                error="invalid_grant",
                description="The 'redirect_uri' does not match the "
                "authorization code.",
                status_code=400,
            )

        # Verify PKCE.
        code_verifier = form.get("code_verifier")
        if code_verifier is None:
            return _oauth_error(
                error="invalid_request",
                description="The 'code_verifier' parameter is required.",
                status_code=400,
            )

        expected_challenge = _compute_code_challenge(str(code_verifier))
        if expected_challenge != code_data.get("code_challenge"):
            return _oauth_error(
                error="invalid_grant",
                description="PKCE verification failed.",
                status_code=400,
            )

        user_id: UserId = UserId(code_data["sub"])
        base = origin_from_request(request)

        tokens = await self._mint_tokens_for_user(
            user_id=user_id,
            client_id=str(client_id),
            base=base,
            context=external_context(request),
        )
        return JSONResponse(tokens, headers=_CORS_HEADERS)

    async def _token_refresh(
        self,
        request: Request,
        form: Any,
    ) -> JSONResponse:
        """
        Handle `grant_type=refresh_token`.

        This mints a fresh access/refresh token pair from the (still
        valid) refresh token. It does NOT re-authorize at the identity
        provider, even when `store_tokens=True`: token storage exists so
        the application can call the provider's API, not to drive
        re-authorization here. An app that needs a fresh provider token
        refreshes on demand using the stored `refresh_token`.
        """
        refresh_token_str = form.get("refresh_token")
        if refresh_token_str is None:
            return _oauth_error(
                error="invalid_request",
                description="The 'refresh_token' parameter is required.",
                status_code=400,
            )

        refresh_data = self._verify_jwt(str(refresh_token_str), "refresh")
        if refresh_data is None:
            return _oauth_error(
                error="invalid_grant",
                description="The refresh token is invalid or expired.",
                status_code=400,
            )

        # Verify client_id matches.
        client_id = form.get("client_id")
        if client_id != refresh_data.get("client_id"):
            return _oauth_error(
                error="invalid_grant",
                description="The 'client_id' does not match the refresh token.",
                status_code=400,
            )

        user_id: UserId = UserId(refresh_data["sub"])
        base = origin_from_request(request)

        return JSONResponse(
            await self._mint_tokens_for_user(
                user_id=user_id,
                client_id=str(client_id),
                base=base,
                context=external_context(request),
            ),
            headers=_CORS_HEADERS,
        )

    # ---- Browser-flow endpoints ----

    def _is_valid_return_to(self, return_to: str, request: Request) -> bool:
        """Decide whether `return_to` is safe to 302 to from
        `/finish`. Accepts same-origin relative paths
        unconditionally; accepts an absolute `http(s)://host[:port]`
        URL only when its origin is trusted for credentialed browser
        traffic — the same set Envoy's CORS uses (see
        `reboot.aio.auth.allowed_origins`): the explicit
        `Application(allowed_origins=...)` list, the backend's own
        origin, or, under `rbt dev run`, any localhost origin.
        Rejects everything else (`//evil.example`, `javascript:`,
        `data:`, absolute URLs whose origin isn't trusted).

        This prevents a so-called "open-redirect" / "phishing-aid"
        attack: without the trusted-origins check, a
        `/start?return_to=https://evil.example`
        link tricks the user into a "I just signed in" mental state
        on an attacker-controlled page (no tokens leak — those stay
        in HttpOnly cookies on the backend origin — but trust does).
        MCP clients are unaffected: they never use `/start` or
        `/finish`; they go through DCR + `/authorize` + `/callback`
        and validate their `redirect_uri` against what the client
        registered via DCR.
        """
        if not return_to:
            return False
        if return_to.startswith("/") and not return_to.startswith("//"):
            return True
        try:
            parsed = urlparse(return_to)
        except ValueError:
            return False
        if parsed.scheme not in ("http", "https"):
            return False
        if not parsed.netloc:
            return False
        return is_allowed_origin(
            f"{parsed.scheme}://{parsed.netloc}",
            allowed_origins=self._allowed_origins,
            own_origin=origin_from_request(request),
        )

    async def start(self, request: Request) -> Response:
        """GET /__/oauth/start[?return_to=...]

        Browser entry point for sign-in. Generates a PKCE verifier,
        stashes it in a signed `rbt_oauth_pending` cookie, mints an
        internal browser `client_id`, and 302s into `/authorize`
        with the right parameters. The user ends up at `/finish`
        after the IdP round-trip (or directly, if `/authorize`
        short-circuits because the browser already has a session
        cookie).
        """
        return_to = request.query_params.get("return_to", "/")
        if not self._is_valid_return_to(return_to, request):
            return _oauth_error(
                error="invalid_request",
                description=(
                    "The 'return_to' parameter must be a same-"
                    "origin path or an absolute http(s) URL."
                ),
                status_code=400,
            )

        code_verifier = secrets.token_urlsafe(64)
        code_challenge = _compute_code_challenge(code_verifier)

        base = origin_from_request(request)
        finish_uri = f"{base}{_FINISH_PATH}"

        # The browser client_id is just-in-time; its only registered
        # `redirect_uri` is our own `/finish`, so `/authorize` will
        # accept it but no other relying party can reuse it.
        browser_client_id = self._make_jwt(
            {
                "type": _BROWSER_CLIENT_TYPE,
                "redirect_uris": [finish_uri],
            },
            ttl_seconds=_PENDING_STATE_TTL_SECONDS,
        )

        # Pending cookie holds the PKCE verifier and where to send
        # the user when `/finish` completes. JWT-signed so a
        # tampered cookie can't redirect the user elsewhere.
        pending_value = self._make_jwt(
            {
                "type": "pending-browser",
                "code_verifier": code_verifier,
                "return_to": return_to,
            },
            ttl_seconds=_PENDING_STATE_TTL_SECONDS,
        )

        authorize_url = f"{base}{_AUTHORIZE_PATH}?" + urlencode(
            {
                "response_type": "code",
                "client_id": browser_client_id,
                "redirect_uri": finish_uri,
                "code_challenge": code_challenge,
                "code_challenge_method": "S256",
                # `state` is required by OAuth servers; it's opaque
                # for us since the pending cookie carries everything
                # we need at `/finish`.
                "state": secrets.token_urlsafe(16),
            }
        )

        response = RedirectResponse(url=authorize_url, status_code=302)
        # `SameSite=Lax` is fine here: the browser only needs to send
        # this cookie when it lands back at `/finish` via a top-level
        # navigation (302 redirect chain), which `Lax` allows.
        response.set_cookie(
            key=PENDING_COOKIE_NAME,
            value=pending_value,
            max_age=_PENDING_STATE_TTL_SECONDS,
            path="/__/oauth/",
            secure=True,
            httponly=True,
            samesite="lax",
        )
        return response

    async def finish(self, request: Request) -> Response:
        """GET /__/oauth/finish?code=...&state=...

        Browser-flow completion: redeems the auth code against the
        PKCE verifier stashed in `rbt_oauth_pending`, sets the
        session cookies, and 302s the user back to `return_to`.
        """
        params = request.query_params

        # The provider may have returned an error from `/callback`.
        # Surface a clean response and clear the pending cookie.
        idp_error = params.get("error")
        if idp_error is not None:
            response = _oauth_error(
                error=idp_error,
                description=params.get("error_description") or
                "Identity provider returned an error.",
                status_code=400,
            )
            response.delete_cookie(
                key=PENDING_COOKIE_NAME,
                path="/__/oauth/",
            )
            return response

        # Any 400 return on this handler should also clear
        # `rbt_oauth_pending`. A failed `/finish` leaves the user
        # back at the SPA; the stale cookie would otherwise sit
        # for `_PENDING_STATE_TTL_SECONDS` and confuse a fresh
        # `/start` flow if the user retries.
        def _finish_error(error: str, description: str) -> JSONResponse:
            response = _oauth_error(
                error=error,
                description=description,
                status_code=400,
            )
            response.delete_cookie(
                key=PENDING_COOKIE_NAME,
                path="/__/oauth/",
            )
            return response

        code_token = params.get("code")
        if code_token is None:
            return _finish_error(
                error="invalid_request",
                description="Missing 'code' parameter.",
            )

        pending_value = request.cookies.get(PENDING_COOKIE_NAME)
        if pending_value is None:
            return _finish_error(
                error="invalid_request",
                description=(
                    "Missing pending-flow cookie. The sign-in flow "
                    "may have expired; try signing in again."
                ),
            )

        pending = self._verify_jwt(pending_value, "pending-browser")
        if pending is None:
            return _finish_error(
                error="invalid_request",
                description=(
                    "Invalid or expired pending-flow cookie. Try "
                    "signing in again."
                ),
            )

        code_data = self._verify_jwt(str(code_token), "code")
        if code_data is None:
            return _finish_error(
                error="invalid_grant",
                description="Authorization code is invalid or expired.",
            )

        # PKCE: the verifier in the cookie must hash to the
        # challenge baked into the auth code.
        code_verifier = str(pending["code_verifier"])
        expected_challenge = _compute_code_challenge(code_verifier)
        if expected_challenge != code_data.get("code_challenge"):
            return _finish_error(
                error="invalid_grant",
                description="PKCE verification failed.",
            )

        user_id: UserId = UserId(code_data["sub"])
        base = origin_from_request(request)

        tokens = await self._mint_tokens_for_user(
            user_id=user_id,
            client_id=str(code_data["client_id"]),
            base=base,
            context=external_context(request),
        )

        return_to = str(pending["return_to"])
        response = RedirectResponse(url=return_to, status_code=302)
        self._set_session_cookies(
            response,
            access_token=tokens["access_token"],
            refresh_token=tokens["refresh_token"],
            expires_in=tokens["expires_in"],
        )
        response.delete_cookie(
            key=PENDING_COOKIE_NAME,
            path="/__/oauth/",
        )
        return response

    async def refresh(self, request: Request) -> Response:
        """POST /__/oauth/refresh

        Reads `rbt_refresh`, mints a fresh access/refresh pair, sets
        new cookies, and returns the new access token and its
        `expires_at` expiry in the body, so a client can schedule its
        next refresh to land before the access token lapses.
        """
        # CSRF protection: `/refresh` is state-changing and cookie-
        # authorized — a cross-site page could otherwise re-mint the
        # session's cookies at will, keeping a victim's 30-day
        # refresh window alive for as long as that page stays open.
        forbidden = self._forbidden_cross_site_response(
            request, action="refresh"
        )
        if forbidden is not None:
            return forbidden
        refresh_token = request.cookies.get(REFRESH_COOKIE_NAME)
        if refresh_token is None:
            return JSONResponse(
                status_code=401,
                content={"error": "not_signed_in"},
            )

        refresh_data = self._verify_jwt(refresh_token, "refresh")
        if refresh_data is None:
            response = JSONResponse(
                status_code=401,
                content={"error": "refresh_invalid"},
            )
            # Clear stale cookies so the SPA observes a clean
            # signed-out state on the next request.
            self._clear_session_cookies(response)
            return response

        user_id: UserId = UserId(refresh_data["sub"])
        base = origin_from_request(request)

        tokens = await self._mint_tokens_for_user(
            user_id=user_id,
            client_id=str(refresh_data.get("client_id", "")),
            base=base,
            context=external_context(request),
        )
        # Returning the new access_token in the body — alongside
        # rotating the cookies — lets the SPA's `onUnauthenticated`
        # 401-retry hook update `setBearerToken(...)` without a
        # second `/whoami` round-trip. Same `tokenizeAs`-style
        # bridge as the Cloud/Kratos pattern documented on
        # `/__/oauth/whoami`. `expires_at` is the absolute Unix-
        # epoch deadline (mirrors `/__/oauth/whoami`) so the SPA
        # can re-arm its proactive-refresh timer off the wall
        # clock without re-decoding the JWT.
        response = JSONResponse(
            {
                "access_token": tokens["access_token"],
                "expires_in": tokens["expires_in"],
                "expires_at": (int(time.time()) + tokens["expires_in"]),
            }
        )
        self._set_session_cookies(
            response,
            access_token=tokens["access_token"],
            refresh_token=tokens["refresh_token"],
            expires_in=tokens["expires_in"],
        )
        return response

    def _forbidden_cross_site_response(
        self,
        request: Request,
        *,
        action: str,
    ) -> Optional[JSONResponse]:
        """CSRF protection for a state-changing, cookie-authorized
        browser endpoint: a 403 response when `request` carries an
        `Origin` header naming an untrusted origin, or `None` when the
        request may proceed. Browsers attach an `Origin` header to every
        cross-origin POST; require it to name a trusted origin (the same
        set Envoy's CORS uses). Requests without an `Origin` header come
        from non-browser clients, which attach cookies deliberately
        rather than ambiently, so they pass. `action` names the
        forbidden operation in the error description."""
        origin = request.headers.get("origin")
        if origin is not None and not is_allowed_origin(
            origin,
            allowed_origins=self._allowed_origins,
            own_origin=origin_from_request(request),
        ):
            return _oauth_error(
                error="invalid_request",
                description=f"Cross-site {action} is not allowed.",
                status_code=403,
            )
        return None

    async def signout(self, request: Request) -> Response:
        """POST /__/oauth/signout

        Local sign-out only: clears the session cookies and returns 204.

        **Known limitation.** The access JWT itself is stateless —
        we have no server-side blocklist — so a copy of the cookie
        value scraped before sign-out remains a valid bearer until
        its `exp` claim (typically 30 minutes; `access_token_ttl_seconds`
        on the provider). For an attacker to exploit this, they need
        to have already exfiltrated the cookie value — which requires
        either an XSS on a SPA that called `setBearerToken(...)`
        with the JWT, or a CORS misconfiguration that let a third-
        party origin read `/whoami` credentialed. Both are blocked
        by the framework's defaults (HttpOnly cookie, exact-match
        `Application(allowed_origins=...)`). Accepted as a follow-up;
        adding a `jti` blocklist on this endpoint is the natural
        fix when it becomes load-bearing.
        """
        # CSRF protection: a cross-site `<form>` or `fetch` could
        # otherwise sign the user out at will.
        forbidden = self._forbidden_cross_site_response(
            request, action="sign-out"
        )
        if forbidden is not None:
            return forbidden
        response = Response(status_code=204)
        self._clear_session_cookies(response)
        return response

    async def whoami(self, request: Request) -> JSONResponse:
        """GET /__/oauth/whoami

        Lightweight initial-load probe for the SPA. Returns
        `{authenticated: true, user_id, access_token, default_ids}`
        when `rbt_session` is present and valid, `{authenticated:
        false}` otherwise. The `default_ids` map carries
        `{state_type_full_name: state_id}` for every auto-construct
        state type — same shape MCP delivers via tool results, so
        generated React hooks can resolve without the SPA threading
        the user_id through every call.

        Why a server round-trip exists at all, rather than the SPA
        just reading the cookie from JavaScript: Reboot serves the
        SPA on a different origin — indeed a different site — than
        the backend, so the backend's `rbt_session` cookie is not
        visible in the SPA's `document.cookie`. Cookies are scoped
        to the host that set them; a cross-site SPA cannot read
        another host's cookie from JS even if it weren't HttpOnly
        (and dropping HttpOnly would only widen XSS exposure without
        enabling the read). A *credentialed* fetch does send that
        cookie back to the backend, so `/whoami` is the bridge that
        reads it server-side and hands the JWT to the SPA.

        `access_token` returns the access JWT that's also in the
        `rbt_session` HttpOnly cookie. The SPA hands it to
        `setBearerToken(...)`, and it becomes the bearer on every
        Reboot call — cross-origin requests can't rely on the
        cookie alone.

        Security: returning the bearer in the JSON body makes
        the response a JWT-exfiltration vector for any origin we
        let read it credentialed. That's the load-bearing reason
        `Application(allowed_origins=...)` is an exact-match
        allow-list rather than a wildcard.
        """
        decoded = self._decode_session_cookie(request)
        user_id = decoded.get("sub", "") if decoded is not None else ""
        if decoded is None or not user_id:
            return JSONResponse({"authenticated": False})
        # The cookie's value IS the access JWT — surface it inline
        # so the SPA's bearer and the cookie expire in lockstep
        # (the SPA's refresh path renews both at once).
        access_token = request.cookies.get(SESSION_COOKIE_NAME)
        # `expires_at` lets the SPA's `RebootClientProvider`
        # schedule a `refreshBearer(...)` a few seconds before
        # the access JWT expires, so unary RPCs / WebSocket
        # mutations never observe a 401-due-to-expiry.
        expires_at = int(decoded["exp"])
        # All currently-supported auto-construct types key off the
        # user_id, so the map is `{<state-type>: user_id}` for each.
        # If a future auto-construct mode derives state_id from
        # something else, this is the place to compute it.
        ids = {
            full_name: user_id
            for full_name in self._auto_construct_state_type_full_names
        }
        return JSONResponse(
            {
                "authenticated": True,
                "user_id": user_id,
                "access_token": access_token,
                "expires_at": expires_at,
                "default_ids": ids,
            }
        )
