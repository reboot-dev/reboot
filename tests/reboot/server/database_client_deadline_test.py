import asyncio
import grpc
import unittest
from rbt.v1alpha1 import application_metadata_pb2, database_pb2_grpc
from reboot.server import database
from reboot.server.database import DatabaseClient
from unittest import mock


class UnresponsiveDatabase(database_pb2_grpc.DatabaseServicer):
    """A database that accepts the application metadata calls but never
    answers them."""

    async def GetApplicationMetadata(self, request, context):
        await asyncio.Event().wait()

    async def StoreApplicationMetadata(self, request, context):
        await asyncio.Event().wait()


class TestApplicationMetadataDeadline(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self):
        self._server = grpc.aio.server()
        database_pb2_grpc.add_DatabaseServicer_to_server(
            UnresponsiveDatabase(),
            self._server,
        )
        port = self._server.add_insecure_port('127.0.0.1:0')
        await self._server.start()
        self._address = f'127.0.0.1:{port}'
        self._client = DatabaseClient(self._address)

        patcher = mock.patch.object(
            database,
            'APPLICATION_METADATA_DEADLINE_SECONDS',
            0.5,
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    async def asyncTearDown(self):
        await self._server.stop(grace=None)

    def _assert_reported(self, logs, call: str):
        """Asserts that the warning names the call and the database,
        neither of which a `DEADLINE_EXCEEDED` `AioRpcError` carries."""
        self.assertEqual(len(logs.output), 1)
        self.assertIn(call, logs.output[0])
        self.assertIn(self._address, logs.output[0])

    async def test_get_application_metadata_deadline(self):
        with self.assertLogs(database.logger, level='WARNING') as logs:
            with self.assertRaises(grpc.aio.AioRpcError) as raised:
                await self._client.get_application_metadata()
        self.assertEqual(
            raised.exception.code(),
            grpc.StatusCode.DEADLINE_EXCEEDED,
        )
        self._assert_reported(logs, 'GetApplicationMetadata')

    async def test_store_application_metadata_deadline(self):
        with self.assertLogs(database.logger, level='WARNING') as logs:
            with self.assertRaises(grpc.aio.AioRpcError) as raised:
                await self._client.store_application_metadata(
                    application_metadata_pb2.ApplicationMetadata()
                )
        self.assertEqual(
            raised.exception.code(),
            grpc.StatusCode.DEADLINE_EXCEEDED,
        )
        self._assert_reported(logs, 'StoreApplicationMetadata')


if __name__ == '__main__':
    unittest.main()
