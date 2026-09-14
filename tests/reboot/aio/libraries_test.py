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


GREETER_4_LIBRARY_NAME = "tests.reboot.aio.libraries_test.Greeter4Library"


class Greeter4Library(Library):
    """A library with no servicers, requiring a library that itself
    requires another."""

    name = GREETER_4_LIBRARY_NAME

    def servicers(self):
        return []

    def requirements(self):
        return [GREETER_2_LIBRARY_NAME]


def greeter_library():
    return GreeterLibrary()


def greeter2_library():
    return Greeter2Library()


def greeter3_library():
    return Greeter3Library()


def greeter4_library():
    return Greeter4Library()


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

    async def test_adds_required_libraries(self) -> None:
        application = Application(libraries=[greeter2_library()])

        # The required library is added, with its servicers.
        self.assertEqual(
            {GreeterLibrary, Greeter2Library},
            set(type(library) for library in application.libraries),
        )
        self.assertIn(MyGreeterServicer, application.servicers)
        self.assertIn(Greeter2Servicer, application.servicers)

    async def test_adds_required_libraries_transitively(self) -> None:
        application = Application(libraries=[greeter4_library()])

        self.assertEqual(
            {GreeterLibrary, Greeter2Library, Greeter4Library},
            set(type(library) for library in application.libraries),
        )

    async def test_keeps_listed_instance_of_required_library(self) -> None:
        greeter = greeter_library()
        application = Application(
            libraries=[greeter2_library(), greeter],
        )

        # The listed instance is used rather than a fresh one.
        self.assertEqual(2, len(application.libraries))
        self.assertTrue(
            any(library is greeter for library in application.libraries)
        )

    async def test_throws_if_requirement_unknown(self) -> None:

        class NeedsUnknownLibrary(Library):

            name = "tests.reboot.aio.libraries_test.NeedsUnknownLibrary"

            def servicers(self):
                return []

            def requirements(self):
                return ["tests.reboot.aio.libraries_test.Unknown"]

        with self.assertRaises(ValueError) as error:
            Application(libraries=[NeedsUnknownLibrary()])

        self.assertIn(
            "requires library `tests.reboot.aio.libraries_test.Unknown`, "
            "which is not one Reboot can construct itself",
            str(error.exception),
        )

    async def test_throws_if_requirement_needs_arguments(self) -> None:

        class NeedsArgumentLibrary(Library):

            name = "tests.reboot.aio.libraries_test.NeedsArgumentLibrary"

            def __init__(self, argument: str):
                self.argument = argument

            def servicers(self):
                return [MyGreeterServicer]

        class RequiresNeedsArgumentLibrary(Library):

            name = (
                "tests.reboot.aio.libraries_test."
                "RequiresNeedsArgumentLibrary"
            )

            def servicers(self):
                return []

            def requirements(self):
                return [NeedsArgumentLibrary.name]

        with self.assertRaises(ValueError) as error:
            Application(libraries=[RequiresNeedsArgumentLibrary()])

        self.assertIn(
            "can not be constructed without arguments",
            str(error.exception),
        )

        # Listing a constructed instance satisfies the requirement.
        application = Application(
            libraries=[
                RequiresNeedsArgumentLibrary(),
                NeedsArgumentLibrary("argument"),
            ]
        )
        self.assertEqual(2, len(application.libraries))

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

            name = "tests.reboot.aio.libraries_test.Library1WithInitialize"

            def servicers(self):
                return [MyGreeterServicer]

            async def initialize(self, context: InitializeContext) -> None:
                nonlocal initialize1_called
                initialize1_called = True

        class Library2WithInitialize(Library):
            """Library with an initialize function."""

            name = "tests.reboot.aio.libraries_test.Library2WithInitialize"

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
