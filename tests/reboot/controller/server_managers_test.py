import unittest
import unittest.mock
from google.protobuf.descriptor_pb2 import FileDescriptorSet
from rbt.v1alpha1 import placement_planner_pb2
from rbt.v1alpha1.database_pb2 import ShardInfo
from reboot.aio.types import ApplicationId
from reboot.controller.server_managers import ServerManager
from reboot.controller.servers import ServerSpec
from reboot.naming import get_namespace_for_space
from tests.reboot.settings import REBOOT_VERSION_BEFORE_SHARDED_DATABASE

APPLICATION_ID = ApplicationId('a0123456789')
APPLICATION_NAMESPACE = get_namespace_for_space(
    # Needs to be "s" + 10 characters.
    's0123456789'
)
REBOOT_STORAGE_TYPE = 'LOCAL'

# Dummy value that we use for port.
TEST_DUMMY_PORT = 0xFFFF + 42


def server_id_to_hostname(server_id: str) -> str:
    """Test helper to map server ID to hostname."""
    # Hostname _is_ server ID.
    return server_id


class TestServerManager(ServerManager):
    """A mock implementation to test parent class functionality."""

    async def _set_server(
        self,
        server: ServerSpec,
    ) -> placement_planner_pb2.Server.Address:
        return placement_planner_pb2.Server.Address(
            host=server_id_to_hostname(server.id),
            port=TEST_DUMMY_PORT,
        )

    async def _delete_server(
        self,
        server: ServerSpec,
    ) -> None:
        pass


class TestServerManagers(unittest.IsolatedAsyncioTestCase):

    def setUp(self) -> None:
        self.maxDiff = None
        # Bootstrap test by populating lists of known servers and their
        # expected locations.
        self.servers: list[ServerSpec] = []
        self.expected_server_protos: list[placement_planner_pb2.Server] = []

        for i in range(5):
            shard_id = f'shard-{i}'
            shard_first_key = b"" if i == 0 else bytes(i)
            server_id = f'server-{i}'
            self.servers.append(
                ServerSpec(
                    id=server_id,
                    shards=[
                        ShardInfo(
                            shard_id=shard_id, shard_first_key=shard_first_key
                        ),
                    ],
                    application_id=APPLICATION_ID,
                    container_image_name='image',
                    namespace=APPLICATION_NAMESPACE,
                    file_descriptor_set=FileDescriptorSet(),
                    reboot_version=REBOOT_VERSION_BEFORE_SHARDED_DATABASE,
                    replica_index=0,
                )
            )
            self.expected_server_protos.append(
                placement_planner_pb2.Server(
                    id=server_id,
                    application_id=APPLICATION_ID,
                    address=placement_planner_pb2.Server.Address(
                        host=server_id_to_hostname(server_id),
                        port=TEST_DUMMY_PORT
                    ),
                    namespace=APPLICATION_NAMESPACE,
                    file_descriptor_set=FileDescriptorSet(),
                    reboot_version=REBOOT_VERSION_BEFORE_SHARDED_DATABASE,
                )
            )

    async def test_make_servers(self) -> None:
        """Test that multiple servers can be made at once."""
        server_manager = TestServerManager()
        server_protos = await server_manager.set_servers(self.servers)
        self.assertEqual(server_protos, self.expected_server_protos)

    async def test_delete_server(self) -> None:
        """Test that outdated servers will be deleted."""
        with unittest.mock.patch.object(
            TestServerManager, '_delete_server'
        ) as mock_delete_server:
            server_manager = TestServerManager()

            # Create 5 initial servers.
            await server_manager.set_servers(self.servers)

            # Now remove one and check that the list is updated accordingly.
            server_to_delete = self.servers.pop(2)
            self.expected_server_protos.pop(2)
            server_protos = await server_manager.set_servers(self.servers)
            self.assertEqual(server_protos, self.expected_server_protos)
            mock_delete_server.assert_called_with(server_to_delete)


if __name__ == '__main__':
    unittest.main()
