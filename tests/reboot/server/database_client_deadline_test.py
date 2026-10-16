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
        self._client = DatabaseClient(f'127.0.0.1:{port}')

        patcher = mock.patch.object(
            database,
            'APPLICATION_METADATA_DEADLINE_SECONDS',
            0.5,
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    async def asyncTearDown(self):
        await self._server.stop(grace=None)

    async def test_get_application_metadata_deadline(self):
        with self.assertRaises(grpc.aio.AioRpcError) as raised:
            await self._client.get_application_metadata()
        self.assertEqual(
            raised.exception.code(),
            grpc.StatusCode.DEADLINE_EXCEEDED,
        )

    async def test_store_application_metadata_deadline(self):
        with self.assertRaises(grpc.aio.AioRpcError) as raised:
            await self._client.store_application_metadata(
                application_metadata_pb2.ApplicationMetadata()
            )
        self.assertEqual(
            raised.exception.code(),
            grpc.StatusCode.DEADLINE_EXCEEDED,
        )


if __name__ == '__main__':
    unittest.main()
