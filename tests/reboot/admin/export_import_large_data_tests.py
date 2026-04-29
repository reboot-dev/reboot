import grpc
import os
import tempfile
import unittest
from log.log import get_logger
from pathlib import Path
from rbt.v1alpha1.admin import export_import_pb2_grpc
from reboot.admin import export_import_client
from reboot.aio.applications import Application
from reboot.aio.external import ExternalContext
from reboot.aio.tests import Reboot
from reboot.settings import ENVVAR_SECRET_REBOOT_ADMIN_TOKEN
from reboot.ssl.localhost import LOCALHOST_CRT_DATA
from tests.reboot.echo_rbt import Echo
from tests.reboot.echo_servicers import MyEchoServicer
from typing import Optional

logger = get_logger(__name__)

TEST_SECRET_REBOOT_ADMIN_TOKEN = 'test-admin-secret'

# Target total data volume that exceeds the 100 MB gRPC message limit.
# This verifies that streaming batching (flush at 50 MB) works.
NUMBER_OF_STATES = 150
# Each state stores one ~1 MB message, so the total serialized state
# data is ~150 MB + ~150MB for each `IdempotentMutation` which will
# store the response message of the same ~1 MB size.
MESSAGE_SIZE = 1 * 1024 * 1024


class LargeDataExportTestCase(unittest.IsolatedAsyncioTestCase):
    """Tests that export/import round-trips work when total data exceeds
    100 MB.

    Before the streaming export change this would have produced a single
    `ExportResponse` exceeding the gRPC message limit, causing
    RESOURCE_EXHAUSTED. Streaming with byte-size batching solves this.
    """

    async def asyncSetUp(self) -> None:
        os.environ[ENVVAR_SECRET_REBOOT_ADMIN_TOKEN
                  ] = TEST_SECRET_REBOOT_ADMIN_TOKEN
        self.rbt: Optional[Reboot] = None

    async def asyncTearDown(self) -> None:
        if self.rbt is not None:
            await self.rbt.stop()
            self.rbt = None

    async def start(
        self,
    ) -> tuple[ExternalContext, export_import_pb2_grpc.ExportImportStub]:
        assert self.rbt is None
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
            local_envoy=True,
            # For SSL/TLS test coverage.
            local_envoy_tls=True,
        )
        context = self.rbt.create_external_context(name=self.id())
        channel = grpc.aio.secure_channel(
            self.rbt.localhost_direct_endpoint(),
            grpc.ssl_channel_credentials(
                root_certificates=LOCALHOST_CRT_DATA,
            ),
        )
        stub = export_import_pb2_grpc.ExportImportStub(channel)
        return context, stub

    async def stop(self) -> None:
        assert self.rbt is not None
        await self.rbt.stop()
        self.rbt = None

    async def test_large_export(self) -> None:
        context, stub = await self.start()

        # Create states whose total state exceeds 100 MB.
        large_message = "x" * MESSAGE_SIZE
        for i in range(NUMBER_OF_STATES):
            echo = Echo.ref(f"large-{i}")
            await echo.Reply(context, message=large_message)

        with tempfile.TemporaryDirectory() as directory:
            directory_path = Path(directory)

            # Export must succeed despite total data > 100 MB.
            await export_import_client.do_export(
                stub,
                directory_path,
                admin_token=TEST_SECRET_REBOOT_ADMIN_TOKEN,
            )

            # Verify total exported data exceeds 300 MB.
            total_bytes = sum(
                p.stat().st_size for p in directory_path.iterdir()
            )
            self.assertGreater(total_bytes, 300 * 1024 * 1024)

            # Bring up a fresh instance and verify it has no state.
            await self.stop()
            fresh_context, fresh_stub = await self.start()

            for i in range(NUMBER_OF_STATES):
                with self.assertRaises(Exception) as exc:
                    await Echo.ref(f"large-{i}").Replay(fresh_context)
                self.assertIn(
                    "StateNotConstructed",
                    str(exc.exception),
                )

            await export_import_client.do_import(
                fresh_stub,
                directory_path,
                admin_token=TEST_SECRET_REBOOT_ADMIN_TOKEN,
            )

            for i in range(NUMBER_OF_STATES):
                response = await Echo.ref(f"large-{i}").Replay(fresh_context)
                self.assertEqual([large_message], response.messages)


if __name__ == '__main__':
    unittest.main()
