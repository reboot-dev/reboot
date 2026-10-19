import asyncio
import contextlib
import re
import uvicorn  # type: ignore[import]
from abc import ABC, abstractmethod
from dataclasses import dataclass
from envoy.config.route.v3 import route_components_pb2
from envoy.type.matcher.v3 import regex_pb2
from fastapi import Depends, FastAPI  # type: ignore[import]
from pathlib import Path
from reboot.aio.caller_id import CallerID
from reboot.aio.exceptions import InputError
from reboot.aio.external import ExternalContext
from reboot.aio.headers import AUTHORIZATION_HEADER
from reboot.aio.internals.channel_manager import _ChannelManager
from reboot.aio.types import ApplicationId, ServerId
from reboot.rootpage.page import probe, root_page, root_page_asset
from reboot.settings import ONLY_LOCALHOST_NETWORK_ADDRESS
from reboot.wait_for_tasks import wait_for_tasks
from starlette.exceptions import HTTPException  # type: ignore[import]
from starlette.requests import Request  # type: ignore[import]
from starlette.responses import Response  # type: ignore[import]
from starlette.routing import BaseRoute
from starlette.routing import Mount as StarletteMount
from starlette.routing import Route
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


class WebApp(StaticFiles):
    """A built web app served from a directory at `/`.

    `StaticFiles` serves the files and `index.html` for `/`; the
    override in `get_response` serves `index.html` for the app's own
    routes too. The Vite plugin's `serveWebAppAtRoot` does the same
    for `--web-app`. Built MCP Apps are each one `index.html` a host
    loads whole, so a plain `StaticFiles` serves those.
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
        """Overriding this so that we can serve `index.html`, status
        200, for a navigation to a client-routed page (`/accounts` on
        a reload or from a shared link), which `StaticFiles` 404s
        since no file is behind it, leaving the app's router to
        handle it. Any other 404 (a missing asset, a mistyped API
        path) stays a 404 rather than a page.
        """
        try:
            return await super().get_response(path, scope)
        except HTTPException as e:
            if e.status_code != 404 or not self._navigation(scope):
                raise
            return await super().get_response("index.html", scope)

    @staticmethod
    def _navigation(scope: Scope) -> bool:
        """Whether a browser is navigating to a page: a `GET` that
        accepts HTML, which an asset or API fetch doesn't. A helper
        for `get_response`, not an override.
        """
        if scope.get("method") != "GET":
            return False
        for name, value in scope.get("headers", []):
            if name == b"accept":
                return b"text/html" in value
        return False


class WebFramework(ABC):
    """Web framework for HTTP endpoints in a Reboot application."""

    @abstractmethod
    def route_matches(self) -> list[route_components_pb2.RouteMatch]:
        """The paths this web framework answers, as Envoy route matches:
        the application's own routes and mounts and Reboot's, so that
        Envoy can route them to it ahead of whatever else answers `/`.
        Known before the framework starts, since routes are registered
        on the `Application` before it runs."""
        raise NotImplementedError()

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


def _route_regex(path: str) -> str:
    """The RE2 regular expression matching the paths a FastAPI route
    with parameters matches: `/users/{id}/orders` -> `^/users/[^/]+/orders$`,
    `/files/{name:path}` -> `^/files/.*$`."""
    return "^" + re.sub(
        r"\{[^}:]+(:[^}]+)?\}",
        lambda m: ".*" if m.group(1) == ":path" else "[^/]+",
        re.escape(path).replace(r"\{", "{").replace(r"\}", "}"),
    ) + "$"


def _route_match(
    api_route: "PythonWebFramework.APIRoute",
) -> route_components_pb2.RouteMatch:
    """What Envoy matches for the route: its path, exactly; or, for a
    route with path parameters, a regex matching exactly what FastAPI
    would (`{name}` is one segment, `{name:path}` the rest of the
    path), never a prefix, which would take a web app's own URLs under
    it too."""
    if "{" not in api_route.path:
        return route_components_pb2.RouteMatch(path=api_route.path)
    return route_components_pb2.RouteMatch(
        safe_regex=regex_pb2.RegexMatcher(regex=_route_regex(api_route.path)),
    )


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


class _MountRoot:
    """An ASGI app serving a mount's path itself, `/mcp`, the way the
    mount serves `/mcp/`: the request is handed to the mount with the
    slash it matches on.

    Starlette strips trailing slashes from mount declarations but matches
    only `<mount>/{path:path}`, not the bare mount path. Its slash redirect
    runs after route matching, so a catch-all can claim the bare path first.
    See https://github.com/Kludex/starlette/issues/869.

    Starlette would otherwise redirect `/mcp` to `/mcp/`, naming the
    host the request reached, which behind a proxy that rewrites it is
    not the client's; and a web app served at `/` catches `/mcp` first
    and refuses a POST. An MCP client is told to connect to `/mcp`.

    A class because `Route` wraps a function, a method or a partial of
    one as a request handler, and uses anything else as an ASGI app."""

    def __init__(self, mount: BaseRoute):
        self._mount = mount

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        await self._mount(
            {
                **scope,
                "path": scope["path"] + "/",
                "raw_path": (scope.get("raw_path") or b"") + b"/",
            },
            receive,
            send,
        )


class PythonWebFramework(WebFramework):

    @dataclass(kw_only=True, frozen=True)
    class APIRoute:
        """Encapsulates details for an API route."""
        path: str
        kwargs: dict
        endpoint: Callable[..., Any]
        # Whether its handler gets an app-internal context; see the
        # DANGER note in `_api_route`.

    @dataclass(kw_only=True, frozen=True)
    class Mount:
        """Encapsulates details for a mount."""
        path: str
        app: Optional[HTTPASGIApp]
        factory: Optional[Callable[[Callable[[Request], ExternalContext]],
                                   HTTPASGIApp]]

    def route_matches(self) -> list[route_components_pb2.RouteMatch]:
        # Order is irrelevant: every match routes to the one HTTP
        # cluster, ahead of Envoy's catch-all. Which route answers
        # a request is FastAPI's call, in the order `start` registers
        # them.
        matches = [
            _route_match(api_route) for api_route in self._internal_api_routes
        ]
        for mount in self._http._mounts:
            # Match the bare mount path even when declared with a trailing
            # slash, so Envoy forwards it to the exact route below.
            matches.append(
                route_components_pb2.RouteMatch(
                    prefix=mount.path.rstrip("/") or "/",
                )
            )
        for api_route in self._http._api_routes:
            matches.append(_route_match(api_route))
        return matches

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
            # Request paths whose handlers receive an *app-internal*
            # context (one that can call app-internal-only servicers)
            # instead of the usual external one, because they opted in via
            # `app_internal=True`. See the DANGER note in `_api_route`.
            self._app_internal_paths: set[str] = set()
            # Request paths served only to a request carrying the
            # application's access token (`require_oauth_token=True`).
            self._require_oauth_token_paths: set[str] = set()
            # Returns the access token a request is signed in with, once
            # verified, or `None`; see `verify_oauth_token_with`.
            self._verify_oauth_token: Optional[Callable[[Request],
                                                        Optional[str]]] = None

        def verify_oauth_token_with(
            self,
            verify: Callable[[Request], Optional[str]],
        ) -> None:
            """Sets how a `require_oauth_token=True` route verifies a
            request: `verify` returns the access token the request is
            signed in with, verified, or `None`. `Application` calls
            this once it has an OAuth server, whose access tokens sign
            a request in."""
            self._verify_oauth_token = verify

        def has_require_oauth_token_routes(self) -> bool:
            return len(self._require_oauth_token_paths) > 0

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
            app_internal = kwargs.pop("app_internal", False)

            # `require_oauth_token` is ours too. Such a route serves only
            # a request signed in as a user of the application: by the
            # access JWT in its `Authorization: Bearer` header; anything
            # else gets a 401. Envoy's CORS policy answers any origin
            # without credentials on every path but the OAuth server's,
            # so a page in an MCP host's sandbox can call it with a
            # bearer.
            require_oauth_token = kwargs.pop("require_oauth_token", False)

            # A request is matched to either kind of route by its exact
            # path, so a path template would never match, and a looser
            # match would hand a caller a trusted context or serve it
            # without a token.
            if (app_internal or require_oauth_token) and "{" in path:
                raise InputError(
                    reason=(
                        f"`{path}`: a route with `app_internal=True` or "
                        "`require_oauth_token=True` cannot have a path "
                        "template, since a request is matched to it by its "
                        "exact path. Take the value as a query parameter "
                        "instead, or reach out to the maintainers if you "
                        "need this."
                    )
                )
            if app_internal:
                self._app_internal_paths.add(path)
            if require_oauth_token:
                self._require_oauth_token_paths.add(path)

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
        # Reboot's own routes: the root page's assets and the install
        # wizard's probe. Not in `self._http`, so that they don't count
        # as the application's (see `has_http_routes_or_mounts`), but
        # the same records, so that `start` and `route_matches` read
        # them from here and nowhere else.
        self._internal_api_routes = [
            PythonWebFramework.APIRoute(
                path="/__/rootpage/{file:path}",
                endpoint=root_page_asset,
                kwargs=dict(methods=["GET"], include_in_schema=False),
            ),
            PythonWebFramework.APIRoute(
                path="/__/probe",
                endpoint=probe,
                kwargs=dict(methods=["GET"], include_in_schema=False),
            ),
        ]

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

        # Registered after `external_context_middleware`, so it runs
        # first and answers a 401 before anything builds a context.
        @fastapi.middleware("http")
        async def require_oauth_token_middleware(request: Request, call_next):
            if request.url.path not in self._http._require_oauth_token_paths:
                return await call_next(request)
            # `Application` refuses to mount a route requiring an OAuth
            # token without an OAuth server.
            assert self._http._verify_oauth_token is not None
            token = self._http._verify_oauth_token(request)
            if token is None:
                # RFC 6750: a 401 carries `WWW-Authenticate: Bearer`,
                # with `error="invalid_token"` only when the request
                # presented a token.
                # `resource_metadata` (RFC 9728) tells the client where
                # to sign in; `/mcp` sends the same.
                base = origin_from_request(request)
                challenge = (
                    'Bearer error="invalid_token", '
                    if AUTHORIZATION_HEADER in request.headers else "Bearer "
                ) + (
                    'resource_metadata="'
                    f'{base}/.well-known/oauth-protected-resource"'
                )
                return Response(
                    status_code=401,
                    headers={"WWW-Authenticate": challenge},
                )
            return await call_next(request)

        # Reboot's own routes first, so that a catch-all mount can't
        # swallow them.
        for api_route in self._internal_api_routes:
            fastapi.add_api_route(
                api_route.path,
                api_route.endpoint,
                **api_route.kwargs,
            )

        for mount in self._http._mounts:
            assert mount.app is not None or mount.factory is not None
            # Use mounted_route.path because Starlette strips trailing slashes;
            # the original mount.path could still be `/something/`, which would
            # leave `/something` unhandled.
            mounted_route = StarletteMount(
                mount.path,
                app=mount.app or mount.factory(  # type: ignore[misc]
                    external_context_from_request,
                ),
            )
            fastapi.router.routes.append(mounted_route)
            # Starlette's Mount matches `/something/` and its descendants, but
            # not `/something`. Its slash redirect runs after route matching,
            # so a later catch-all can claim `/something` before it redirects.
            # To compensate, add another route for `/something` that forwards
            # to the same mount, treating `/something` and `/something/` alike.
            # See https://github.com/Kludex/starlette/issues/869.
            if mounted_route.path:
                fastapi.router.routes.append(
                    Route(mounted_route.path, _MountRoot(mounted_route))
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
        # (`--web-app-dist-path`), which also catches every path nothing
        # else claimed; else Reboot's page at `/`.
        if self._http._web_app_directory is not None:
            fastapi.mount("/", WebApp(self._http._web_app_directory))
        else:
            fastapi.add_api_route(
                "/",
                root_page,
                methods=["GET"],
                include_in_schema=False,
            )

        config = uvicorn.Config(
            fastapi,
            # Only connections from the local Envoy are expected, so we
            # use only the loopback.
            host=ONLY_LOCALHOST_NETWORK_ADDRESS,
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

    def route_matches(self) -> list[route_components_pb2.RouteMatch]:
        # A Node.js application's web framework is its own; Envoy's
        # catch-all already sends everything there.
        return []

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
