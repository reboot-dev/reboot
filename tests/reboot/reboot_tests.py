import string
import sys
import unittest
from rbt.v1alpha1 import errors_pb2, tasks_pb2, tasks_pb2_grpc
from reboot.aio.applications import Application
from reboot.aio.auth.admin_auth import ADMIN_SECRET_NAME
from reboot.aio.external import ExternalContext
from reboot.aio.headers import AUTHORIZATION_HEADER
from reboot.aio.secrets import MockSecretSource, Secrets
from reboot.aio.tests import Reboot
from reboot.aio.types import ApplicationId, StateRef, StateTypeName
from reboot.controller.application_config import LocalApplicationConfig
from reboot.server.service_descriptor_validator import ProtoValidationError
from tests.reboot import echo_rbt
from tests.reboot.bank import BankServicer
from tests.reboot.echo_rbt import Echo, EchoWriterStub
from tests.reboot.echo_servicers import MyEchoServicer
from tests.reboot.greeter_rbt import Greeter
from tests.reboot.greeter_servicers import MyGreeterServicer

_ECHO_ID = 'test-5678'
_ECHO_REF = StateRef.from_id(Echo.__state_type_name__, _ECHO_ID)

TEST_ADMIN_SECRET = 'test-admin-secret'


class RebootTestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        Secrets.set_secret_source(
            MockSecretSource({ADMIN_SECRET_NAME: TEST_ADMIN_SECRET.encode()})
        )

        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    # Comment out the test while we are in the middle of 'snake_case' renaming,
    # since we remove 'abstractmethod' annotation from the base class methods.
    # The user experience for now: it will raise 'UnimplementedError' when
    # trying to call a method that is not implemented, instead of raising
    # 'TypeError' when trying to instantiate the servicer.
    #
    # TODO: re-enable this test once the renaming is done.
    #
    # async def test_echo_servicer_must_implement_all_methods(self):
    #     # The generated base class for the Echo service does not implement
    #     # any of the required grpc methods. Instead of waiting until we have
    #     # brought up a server and start receiving network calls, we fail early:
    #     # you can not instantiate a servicer if it does not implement all the
    #     # specified service methods.
    #     self.assertRaises(TypeError, EchoServicer)

    async def test_rbt_up_single_server(self) -> None:
        await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
            servers=1,  # For coverage of the single-server special case.
        )

        context = self.rbt.create_external_context(name=self.id())

        echo_stub = EchoWriterStub(context, state_ref=_ECHO_REF)
        message = 'Hello, test world'
        response = await echo_stub.Reply(
            echo_rbt.ReplyRequest(message=message)
        )
        self.assertEqual(message, response.message)

    async def test_rbt_up_multiple_servers(self) -> None:
        """
        Tests that traffic flows correctly (from unit tests) when there are
        multiple serving servers.
        """
        revision = await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
        )

        # Confirm that the expected number of servers came up.
        self.assertEqual(
            4,
            len(
                self.rbt._placement_client.known_servers(
                    revision.config.application_id()
                )
            ),
        )

        context = self.rbt.create_external_context(name=self.id())

        message = 'Hello, test world'
        for suffix in string.ascii_lowercase:
            echo = Echo.ref(f'test-{suffix}')
            response = await echo.Reply(context, message=message)
            self.assertEqual(message, response.message)

    async def test_rbt_up_empty_servicers(self) -> None:
        with self.assertRaises(ValueError) as error:
            await self.rbt.up(Application(servicers=[]))

        self.assertEqual(
            str(error.exception),
            "'servicers' can't be an empty list",
        )

    async def test_rbt_up_empty(self) -> None:
        with self.assertRaises(ValueError) as error:
            await self.rbt.up()

        self.assertEqual(
            str(error.exception),
            "Must pass one of 'application' or 'revision'",
        )

    async def test_rbt_down(self) -> None:
        # First bring up a service and check that it can handle traffic.
        await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
        )
        context = self.rbt.create_external_context(name=self.id())

        echo = Echo.ref(_ECHO_ID)
        message = 'Hello, test world'
        response = await echo.Reply(
            context,
            message=message,
        )
        self.assertEqual(message, response.message)

        # Now bring it down and make sure the service has stopped serving.
        await self.rbt.down()

        with self.assertRaises(Echo.StreamAborted) as aborted:
            # Call a streaming RPC - those are not retried in case of
            # unavailable backends, so we should get an error.
            async for _ in echo.Stream(context):
                self.fail("Should not have received a response")

        self.assertEqual(type(aborted.exception.error), errors_pb2.Unavailable)

    async def test_rbt_recovery(self) -> None:
        # First bring up a service and check that it can handle traffic.
        revision = await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
        )

        context = self.rbt.create_external_context(name=self.id())

        echo = Echo.ref(_ECHO_ID)
        message = 'Hello, test world'
        response = await echo.Reply(context, message=message)
        self.assertEqual(message, response.message)

        # Also use a reader method; this initializes the reader stub under the
        # hood.
        async for stream_response in echo.Stream(context):
            self.assertEqual(message, stream_response.message)
            break

        # Now bring down the app and make sure the service has stopped
        # serving.
        await self.rbt.down()

        with self.assertRaises(Echo.StreamAborted) as aborted:
            # Call a streaming RPC - those are not retried in case of
            # unavailable backends, so we should get an error.
            #
            # We already had an open reader stub to the backend, so the
            # fact that it just disappeared should result in an
            # `Unavailable` error.
            async for _ in echo.stream(context):
                self.fail("Should not have received a response")

        self.assertEqual(type(aborted.exception.error), errors_pb2.Unavailable)

        # Now bring the config back up and make sure that the state
        # was recovered.
        await self.rbt.up(revision=revision)

        # We must create a new `WeakReference` to `Echo` now that the
        # state/service has moved (since the old `WeakReference`'s reader stub
        # will remain connected to the old location).
        #
        # ISSUE(https://github.com/reboot-dev/mono/issues/1985): introduce
        # a retry policy, so that stubs can automatically reconnect.
        echo = Echo.ref(_ECHO_ID)
        replay_response = await echo.replay(context)
        self.assertEqual([message], replay_response.messages)

    # Comment out the test while we are in the middle of 'snake_case' renaming,
    # since we remove 'abstractmethod' annotation from the base class methods.
    # The user experience for now: it will raise 'UnimplementedError' when
    # trying to call a method that is not implemented, instead of raising
    # 'TypeError' when trying to instantiate the servicer.
    #
    # TODO: re-enable this test once the renaming is done.
    #
    # async def test_rbt_up_abstract_class(self) -> None:
    #     """Attempt to bring up a servicer with missing service method
    #     implementations. This should fail.
    #     """
    #     with self.assertRaises(InputError) as raised_context:
    #         # EchoServicer is the fully-abstract base class. It is missing many
    #         # method implementations.
    #         await self.rbt.up(Application(servicers=[EchoServicer]))

    #     self.assertIn(
    #         "Failed to instantiate servicer", str(raised_context.exception)
    #     )

    async def test_rbt_recovery_tasks(self) -> None:
        # First bring up a service and start a task.
        revision = await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
        )

        context = self.rbt.create_external_context(name=self.id())

        echo = Echo.ref(_ECHO_ID)

        task = await echo.spawn().Hanging(context)

        task_id = task.task_id

        # Check that the created task is pending.
        channel = context.channel_manager.get_channel_to_state(
            StateTypeName(task_id.state_type),
            StateRef(task_id.state_ref),
        )
        stub = tasks_pb2_grpc.TasksStub(channel)
        list_tasks_response = await stub.ListTasks(
            tasks_pb2.ListTasksRequest(),
            metadata=((AUTHORIZATION_HEADER, f'Bearer {TEST_ADMIN_SECRET}'),),
        )
        self.assertEqual(len(list_tasks_response.tasks), 1)
        self.assertEqual(list_tasks_response.tasks[0].task_id, task_id)
        self.assertEqual(
            list_tasks_response.tasks[0].status,
            tasks_pb2.TaskInfo.Status.STARTED,
        )

        # Now bring down the app while the task is still running.
        await self.rbt.down()

        # Now bring the app back up.
        await self.rbt.up(revision=revision)

        # Check that the task is again pending. We need to create a new stub to
        # pick up the new address.
        channel = context.channel_manager.get_channel_to_state(
            StateTypeName(task_id.state_type),
            StateRef(task_id.state_ref),
        )
        stub = tasks_pb2_grpc.TasksStub(channel)
        list_tasks_response = await stub.ListTasks(
            tasks_pb2.ListTasksRequest(),
            metadata=((AUTHORIZATION_HEADER, f'Bearer {TEST_ADMIN_SECRET}'),),
        )

        self.assertEqual(len(list_tasks_response.tasks), 1)
        self.assertEqual(list_tasks_response.tasks[0].task_id, task_id)
        self.assertEqual(
            list_tasks_response.tasks[0].status,
            tasks_pb2.TaskInfo.Status.STARTED,
        )

    async def test_rbt_recovery_no_config(self) -> None:
        # First bring up a service and check that it can handle traffic.
        await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
        )

        context = self.rbt.create_external_context(name=self.id())

        echo = Echo.ref(_ECHO_ID)

        message = 'Hello, test world'

        response = await echo.Reply(context, message=message)
        self.assertEqual(message, response.message)

        # Now bring down the whole rbt system.
        await self.rbt.down()

        with self.assertRaises(Echo.StreamAborted) as aborted:
            # Call a streaming RPC - those are not retried in case of
            # unavailable backends, so we should get an error.
            #
            # This raises a `SystemAborted` because...
            # 1. There was no reader connection to the backend yet,
            #    and...
            # 2. The local resolver knows the backend is down, so it
            #    never even attempts to connect to it.
            async for _ in echo.Stream(context):
                self.fail("Should not have received a response")

        self.assertEqual(type(aborted.exception.error), errors_pb2.Unavailable)

        # Now bring the servicer back up and see it serving traffic.
        await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
        )

        # Need to create a new context to avoid idempotency uncertainty.
        # Therefore, we must also create a new `Echo`, since each `Echo` may
        # only be used with one context.
        context = self.rbt.create_external_context(name=self.id())
        echo = Echo.ref(_ECHO_ID)

        response = await echo.Reply(context, message=message)
        self.assertEqual(message, response.message)

    @unittest.skipIf(
        sys.platform == "darwin", "This test requires Docker for "
        "the LocalEnvoy, which is unavailable on the MacOS GitHub Runner."
    )
    async def test_rbt_local_envoy_recovery(self) -> None:
        # Bring up a service with local Envoy running.
        revision = await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
            local_envoy=True,
            local_envoy_tls=True,  # For SSL/TLS test coverage.
            servers=1,  # Cover single-server with local envoy case.
        )

        # Test that gRPC traffic can reach the service via the Envoy proxy.
        envoy_url = self.rbt.https_localhost_direct_url()
        context = ExternalContext(name=self.id(), url=envoy_url)

        echo = Echo.ref("test-1234")
        message = 'Hello, test world'
        response = await echo.Reply(context, message=message)
        self.assertEqual(message, response.message)

        # Bring the app down and back up again. The Reboot system should have
        # saved the fact that it was originally brought up with local Envoy and
        # should restart Envoy, so we should again get a response when sending a
        # request via a new Envoy proxy.
        await self.rbt.down()

        await self.rbt.up(revision=revision)

        envoy_url = self.rbt.https_localhost_direct_url()
        context = ExternalContext(name=self.id(), url=envoy_url)

        echo = Echo.ref("test-1234")
        response = await echo.Reply(context, message=message)
        self.assertEqual(message, response.message)

        # Do the same thing, but bring the service back up by passing it in
        # again rather than using the config.
        await self.rbt.down()
        await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
            local_envoy=True,
            local_envoy_tls=True,  # For SSL/TLS test coverage.
            # This time cover the multiple servers case.
        )

        envoy_url = self.rbt.https_localhost_direct_url()
        context = ExternalContext(name=self.id(), url=envoy_url)

        echo = Echo.ref("test-1234")
        response = await echo.Reply(context, message=message)
        self.assertEqual(message, response.message)

    async def test_double_up_without_down(self) -> None:
        await self.rbt.up(Application(servicers=[MyEchoServicer]))

        # Calling `up` twice without a `down` in between is not permitted.
        with self.assertRaises(ValueError) as error:
            await self.rbt.up(Application(servicers=[MyEchoServicer]))

        self.assertIn(
            "This application is already up; if you'd like to update it call "
            "`down()` before calling `up()` again",
            str(error.exception),
        )

    async def test_config_different_application_id(self) -> None:
        revision = await self.rbt.up(Application(servicers=[MyEchoServicer]))
        await self.rbt.down()

        # Try to bring up a config with a different application ID that contains
        # the same servicer. That's not permitted.
        revision.config = LocalApplicationConfig(
            # Changes the application ID.
            application_id=ApplicationId("something-new"),
            spec=revision.config.spec,
        )
        with self.assertRaises(ValueError) as error:
            await self.rbt.up(revision=revision)

        self.assertIn(
            "Revision config is for a different application",
            str(error.exception)
        )

    async def test_config_incompatible_schema(self) -> None:
        await self.rbt.up(Application(servicers=[MyEchoServicer]))
        await self.rbt.down()

        # Try to bring up a config with a different schema. That's not permitted.
        with self.assertRaises(ProtoValidationError):
            await self.rbt.up(Application(servicers=[BankServicer]))

    async def test_deep_recursive_message(self) -> None:
        await self.rbt.up(Application(servicers=[MyGreeterServicer]))

        context = self.rbt.create_external_context(name=self.id())

        greeter, _ = await Greeter.Create(
            context,
            title='Dr',
            name='Jonathan',
            adjective='best',
        )

        depth = 50
        await greeter.construct_and_store_recursive_message(
            context, depth=depth
        )

        read_response = await greeter.read_recursive_message(context)

        # Show that a recursive protobuf message can get serialized, as long as
        # it's within protobuf's limits on nestedness.
        self.assertEqual(
            read_response.message.message,
            f"Level {depth - 1}",
        )

        # Show that when protobuf's limits are exceeded, we produce a helpful
        # error message.
        depth = 1000
        with self.assertRaises(
            Greeter.ConstructAndStoreRecursiveMessageAborted
        ) as aborted:
            await greeter.construct_and_store_recursive_message(
                context,
                depth=depth,
            )
        self.assertIn(
            "This is usually caused by a deeply nested protobuf message, which "
            "is not supported by protobuf.\nSee the limits here: "
            "https://protobuf.dev/programming-guides/proto-limits/",
            str(aborted.exception),
        )


if __name__ == '__main__':
    unittest.main(verbosity=2)
