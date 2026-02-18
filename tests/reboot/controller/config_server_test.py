import grpc
import os
import rbt.v1alpha1.config_mode_pb2 as config_mode_pb2
import rbt.v1alpha1.config_mode_pb2_grpc as config_mode_pb2_grpc
import unittest
from google.protobuf.descriptor_pb2 import FileDescriptorSet
from reboot.aio.servers import ConfigServer
from reboot.aio.servicers import Serviceable
from reboot.controller.settings import ENVVAR_REBOOT_CONFIG_SERVER_PORT
from reboot.version import REBOOT_VERSION
from tests.reboot.echo_servicers import MyEchoServicer
from tests.reboot.greeter_servicers import MyGreeterServicer
from unittest import mock


class TestConfigModeServer(unittest.IsolatedAsyncioTestCase):

    async def test_config_mode_server(self):
        """
        Tests that a `ConfigServer` serves the necessary information.
        """

        with mock.patch.dict(
            # We set the config server port to 0 so that it picks its own
            # unused port. We'll fetch the chosen port later by calling
            # server.port().
            os.environ,
            {
                ENVVAR_REBOOT_CONFIG_SERVER_PORT: '0',
            },
            clear=True
        ):
            server = ConfigServer(
                serviceables=[
                    Serviceable.from_servicer_type(servicer) for servicer in [
                        MyEchoServicer,
                        MyGreeterServicer,
                    ]
                ],
            )
            self.assertIsInstance(server, ConfigServer)

            await server.start()
            async with grpc.aio.insecure_channel(
                f'localhost:{server.port()}'
            ) as channel:
                config_server_stub = config_mode_pb2_grpc.ConfigStub(channel)
                response = await config_server_stub.Get(
                    config_mode_pb2.GetConfigRequest()
                )

                file_descriptor_set = FileDescriptorSet()
                file_descriptor_set.ParseFromString(
                    response.application_config.spec.file_descriptor_set
                )

                service_names = [
                    service.name
                    for file in file_descriptor_set.file
                    for service in file.service
                ]

                self.assertIn('GreeterMethods', service_names)

                # Should also have "system services".
                self.assertIn('React', service_names)

                # The config server should report the version of Reboot
                # the customer application is running.
                self.assertEqual(
                    REBOOT_VERSION,
                    response.application_config.spec.reboot_version
                )

            # The config server should not have instantiated any user servicers,
            # i.e., no user code should have executed.
            self.assertFalse(MyGreeterServicer.instantiated_at_least_once)

            await server.stop()


if __name__ == '__main__':
    unittest.main()
