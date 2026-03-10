import unittest
from reboot.aio.applications import Application, Library
from reboot.aio.external import InitializeContext
from reboot.aio.tests import Reboot
from tests.reboot.greeter_servicers import MyGreeterServicer


class Greeter2Servicer(MyGreeterServicer):
    """Totally fake, but just need another servicer to work with."""
    pass


class Greeter3Servicer(MyGreeterServicer):
    """Totally fake, but just need another servicer to work with."""
    pass


GREETER_LIBRARY_NAME = "tests.reboot.aio.libraries_test.GreeterLibrary"


class GreeterLibrary(Library):
    """A library with 1 servicer, and no dependent libraries"""

    name = GREETER_LIBRARY_NAME

    def servicers(self):
        return [MyGreeterServicer]


GREETER_2_LIBRARY_NAME = "tests.reboot.aio.libraries_test.Greeter2Library"


class Greeter2Library(Library):
    """A library with 1 servicer, and a fake dependent library."""

    name = GREETER_2_LIBRARY_NAME

    def servicers(self):
        return [Greeter2Servicer]

    def requirements(self):
        return [GREETER_LIBRARY_NAME]


GREETER_3_LIBRARY_NAME = "tests.reboot.aio.libraries_test.Greeter3Library"


class Greeter3Library(Library):
    """A library with 1 servicer, and a fake dependent library."""

    name = GREETER_3_LIBRARY_NAME

    def servicers(self):
        return [Greeter3Servicer]

    def requirements(self):
        return [GREETER_LIBRARY_NAME]


def greeter_library():
    return GreeterLibrary()


def greeter2_library():
    return Greeter2Library()


def greeter3_library():
    return Greeter3Library()


class TestCase(unittest.IsolatedAsyncioTestCase):

    async def test_adds_servicers(self) -> None:
        application = Application(libraries=[greeter_library()])

        # Make sure we have the expected library.
        self.assertEqual(1, len(application.libraries))
        self.assertIn(
            GreeterLibrary, [type(lib) for lib in application.libraries]
        )

        # Make sure we have the expected servicer.
        self.assertIn(MyGreeterServicer, application.servicers)

    async def test_dedupes_libraries(self) -> None:
        with self.assertRaises(ValueError) as error:
            Application(libraries=[
                greeter_library(),
                greeter_library(),
            ])

        self.assertIn(
            "contains multiple libraries with the same name",
            str(error.exception)
        )

    async def test_dedupes_dependent_libraries(self) -> None:
        application = Application(
            libraries=[
                greeter_library(),
                greeter2_library(),
                greeter3_library(),
            ]
        )

        # Make sure we have the expected libraries, and only one of each.
        self.assertEqual(3, len(application.libraries))
        libraries = set(type(lib) for lib in application.libraries)
        self.assertIn(GreeterLibrary, libraries)
        self.assertIn(Greeter2Library, libraries)
        self.assertIn(Greeter3Library, libraries)

    async def test_adds_dependent_library_servicers(self) -> None:
        application = Application(
            libraries=[
                greeter_library(),
                greeter2_library(),
                greeter3_library(),
            ]
        )

        # Make sure we have the expected libraries.
        self.assertIn(MyGreeterServicer, application.servicers)
        self.assertIn(Greeter2Servicer, application.servicers)
        self.assertIn(Greeter3Servicer, application.servicers)

    async def test_throws_if_not_all_requirements_present(self) -> None:
        with self.assertRaises(ValueError) as error:
            Application(libraries=[greeter2_library()])
        self.assertEqual(type(error.exception), ValueError)

        self.assertIn(
            f"Missing required libraries: {GREETER_LIBRARY_NAME}",
            str(error.exception)
        )

    async def test_require_class_name(self) -> None:
        with self.assertRaises(NotImplementedError) as error:

            class NeedsNameLibrary(Library):

                def servicers(self):
                    return [MyGreeterServicer]

        self.assertIn(
            "Please set `name` as a class variable.",
            str(error.exception),
        )

    async def test_initialize(self) -> None:
        initialize1_called = False
        initialize2_called = False

        class Library1WithInitialize(Library):
            """Library with an initialize function."""

            name = "tests.reboot.aio.libraries_test.GreeterLibrary"

            def servicers(self):
                return [MyGreeterServicer]

            async def initialize(self, context: InitializeContext) -> None:
                nonlocal initialize1_called
                initialize1_called = True

        class Library2WithInitialize(Library):
            """Library with an initialize function."""

            name = "tests.reboot.aio.libraries_test.Greeter2Library"

            def servicers(self):
                return [MyGreeterServicer]

            async def initialize(self, context: InitializeContext) -> None:
                nonlocal initialize2_called
                initialize2_called = True

        rbt = Reboot()
        await rbt.start()

        # Start the `Application`.
        await rbt.up(
            Application(
                libraries=[
                    Library1WithInitialize(),
                    Library2WithInitialize(),
                ]
            )
        )

        # Check initialize was called.
        self.assertTrue(
            initialize1_called,
            "The initialize function for the first library was not called when using tests.Reboot.up()."
        )
        self.assertTrue(
            initialize2_called,
            "The initialize function for the second library was not called when using tests.Reboot.up()."
        )

        await rbt.stop()


if __name__ == "__main__":
    unittest.main()
