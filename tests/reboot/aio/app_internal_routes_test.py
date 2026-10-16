"""A route registered `app_internal=True` gets an app-internal context
even when its path is a template: the framework matches request paths
the way Starlette does, not by string comparison.
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


if __name__ == '__main__':
    unittest.main()
