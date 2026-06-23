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
from reboot.aio.auth import Auth
from reboot.aio.auth.oauth_providers import (
    OAuthProvider,
    OAuthTokens,
    UserId,
    origin_from_request,
)
from reboot.aio.auth.token_verifiers import TokenVerifier, VerifyTokenResult
from reboot.aio.contexts import ReaderContext
from reboot.aio.http import PythonWebFramework, external_context
from reboot.crypto import root_keys
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, RedirectResponse
from typing import Any, Optional
from urllib.parse import urlencode, urlparse

logger = logging.getLogger(__name__)

# Token TTLs in seconds.
_AUTH_CODE_TTL_SECONDS = 300  # 5 minutes.
_REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60  # 30 days.
# How long a user has to complete the identity provider sign-in
# flow (from the authorize redirect to the callback). 10 minutes
# is generous for an
# interactive login but short enough to limit the window for state-token
# replay.
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
            # Perhaps this wasn't a JWT at all; there may be a different
            # token verifier that knows what this is.
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
    ):
        self._provider = provider
        self._protected_resources = protected_resources
        self._application_title = application_title
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
        http.post(_TOKEN_PATH)(self.token)
        http.options(_TOKEN_PATH)(self.cors_preflight)

        # Let the provider register any additional routes it needs.
        self._provider.mount_routes(http)

    # ---- Helpers ----

    def _make_jwt(self, payload: dict[str, Any], ttl_seconds: int) -> str:
        """Sign a payload as a JWT with the given TTL."""
        now = int(time.time())
        payload = {
            **payload,
            "iat": now,
            "exp": now + ttl_seconds,
        }
        return jwt.encode(payload, self._signing_secret, algorithm=_ALGORITHM)

    def _verify_jwt(
        self,
        token: str,
        expected_type: str,
    ) -> Optional[dict[str, Any]]:
        """Verify and decode a JWT, checking the `type` claim.

        Returns the decoded payload, or `None` if invalid.
        """
        try:
            # Access tokens have an `aud` claim; others don't.
            kwargs: dict[str, Any] = {}
            if expected_type == "access":
                kwargs["audience"] = _AUDIENCE
            else:
                kwargs["options"] = {"verify_aud": False}

            decoded = jwt.decode(
                token,
                self._signing_secret,
                algorithms=[_ALGORITHM],
                **kwargs,
            )
            if decoded.get("type") != expected_type:
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

        # Decode the client_id JWT.
        client_data = self._verify_jwt(client_id_token, "client")
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

        # Mint the auth code JWT.
        auth_code = self._make_jwt(
            {
                "type": "code",
                "sub": user_id,
                "client_id": pending["client_id"],
                "redirect_uri": pending["redirect_uri"],
                "code_challenge": pending["code_challenge"],
            },
            ttl_seconds=_AUTH_CODE_TTL_SECONDS,
        )

        redirect_uri = pending["redirect_uri"]
        mcp_state = pending.get("mcp_state", "")
        query = urlencode({
            "code": auth_code,
            "state": mcp_state,
        })
        return RedirectResponse(
            url=f"{redirect_uri}?{query}",
            status_code=302,
        )

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

        expected_challenge = (
            base64.urlsafe_b64encode(
                hashlib.sha256(str(code_verifier).encode()).digest()
            ).rstrip(b"=").decode()
        )
        if expected_challenge != code_data.get("code_challenge"):
            return _oauth_error(
                error="invalid_grant",
                description="PKCE verification failed.",
                status_code=400,
            )

        user_id: UserId = UserId(code_data["sub"])
        base = origin_from_request(request)

        # Mint access token.
        access_token = self._make_jwt(
            {
                "type": "access",
                "sub": user_id,
                "iss": base,
                "aud": _AUDIENCE,
            },
            ttl_seconds=self._access_token_ttl_seconds,
        )

        # Mint refresh token.
        refresh_token = self._make_jwt(
            {
                "type": "refresh",
                "sub": user_id,
                "client_id": str(client_id),
            },
            ttl_seconds=_REFRESH_TOKEN_TTL_SECONDS,
        )

        return JSONResponse(
            {
                "access_token": access_token,
                "token_type": "bearer",
                "expires_in": self._access_token_ttl_seconds,
                "refresh_token": refresh_token,
            },
            headers=_CORS_HEADERS,
        )

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

        # Mint new access token.
        access_token = self._make_jwt(
            {
                "type": "access",
                "sub": user_id,
                "iss": base,
                "aud": _AUDIENCE,
            },
            ttl_seconds=self._access_token_ttl_seconds,
        )

        # Mint new refresh token (rotation).
        new_refresh_token = self._make_jwt(
            {
                "type": "refresh",
                "sub": user_id,
                "client_id": str(client_id),
            },
            ttl_seconds=_REFRESH_TOKEN_TTL_SECONDS,
        )

        return JSONResponse(
            {
                "access_token": access_token,
                "token_type": "bearer",
                "expires_in": self._access_token_ttl_seconds,
                "refresh_token": new_refresh_token,
            },
            headers=_CORS_HEADERS,
        )
