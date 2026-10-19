"""Who may reach an application at all.

An access policy stands in front of every route and every RPC of an
application: a visitor who has not been let in sees nothing of it,
not even its own sign-in. It is distinct from the application's own
sign-in (`Application(oauth=...)`), which says who the application's
users are: the policy says who may knock. An application run on a
public URL by its developer, with only the developer allowed in, is
the typical use.

A visitor is let in by an issuer, an OAuth authorization server the
policy trusts to say who they are (Reboot Cloud, for a developer's
own application), which the policy talks to as an ordinary OAuth
client: it sends the visitor there to sign in, asking for a token for
this very origin (RFC 8707 `resource`), and learns from the token
response who signed in. The policy then decides, and a visitor it
allows gets a host-scoped cookie that lets them in for a while.
"""

from __future__ import annotations

import html
import jwt
import os
import secrets
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from log.log import get_logger
from rbt.v1alpha1 import errors_pb2
from reboot.aio.auth.oauth_client import (
    AuthorizationServerMetadata,
    OAuthClient,
    OAuthClientError,
    discover,
    pkce_pair,
    register,
)
from reboot.aio.auth.origin import origin_from_request
from reboot.aio.auth.token_verifiers import TokenVerifier, VerifyTokenResult
from reboot.aio.contexts import ReaderContext
from reboot.crypto import root_keys
from reboot.settings import (
    ENVVAR_REBOOT_ACCESS_ISSUER,
    ENVVAR_REBOOT_ACCESS_POLICY,
)
from starlette.requests import Request
from starlette.responses import (
    HTMLResponse,
    JSONResponse,
    RedirectResponse,
    Response,
)
from typing import Any, Awaitable, Callable, Optional, Sequence

logger = get_logger(__name__)

# The cookie that says a visitor has been let in: a signed JWT naming
# them and the issuer that vouched for them. Host-scoped, like every
# cookie, so being let in on one host says nothing about another.
ACCESS_COOKIE_NAME = "rbt_access"

# The cookie that carries a sign-in in progress (the PKCE verifier,
# the `state` to expect back and where to return to) from the redirect
# to the issuer until the issuer sends the visitor back.
_PENDING_COOKIE_NAME = "rbt_access_pending"

# Where the issuer sends a visitor back after they signed in.
CALLBACK_PATH = "/__/access/callback"

# Forgets that a visitor was let in.
SIGNOUT_PATH = "/__/access/signout"

# How long a visitor stays let in.
_ACCESS_TTL_SECONDS = 12 * 60 * 60

# How long a visitor has to finish signing in at the issuer.
_PENDING_TTL_SECONDS = 10 * 60

_ALGORITHM = "HS256"

# HKDF `info` for the key that signs the access and pending cookies,
# derived from Reboot's managed cryptographic root keys. Its own label
# so that it is independent of the OAuth server's token-signing key.
_SIGNING_INFO = b"reboot.access.signing"

# Paths every visitor may reach without having been let in: an
# application's public OAuth surface, which an MCP client must reach
# to start the application's sign-in (registration and the token
# exchange hold no secrets and are protected by PKCE); the policy's
# own routes, which a visitor reaches on the way in; and the empty
# reachability probe the setup wizard fetches.
_PUBLIC_PATH_PREFIXES = ("/.well-known/", "/__/access/")
_PUBLIC_PATHS = frozenset(
    ["/__/oauth/register", "/__/oauth/token", "/__/probe"]
)


@dataclass(frozen=True)
class Visitor:
    """Someone an issuer vouched for: `user_id` is their subject at
    `issuer`, the origin of the authorization server that said so."""
    user_id: str
    issuer: str


class Policy(ABC):
    """Which visitors may reach the application."""

    @abstractmethod
    def allows(self, visitor: Visitor) -> bool:
        """Whether `visitor` may reach the application."""
        raise NotImplementedError()

    @abstractmethod
    def describe(self) -> str:
        """Who the policy lets in, for a message to a visitor it does
        not, e.g. `the Reboot Cloud user that started it`."""
        raise NotImplementedError()


@dataclass(frozen=True)
class UserPolicy(Policy):
    """Lets in one user of the issuer, by their subject there, and
    nobody else: the developer running their own application."""
    user_id: str

    def allows(self, visitor: Visitor) -> bool:
        return visitor.user_id == self.user_id

    def describe(self) -> str:
        return f"the user who started it ({self.user_id})"


def parse_policy(text: str) -> Policy:
    """The policy `text` spells, as `REBOOT_ACCESS_POLICY` does:
    `user:<id>`. Raises `ValueError` for anything else."""
    kind, _, argument = text.strip().partition(":")
    if kind == "user" and argument:
        return UserPolicy(user_id=argument)
    raise ValueError(f"Unknown access policy {text!r}; expected 'user:<id>'")


@dataclass(frozen=True)
class AppSignIn:
    """How the application's own sign-in (`Application(oauth=...)`)
    presents a credential, so that a visitor holding one is let in
    without the policy's own cookie: they could only have obtained it
    through a sign-in that was itself behind the policy.

    `session_cookie_name` is the cookie the application's browser
    session rides in and `is_access_token` tells a token the
    application minted (the session cookie's value, or a bearer).
    `protected_resources` are the paths whose RFC 9728 metadata tells
    an MCP client how to sign in, named in the `WWW-Authenticate` of a
    refusal so that the client starts the application's sign-in."""
    session_cookie_name: str
    is_access_token: Callable[[str], bool]
    protected_resources: Sequence[str] = ()


class Access:
    """An access policy and the machinery that enforces it: the HTTP
    middleware in front of every route, the routes a visitor passes
    through on the way in, and the check in front of every RPC
    (`token_verifier`).

    Per request, in order: a public path (see `_PUBLIC_PATHS`) is
    served; a visitor the policy let in (a valid `rbt_access` cookie)
    is served; a holder of the application's own credential (see
    `AppSignIn`) is served; anyone else is sent to the issuer to sign
    in if they are a browser navigating, and refused with a 401
    otherwise, naming the application's sign-in when it has one.
    """

    def __init__(
        self,
        *,
        issuer: str,
        policy: Policy,
        app: Optional[AppSignIn] = None,
        # The name this application registers with the issuer under,
        # shown on the issuer's consent screen if it shows one.
        client_name: str = "Reboot application",
    ):
        self._issuer = issuer.rstrip("/")
        self._policy = policy
        self._app = app
        self._client_name = client_name
        self._signing_secret: Optional[bytes] = None
        self._metadata: Optional[AuthorizationServerMetadata] = None
        # The client registered with the issuer for each origin this
        # application was reached at: a redirect URI is per origin,
        # and registration is stateless on a Reboot issuer, so one per
        # origin, made when first needed.
        self._clients: dict[str, OAuthClient] = {}

    @classmethod
    def from_environment(
        cls,
        *,
        app: Optional[AppSignIn] = None,
        client_name: str = "Reboot application",
    ) -> Optional[Access]:
        """The policy the environment imposes, from
        `REBOOT_ACCESS_POLICY` and `REBOOT_ACCESS_ISSUER`, or `None`
        when it imposes none. Raises `ValueError` when the policy is
        malformed or set without an issuer."""
        policy = os.environ.get(ENVVAR_REBOOT_ACCESS_POLICY)
        issuer = os.environ.get(ENVVAR_REBOOT_ACCESS_ISSUER)
        if not policy:
            return None
        if not issuer:
            raise ValueError(
                f"'{ENVVAR_REBOOT_ACCESS_POLICY}' is set but "
                f"'{ENVVAR_REBOOT_ACCESS_ISSUER}' is not; the issuer is "
                "the OAuth authorization server that says who a visitor is"
            )
        return cls(
            issuer=issuer,
            policy=parse_policy(policy),
            app=app,
            client_name=client_name,
        )

    @property
    def issuer(self) -> str:
        return self._issuer

    @property
    def policy(self) -> Policy:
        return self._policy

    def mount_routes(self, http: Any) -> None:
        """Register the routes a visitor passes through on the way in
        on `http`, a `PythonWebFramework.HTTP`."""
        http.get(CALLBACK_PATH, include_in_schema=False)(self.callback)
        http.get(SIGNOUT_PATH, include_in_schema=False)(self.signout)

    async def middleware(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        """The check in front of every route; see the class."""
        if self._is_public(request):
            return await call_next(request)
        if self.visitor(request) is not None:
            return await call_next(request)
        if self._holds_app_credential(request):
            return await call_next(request)
        if _is_navigation(request):
            return await self._start_sign_in(request)
        return self._unauthorized(request)

    def visitor(self, request: Request) -> Optional[Visitor]:
        """The visitor `request`'s `rbt_access` cookie says was let
        in, if it carries a valid one and the policy still allows
        them."""
        return self.visitor_from_cookie_header(request.headers.get("cookie"))

    def visitor_from_cookie_header(
        self,
        cookie_header: Optional[str],
    ) -> Optional[Visitor]:
        """As `visitor`, from a raw `Cookie` header value."""
        if cookie_header is None:
            return None
        token = _cookie_value(cookie_header, ACCESS_COOKIE_NAME)
        if token is None:
            return None
        claims = self._verify_jwt(token, "access")
        if claims is None:
            return None
        visitor = Visitor(
            user_id=str(claims.get("sub", "")),
            issuer=str(claims.get("iss", "")),
        )
        if (
            not visitor.user_id or visitor.issuer != self._issuer or
            not self._policy.allows(visitor)
        ):
            return None
        return visitor

    @property
    def token_verifier(self) -> _AccessTokenVerifier:
        """The check in front of every RPC: refuses an RPC from outside
        the application unless the caller was let in (its `Cookie`
        carries a valid `rbt_access`) or holds a credential the
        application's own token verifier vouches for. Wraps that
        verifier with `wrapping`."""
        return _AccessTokenVerifier(self, None)

    def wrapping(
        self,
        token_verifier: Optional[TokenVerifier],
    ) -> _AccessTokenVerifier:
        """`token_verifier`, the application's own, behind this
        policy's check (see `token_verifier`)."""
        return _AccessTokenVerifier(self, token_verifier)

    async def callback(self, request: Request) -> Response:
        """GET /__/access/callback

        Where the issuer sends a visitor after they signed in: finishes
        the sign-in the pending cookie describes, asks the policy, and
        lets the visitor in (the `rbt_access` cookie) and returns them
        to where they were going, or tells them why not.
        """
        pending = self._pending(request)
        if pending is None:
            return _page(
                "Sign-in expired",
                "This sign-in took too long or was started elsewhere. "
                "Go back to where you were and try again.",
                status_code=400,
            )
        error = request.query_params.get("error")
        if error is not None:
            description = (
                "The issuer refused the sign-in." if error == "access_denied"
                else f"The issuer answered with `{error}`."
            )
            return _page("Sign-in refused", description, status_code=403)
        code = request.query_params.get("code")
        if (
            code is None or
            request.query_params.get("state") != pending.get("state")
        ):
            return _page(
                "Sign-in did not finish",
                "The issuer sent back something other than what was "
                "asked for. Go back to where you were and try again.",
                status_code=400,
            )
        origin = str(pending["origin"])
        try:
            client = await self._client(origin)
            tokens = await client.exchange_code(
                code=code,
                redirect_uri=f"{origin}{CALLBACK_PATH}",
                code_verifier=str(pending["verifier"]),
                resource=origin,
            )
        except OAuthClientError as e:
            logger.warning("Access sign-in at %s failed: %s", self._issuer, e)
            return _page(
                "Sign-in did not finish",
                f"The issuer at {self._issuer} did not accept the sign-in "
                f"({e.error}). Go back to where you were and try again.",
                status_code=502,
            )
        subject = tokens.get("sub")
        if not isinstance(subject, str) or not subject:
            return _page(
                "Sign-in did not finish",
                f"The issuer at {self._issuer} did not say who signed in, "
                "so nobody can be let in through it.",
                status_code=502,
            )
        visitor = Visitor(user_id=subject, issuer=self._issuer)
        if not self._policy.allows(visitor):
            response = _page(
                "Not for you",
                f"You signed in at {self._issuer} as {visitor.user_id}, "
                f"but this application is only open to "
                f"{self._policy.describe()}.",
                status_code=403,
            )
            _delete_cookie(response, _PENDING_COOKIE_NAME, origin)
            return response
        response = RedirectResponse(
            url=str(pending.get("return_to") or "/"),
            status_code=302,
        )
        _set_cookie(
            response,
            ACCESS_COOKIE_NAME,
            self._make_jwt(
                {
                    "type": "access",
                    "sub": visitor.user_id,
                    "iss": visitor.issuer,
                },
                ttl_seconds=_ACCESS_TTL_SECONDS,
            ),
            origin,
            max_age=_ACCESS_TTL_SECONDS,
        )
        _delete_cookie(response, _PENDING_COOKIE_NAME, origin)
        return response

    async def signout(self, request: Request) -> Response:
        """GET /__/access/signout

        Forgets that the visitor was let in, so the next navigation
        goes through the issuer again (which may well remember them).
        """
        response = _page(
            "Signed out",
            "You are no longer let in here. Reload to sign in again.",
            status_code=200,
        )
        _delete_cookie(
            response, ACCESS_COOKIE_NAME, origin_from_request(request)
        )
        return response

    def _is_public(self, request: Request) -> bool:
        path = request.url.path
        return (
            # A CORS preflight carries no credential by design.
            request.method == "OPTIONS" or
            path.startswith(_PUBLIC_PATH_PREFIXES) or path in _PUBLIC_PATHS
        )

    def _holds_app_credential(self, request: Request) -> bool:
        if self._app is None:
            return False
        session = request.cookies.get(self._app.session_cookie_name)
        if session is not None and self._app.is_access_token(session):
            return True
        authorization = request.headers.get("authorization")
        if authorization is not None:
            scheme, _, token = authorization.partition(" ")
            if (
                scheme.lower() == "bearer" and token and
                self._app.is_access_token(token)
            ):
                return True
        return False

    async def _start_sign_in(self, request: Request) -> Response:
        origin = origin_from_request(request)
        try:
            client = await self._client(origin)
        except OAuthClientError as e:
            logger.warning(
                "Could not start access sign-in at %s: %s", self._issuer, e
            )
            return _page(
                "Sign-in unavailable",
                f"The issuer at {self._issuer} could not be reached "
                f"({e.error}). Try again in a moment.",
                status_code=502,
            )
        verifier, challenge = pkce_pair()
        state = secrets.token_urlsafe(16)
        return_to = request.url.path
        if request.url.query:
            return_to = f"{return_to}?{request.url.query}"
        response = RedirectResponse(
            url=client.authorization_url(
                redirect_uri=f"{origin}{CALLBACK_PATH}",
                state=state,
                code_challenge=challenge,
                resource=origin,
            ),
            status_code=302,
        )
        _set_cookie(
            response,
            _PENDING_COOKIE_NAME,
            self._make_jwt(
                {
                    "type": "pending",
                    "verifier": verifier,
                    "state": state,
                    "origin": origin,
                    "return_to": return_to,
                },
                ttl_seconds=_PENDING_TTL_SECONDS,
            ),
            origin,
            max_age=_PENDING_TTL_SECONDS,
        )
        return response

    def _unauthorized(self, request: Request) -> Response:
        headers: dict[str, str] = {}
        if self._app is not None:
            path = request.url.path
            resource = next(
                (
                    protected for protected in self._app.protected_resources
                    if path == protected or path.startswith(protected + "/")
                ),
                "",
            )
            metadata = (
                f"{origin_from_request(request)}"
                f"/.well-known/oauth-protected-resource{resource}"
            )
            headers["WWW-Authenticate"] = (
                f'Bearer resource_metadata="{metadata}"'
            )
        return JSONResponse(
            {
                "error":
                    "unauthorized",
                "error_description":
                    (
                        "This application is only open to "
                        f"{self._policy.describe()}; sign in at "
                        f"{self._issuer} by opening it in a browser."
                    ),
            },
            status_code=401,
            headers=headers,
        )

    def _pending(self, request: Request) -> Optional[dict[str, Any]]:
        token = request.cookies.get(_PENDING_COOKIE_NAME)
        if token is None:
            return None
        claims = self._verify_jwt(token, "pending")
        if claims is None or claims.get("origin"
                                       ) != origin_from_request(request):
            return None
        return claims

    async def _client(self, origin: str) -> OAuthClient:
        client = self._clients.get(origin)
        if client is not None:
            return client
        if self._metadata is None:
            self._metadata = await discover(self._issuer)
        if self._metadata.registration_endpoint is None:
            raise OAuthClientError(
                error="invalid_response",
                description=f"{self._issuer} does not register clients",
            )
        client_id = await register(
            self._metadata.registration_endpoint,
            redirect_uris=[f"{origin}{CALLBACK_PATH}"],
            client_name=self._client_name,
            client_uri=origin,
        )
        client = OAuthClient(
            authorization_endpoint=self._metadata.authorization_endpoint,
            token_endpoint=self._metadata.token_endpoint,
            client_id=client_id,
        )
        self._clients[origin] = client
        return client

    def _secret(self) -> bytes:
        if self._signing_secret is None:
            self._signing_secret = root_keys.derive_key(
                info=_SIGNING_INFO,
                version=root_keys.active_version(),
            )
        return self._signing_secret

    def _make_jwt(self, payload: dict[str, Any], *, ttl_seconds: int) -> str:
        now = int(time.time())
        return jwt.encode(
            {
                **payload, "iat": now,
                "exp": now + ttl_seconds
            },
            self._secret(),
            algorithm=_ALGORITHM,
        )

    def _verify_jwt(
        self,
        token: str,
        expected_type: str,
    ) -> Optional[dict[str, Any]]:
        try:
            claims = jwt.decode(
                token,
                self._secret(),
                algorithms=[_ALGORITHM],
                options={"verify_aud": False},
            )
        except jwt.exceptions.PyJWTError:
            return None
        if claims.get("type") != expected_type:
            return None
        return claims


class _AccessTokenVerifier(TokenVerifier):
    """An `Access` policy in front of the application's own token
    verifier, for RPCs. A call from within the application passes
    straight to the wrapped verifier; a call from outside passes only
    if its `Cookie` says the caller was let in, or the wrapped
    verifier vouches for its token; anything else is refused."""

    def __init__(
        self,
        access: Access,
        token_verifier: Optional[TokenVerifier],
    ):
        self._access = access
        self._token_verifier = token_verifier

    async def verify_token(
        self,
        context: ReaderContext,
        token: Optional[str],
    ) -> VerifyTokenResult:
        if context.app_internal:
            return await self._delegate(context, token)
        if self._access.visitor_from_cookie_header(context.cookie) is not None:
            return await self._delegate(context, token)
        result = await self._delegate(context, token)
        if result is None:
            return errors_pb2.Unauthenticated(
                message=(
                    "This application is only open to "
                    f"{self._access.policy.describe()}; sign in at "
                    f"{self._access.issuer} by opening it in a browser."
                ),
            )
        return result

    async def _delegate(
        self,
        context: ReaderContext,
        token: Optional[str],
    ) -> VerifyTokenResult:
        if self._token_verifier is None:
            return None
        return await self._token_verifier.verify_token(context, token)


def _is_navigation(request: Request) -> bool:
    """Whether `request` is a browser navigating to a page, which can
    be sent through a sign-in, as opposed to a fetch, an API call or an
    MCP client, which get a 401 to act on."""
    return (
        request.method in ("GET", "HEAD") and
        "text/html" in request.headers.get("accept", "")
    )


def _cookie_value(cookie_header: str, name: str) -> Optional[str]:
    """The value of cookie `name` in a raw `Cookie` header, if set."""
    for part in cookie_header.split(";"):
        key, _, value = part.strip().partition("=")
        if key == name:
            return value
    return None


def _set_cookie(
    response: Response,
    name: str,
    value: str,
    origin: str,
    *,
    max_age: int,
) -> None:
    response.set_cookie(
        name,
        value,
        max_age=max_age,
        path="/",
        httponly=True,
        # Over TLS only, except on a plain-`http` origin, which is
        # local development; `Lax` so that the cookie rides the
        # top-level navigation back from the issuer.
        secure=origin.startswith("https://"),
        samesite="lax",
    )


def _delete_cookie(response: Response, name: str, origin: str) -> None:
    response.delete_cookie(
        name,
        path="/",
        httponly=True,
        secure=origin.startswith("https://"),
        samesite="lax",
    )


def _page(title: str, text: str, *, status_code: int) -> HTMLResponse:
    """A plain page saying `text`; the visitor is a person in a
    browser, on the way in or turned away."""
    return HTMLResponse(
        "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\">"
        "<meta name=\"viewport\" content=\"width=device-width, "
        f"initial-scale=1\"><title>{html.escape(title)}</title>"
        "<style>body{font-family:system-ui,sans-serif;max-width:32rem;"
        "margin:4rem auto;padding:0 1rem;color:#103761;line-height:1.5}"
        "</style></head><body>"
        f"<h1>{html.escape(title)}</h1><p>{html.escape(text)}</p>"
        "</body></html>",
        status_code=status_code,
        headers={"Cache-Control": "no-store"},
    )
