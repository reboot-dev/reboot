import argparse
import importlib
import sys
import unittest
from reboot.aio.applications import Application
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WriterContext
from reboot.aio.tests import Reboot
from tests.reboot.protoc.shared_pb2 import Empty, Text
from types import ModuleType


def run_test(
    echo_state_rbt_module: ModuleType,
    reply_client_rbt_module: ModuleType,
    last_message_client_rbt_module: ModuleType,
):

    class EchoServicer(
        echo_state_rbt_module.Echo.Servicer  # type: ignore[name-defined]
    ):

        def authorizer(self):
            return allow()

        async def Reply(
            self,
            context: WriterContext,
            request: Text,
        ) -> Text:
            self.state.last_message.CopyFrom(request)
            return Text(content=request.content)

        async def LastMessage(
            self,
            context: ReaderContext,
            request: Empty,
        ) -> Text:
            return self.state.last_message

    class EchoTestCase(unittest.IsolatedAsyncioTestCase):

        async def asyncSetUp(self) -> None:
            self.rbt = Reboot()
            await self.rbt.start()

        async def asyncTearDown(self) -> None:
            await self.rbt.stop()

        async def test_end_to_end(self) -> None:
            await self.rbt.up(
                Application(servicers=[EchoServicer]),
            )
            context = self.rbt.create_external_context(name=self.id())

            # Use both methods on the _state_ type, to demonstrate state types
            # are also clients for all their methods.
            Echo = echo_state_rbt_module.Echo  # type: ignore[attr-defined]
            echo = Echo.ref("test-id")
            response = await echo.Reply(context, content="hello")
            self.assertEqual("hello", response.content)
            response = await echo.LastMessage(context)
            self.assertEqual("hello", response.content)

            # Spawning tasks should also work.
            task = await echo.spawn().Reply(context, content="future")
            response = await task
            self.assertEqual("future", response.content)
            task = await echo.spawn().LastMessage(context)
            response = await task
            self.assertEqual("future", response.content)

            # Use the _client_ type(s) to call both methods. The two methods may
            # be accessed using different client types, or they may be the same.
            Echo = reply_client_rbt_module.Echo  # type: ignore[attr-defined]
            echo_reply_client = Echo.ref("fixed-id")
            response = await echo_reply_client.Reply(
                context, content="hello, client-only world!"
            )
            self.assertEqual("hello, client-only world!", response.content)

            Echo = last_message_client_rbt_module.Echo  # type: ignore[attr-defined]
            echo_last_message_client = Echo.ref("fixed-id")
            response = await echo_last_message_client.LastMessage(context)
            self.assertEqual("hello, client-only world!", response.content)

            # Spawning tasks should also work.
            task = await echo_reply_client.spawn().Reply(
                context, content="future client-only world!"
            )
            response = await task
            self.assertEqual("future client-only world!", response.content)

            task = await echo_last_message_client.spawn().LastMessage(context)
            response = await task
            self.assertEqual("future client-only world!", response.content)

    # Basic re-implementation of `unittest.main()`, but in a way that supports a
    # dynamically defined test case.
    runner = unittest.TextTestRunner()
    result = runner.run(EchoTestCase("test_end_to_end"))
    sys.exit(0 if result.wasSuccessful() else 1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--echo_state_rbt_module",
        help="the '[...]_rbt' module containing the 'Echo' type",
    )
    parser.add_argument(
        "--reply_client_rbt_module",
        help="the '[...]_rbt' module containing the  'Echo' client that has "
        "the 'Reply' method",
    )
    parser.add_argument(
        "--last_message_client_rbt_module",
        help="the '[...]_rbt' module containing the  'Echo' client that has "
        "the 'LastMessage' method",
    )
    args = parser.parse_args()

    run_test(
        echo_state_rbt_module=importlib.import_module(
            args.echo_state_rbt_module
        ),
        reply_client_rbt_module=importlib.import_module(
            args.reply_client_rbt_module
        ),
        last_message_client_rbt_module=importlib.import_module(
            args.last_message_client_rbt_module
        ),
    )
