"""The client side of the application under test.

A frontend is a web app, an MCP UI, or both, from one dev server.
Each scenario gets one of its own, started fresh before the
scenario's backend, which the backend's Envoy then serves the way
`rbt dev run --frontend-url=... --web-app` does: `/__/frontend/**`,
and the web app at `/`, route to the frontend's dev server, so a
browser opens the web app at the backend's own origin, as it does
once deployed. It is stopped when the scenario ends, so that nothing
carries over from one scenario to the next.

The `frontend` fixture is a `Frontend`. A project defines it for
however it serves its frontend; `reboot.bdd.vite` serves one with a
Vite dev server.
"""


class Frontend:
    """One scenario's frontend: serving it, and where the backend
    finds it."""

    async def serve(self) -> None:
        """Starts serving the frontend and returns at once; `ready()`
        is what waits for it to answer. Serving ends with the fixture
        that made the frontend."""
        raise NotImplementedError

    async def ready(self) -> None:
        """Returns once the frontend answers, and raises once it is
        clear that it never will."""
        raise NotImplementedError

    @property
    def url(self) -> str:
        """The dev server's URL, for the backend's Envoy to route
        `/__/frontend/**`, `/` and every path the application doesn't
        answer to; known once `ready()` has returned."""
        raise NotImplementedError
