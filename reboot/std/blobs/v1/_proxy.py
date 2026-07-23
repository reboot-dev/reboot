"""Application-side reverse proxy for a blob data plane's forwarded
paths.

A data plane whose URLs are not directly reachable by clients (e.g.
the filesystem server, which binds localhost only) asks, via its
`Configuration`, for path namespaces to be forwarded to it. The `Blob`
library then registers these routes on the application's own HTTP
server, forwarding the requests to the data plane's HTTP endpoint.
That keeps the data plane off any externally-exposed port: a single
application origin/tunnel serves both the control plane and the
bytes.

The proxy is deliberately dumb: it forwards the request path and query
verbatim and never inspects them. The data plane minted the URL and
validates its own signature, so the proxy adds no trust. The one thing
it enforces is the namespace: every forwarded path must live under
`FORWARDED_PATH_PREFIX`, so a data plane can never claim application
routes.
"""

import aiohttp
from rbt.std.blobs.v1.data_plane_pb2 import (
    HTTP_METHOD_GET,
    HTTP_METHOD_PUT,
    ForwardedPath,
    HttpMethod,
)
from reboot.aio.http import PythonWebFramework
from reboot.std.blobs.v1._data_plane import FORWARDED_PATH_PREFIX
from starlette.requests import Request
from starlette.responses import Response, StreamingResponse
from typing import Iterable

_STREAM_CHUNK_SIZE = 1024 * 1024

# Response headers worth carrying back from the data plane on a
# download; others are hop-by-hop or recomputed by the framework.
_FORWARDED_GET_HEADERS = (
    "Content-Type",
    "Content-Length",
    "ETag",
    "Accept-Ranges",
)


def mount_proxy_routes(
    http: PythonWebFramework.HTTP,
    proxy_target_url: str,
    forwarded_paths: Iterable[ForwardedPath],
) -> None:
    """Registers a reverse-proxy route for each of the data plane's
    `forwarded_paths`, forwarding to `proxy_target_url`. Refuses paths
    outside `FORWARDED_PATH_PREFIX` and unknown methods."""

    target = proxy_target_url.rstrip("/")

    def _forward_url(request: Request) -> str:
        url = target + request.url.path
        if request.url.query:
            url += "?" + request.url.query
        return url

    async def put_forward(rest: str, request: Request) -> Response:
        session = aiohttp.ClientSession()
        try:
            upstream = await session.put(
                _forward_url(request),
                data=request.stream(),
            )
            body = await upstream.read()
            headers = {}
            if "ETag" in upstream.headers:
                headers["ETag"] = upstream.headers["ETag"]
            return Response(
                content=body,
                status_code=upstream.status,
                headers=headers,
            )
        finally:
            await session.close()

    async def get_forward(rest: str, request: Request) -> Response:
        session = aiohttp.ClientSession()
        # Close the session on every non-streaming path (connection
        # error, non-200); on the streaming path the generator's
        # `finally` closes it once the body is fully read or the client
        # disconnects.
        try:
            upstream = await session.get(_forward_url(request))
        except Exception:
            await session.close()
            raise

        if upstream.status != 200:
            try:
                body = await upstream.read()
            finally:
                await session.close()
            return Response(content=body, status_code=upstream.status)

        headers = {
            name: upstream.headers[name]
            for name in _FORWARDED_GET_HEADERS
            if name in upstream.headers
        }

        async def stream():
            try:
                async for chunk in upstream.content.iter_chunked(
                    _STREAM_CHUNK_SIZE
                ):
                    yield chunk
            finally:
                await session.close()

        return StreamingResponse(
            stream(),
            status_code=200,
            media_type=upstream.headers.get("Content-Type"),
            headers=headers,
        )

    mounted: set[tuple[int, str]] = set()
    for forwarded in forwarded_paths:
        prefix = forwarded.path_prefix
        if not prefix.startswith(FORWARDED_PATH_PREFIX):
            raise ValueError(
                f"Blob data plane requested forwarding of '{prefix}', "
                f"which is outside `{FORWARDED_PATH_PREFIX}`; refusing"
            )
        if (forwarded.method, prefix) in mounted:
            continue
        mounted.add((forwarded.method, prefix))
        # `{rest:path}` matches anything, including `/`s and the empty
        # string, so the route covers exactly "path starts with
        # `prefix`".
        route = prefix + "{rest:path}"
        if forwarded.method == HTTP_METHOD_GET:
            http.get(route)(get_forward)
        elif forwarded.method == HTTP_METHOD_PUT:
            http.put(route)(put_forward)
        else:
            raise ValueError(
                "Blob data plane requested forwarding with unsupported "
                f"method {HttpMethod.Name(forwarded.method)}"
            )
