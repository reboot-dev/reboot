"""
Tests which `ExternalContext` a custom HTTP route is handed: a route
registered with `app_internal=True` gets an app-internal one (carrying
the application's `caller_id`), whatever the shape of its path, while a
route registered without it gets an external one even when it lives
under the same path prefix as an app-internal route.
"""

import httpx
import unittest
from reboot.aio.applications import Application
from reboot.aio.external import ExternalContext
from reboot.aio.http import InjectExternalContext
from reboot.aio.tests import Reboot
from tests.reboot.greeter_servicers import MyGreeterServicer

# Generous per-request HTTP timeout: each request crosses a full Reboot
# cluster plus a local Envoy, which can take a while on a loaded CI
# runner, and Bazel's test timeout remains the backstop against a hang.
_HTTP_TIMEOUT_SECONDS = 30.0


def _describe(context: ExternalContext) -> dict[str, bool]:
    """The kind of context a handler was given: an app-internal context
    carries the application's `caller_id`, an external one carries
    none."""
    return {"app_internal": context.caller_id is not None}


class HTTPAppInternalTest(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

        application = Application(servicers=[MyGreeterServicer])

        # Starlette dispatches to the first route whose path matches,
        # so the static routes are registered ahead of the
        # parameterized one that would otherwise capture them.
        @application.http.get("/__/test/static", app_internal=True)
        def static(context: ExternalContext = InjectExternalContext):
            return _describe(context)

        @application.http.get("/__/test/plain")
        def plain(context: ExternalContext = InjectExternalContext):
            return _describe(context)

        @application.http.get("/__/test/{item}", app_internal=True)
        def parameterized(
            item: str,
            context: ExternalContext = InjectExternalContext,
        ):
            return _describe(context)

        await self.rbt.up(application)

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def _get(self, path: str) -> dict[str, bool]:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS) as client:
            response = await client.get(self.rbt.http_localhost_url(path))
        self.assertEqual(200, response.status_code, response.text)
        return response.json()

    async def test_static_app_internal_route(self) -> None:
        self.assertEqual(
            {"app_internal": True},
            await self._get("/__/test/static"),
        )

    async def test_parameterized_app_internal_route(self) -> None:
        # The route's path is a template (`/__/test/{item}`); the
        # request's path is concrete, so an exact path lookup would
        # never match it.
        self.assertEqual(
            {"app_internal": True},
            await self._get("/__/test/some-item"),
        )

    async def test_plain_route_under_app_internal_prefix(self) -> None:
        # `/__/test/plain` also matches the `/__/test/{item}` pattern,
        # so an app-internal grant keyed on a path pattern rather than
        # on the dispatched endpoint would leak to this route.
        self.assertEqual(
            {"app_internal": False},
            await self._get("/__/test/plain"),
        )


if __name__ == "__main__":
    unittest.main()
