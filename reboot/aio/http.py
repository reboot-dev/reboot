import asyncio
import contextlib
import uvicorn  # type: ignore[import]
from abc import ABC, abstractmethod
from dataclasses import dataclass
from fastapi import Depends, FastAPI  # type: ignore[import]
from rebootdev.aio.external import ExternalContext
from rebootdev.aio.internals.channel_manager import _ChannelManager
from rebootdev.aio.types import ServerId
from starlette.requests import Request  # type: ignore[import]
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


class WebFramework(ABC):
    """Web framework for HTTP endpoints in a Reboot application."""

    @abstractmethod
    async def start(
        self,
        server_id: ServerId,
        port: Optional[int],
        channel_manager: _ChannelManager,
    ) -> int:
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

        def _api_route(self, path: str, **kwargs):
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

        fastapi = FastAPI()

        @fastapi.middleware("http")
        async def external_context_middleware(request: Request, call_next):
            # Namespace this so that any other middleware doesn't
            # clash on `request.state`.
            request.state.reboot_external_context = external_context_from_request(
                request
            )

            return await call_next(request)

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

        config = uvicorn.Config(
            fastapi,
            host="0.0.0.0",
            port=port or 0,
            log_level="warning",
            reload=False,  # This is handled by Reboot.
            workers=1,
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
                await uvicorn_run_task
            except:
                pass
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
    ) -> int:
        return await self._start(server_id, port, channel_manager)

    async def stop(self, server_id: ServerId):
        await self._stop(server_id)
