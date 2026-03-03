import unittest
from log.log import get_logger
from reboot.aio.applications import Application
from reboot.aio.external import InitializeContext
from reboot.aio.tests import Reboot
from reboot.std.collections.v1.sorted_map import SortedMap, sorted_map_library
from tests.reboot.greeter_servicers import MyClockServicer, MyGreeterServicer

logger = get_logger(__name__)


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


if __name__ == "__main__":
    unittest.main()
