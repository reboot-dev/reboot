"""
Regression test for https://github.com/reboot-dev/reboot/issues/288:
with `http_proxy` (or `HTTPS_PROXY`, ...) set and no `no_proxy`
covering loopback, Reboot's own gRPC channels went through the proxy,
which never answered, and `Reboot().start()` waited forever.
"""

import asyncio
import os
import socket
import unittest
from rbt.v1alpha1.errors_pb2 import PermissionDenied
from reboot.aio.applications import Application
from reboot.aio.external import ExternalContext
from reboot.aio.tests import Reboot
from reboot.std.collections.v1.sorted_map import SortedMap, sorted_map_library
from unittest import mock

# Generous for start-up, but bounded: without the fix the test would
# otherwise hang until Bazel's timeout instead of failing.
TIMEOUT_SECONDS = 120


class HttpProxyTest(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        # A proxy that refuses every connection: a port held by a bound
        # socket that never listens.
        self.dead_proxy = socket.socket()
        self.dead_proxy.bind(('127.0.0.1', 0))
        proxy_url = f'http://127.0.0.1:{self.dead_proxy.getsockname()[1]}'

        environ = {
            name: value
            for name, value in os.environ.items()
            if name.lower() not in (
                'no_proxy',
                'no_grpc_proxy',
            )
        }
        for name in (
            'grpc_proxy',
            'https_proxy',
            'http_proxy',
            'HTTPS_PROXY',
            'HTTP_PROXY',
        ):
            environ[name] = proxy_url
        # Set before `Reboot()`, so the servers it spawns inherit it too.
        self.environ = mock.patch.dict(os.environ, environ, clear=True)
        self.environ.start()

        self.rbt = Reboot()

    async def asyncTearDown(self) -> None:
        await asyncio.wait_for(self.rbt.stop(), TIMEOUT_SECONDS)
        self.environ.stop()
        self.dead_proxy.close()

    async def test_proxy_is_not_used_for_reboots_own_channels(self) -> None:
        await asyncio.wait_for(self.rbt.start(), TIMEOUT_SECONDS)
        await asyncio.wait_for(
            self.rbt.up(
                Application(libraries=[sorted_map_library()]),
                servers=2,
                local_envoy=True,
            ),
            TIMEOUT_SECONDS,
        )

        async def calls() -> None:
            context = self.rbt.create_external_context(
                name=self.id(),
                app_internal=True,
            )
            # Enough states to land on both servers.
            for i in range(20):
                await SortedMap.ref(f'map-{i}').insert(
                    context,
                    entries={'key': str(i).encode()},
                )
            for i in range(20):
                response = await SortedMap.ref(f'map-{i}').get(
                    context,
                    key='key',
                )
                self.assertEqual(response.value, str(i).encode())

            # A client given a loopback URL ignores the proxy too. The
            # sorted map lets only app-internal callers in, so being
            # refused proves the call reached a server and came back.
            external = ExternalContext(name='external', url=self.rbt.url())
            with self.assertRaises(SortedMap.GetAborted) as aborted:
                await SortedMap.ref('map-0').get(external, key='key')
            self.assertEqual(type(aborted.exception.error), PermissionDenied)

        await asyncio.wait_for(calls(), TIMEOUT_SECONDS)


if __name__ == '__main__':
    unittest.main()
