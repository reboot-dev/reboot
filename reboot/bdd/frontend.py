"""The client side of the application under test.

A frontend is a web app, a mobile app, or an MCP UI. Each scenario
gets one of its own, served fresh once the scenario's backend is up
and stopped when the scenario ends, so that nothing carries over from
one scenario to the next. How it is driven is the kind's own affair:
a browser for a web app, a device for a mobile app, an MCP host for
an MCP UI.

The `frontend` fixture is a `Frontend`. A project defines it for
however it serves its frontend; `reboot.bdd.vite` serves a web app
with a Vite dev server.
"""
from reboot.aio.tests import Reboot
from typing import Optional


def backend_url(rbt: Reboot) -> str:
    """The backend's address for a frontend, on `127.0.0.1` so that it
    is a different site from a frontend served on `localhost`, the way
    a deployed frontend and its backend are."""
    return f'http://127.0.0.1:{rbt.envoy_port()}'


class Frontend:
    """One scenario's frontend: where it is served from, and serving
    it once the backend it calls is up."""

    def __init__(self, origin: Optional[str]) -> None:
        self._origin = origin

    @property
    def origin(self) -> Optional[str]:
        """Where a browser loads the frontend from, which is what the
        backend must allow cross-origin requests from; `None` for a
        frontend that makes no cross-origin requests, such as a native
        mobile app."""
        return self._origin

    async def serve(self, *, backend_url: str) -> None:
        """Starts serving the frontend, calling the backend at the
        given URL, and returns at once; `ready()` is what waits for it
        to answer. Serving ends with the fixture that made the
        frontend."""
        raise NotImplementedError

    async def ready(self) -> None:
        """Returns once the frontend answers, and raises once it is
        clear that it never will."""
        raise NotImplementedError
