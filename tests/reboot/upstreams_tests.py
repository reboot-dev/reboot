"""The paths a library's upstreams may claim."""

import unittest
from reboot.aio.applications import Application, Library
from reboot.aio.servicers import Servicer
from reboot.routing.envoy_config import Upstream
from reboot.std.collections.v1.sorted_map import SortedMapServicer


def _upstream(prefix: str) -> Upstream:
    return Upstream(
        name=prefix.strip("/").replace("/", "-"),
        prefix=prefix,
        host="127.0.0.1",
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
