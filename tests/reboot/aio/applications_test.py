import unittest
from log.log import get_logger
from reboot.aio.applications import Application
from reboot.aio.external import InitializeContext
from reboot.aio.servicers import Servicer
from reboot.aio.tests import Reboot
from reboot.aio.types import ServiceName, StateTypeName
from reboot.std.collections.v1.sorted_map import SortedMap, sorted_map_library
from tests.reboot.greeter_servicers import MyClockServicer, MyGreeterServicer

logger = get_logger(__name__)


# Minimal `Servicer` stubs for testing `_mount_mcp` behavior.
# Only the attributes accessed by `_mount_mcp` need real values.
class _StubAutoConstructA(Servicer):
    __service_names__ = [ServiceName("test.v1.ServiceA")]
    __state_type_name__ = StateTypeName("test.v1.StateA")
    _is_auto_construct = True


class _StubAutoConstructB(Servicer):
    __service_names__ = [ServiceName("test.v1.ServiceB")]
    __state_type_name__ = StateTypeName("test.v1.StateB")
    _is_auto_construct = True


class TestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_initialize_is_internal(self) -> None:
        """
        Tests that the `initialize` method run by Application is given
        application-internal credentials.
        """

        async def initialize(context: InitializeContext) -> None:
            # A SortedMap requires application-internal credentials, so calling
            # it successfully means that the `initialize` method was given the
            # appropriate credentials.
            await SortedMap.ref("unimportant").Insert(
                context,
                entries={"Foo": b"Bar"},
            )

        application = Application(
            libraries=[sorted_map_library()],
            initialize=initialize,
        )

        await self.rbt.up(application)

    async def test_incorrect_arguments(self) -> None:
        """
        Tests that when a developer accidentally passes incorrectly-typed
        values to `Application`, they are told at runtime if the mistake is not
        caught at static-check-time.
        """
        with self.assertRaises(ValueError) as e:
            Application(
                servicers=[MyGreeterServicer()]  # type: ignore[list-item]
            )
        self.assertEqual(
            "The `servicers` parameter contains a 'MyGreeterServicer' object, "
            "but was expecting only classes. Try passing `MyGreeterServicer` "
            "instead of `MyGreeterServicer(...)`",
            str(e.exception),
        )

        with self.assertRaises(ValueError) as e:
            Application(
                servicers=[MyClockServicer]  # type: ignore[list-item]
            )
        self.assertEqual(
            "The `servicers` parameter contains 'MyClockServicer', which is "
            "not a Reboot servicer. If it is a legacy gRPC servicer it "
            "should be passed in via the `legacy_grpc_servicers` parameter "
            "instead",
            str(e.exception),
        )

        with self.assertRaises(ValueError) as e:
            Application(
                legacy_grpc_servicers=[
                    MyClockServicer()  # type: ignore[list-item]
                ]
            )
        self.assertEqual(
            "The `legacy_grpc_servicers` parameter contains a "
            "'MyClockServicer' object, but was expecting only classes. Try "
            "passing `MyClockServicer` instead of `MyClockServicer(...)`",
            str(e.exception),
        )

        with self.assertRaises(ValueError) as e:
            Application(
                legacy_grpc_servicers=[
                    MyGreeterServicer  # type: ignore[list-item]
                ]
            )
        self.assertEqual(
            "The `legacy_grpc_servicers` parameter contains "
            "'MyGreeterServicer', which is a Reboot servicer, not a legacy "
            "gRPC servicer. It should be passed in via the `servicers` "
            "parameter instead",
            str(e.exception),
        )

    async def test_multiple_auto_construct_types_raises(self) -> None:
        """Tests that having multiple servicers with
        `_is_auto_construct = True` raises a `ValueError`."""
        with self.assertRaises(ValueError) as e:
            Application(servicers=[
                _StubAutoConstructA,
                _StubAutoConstructB,
            ])
        msg = str(e.exception)
        self.assertIn("Multiple auto-construct state types", msg)
        self.assertIn("test.v1.StateA", msg)
        self.assertIn("test.v1.StateB", msg)


if __name__ == "__main__":
    unittest.main()
