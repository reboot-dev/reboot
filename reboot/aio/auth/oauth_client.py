"""The client side of OAuth 2.0: finding an authorization server,
registering with it, sending a person to sign in there, and turning
the code that comes back into tokens."""

from __future__ import annotations

import aiohttp
import base64
import hashlib
import secrets
from dataclasses import dataclass
from typing import Any, Mapping, Optional, Sequence
from urllib.parse import urlencode

# RFC 8414 well-known path, relative to the issuer.
_METADATA_PATH = "/.well-known/oauth-authorization-server"


class OAuthClientError(Exception):
    """An authorization server answered a request with an error:
    `error` is the OAuth error code when the response carried one
    (RFC 6749 §5.2), else the HTTP status, and `description` what it
    said about it."""

    def __init__(self, *, error: str, description: str):
        super().__init__(f"{error}: {description}" if description else error)
        self.error = error
        self.description = description


@dataclass(frozen=True)
class AuthorizationServerMetadata:
    """What an authorization server says about itself (RFC 8414)."""
    issuer: str
    authorization_endpoint: str
    token_endpoint: str
    # Where a client registers dynamically (RFC 7591), if the server
    # lets clients do that.
    registration_endpoint: Optional[str] = None


def pkce_pair() -> tuple[str, str]:
    """A fresh PKCE (RFC 7636) code verifier and its S256 challenge."""
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()
    ).decode().rstrip("=")
    return verifier, challenge


async def _json(response: aiohttp.ClientResponse) -> dict[str, Any]:
    """The JSON body of `response`, or an `OAuthClientError` for an
    error status or a body that is not a JSON object."""
    try:
        body = await response.json(content_type=None)
    except Exception:
        body = None
    if not isinstance(body, dict):
        if response.status >= 400:
            raise OAuthClientError(
                error=str(response.status),
                description=(
                    f"{response.reason or 'error'} from {response.url}"
                ),
            )
        raise OAuthClientError(
            error="invalid_response",
            description=f"Expected a JSON object from {response.url}",
        )
    if response.status >= 400:
        raise OAuthClientError(
            error=str(body.get("error", response.status)),
            description=str(body.get("error_description", "")),
        )
    return body


async def discover(issuer: str) -> AuthorizationServerMetadata:
    """Fetch an authorization server's metadata (RFC 8414) from its
    well-known location under `issuer`, an origin such as
    `https://cloud.example`."""
    issuer = issuer.rstrip("/")
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{issuer}{_METADATA_PATH}") as response:
            body = await _json(response)
    try:
        return AuthorizationServerMetadata(
            issuer=str(body["issuer"]),
            authorization_endpoint=str(body["authorization_endpoint"]),
            token_endpoint=str(body["token_endpoint"]),
            registration_endpoint=(
                str(body["registration_endpoint"])
                if body.get("registration_endpoint") else None
            ),
        )
    except KeyError as e:
        raise OAuthClientError(
            error="invalid_response",
            description=f"Authorization server metadata lacks {e}",
        )


async def register(
    registration_endpoint: str,
    *,
    redirect_uris: Sequence[str],
    client_name: str,
    **metadata: Any,
) -> str:
    """Register a client dynamically (RFC 7591) and return its
    `client_id`. `metadata` is any further RFC 7591 client metadata,
    such as `client_uri`."""
    async with aiohttp.ClientSession() as session:
        async with session.post(
            registration_endpoint,
            json={
                "redirect_uris": list(redirect_uris),
                "client_name": client_name,
                **metadata,
            },
        ) as response:
            body = await _json(response)
    client_id = body.get("client_id")
    if not isinstance(client_id, str) or not client_id:
        raise OAuthClientError(
            error="invalid_response",
            description="Registration response lacks a 'client_id'",
        )
    return client_id


class OAuthClient:
    """An OAuth 2.0 client of one authorization server, for the
    authorization code grant (RFC 6749 §4.1): builds the URL a person
    signs in at, and exchanges the code that comes back, or a refresh
    token, for tokens at the token endpoint. Supports PKCE (RFC 7636)
    and asking for a token for a particular resource (RFC 8707).
    """

    def __init__(
        self,
        *,
        authorization_endpoint: str,
        token_endpoint: str,
        client_id: str,
        # Absent for a public client (RFC 6749 §2.1), such as a CLI or
        # an application that registered dynamically.
        client_secret: Optional[str] = None,
    ):
        self._authorization_endpoint = authorization_endpoint
        self._token_endpoint = token_endpoint
        self._client_id = client_id
        self._client_secret = client_secret

    @property
    def client_id(self) -> str:
        return self._client_id

    def authorization_url(
        self,
        *,
        redirect_uri: str,
        state: str,
        scopes: Sequence[str] = (),
        code_challenge: Optional[str] = None,
        resource: Optional[str] = None,
        extra: Optional[Mapping[str, str]] = None,
    ) -> str:
        """The URL to send the person to. `code_challenge` is the S256
        challenge of the verifier that `exchange_code` presents later;
        `extra` is any further query parameters the server wants."""
        params: dict[str, str] = {
            "client_id": self._client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
        }
        if scopes:
            params["scope"] = " ".join(scopes)
        params["state"] = state
        if code_challenge is not None:
            params["code_challenge"] = code_challenge
            params["code_challenge_method"] = "S256"
        if resource is not None:
            params["resource"] = resource
        params.update(extra or {})
        return f"{self._authorization_endpoint}?{urlencode(params)}"

    async def exchange_code(
        self,
        *,
        code: str,
        redirect_uri: str,
        code_verifier: Optional[str] = None,
        resource: Optional[str] = None,
    ) -> dict[str, Any]:
        """Exchange an authorization code for the token response
        (RFC 6749 §5.1), a JSON object with at least `access_token`.
        Raises `OAuthClientError` when the server refuses."""
        data = {
            "grant_type": "authorization_code",
            "client_id": self._client_id,
            "code": code,
            "redirect_uri": redirect_uri,
        }
        if self._client_secret is not None:
            data["client_secret"] = self._client_secret
        if code_verifier is not None:
            data["code_verifier"] = code_verifier
        if resource is not None:
            data["resource"] = resource
        return await self._post_token(data)

    async def refresh(
        self,
        *,
        refresh_token: str,
        resource: Optional[str] = None,
    ) -> dict[str, Any]:
        """Exchange a refresh token for a fresh token response (RFC
        6749 §6). Raises `OAuthClientError` when the server refuses."""
        data = {
            "grant_type": "refresh_token",
            "client_id": self._client_id,
            "refresh_token": refresh_token,
        }
        if self._client_secret is not None:
            data["client_secret"] = self._client_secret
        if resource is not None:
            data["resource"] = resource
        return await self._post_token(data)

    async def _post_token(self, data: Mapping[str, str]) -> dict[str, Any]:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                self._token_endpoint,
                data=dict(data),
                headers={"Accept": "application/json"},
            ) as response:
                return await _json(response)
