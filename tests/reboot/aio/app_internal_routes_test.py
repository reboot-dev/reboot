"""A route registered `app_internal=True` gets an app-internal context
and any other route an external one, matched by exact path; a path
template is refused on it and on a `require_oauth_token=True` route.
"""
import httpx
import unittest
from reboot.aio.applications import Application
from reboot.aio.exceptions import InputError
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

    @application.http.get('/internal', app_internal=True)
    async def internal(
        context: ExternalContext = InjectExternalContext,
    ) -> PlainTextResponse:
        return kind(context)

    @application.http.get('/external')
    async def external(
        context: ExternalContext = InjectExternalContext,
    ) -> PlainTextResponse:
        return kind(context)

    return application


class AppInternalRoutesTest(unittest.IsolatedAsyncioTestCase):

    async def test_only_an_app_internal_route_is_trusted(self) -> None:
        rbt = Reboot()
        await rbt.start()
        self.addAsyncCleanup(rbt.stop)
        await rbt.up(_application(), local_envoy=True)
        async with httpx.AsyncClient() as client:
            response = await client.get(rbt.http_localhost_url('/internal'))
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.text, 'app-internal')
            response = await client.get(rbt.http_localhost_url('/external'))
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.text, 'external')

    def test_a_path_template_is_refused(self) -> None:
        application = Application(servicers=[CounterServicer])
        for flag in ('app_internal', 'require_oauth_token'):
            with self.assertRaisesRegex(InputError, 'path template'):
                application.http.get('/files/{name}', **{flag: True})


if __name__ == '__main__':
    unittest.main()
