import sys
import unittest
from reboot.aio.applications import Application
from reboot.aio.external import ExternalContext
from reboot.aio.health_check import do_health_check
from reboot.aio.tests import Reboot
from typing import Awaitable, Callable, Optional


def web_test_against_local_envoy(
    *,
    test: Callable[[ExternalContext, str], Awaitable[None]],
    application: Application,
    bearer_token: Optional[str] = None,
):

    class WebTestAgainstLocalEnvoy(unittest.IsolatedAsyncioTestCase):

        async def asyncSetUp(self):
            self.rbt = Reboot()
            await self.rbt.start()

        async def asyncTearDown(self):
            await self.rbt.stop()

        async def test_use_tls(self):
            assert application is not None

            await self.rbt.up(
                application,
                local_envoy=True,
                local_envoy_tls=True,
            )

            uri = self.rbt.https_localhost_direct_url()

            await do_health_check(
                application_url=uri,
            )

            context = self.rbt.create_external_context(
                name=self.id(),
                bearer_token=bearer_token,
            )

            await test(context, uri)

        async def test_no_use_tls(self):
            assert application is not None

            await self.rbt.up(
                application,
                local_envoy=True,
                # The default is for local envoy to not use TLS.
            )

            uri = f'http://127.0.0.1:{self.rbt.envoy_port()}'

            await do_health_check(
                application_url=uri,
            )

            context = self.rbt.create_external_context(
                name=self.id(),
                bearer_token=bearer_token,
            )

            await test(context, uri)

    # `unittest` loads tests at the top-level of a module (called
    # "test discovery"), so we need to add our class there.
    #
    # TODO(benh): support multiple
    assert not hasattr(sys.modules[__name__], 'WebTestAgainstLocalEnvoy'), (
        "You can only call `web_test_against_local_envoy()` once per test"
    )
    sys.modules[
        __name__
    ].WebTestAgainstLocalEnvoy = WebTestAgainstLocalEnvoy  # type: ignore[attr-defined]

    unittest.main(module=sys.modules[__name__])
