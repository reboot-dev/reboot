"""The paths a library's upstreams may claim."""

import unittest
from reboot.aio.applications import Application, Library
from reboot.aio.servicers import Servicer
from reboot.routing.upstreams import Upstream
from reboot.std.collections.v1.sorted_map import SortedMapServicer


def _upstream(prefix: str) -> Upstream:
    return Upstream(
        name=prefix.strip("/").replace("/", "-"),
        prefix=prefix,
        port=9000,
    )


class _StoreLibrary(Library):
    name = "store"

    def servicers(self) -> list[type[Servicer]]:
        return []

    def upstreams(self) -> list[Upstream]:
        return [_upstream("/__/store/")]


class _NestedLibrary(Library):
    name = "nested"

    def servicers(self) -> list[type[Servicer]]:
        return []

    def upstreams(self) -> list[Upstream]:
        return [_upstream("/__/store/nested/")]


class _OtherLibrary(Library):
    name = "other"

    def servicers(self) -> list[type[Servicer]]:
        return []

    def upstreams(self) -> list[Upstream]:
        return [_upstream("/__/other/")]


class UpstreamsTest(unittest.TestCase):

    def test_distinct_prefixes_are_all_forwarded(self) -> None:
        application = Application(
            servicers=[SortedMapServicer],
            libraries=[_StoreLibrary(), _OtherLibrary()],
        )
        self.assertEqual(
            [upstream.prefix for upstream in application.upstreams()],
            ["/__/other/", "/__/store/"],
        )

    def test_two_libraries_may_not_claim_overlapping_prefixes(
        self,
    ) -> None:
        application = Application(
            servicers=[SortedMapServicer],
            libraries=[_StoreLibrary(), _NestedLibrary()],
        )
        with self.assertRaises(ValueError) as raised:
            application.upstreams()
        self.assertIn("'/__/store/nested/'", str(raised.exception))
        self.assertIn("'/__/store/'", str(raised.exception))

    def test_a_prefix_may_not_overlap_the_applications_own_paths(
        self,
    ) -> None:
        application = Application(
            servicers=[SortedMapServicer],
            libraries=[_StoreLibrary()],
        )

        @application.http.get("/__/store/status")
        async def status():
            return {}

        with self.assertRaises(ValueError) as raised:
            application.upstreams()
        self.assertIn("answers itself", str(raised.exception))

    def test_a_route_with_a_parameter_under_the_prefix_is_an_overlap(
        self,
    ) -> None:
        application = Application(
            servicers=[SortedMapServicer],
            libraries=[_StoreLibrary()],
        )

        @application.http.get("/__/store/{id}")
        async def item(id: str):
            return {}

        with self.assertRaises(ValueError) as raised:
            application.upstreams()
        self.assertIn("'/__/store/{id}'", str(raised.exception))

    def test_a_route_whose_parameter_could_be_the_prefix_is_an_overlap(
        self,
    ) -> None:
        # `/{page}` answers `/__` and so takes nothing under
        # `/__/store/`, but `/{owner}/store/{id}` answers `/__/store/42`.
        application = Application(
            servicers=[SortedMapServicer],
            libraries=[_StoreLibrary()],
        )

        @application.http.get("/{owner}/store/{id}")
        async def item(owner: str, id: str):
            return {}

        with self.assertRaises(ValueError) as raised:
            application.upstreams()
        self.assertIn("'/{owner}/store/{id}'", str(raised.exception))

    def test_a_path_parameter_takes_everything_under_it(self) -> None:
        application = Application(
            servicers=[SortedMapServicer],
            libraries=[_StoreLibrary()],
        )

        @application.http.get("/__/{rest:path}")
        async def anything(rest: str):
            return {}

        with self.assertRaises(ValueError) as raised:
            application.upstreams()
        self.assertIn("'/__/{rest:path}'", str(raised.exception))

    def test_a_parameter_beside_the_prefix_is_not_an_overlap(self) -> None:
        application = Application(
            servicers=[SortedMapServicer],
            libraries=[_StoreLibrary()],
        )

        # `/__/other/{id}` is a sibling; `/{page}` answers one segment,
        # which `/__/store/...` never is.
        @application.http.get("/__/other/{id}")
        async def other(id: str):
            return {}

        @application.http.get("/{page}")
        async def page(page: str):
            return {}

        self.assertEqual(len(application.upstreams()), 1)

    def test_a_library_may_not_claim_the_root(self) -> None:

        class _RootLibrary(Library):
            name = "root"

            def servicers(self) -> list[type[Servicer]]:
                return []

            def upstreams(self) -> list[Upstream]:
                return [_upstream("/")]

        application = Application(
            servicers=[SortedMapServicer],
            libraries=[_RootLibrary()],
        )
        with self.assertRaises(ValueError) as raised:
            application.upstreams()
        self.assertIn("the root", str(raised.exception))

    def test_a_prefix_may_not_overlap_reboots_own_paths(self) -> None:

        class _FrontendLibrary(Library):
            name = "frontend"

            def servicers(self) -> list[type[Servicer]]:
                return []

            def upstreams(self) -> list[Upstream]:
                return [_upstream("/__/frontend/assets/")]

        application = Application(
            servicers=[SortedMapServicer],
            libraries=[_FrontendLibrary()],
        )
        with self.assertRaises(ValueError) as raised:
            application.upstreams()
        self.assertIn("Reboot answers itself", str(raised.exception))

    def test_a_sibling_path_is_not_an_overlap(self) -> None:
        application = Application(
            servicers=[SortedMapServicer],
            libraries=[_StoreLibrary()],
        )

        @application.http.get("/__/storefront")
        async def storefront():
            return {}

        self.assertEqual(len(application.upstreams()), 1)


if __name__ == "__main__":
    unittest.main()
