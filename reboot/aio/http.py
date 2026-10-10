import aiohttp
import asyncio
import contextlib
import uvicorn  # type: ignore[import]
from abc import ABC, abstractmethod
from dataclasses import dataclass
from fastapi import Depends, FastAPI  # type: ignore[import]
from pathlib import Path
from reboot.aio.caller_id import CallerID
from reboot.aio.external import ExternalContext
from reboot.aio.internals.channel_manager import _ChannelManager
from reboot.aio.types import ApplicationId, ServerId
from reboot.portless import proxy_port, ssl_context
from reboot.rootpage.page import probe, root_page_asset, root_page_endpoint
from reboot.wait_for_tasks import wait_for_tasks
from starlette.exceptions import HTTPException  # type: ignore[import]
from starlette.requests import Request  # type: ignore[import]
from starlette.responses import Response  # type: ignore[import]
from starlette.staticfiles import StaticFiles  # type: ignore[import]
from starlette.types import Receive, Scope, Send  # type: ignore[import]
from typing import (
    Any,
    Awaitable,
    Callable,
    Generator,
    Optional,
    Protocol,
    overload,
)
from urllib.parse import urlparse


class WebApp(StaticFiles):
    """A built web app served from a directory at `/`.

    `index.html` answers `/` (via `html=True`) and, so that the app's
    own URL-path routing works on a reload or a shared link, any
    `GET` for a path that has no file and that the browser is
    navigating to (it accepts HTML). A request for a missing asset or
    a JSON path still 404s, so a typo isn't masked by a page.
    """

    def __init__(self, directory: Path):
        super().__init__(
            directory=str(directory),
            html=True,
            # A not-yet-built web app doesn't stop the application
            # from starting; `/` 404s until it is built.
            check_dir=False,
            # Under Bazel runfiles the built app is a symlink farm
            # into `bazel-out`, which Starlette's default `realpath`
            # check would reject as escaping the directory.
            follow_symlink=True,
        )

    async def get_response(self, path: str, scope: Scope) -> Response:
        try:
            return await super().get_response(path, scope)
        except HTTPException as e:
            if e.status_code != 404 or not self._navigation(scope):
                raise
            return await super().get_response("index.html", scope)

    @staticmethod
    def _navigation(scope: Scope) -> bool:
        if scope.get("method") != "GET":
            return False
        for name, value in scope.get("headers", []):
            if name == b"accept":
                return b"text/html" in value
        return False


# Headers that describe the connection a message came over, not the
# message, which a proxy must not pass on (RFC 9110 §7.6.1).
_HOP_BY_HOP_HEADERS = frozenset(
    (
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
    )
)


class WebDevServer:
    """A web app served at `/` from its dev server (`--web-app-url`), with
    Hot Module Replacement: every request that reaches this mount is
    proxied to the dev server as it came, so `/` and every path the
    web app's own routing owns are answered the way the dev server
    answers them (its transformed `index.html`), and a missing asset
    404s as it does there.

    Only the page itself and the web app's `public/` files come this
    way. The modules the page loads, and the HMR WebSocket, are under
    `/__/frontend/`, which Envoy proxies to the dev server directly.
    """

    def __init__(self, host: str):
        self._host = host.rstrip("/")
        parsed = urlparse(self._host)
        self._hostname = parsed.hostname or ""
        self._tls = parsed.scheme == "https"
        # A `*.localhost` host is one the portless proxy serves,
        # routing by name: reached at the loopback address with the
        # name as SNI and `Host`, the way a browser's request arrives,
        # so that no resolver has to know the name (as Envoy reaches
        # it, see `FrontendConfig.named_loopback`).
        self._named_loopback = self._hostname.endswith(".localhost")
        self._port = parsed.port or (proxy_port() if self._tls else 80)

    async def __call__(
        self,
        scope: Scope,
        receive: Receive,
        send: Send,
    ) -> None:
        if scope["type"] != "http":
            # A WebSocket for a path under `/` is not the HMR socket
            # (that is under `/__/frontend/`, Envoy's to proxy), and
            # nothing else here speaks it.
            await send({"type": "websocket.close"})
            return
        request = Request(scope, receive)
        path = request.url.path
        if request.url.query:
            path += "?" + request.url.query
        # The request as it came, minus the `Host`, which is the dev
        # server's own.
        headers = [
            (name, value) for name, value in request.headers.items() if
            name.lower() not in _HOP_BY_HOP_HEADERS and name.lower() != "host"
        ]
        if self._named_loopback:
            scheme = "https" if self._tls else "http"
            url = f"{scheme}://127.0.0.1:{self._port}{path}"
            headers.append(("host", self._hostname))
            by_name: dict[str, Any] = {"server_hostname": self._hostname}
        else:
            url = self._host + path
            by_name = {}
        try:
            async with aiohttp.ClientSession(auto_decompress=False) as session:
                async with session.request(
                    request.method,
                    url,
                    headers=headers,
                    data=(
                        request.stream()
                        if request.method not in ("GET", "HEAD") else None
                    ),
                    allow_redirects=False,
                    ssl=ssl_context() if self._tls else None,
                    **by_name,
                ) as upstream:
                    await send(
                        {
                            "type":
                                "http.response.start",
                            "status":
                                upstream.status,
                            "headers":
                                [
                                    (name.lower().encode(), value.encode())
                                    for name, value in upstream.headers.items()
                                    if name.lower() not in _HOP_BY_HOP_HEADERS
                                ],
                        }
                    )
                    async for chunk in upstream.content.iter_any():
                        await send(
                            {
                                "type": "http.response.body",
                                "body": chunk,
                                "more_body": True,
                            }
                        )
                    await send({"type": "http.response.body", "body": b""})
        except aiohttp.ClientConnectionError as error:
            # The dev server is not up (or not yet): say so in place
            # of the page, rather than a bare 502.
            await Response(
                f"The web app's dev server at {self._host} is not "
                f"answering ({error}); is it running "
                "(`npm run dev` in the frontend)?",
                status_code=502,
                media_type="text/plain",
            )(scope, receive, send)


class WebFramework(ABC):
    """Web framework for HTTP endpoints in a Reboot application."""

    @abstractmethod
    async def start(
        self,
        server_id: ServerId,
        port: Optional[int],
        channel_manager: _ChannelManager,
        application_id: ApplicationId,
    ) -> int:
        """Start serving on `port` (or a free one when `None`) and
        return the port."""
        raise NotImplementedError()

    @abstractmethod
    async def stop(self, server_id: ServerId):
        raise NotImplementedError()


def external_context(request: Request) -> ExternalContext:
    return request.state.reboot_external_context


InjectExternalContext = Depends(external_context)


class HTTPASGIApp(Protocol):

    async def __call__(
        self,
        scope: Scope,
        receive: Receive,
        send: Send,
    ) -> None:
        ...


class PythonWebFramework(WebFramework):

    @dataclass(kw_only=True, frozen=True)
    class APIRoute:
        """Encapsulates details for an API route."""
        path: str
        kwargs: dict
        endpoint: Callable[..., Any]

    @dataclass(kw_only=True, frozen=True)
    class Mount:
        """Encapsulates details for a mount."""
        path: str
        app: Optional[HTTPASGIApp]
        factory: Optional[Callable[[Callable[[Request], ExternalContext]],
                                   HTTPASGIApp]]

    class HTTP:
        """Interface for decorating functions as API routes.

        NOTE: we can't just have developers directly use `FastAPI`
        because we need to actually capture each API route so that it
        can be pickled too each server process that we
        create. Moreover, we want to control the surface area that we
        expose so we can make sure that it works correctly.
        """

        def __init__(self):
            self._api_routes: list[PythonWebFramework.APIRoute] = []
            self._mounts: list[PythonWebFramework.Mount] = []
            # The built web app Reboot serves at `/` (`--web-app-dist-path`),
            # if any. Kept apart from `_mounts` because it must be
            # mounted last, after every route, and because it isn't one
            # of the application's own routes (see
            # `has_http_routes_or_mounts`).
            self._web_app_directory: Optional[Path] = None
            # The dev server serving the web app (`--web-app-url`), if
            # any: `/`, and every path nothing else claims, is proxied
            # to it.
            self._web_app_url: Optional[str] = None
            # Exact request paths whose handlers receive an *app-internal*
            # context (one that can call app-internal-only servicers)
            # instead of the usual external one, because they opted in via
            # `app_internal=True`. See the DANGER note in `_api_route`.
            self._app_internal_paths: set[str] = set()

        def _api_route(self, path: str, **kwargs):
            # `app_internal` is our own kwarg, not one of FastAPI's, so we
            # pop it before storing the rest. When set, this route's
            # handler is given an *app-internal* `ExternalContext` (one
            # carrying the application's `caller_id`, able to call
            # app-internal-only servicers) instead of the external one.
            #
            # DANGER: an app-internal context bypasses authorizers, so a
            # route that gets one can make trusted in-app calls on behalf
            # of arbitrary, unauthenticated callers. Only set
            # `app_internal=True` on a route you are completely certain
            # serves trusted traffic — e.g. an OAuth callback that runs
            # only after the authorization code has been exchanged and
            # validated. Never set it on a route that acts on unvalidated
            # request input.
            if kwargs.pop("app_internal", False):
                self._app_internal_paths.add(path)

            # TODO: add type annotations for `endpoint` so that what
            # we take in is exactly what we return.
            def decorator(endpoint):
                # NOTE: we need to store the API route for later once
                # within the server process we call start only
                # _then_ can we add the route to the `FastAPI`
                # instance. This is further complicated by the fact
                # that we need to store the information in a
                # `APIRoute` object so that everything can be properly
                # pickled.
                self._api_routes.append(
                    PythonWebFramework.APIRoute(
                        path=path,
                        endpoint=endpoint,
                        kwargs=kwargs,
                    )
                )
                return endpoint

            return decorator

        def get(self, path: str, **kwargs):
            # Rather than list out all of the possible keyword args
            # that `FastAPI` expects we'll just pass along any that
            # are passed to us, but we don't expect `methods` as we
            # override that below.
            assert "methods" not in kwargs
            return self._api_route(path, methods=["GET"], **kwargs)

        def post(self, path: str, **kwargs):
            # Rather than list out all of the possible keyword args
            # that `FastAPI` expects we'll just pass along any that
            # are passed to us, but we don't expect `methods` as we
            # override that below.
            assert "methods" not in kwargs
            return self._api_route(path, methods=["POST"], **kwargs)

        def options(self, path: str, **kwargs):
            # Used for CORS preflight handlers.
            assert "methods" not in kwargs
            return self._api_route(path, methods=["OPTIONS"], **kwargs)

        @overload
        def mount(
            self,
            path: str,
            *,
            app: HTTPASGIApp,
        ) -> None:
            ...

        @overload
        def mount(
            self,
            path: str,
            *,
            factory: Callable[[Callable[[Request], ExternalContext]],
                              HTTPASGIApp],
        ) -> None:
            ...

        def mount(
            self,
            path: str,
            *,
            app: Optional[HTTPASGIApp] = None,
            factory: Optional[Callable[[Callable[[Request], ExternalContext]],
                                       HTTPASGIApp]] = None,
        ):
            """
            Adds a completely "independent" application at the specified
            `path`, that then takes care of handling everything under
            that path, with the path operations declared in that
            sub-application.

            Note that like `FastAPI` you can pass the sub-application
            via the keyword argument `app`, or you can pass a
            `factory` function that gets passed a function that can be
            used to get an `ExternalContext` from a `Request`.
            """
            if (
                (app is None and factory is None) or
                (app is not None and factory is not None)
            ):
                raise TypeError(
                    "Exactly one of the `app` or `factory` keyword "
                    "argument should be specified"
                )
            self._mounts.append(
                PythonWebFramework.Mount(path=path, app=app, factory=factory)
            )

    def __init__(self):
        self._http = PythonWebFramework.HTTP()

        self._servers: dict[
            ServerId,
            tuple[uvicorn.Server, asyncio.Task],
        ] = {}

    @property
    def http(self) -> HTTP:
        return self._http

    async def start(
        self,
        server_id: ServerId,
        port: Optional[int],
        channel_manager: _ChannelManager,
        application_id: ApplicationId,
    ) -> int:
        assert server_id not in self._servers

        def external_context_from_request(request: Request) -> ExternalContext:
            # Check if we have an `Authorization: bearer <token>`
            # header and if so pass on the bearer token so every
            # developer doesn't have to do it themselves.
            #
            # TODO: consider making this a feature that can be turned
            # off via a kwarg passed when decorating.
            bearer_token: Optional[str] = None

            authorization: Optional[str] = request.headers.get("Authorization")

            if authorization is not None:
                parts = authorization.split()
                if len(parts) == 2 and parts[0].lower() == "bearer":
                    bearer_token = parts[1]

            # Namespace this so that any other middleware doesn't
            # clash on `request.state`.
            return ExternalContext(
                name=f"HTTP {request.method} '{request.url.path}'",
                channel_manager=channel_manager,
                bearer_token=bearer_token,
                # NOTE: WE DO NOT SET `caller_id` as this context is
                # _not_ meant to be app internal! We pass on the
                # `bearer_token` above but otherwise this must be
                # considered _external_ code because we can't be sure
                # that we've performed any kind of authentication on the
                # caller. We believe that developers will use this
                # context primarily to translate traffic from HTTP to
                # Reboot calls, and that they still want to perform
                # end-user auth when they enter their Reboot code.
            )

        def app_internal_external_context_from_request(
            request: Request,
        ) -> ExternalContext:
            # An app-internal context (carries the application's
            # `caller_id`) so HTTP handlers can call app-internal-only
            # servicers (e.g. the OAuth server persisting encrypted
            # identity-provider tokens).
            return ExternalContext(
                name=f"HTTP {request.method} '{request.url.path}'",
                channel_manager=channel_manager,
                caller_id=CallerID(application_id=application_id),
            )

        fastapi = FastAPI()

        @fastapi.middleware("http")
        async def external_context_middleware(request: Request, call_next):
            # Most routes get an *external* context (no `caller_id`): an
            # HTTP handler serves untrusted external traffic, so handing it
            # a caller that bypasses authorizers would let external
            # requests escalate to trusted in-app calls. Those routes must
            # do their own end-user auth. Only routes that opted in via
            # `app_internal=True` get an *app-internal* context instead —
            # see the DANGER note on `HTTP._api_route`. We namespace this
            # on `request.state` so other middleware doesn't clash.
            if request.url.path in self._http._app_internal_paths:
                request.state.reboot_external_context = (
                    app_internal_external_context_from_request(request)
                )
            else:
                request.state.reboot_external_context = (
                    external_context_from_request(request)
                )

            return await call_next(request)

        # Reboot's own paths: the root page's assets and the install
        # wizard's probe. Registered before the application's routes
        # and mounts so that a catch-all mount can't swallow them, and
        # not through `self._http` so that they don't count as the
        # application's (see `has_http_routes_or_mounts`).
        fastapi.add_api_route(
            "/__/rootpage/{file:path}",
            root_page_asset,
            methods=["GET"],
            include_in_schema=False,
        )
        fastapi.add_api_route(
            "/__/probe",
            probe,
            methods=["GET"],
            include_in_schema=False,
        )

        for mount in self._http._mounts:
            assert mount.app is not None or mount.factory is not None
            fastapi.mount(
                mount.path,
                mount.app or mount.factory(  # type: ignore[misc]
                    external_context_from_request,
                ),
            )

        for api_route in self._http._api_routes:
            fastapi.add_api_route(
                api_route.path,
                api_route.endpoint,
                **api_route.kwargs,
            )

        # What answers `/`, registered after the application's own
        # routes and mounts so that any of those that claims a path
        # wins, and not through `self._http` so that it doesn't count
        # as one of the application's routes (see
        # `has_http_routes_or_mounts`): the built web app
        # (`--web-app-dist-path`) or the web app its dev server serves
        # (`--web-app-url`), either of which also catches every path
        # nothing else claimed; else Reboot's page at `/`.
        if self._http._web_app_directory is not None:
            fastapi.mount("/", WebApp(self._http._web_app_directory))
        elif self._http._web_app_url is not None:
            fastapi.mount("/", WebDevServer(self._http._web_app_url))
        else:
            fastapi.add_api_route(
                "/",
                root_page_endpoint(),
                methods=["GET"],
                include_in_schema=False,
            )

        config = uvicorn.Config(
            fastapi,
            host="0.0.0.0",
            port=port or 0,
            log_level="warning",
            reload=False,  # This is handled by Reboot.
            workers=1,
            # Trust 'X-Forwarded-Proto'/'X-Forwarded-For' from any
            # source so that redirects (e.g. Starlette's trailing-slash
            # redirect on mounted apps) use the correct scheme when
            # behind a reverse proxy such as ngrok.
            proxy_headers=True,
            # To trust `X-Forwarded-*` headers coming from Envoy, which
            # may be running in a Docker container and therefore not on
            # the `127.0.0.1` IP, we must trust these headers from more
            # IPs than just `127.0.0.1` (the default). This isn't a
            # problem in our case: we don't do e.g. IP-based access
            # control, so spoofing an `X-Forwarded-*` header doesn't get
            # an attacker anything.
            forwarded_allow_ips="*",
        )

        class Server(uvicorn.Server):
            """We need to override the installation of signal handlers as Reboot
            is already handling this itself.
            """

            @contextlib.contextmanager
            def capture_signals(self) -> Generator[None, None, None]:
                # Do nothing
                yield

        server = Server(config)

        async def uvicorn_run():
            try:
                assert server is not None
                await server.serve()
            except asyncio.CancelledError:
                raise
            except:
                import traceback
                traceback.print_exc()

        uvicorn_run_task = asyncio.create_task(uvicorn_run())

        self._servers[server_id] = (server, uvicorn_run_task)

        # Look up port if it wasn't passed.
        if port is None:
            while not server.started:
                await asyncio.sleep(0.1)
            assert len(server.servers) == 1
            assert len(server.servers[0].sockets) == 1
            return server.servers[0].sockets[0].getsockname()[1]
        else:
            return port

    async def stop(self, server_id: ServerId):
        if server_id in self._servers:
            server, uvicorn_run_task = self._servers[server_id]
            # NOTE: this is the recommended way to stop a uvicorn
            # server! Calling `uvicorn_run_task.cancel()` produces
            # gross stack traces.
            server.should_exit = True
            try:
                # The task stops on its own once `should_exit` is set,
                # so pass `cancel=False`. Any `CancelledError` raised
                # here is this task's own cancellation and is
                # propagated.
                await wait_for_tasks([uvicorn_run_task], cancel=False)
            finally:
                del self._servers[server_id]


class NodeWebFramework(WebFramework):

    def __init__(
        self,
        *,
        start: Callable[
            [ServerId, Optional[int], _ChannelManager],
            Awaitable[int],
        ],
        stop: Callable[[ServerId], Awaitable[None]],
    ):
        self._start = start
        self._stop = stop

    async def start(
        self,
        server_id: ServerId,
        port: Optional[int],
        channel_manager: _ChannelManager,
        application_id: ApplicationId,
    ) -> int:
        # `application_id` is only needed to build app-internal contexts
        # for Python-served framework routes (e.g. the OAuth callback);
        # the Node web framework doesn't serve those, so it's ignored.
        return await self._start(server_id, port, channel_manager)

    async def stop(self, server_id: ServerId):
        await self._stop(server_id)
