"""Serves an `OAuthServer`'s routes in-process, without a Reboot.

The OAuth server is plain HTTP over the routes it registers on a
`PythonWebFramework.HTTP`, so protocol-level behavior (what a client
sends and receives at each endpoint) can be driven with `httpx`
against a FastAPI app serving exactly those routes, the way
`PythonWebFramework.start` serves them, in milliseconds and without
bringing up an application. Tests that need the tokens to then
authenticate real Reboot calls use `reboot.aio.tests.Reboot` instead.
"""

import asyncio
import base64
import hashlib
import httpx
import jwt
import os
import re
import secrets
import socket
import uvicorn
from collections.abc import Callable, Sequence
from fastapi import FastAPI
from reboot.aio.http import PythonWebFramework
from reboot.settings import ENVVAR_REBOOT_CRYPTO_ROOT_KEYS
from starlette.requests import Request
from typing import Any, AsyncIterator
from urllib.parse import parse_qs, urlencode, urlparse

# What the harness hands in for `redirect_uri` unless a test says
# otherwise: the loopback address an MCP client listens on.
DEFAULT_REDIRECT_URI = "http://localhost:1234/callback"


def ensure_root_keys() -> None:
    """Provide the root keys the OAuth server derives its signing
    secret from, when the test environment hasn't already."""
    os.environ.setdefault(
        ENVVAR_REBOOT_CRYPTO_ROOT_KEYS,
        "v1:" + secrets.token_urlsafe(32),
    )


class _FakeExternalContext:
    """Stands in for the `ExternalContext` the web framework attaches
    to each request; the OAuth server only forwards it to hooks that
    these tests leave unset."""

    def __init__(self, request: Request):
        self.request = request


def serve(mount: Callable[[PythonWebFramework.HTTP], None]) -> FastAPI:
    """A FastAPI app serving the routes `mount` registers (e.g.
    `OAuthServer.mount_routes`), with the per-request context the web
    framework provides."""
    http = PythonWebFramework.HTTP()
    mount(http)
    fastapi = FastAPI()

    @fastapi.middleware("http")
    async def context_middleware(request: Request, call_next):
        request.state.reboot_external_context = _FakeExternalContext(request)
        return await call_next(request)

    for http_mount in http._mounts:
        fastapi.mount(
            http_mount.path,
            http_mount.app or http_mount.factory(  # type: ignore[misc]
                lambda request: _FakeExternalContext(request)
            ),
        )
    for api_route in http._api_routes:
        fastapi.add_api_route(
            api_route.path,
            api_route.endpoint,
            **api_route.kwargs,
        )
    return fastapi


async def serve_on_loopback(fastapi: FastAPI) -> AsyncIterator[str]:
    """Serve `fastapi` on a loopback port for the duration of the
    iteration, yielding its origin, for a client that speaks real HTTP
    rather than the in-process transport of `client`."""
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    server = uvicorn.Server(
        uvicorn.Config(
            fastapi,
            host="127.0.0.1",
            port=port,
            log_level="warning",
            # Nothing here uses startup or shutdown events, and the
            # lifespan task would log its cancellation at shutdown.
            lifespan="off",
        )
    )
    task = asyncio.create_task(server.serve())
    while not server.started:
        await asyncio.sleep(0.01)
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.should_exit = True
        await task


def client(
    fastapi: FastAPI, base_url: str, **kwargs: Any
) -> httpx.AsyncClient:
    """An `httpx` client talking to `fastapi` in-process, presenting
    itself as arriving at `base_url` (the origin the server sees)."""
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=fastapi),
        base_url=base_url,
        **kwargs,
    )


def pkce_pair() -> tuple[str, str]:
    """A PKCE verifier and its S256 challenge."""
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()
    ).decode().rstrip("=")
    return verifier, challenge


def claims(token: str) -> dict[str, Any]:
    """The claims of a JWT this server minted, read without verifying
    the signature: tests assert on what was put in, not on its
    integrity."""
    return jwt.decode(token, options={"verify_signature": False})


def form_body(fields: Sequence[tuple[str, str]]) -> dict[str, Any]:
    """`httpx` request kwargs for a form body given as pairs, which
    is how a parameter is repeated (`resource` twice)."""
    return {
        "content": urlencode(fields),
        "headers": {
            "content-type": "application/x-www-form-urlencoded"
        },
    }


async def register(
    http_client: httpx.AsyncClient,
    redirect_uri: str = DEFAULT_REDIRECT_URI,
    **metadata: Any,
) -> str:
    """Dynamically register a client; returns its `client_id`."""
    response = await http_client.post(
        "/__/oauth/register",
        json={
            "redirect_uris": [redirect_uri],
            "client_name": "Test client",
            **metadata,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["client_id"]


async def authorize(
    http_client: httpx.AsyncClient,
    client_id: str,
    *,
    redirect_uri: str = DEFAULT_REDIRECT_URI,
    resources: Sequence[str] = (),
    identity: str = "Alice",
    approve_consent: bool = True,
) -> httpx.Response | tuple[str, str | None, str]:
    """Drive a `Development()` sign-in: `/authorize`, the consent
    screen when one is shown, the fake account picker (choosing
    `identity`), and `/callback`. Returns the PKCE verifier, the
    authorization code, and the final redirect location, or the
    response itself when `/authorize` refused the request."""
    verifier, challenge = pkce_pair()
    params = [
        ("response_type", "code"),
        ("client_id", client_id),
        ("redirect_uri", redirect_uri),
        ("code_challenge", challenge),
        ("code_challenge_method", "S256"),
        ("state", "opaque"),
    ] + [("resource", resource) for resource in resources]
    response = await http_client.get(
        "/__/oauth/authorize",
        params=params,
        follow_redirects=False,
    )
    if response.status_code != 302:
        if response.status_code != 200:
            return response
        match = re.search(r'name="consent" value="([^"]+)"', response.text)
        assert match is not None, response.text
        response = await http_client.post(
            "/__/oauth/consent",
            data={
                "consent": match.group(1),
                "action": "approve" if approve_consent else "deny",
            },
            follow_redirects=False,
        )
        assert response.status_code == 302, response.text
    location = response.headers["location"]
    if "/__/oauth/dev-login" in location:
        state = parse_qs(urlparse(location).query)["state"][0]
        response = await http_client.get(
            "/__/oauth/callback",
            params={
                "code": identity,
                "state": state
            },
            follow_redirects=False,
        )
        assert response.status_code == 302, response.text
        location = response.headers["location"]
    code = parse_qs(urlparse(location).query).get("code", [None])[0]
    return verifier, code, location


async def exchange(
    http_client: httpx.AsyncClient,
    *,
    client_id: str,
    code: str,
    verifier: str,
    redirect_uri: str = DEFAULT_REDIRECT_URI,
    resources: Sequence[str] = (),
) -> httpx.Response:
    """`POST /token` with `grant_type=authorization_code`."""
    return await http_client.post(
        "/__/oauth/token",
        **form_body(
            [
                ("grant_type", "authorization_code"),
                ("code", code),
                ("client_id", client_id),
                ("redirect_uri", redirect_uri),
                ("code_verifier", verifier),
            ] + [("resource", resource) for resource in resources]
        ),
    )


async def refresh(
    http_client: httpx.AsyncClient,
    *,
    client_id: str,
    refresh_token: str,
    resources: Sequence[str] = (),
) -> httpx.Response:
    """`POST /token` with `grant_type=refresh_token`."""
    return await http_client.post(
        "/__/oauth/token",
        **form_body(
            [
                ("grant_type", "refresh_token"),
                ("refresh_token", refresh_token),
                ("client_id", client_id),
            ] + [("resource", resource) for resource in resources]
        ),
    )
