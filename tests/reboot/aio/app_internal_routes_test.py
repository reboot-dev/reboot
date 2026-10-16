"""A route registered `app_internal=True` gets an app-internal context
even when its path is a template, and only the route FastAPI serves a
request with counts: an external route registered before an
app-internal template keeps its external context on the requests it
serves, however the template matches them.
"""
import httpx
import unittest
from reboot.aio.applications import Application
from reboot.aio.external import ExternalContext
from reboot.aio.http import InjectExternalContext
from reboot.aio.tests import Reboot
from reboot.ping.ping import CounterServicer
from starlette.responses import PlainTextResponse


def _application() -> Application:
    application = Application(servicers=[CounterServicer])

    # An app-internal context carries the application's caller id; an
    # external one carries none.
    def kind(context: ExternalContext) -> PlainTextResponse:
        return PlainTextResponse(
            'external' if context.caller_id is None else 'app-internal'
        )

    @application.http.get('/internal/{name}', app_internal=True)
    async def internal(
        name: str,
        context: ExternalContext = InjectExternalContext,
    ) -> PlainTextResponse:
        return kind(context)

    @application.http.get('/external/{name}')
    async def external(
        name: str,
        context: ExternalContext = InjectExternalContext,
    ) -> PlainTextResponse:
        return kind(context)

    # Registered first, so FastAPI serves `/files/status` with it,
    # though the app-internal template below matches that path too.
    @application.http.get('/files/status')
    async def files_status(
        context: ExternalContext = InjectExternalContext,
    ) -> PlainTextResponse:
        return kind(context)

    @application.http.get('/files/{name}', app_internal=True)
    async def files(
        name: str,
        context: ExternalContext = InjectExternalContext,
    ) -> PlainTextResponse:
        return kind(context)

    return application


class AppInternalRoutesTest(unittest.IsolatedAsyncioTestCase):

    async def test_a_path_template_is_app_internal(self) -> None:
        rbt = Reboot()
        await rbt.start()
        self.addAsyncCleanup(rbt.stop)
        await rbt.up(_application(), local_envoy=True)
        async with httpx.AsyncClient() as client:
            response = await client.get(
                rbt.http_localhost_url('/internal/you')
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.text, 'app-internal')
            response = await client.get(
                rbt.http_localhost_url('/external/you')
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.text, 'external')

    async def test_only_the_route_served_counts(self) -> None:
        rbt = Reboot()
        await rbt.start()
        self.addAsyncCleanup(rbt.stop)
        await rbt.up(_application(), local_envoy=True)
        async with httpx.AsyncClient() as client:
            # The external `/files/status` route serves this, not the
            # app-internal `/files/{name}` template that also matches.
            response = await client.get(
                rbt.http_localhost_url('/files/status')
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.text, 'external')
            response = await client.get(rbt.http_localhost_url('/files/you'))
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.text, 'app-internal')
            # A method the template does not serve gets no context at
            # all, let alone a trusted one.
            response = await client.post(rbt.http_localhost_url('/files/you'))
            self.assertEqual(response.status_code, 405)


if __name__ == '__main__':
    unittest.main()
