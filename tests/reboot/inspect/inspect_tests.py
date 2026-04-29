import grpc
import os
import unittest
from google.protobuf import struct_pb2
from log.log import get_logger
from rbt.v1alpha1.inspect import inspect_pb2_grpc
from rbt.v1alpha1.inspect.inspect_pb2 import (
    GetStateRequest,
    GetStateTypesRequest,
    ListStatesRequest,
)
from reboot.aio.applications import Application
from reboot.aio.headers import AUTHORIZATION_HEADER, STATE_REF_HEADER
from reboot.aio.tests import Reboot, temporary_environ
from reboot.aio.types import StateRef, StateTypeName
from reboot.settings import ENVVAR_SECRET_REBOOT_ADMIN_TOKEN
from reboot.ssl.localhost import LOCALHOST_CRT_DATA
from tests.reboot.echo_rbt import Echo
from tests.reboot.echo_servicers import MyEchoServicer
from uuid import uuid4

logger = get_logger(__name__)

TEST_SECRET_REBOOT_ADMIN_TOKEN = 'test-admin-secret'


def admin_auth_metadata() -> tuple:
    """Simple helper to provide the admin auth metadata."""
    return (
        (AUTHORIZATION_HEADER, f'Bearer {TEST_SECRET_REBOOT_ADMIN_TOKEN}'),
    )


class InspectTestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        temporary_environ(
            self,
            {ENVVAR_SECRET_REBOOT_ADMIN_TOKEN: TEST_SECRET_REBOOT_ADMIN_TOKEN},
        )
        self.maxDiff = None
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    def assertStructsEqual(
        self,
        expected: struct_pb2.Struct,
        got: struct_pb2.Struct,
    ):
        # The error message when diffing two structs using `self.assertEqual` is
        # pretty bad, so we print our own.
        self.assertTrue(
            expected == got,
            "Expected:\n"
            "####\n"
            f"{str(expected)}\n"
            "####\n"
            "Got:\n"
            "####\n"
            f"{str(got)}\n"
            "####\n",
        )

    async def _do_get_state_types_test(self) -> None:
        """Helper method to test `GetStateTypes` RPC."""
        channel = grpc.aio.secure_channel(
            self.rbt.localhost_direct_endpoint(),
            grpc.ssl_channel_credentials(
                root_certificates=LOCALHOST_CRT_DATA,
            )
        )
        stub = inspect_pb2_grpc.InspectStub(channel)

        # State types should be available immediately after rbt.up since
        # they are determined by the servicers registered at startup.
        response_stream = stub.GetStateTypes(
            GetStateTypesRequest(),
            metadata=admin_auth_metadata(),
        )

        first_response = await response_stream.read()
        expected_service = 'tests.reboot.Echo'

        # The Echo servicer should be listed immediately.
        self.assertIn(expected_service, first_response.state_types)

    async def test_get_state_types_single_server(self) -> None:
        """Test GetStateTypes RPC with single server."""
        await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
            local_envoy=True,
            local_envoy_tls=True,  # For TLS/SSL test coverage.
            servers=1,
        )
        await self._do_get_state_types_test()

    async def test_get_state_types_multiple_servers(self) -> None:
        """Test GetStateTypes RPC with multiple servers."""
        await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
            local_envoy=True,
            local_envoy_tls=True,  # For TLS/SSL test coverage.
            servers=2,
        )
        await self._do_get_state_types_test()

    async def test_get_state_types_admin_auth(self) -> None:
        """Test GetStateTypes RPC requires proper admin authentication."""
        # Change the admin secret so the client's bearer token
        # no longer matches. This should cause authentication
        # failure.
        os.environ[ENVVAR_SECRET_REBOOT_ADMIN_TOKEN] = 'wrong-secret'

        await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
            local_envoy=True,
            local_envoy_tls=True,  # For TLS/SSL test coverage.
            servers=1,
        )

        # Running the test should now fail because of the wrong secret.
        with self.assertRaises(
            grpc.aio.AioRpcError,
        ) as error:
            await self._do_get_state_types_test()
        # Check that we are failing for the expected reason.
        self.assertIn(
            'Bearer token does not match the admin secret',
            str(error.exception),
        )

    async def _do_list_states_test(self) -> None:
        """Helper method to test `ListStates` RPC."""
        context = self.rbt.create_external_context(name=self.id())
        channel = grpc.aio.secure_channel(
            self.rbt.localhost_direct_endpoint(),
            grpc.ssl_channel_credentials(
                root_certificates=LOCALHOST_CRT_DATA,
            )
        )
        stub = inspect_pb2_grpc.InspectStub(channel)

        expected_service = 'tests.reboot.Echo'

        # Initially, no states should be returned for the service.
        response_stream = stub.ListStates(
            ListStatesRequest(state_type=expected_service),
            metadata=admin_auth_metadata(),
        )

        first_response = await response_stream.read()
        self.assertEqual(first_response.state_infos, [])

        # Create Echo states with UUIDs, to try and ensure that multiple
        # server tests have data in all partitions.
        state_ids = [
            str(uuid4()),
            str(uuid4()),
            str(uuid4()),
            str(uuid4()),
            str(uuid4()),
        ]
        state_refs = []

        for state_id in state_ids:
            echo = Echo.ref(state_id)
            state_refs.append(echo._state_ref)
            message = f'Hello, {state_id}'
            response = await echo.Reply(context, message=message)
            self.assertEqual(message, response.message)

        # Now `ListStates` should return the created states.
        expected_state_ids = [ref.id for ref in state_refs]

        # The stream should eventually return all the states.
        while True:
            response = await response_stream.read()
            if len(response.state_infos) == len(expected_state_ids):
                # Sort both lists for comparison since order might vary.
                returned_state_ids = [
                    info.state_id for info in response.state_infos
                ]
                self.assertEqual(
                    sorted(returned_state_ids), sorted(expected_state_ids)
                )
                # Verify each `StateInfo` has `server_id` and `replica_index`.
                for state_info in response.state_infos:
                    self.assertNotEqual(state_info.server_id, "")
                    self.assertIsInstance(state_info.replica_index, int)
                break

    async def test_list_states_single_server(self) -> None:
        """Test `ListStates` RPC with single server."""
        await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
            local_envoy=True,
            local_envoy_tls=True,  # For TLS/SSL test coverage.
            servers=1,
        )
        await self._do_list_states_test()

    async def test_list_states_multiple_servers(self) -> None:
        """Test `ListStates` RPC with multiple servers."""
        await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
            local_envoy=True,
            local_envoy_tls=True,  # For TLS/SSL test coverage.
            servers=2,
        )
        await self._do_list_states_test()

    async def test_list_states_admin_auth(self) -> None:
        """Test `ListStates` RPC requires proper admin authentication."""
        # Change the admin secret so the client's bearer token
        # no longer matches. This should cause authentication
        # failure.
        os.environ[ENVVAR_SECRET_REBOOT_ADMIN_TOKEN] = 'wrong-secret'

        await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
            local_envoy=True,
            local_envoy_tls=True,  # For TLS/SSL test coverage.
            servers=1,
        )

        # Running the test should now fail because of the wrong secret.
        with self.assertRaises(
            grpc.aio.AioRpcError,
        ) as error:
            await self._do_list_states_test()
        # Check that we are failing for the expected reason.
        self.assertIn(
            'Bearer token does not match the admin secret',
            str(error.exception),
        )

    async def _do_list_states_nonexistent_state_type_test(self) -> None:
        """Helper method to test `ListStates` RPC with non-existent state type."""
        channel = grpc.aio.secure_channel(
            self.rbt.localhost_direct_endpoint(),
            grpc.ssl_channel_credentials(
                root_certificates=LOCALHOST_CRT_DATA,
            )
        )
        stub = inspect_pb2_grpc.InspectStub(channel)

        # Request states for a non-existent state type should result
        # in NOT_FOUND error.
        response_stream = stub.ListStates(
            ListStatesRequest(state_type='nonexistent.StateType'),
            metadata=admin_auth_metadata(),
        )

        # Should raise a NOT_FOUND gRPC error for non-existent state type.
        with self.assertRaises(grpc.aio.AioRpcError) as error:
            await response_stream.read()

        # Verify it's specifically a NOT_FOUND error.
        self.assertEqual(error.exception.code(), grpc.StatusCode.NOT_FOUND)

    async def test_list_states_nonexistent_state_type_single_server(
        self
    ) -> None:
        """Test `ListStates` RPC with non-existent state type, single server."""
        await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
            local_envoy=True,
            local_envoy_tls=True,  # For TLS/SSL test coverage.
            servers=1,
        )
        await self._do_list_states_nonexistent_state_type_test()

    async def test_list_states_nonexistent_state_type_multiple_servers(
        self
    ) -> None:
        """Test `ListStates` RPC with non-existent state type, multiple servers."""
        await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
            local_envoy=True,
            local_envoy_tls=True,  # For TLS/SSL test coverage.
            servers=2,
        )
        await self._do_list_states_nonexistent_state_type_test()

    async def _do_get_state_test(self) -> None:
        """Helper method to test GetState RPC streaming behavior."""
        context = self.rbt.create_external_context(name=self.id())
        channel = grpc.aio.secure_channel(
            self.rbt.localhost_direct_endpoint(),
            grpc.ssl_channel_credentials(
                root_certificates=LOCALHOST_CRT_DATA,
            )
        )
        stub = inspect_pb2_grpc.InspectStub(channel)

        expected_service = 'tests.reboot.Echo'
        test_state_id = str(uuid4())
        test_message_1 = f'Hello, {test_state_id}'
        test_message_2 = f'Updated, {test_state_id}'

        # Test GetState for a non-existent state - should return NOT_FOUND error
        # Create state ref for the non-existent state.
        state_ref = StateRef.from_id(
            StateTypeName(expected_service),
            test_state_id,
        )
        metadata = admin_auth_metadata(
        ) + ((STATE_REF_HEADER, state_ref.to_str()),)

        response_stream = stub.GetState(
            GetStateRequest(),
            metadata=metadata,
        )

        # Should raise a NOT_FOUND gRPC error for non-existent state.
        with self.assertRaises(grpc.aio.AioRpcError) as error:
            async for _ in response_stream:
                pass
        self.assertEqual(error.exception.code(), grpc.StatusCode.NOT_FOUND)

        # Create an Echo actor.
        echo = Echo.ref(test_state_id)
        response = await echo.Reply(context, message=test_message_1)
        self.assertEqual(test_message_1, response.message)

        # Now start streaming GetState for the existing state.
        response_stream = stub.GetState(
            GetStateRequest(),
            metadata=metadata,
        )

        # Accumulate the first chunked response (initial state).
        data = []
        async for response in response_stream:
            data.append(response.data)
            # Check if there are more chunks.
            if response.chunk < response.total - 1:
                continue
            # No more chunks - accumulate and verify first state.
            accumulated = b''.join(data)
            struct = struct_pb2.Struct()
            struct.ParseFromString(accumulated)
            # Should contain the initial state data.
            expected_struct = struct_pb2.Struct()
            expected_struct.update({'messages': [test_message_1]})
            self.assertStructsEqual(expected_struct, struct)
            # Reset data for next chunk set.
            data = []
            break

        # Update the state - this should trigger a new set of chunks in
        # the stream.
        response = await echo.Reply(context, message=test_message_2)
        self.assertEqual(test_message_2, response.message)

        # The stream should continue and give us the updated state.
        async for response in response_stream:
            data.append(response.data)
            # Check if there are more chunks.
            if response.chunk < response.total - 1:
                continue
            # No more chunks - accumulate and verify updated state.
            accumulated = b''.join(data)
            struct = struct_pb2.Struct()
            struct.ParseFromString(accumulated)
            # Should contain both messages now.
            expected_struct = struct_pb2.Struct()
            expected_struct.update(
                {'messages': [test_message_1, test_message_2]}
            )
            self.assertStructsEqual(expected_struct, struct)
            break

    async def test_get_state_single_server(self) -> None:
        """Test GetState RPC with single server."""
        await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
            local_envoy=True,
            local_envoy_tls=True,  # For TLS/SSL test coverage.
            servers=1,
        )
        await self._do_get_state_test()

    async def test_get_state_multiple_servers(self) -> None:
        """Test GetState RPC with multiple servers."""
        await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
            local_envoy=True,
            local_envoy_tls=True,  # For TLS/SSL test coverage.
            servers=2,
        )
        await self._do_get_state_test()

    async def test_get_state_admin_auth(self) -> None:
        """Test GetState RPC requires proper admin authentication."""
        # Change the admin secret so the client's bearer token
        # no longer matches. This should cause authentication
        # failure.
        os.environ[ENVVAR_SECRET_REBOOT_ADMIN_TOKEN] = 'wrong-secret'

        await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
            local_envoy=True,
            local_envoy_tls=True,  # For TLS/SSL test coverage.
            servers=1,
        )

        # Create a minimal GetState call that should fail auth.
        channel = grpc.aio.secure_channel(
            self.rbt.localhost_direct_endpoint(),
            grpc.ssl_channel_credentials(
                root_certificates=LOCALHOST_CRT_DATA,
            )
        )
        stub = inspect_pb2_grpc.InspectStub(channel)

        # Create state ref and metadata.
        state_ref = StateRef.from_id(
            StateTypeName('tests.reboot.Echo'),
            'test-state',
        )
        metadata = admin_auth_metadata(
        ) + ((STATE_REF_HEADER, state_ref.to_str()),)

        # Running the test should now fail because of the wrong secret.
        response_stream = stub.GetState(
            GetStateRequest(),
            metadata=metadata,
        )

        with self.assertRaises(
            grpc.aio.AioRpcError,
        ) as error:
            async for _ in response_stream:
                pass
        self.assertIn(
            'Bearer token does not match the admin secret',
            str(error.exception),
        )

    async def _do_get_state_nonexistent_state_type_test(self) -> None:
        """Helper method to test GetState RPC with non-existent state type."""
        channel = grpc.aio.secure_channel(
            self.rbt.localhost_direct_endpoint(),
            grpc.ssl_channel_credentials(
                root_certificates=LOCALHOST_CRT_DATA,
            )
        )
        stub = inspect_pb2_grpc.InspectStub(channel)

        # Request state for a non-existent state type should result in
        # NOT_FOUND error.
        state_ref = StateRef.from_id(
            StateTypeName('nonexistent.StateType'),
            'test-id',
        )
        metadata = admin_auth_metadata(
        ) + ((STATE_REF_HEADER, state_ref.to_str()),)

        response_stream = stub.GetState(
            GetStateRequest(),
            metadata=metadata,
        )

        # Should raise a NOT_FOUND gRPC error for non-existent state
        # type.
        with self.assertRaises(grpc.aio.AioRpcError) as error:
            async for _ in response_stream:
                pass

        # Verify it's specifically a NOT_FOUND error.
        self.assertEqual(error.exception.code(), grpc.StatusCode.NOT_FOUND)

    async def test_get_state_nonexistent_state_type_single_server(
        self
    ) -> None:
        """Test GetState RPC with non-existent state type and single server."""
        await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
            local_envoy=True,
            local_envoy_tls=True,  # For TLS/SSL test coverage.
            servers=1,
        )
        await self._do_get_state_nonexistent_state_type_test()

    async def test_get_state_nonexistent_state_type_multiple_servers(
        self
    ) -> None:
        """Test GetState RPC with non-existent state type and multiple servers."""
        await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
            local_envoy=True,
            local_envoy_tls=True,  # For TLS/SSL test coverage.
            servers=2,
        )
        await self._do_get_state_nonexistent_state_type_test()

    async def _do_get_state_chunking_test(self) -> None:
        """
        Test GetState RPC with large messages that must be chunked.
        """
        context = self.rbt.create_external_context(name=self.id())
        channel = grpc.aio.secure_channel(
            self.rbt.localhost_direct_endpoint(),
            grpc.ssl_channel_credentials(
                root_certificates=LOCALHOST_CRT_DATA,
            )
        )
        stub = inspect_pb2_grpc.InspectStub(channel)

        expected_service = 'tests.reboot.Echo'
        test_state_id = str(uuid4())

        # Create an Echo actor with a small initial message.
        echo = Echo.ref(test_state_id)
        initial_message = f'Initial message for {test_state_id}'
        response = await echo.Reply(context, message=initial_message)
        self.assertEqual(initial_message, response.message)

        # Start streaming GetState for the existing state.
        state_ref = StateRef.from_id(
            StateTypeName(expected_service),
            test_state_id,
        )
        metadata = admin_auth_metadata(
        ) + ((STATE_REF_HEADER, state_ref.to_str()),)

        response_stream = stub.GetState(
            GetStateRequest(),
            metadata=metadata,
        )

        # Accumulate the first chunked response (initial state).
        data = []
        async for response in response_stream:
            data.append(response.data)
            # Check if there are more chunks.
            if response.chunk < response.total - 1:
                continue
            # No more chunks - accumulate and verify first state.
            accumulated = b''.join(data)
            struct = struct_pb2.Struct()
            struct.ParseFromString(accumulated)
            # Should contain the initial state data.
            expected_struct = struct_pb2.Struct()
            expected_struct.update({'messages': [initial_message]})
            self.assertStructsEqual(expected_struct, struct)
            # Reset data for next chunk set.
            data = []
            break

        # Add 5 large messages of 512 KB each (total ~2.5 MB).
        # This ensures the final state will require chunking (> 1 MB
        # default chunk size).
        latin_words = [
            "lorem", "ipsum", "dolor", "sit", "amet", "consectetur",
            "adipiscing", "elit", "sed", "do", "eiusmod", "tempor",
            "incididunt", "ut", "labore", "et", "dolore", "magna", "aliqua"
        ]
        large_messages = []
        TARGET_BYTES = 512 * 1024  # 512 KB per message.
        for i in range(5):
            words = []
            current_size_bytes = 0
            word_index = 0

            while current_size_bytes < TARGET_BYTES:
                word = latin_words[word_index % len(latin_words)] + " "
                words.append(word)
                current_size_bytes += len(word)
                word_index += 1

            large_message = "".join(words)
            large_messages.append(large_message)
            logger.info(
                f"Sending large message {i} of {len(large_message)} bytes"
            )
            response = await echo.Reply(context, message=large_message)
            self.assertEqual(large_message, response.message)

        # Now read from the stream until we get the expected final
        # state.
        expected_messages = [initial_message] + large_messages
        expected_struct = struct_pb2.Struct()
        expected_struct.update({'messages': expected_messages})

        updates_seen = 0
        struct = None
        while True:
            async for response in response_stream:
                data.append(response.data)
                # Log chunking info for debugging.
                logger.info(
                    f"Update {updates_seen}: Received chunk "
                    f"{response.chunk + 1}/{response.total}, "
                    f"size: {len(response.data)} bytes"
                )
                # Check if there are more chunks.
                if response.chunk < response.total - 1:
                    continue
                # No more chunks - accumulate and check state.
                accumulated = b''.join(data)
                struct = struct_pb2.Struct()
                struct.ParseFromString(accumulated)

                updates_seen += 1
                # Count messages in the struct.
                num_messages = 0
                if 'messages' in struct.fields:
                    messages_value = struct.fields['messages']
                    if messages_value.HasField('list_value'):
                        num_messages = len(messages_value.list_value.values)
                logger.info(
                    f"Update {updates_seen}: Got {num_messages} messages, "
                    f"total size: {len(accumulated)} bytes"
                )

                # Check if we have the final expected state.
                if struct == expected_struct:
                    logger.info(
                        f"Successfully received all {len(expected_messages)} "
                        f"messages after {updates_seen} updates"
                    )
                    self.assertStructsEqual(expected_struct, struct)

                    # Verify that the final response was chunked (should
                    # be ~2.5MB). With 5 large messages of 512KB each
                    # plus initial message.
                    self.assertGreater(
                        response.total, 1,
                        f"Expected final response with ~2.5MB of data to be "
                        f"chunked, but got only {response.total} chunk(s)"
                    )
                    logger.info(
                        f"✓ Final response was properly chunked: "
                        f"{response.total} chunks for {len(accumulated)} bytes"
                    )
                    return  # Test passed!

                # Reset data for next update.
                data = []
                break

            # Safety check to avoid infinite loop.
            if updates_seen > 10:
                self.fail(
                    f"Did not receive expected state after {updates_seen} "
                    f"updates. Last struct: {struct}"
                )

    async def test_get_state_chunking_single_server(self) -> None:
        """Test GetState RPC with multiple messages and single server."""
        await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
            local_envoy=True,
            local_envoy_tls=True,  # For TLS/SSL test coverage.
            servers=1,
        )
        await self._do_get_state_chunking_test()

    async def test_get_state_chunking_multiple_servers(self) -> None:
        """Test GetState RPC with multiple messages and multiple servers."""
        await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
            local_envoy=True,
            local_envoy_tls=True,  # For TLS/SSL test coverage.
            servers=2,
        )
        await self._do_get_state_chunking_test()


if __name__ == '__main__':
    unittest.main(verbosity=2)
