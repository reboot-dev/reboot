import unittest
from google.protobuf.any_pb2 import Any
from google.protobuf.struct_pb2 import Value
from rbt.v1alpha1.errors_pb2 import PermissionDenied, StateAlreadyConstructed
from reboot.aio.applications import Application
from reboot.aio.auth.authorizers import allow, deny
from reboot.aio.tests import Reboot
from reboot.protobuf import as_str, from_str
from reboot.std.collections.ordered_map.v1.ordered_map import (
    InvalidRangeError,
    OrderedMap,
    ordered_map_library,
)


class TestOrderedMap(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def create_and_populate_ordered_map(
        self,
        context,
        degree=4,
    ) -> OrderedMap.WeakReference:
        ordered_map = OrderedMap.ref("test-map")

        await ordered_map.Create(
            context,
            degree=degree,
        )

        await ordered_map.Insert(
            context,
            key="a",
            value=from_str("A"),
        )

        await ordered_map.Insert(
            context,
            key="j",
            value=from_str("J"),
        )

        await ordered_map.Insert(
            context,
            key="m",
            value=from_str("M"),
        )

        await ordered_map.Insert(
            context,
            key="z",
            value=from_str("Z"),
        )

        return ordered_map

    async def test_insert_basic(self) -> None:
        """
        Test that we can insert multiple strings into the B+ tree
        in the correct lexicographic order and that a split correctly
        occurs when the number of elements in either an inner node or
        leaf node is equal to the order.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = OrderedMap.ref("test-map")
        await ordered_map.Create(context, degree=4)

        await ordered_map.Insert(
            context,
            key="b",
            value=from_str("B"),
        )

        await ordered_map.Insert(
            context,
            key="m",
            value=from_str("M"),
        )

        await ordered_map.Insert(
            context,
            key="z",
            value=from_str("Z"),
        )

        response = await ordered_map.Stringify(context)
        expected_b_tree = "Leaf: ['b', 'm', 'z']\n"
        self.assertEqual(response.value, expected_b_tree)

        # Adding another element should trigger a split since
        # the order is 4.
        await ordered_map.Insert(
            context,
            key="y",
            value=from_str("Y"),
        )

        response = await ordered_map.Stringify(context)
        # Check the B+ tree after the split.
        expected_b_tree = "Inner: ['y']\n  Leaf: ['b', 'm']\n  Leaf: ['y', 'z']\n"
        self.assertEqual(response.value, expected_b_tree)

        # Intentionally add a lower value to ensure that it is inserted
        # in the correct location.
        await ordered_map.Insert(
            context,
            key="a",
            value=from_str("A"),
        )

        response = await ordered_map.Stringify(context)
        expected_b_tree = "Inner: ['y']\n  Leaf: ['a', 'b', 'm']\n  Leaf: ['y', 'z']\n"
        self.assertEqual(response.value, expected_b_tree)

        # Insert a key into the middle of the tree.
        await ordered_map.Insert(
            context,
            key="c",
            value=from_str("C"),
        )

        response = await ordered_map.Stringify(context)
        expected_b_tree = "Inner: ['c', 'y']\n  Leaf: ['a', 'b']\n  Leaf: ['c', 'm']\n  Leaf: ['y', 'z']\n"
        self.assertEqual(response.value, expected_b_tree)

        # Add elements until the inner node splits.
        await ordered_map.Insert(
            context,
            key="d",
            value=from_str("D"),
        )

        await ordered_map.Insert(
            context,
            key="e",
            value=from_str("E"),
        )

        await ordered_map.Insert(
            context,
            key="f",
            value=from_str("F"),
        )

        await ordered_map.Insert(
            context,
            key="g",
            value=from_str("G"),
        )

        response = await ordered_map.Stringify(context)
        expected_b_tree = "Inner: ['g']\n  Inner: ['c', 'e']\n    Leaf: ['a', 'b']\n    Leaf: ['c', 'd']\n    Leaf: ['e', 'f']\n  Inner: ['y']\n    Leaf: ['g', 'm']\n    Leaf: ['y', 'z']\n"
        self.assertEqual(response.value, expected_b_tree)

    async def test_insert_duplicate(self) -> None:
        """
        Test that inserting a duplicate key successfully updates the
        value without changing the structure of the B+ tree.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = await self.create_and_populate_ordered_map(context)

        response = await ordered_map.Stringify(context)
        expected_b_tree = "Inner: ['m']\n  Leaf: ['a', 'j']\n  Leaf: ['m', 'z']\n"
        self.assertEqual(response.value, expected_b_tree)

        response = await ordered_map.Search(context, key="j")
        self.assertTrue(response.found)
        self.assertEqual(as_str(response.value), "J")

        # Insert a duplicate key with a different value.
        await ordered_map.Insert(
            context,
            key="j",
            value=from_str("New J"),
        )

        response = await ordered_map.Stringify(context)
        expected_b_tree = "Inner: ['m']\n  Leaf: ['a', 'j']\n  Leaf: ['m', 'z']\n"
        self.assertEqual(response.value, expected_b_tree)

        # Ensure that the value for the duplicate key is updated.
        response = await ordered_map.Search(context, key="j")
        self.assertTrue(response.found)
        self.assertEqual(as_str(response.value), "New J")

    async def test_search_basic(self) -> None:
        """
        Test that we can successfully search for all keys after building
        a B+ tree with multiple inserts and splits.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = OrderedMap.ref("test-map")
        await ordered_map.Create(context, degree=4)

        await ordered_map.Insert(
            context,
            key="b",
            value=from_str("B"),
        )

        await ordered_map.Insert(
            context,
            key="m",
            value=from_str("M"),
        )

        await ordered_map.Insert(
            context,
            key="z",
            value=from_str("Z"),
        )

        response = await ordered_map.Search(context, key="b")
        self.assertTrue(response.found)
        self.assertEqual(as_str(response.value), "B")

        response = await ordered_map.Search(context, key="m")
        self.assertTrue(response.found)
        self.assertEqual(as_str(response.value), "M")

        response = await ordered_map.Search(context, key="z")
        self.assertTrue(response.found)
        self.assertEqual(as_str(response.value), "Z")

        # Adding another element should trigger a split since
        # the order is 4.
        await ordered_map.Insert(
            context,
            key="y",
            value=from_str("Y"),
        )

        # Ensure that we can search for all the keys after the split.
        response = await ordered_map.Search(context, key="b")
        self.assertTrue(response.found)
        self.assertEqual(as_str(response.value), "B")

        response = await ordered_map.Search(context, key="m")
        self.assertTrue(response.found)
        self.assertEqual(as_str(response.value), "M")

        response = await ordered_map.Search(context, key="z")
        self.assertTrue(response.found)
        self.assertEqual(as_str(response.value), "Z")

        response = await ordered_map.Search(context, key="y")
        self.assertTrue(response.found)
        self.assertEqual(as_str(response.value), "Y")

        # Intentionally add a lower value to check if we can
        # search for it correctly.
        await ordered_map.Insert(
            context,
            key="a",
            value=from_str("A"),
        )

        response = await ordered_map.Search(context, key="a")
        self.assertTrue(response.found)
        self.assertEqual(as_str(response.value), "A")

        # Insert a key into the middle of the tree to cause a split.
        await ordered_map.Insert(
            context,
            key="c",
            value=from_str("C"),
        )

        response = await ordered_map.Search(context, key="a")
        self.assertTrue(response.found)
        self.assertEqual(as_str(response.value), "A")

        response = await ordered_map.Search(context, key="b")
        self.assertTrue(response.found)
        self.assertEqual(as_str(response.value), "B")

        response = await ordered_map.Search(context, key="c")
        self.assertTrue(response.found)
        self.assertEqual(as_str(response.value), "C")

        response = await ordered_map.Search(context, key="m")
        self.assertTrue(response.found)
        self.assertEqual(as_str(response.value), "M")

        response = await ordered_map.Search(context, key="y")
        self.assertTrue(response.found)
        self.assertEqual(as_str(response.value), "Y")

        response = await ordered_map.Search(context, key="z")
        self.assertTrue(response.found)
        self.assertEqual(as_str(response.value), "Z")

        # Add elements until the inner node splits.
        await ordered_map.Insert(
            context,
            key="d",
            value=from_str("D"),
        )

        await ordered_map.Insert(
            context,
            key="e",
            value=from_str("E"),
        )

        await ordered_map.Insert(
            context,
            key="f",
            value=from_str("F"),
        )

        await ordered_map.Insert(
            context,
            key="g",
            value=from_str("G"),
        )

        # Ensure that we can search for all the keys after the
        # inner node split.
        response = await ordered_map.Search(context, key="a")
        self.assertTrue(response.found)
        self.assertEqual(as_str(response.value), "A")

        response = await ordered_map.Search(context, key="b")
        self.assertTrue(response.found)
        self.assertEqual(as_str(response.value), "B")

        response = await ordered_map.Search(context, key="c")
        self.assertTrue(response.found)
        self.assertEqual(as_str(response.value), "C")

        response = await ordered_map.Search(context, key="d")
        self.assertTrue(response.found)
        self.assertEqual(as_str(response.value), "D")

        response = await ordered_map.Search(context, key="e")
        self.assertTrue(response.found)
        self.assertEqual(as_str(response.value), "E")

        response = await ordered_map.Search(context, key="f")
        self.assertTrue(response.found)
        self.assertEqual(as_str(response.value), "F")

        response = await ordered_map.Search(context, key="g")
        self.assertTrue(response.found)
        self.assertEqual(as_str(response.value), "G")

        response = await ordered_map.Search(context, key="m")
        self.assertTrue(response.found)
        self.assertEqual(as_str(response.value), "M")

        response = await ordered_map.Search(context, key="y")
        self.assertTrue(response.found)
        self.assertEqual(as_str(response.value), "Y")

        response = await ordered_map.Search(context, key="z")
        self.assertTrue(response.found)
        self.assertEqual(as_str(response.value), "Z")

    async def test_search_empty_tree(self) -> None:
        """
        Test that searching for a key in an empty B+ tree returns
        a not found response.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = OrderedMap.ref("test-map")
        await ordered_map.Create(context, degree=4)

        response = await ordered_map.Search(context, key="a")
        self.assertFalse(response.found)

    async def test_search_nonexistent_key(self) -> None:
        """
        Test that searching for a key that does not exist in the B+ tree
        returns a not found response.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = await self.create_and_populate_ordered_map(context)

        response = await ordered_map.Search(context, key="b")
        self.assertFalse(response.found)

    async def test_remove_basic(self) -> None:
        """
        Test that we can remove keys from the B+ tree and subsequently
        insert new keys to correctly rebuild the tree.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = await self.create_and_populate_ordered_map(context)

        response = await ordered_map.Stringify(context)
        expected_b_tree = "Inner: ['m']\n  Leaf: ['a', 'j']\n  Leaf: ['m', 'z']\n"
        self.assertEqual(response.value, expected_b_tree)

        # Remove the right side of the tree.
        await ordered_map.Remove(context, key="m")
        await ordered_map.Remove(context, key="z")

        response = await ordered_map.Stringify(context)
        expected_b_tree = "Inner: ['m']\n  Leaf: ['a', 'j']\n  Leaf: []\n"
        self.assertEqual(response.value, expected_b_tree)

        # Add the keys back to the tree to verify that we return to
        # the initial structure.
        await ordered_map.Insert(
            context,
            key="m",
            value=from_str("M"),
        )

        await ordered_map.Insert(
            context,
            key="z",
            value=from_str("Z"),
        )

        response = await ordered_map.Stringify(context)
        expected_b_tree = "Inner: ['m']\n  Leaf: ['a', 'j']\n  Leaf: ['m', 'z']\n"
        self.assertEqual(response.value, expected_b_tree)

    async def test_remove_nonexistent_key(self) -> None:
        """
        Test that attempting to remove a key that does not exist in the
        B+ tree results in a no-op and does not affect the structure
        of the tree.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = await self.create_and_populate_ordered_map(context)

        response = await ordered_map.Stringify(context)
        expected_b_tree = "Inner: ['m']\n  Leaf: ['a', 'j']\n  Leaf: ['m', 'z']\n"
        self.assertEqual(response.value, expected_b_tree)

        # Remove non-existent key.
        await ordered_map.Remove(context, key="e")

        # Verify that the B+ tree remains the same.
        response = await ordered_map.Stringify(context)
        expected_b_tree = "Inner: ['m']\n  Leaf: ['a', 'j']\n  Leaf: ['m', 'z']\n"
        self.assertEqual(response.value, expected_b_tree)

    async def test_range_basic(self) -> None:
        """
        Test a basic range request succeeds.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = await self.create_and_populate_ordered_map(context)

        response = await ordered_map.Range(context, start_key="a", limit=4)

        expected = [
            ("a", "A"),
            ("j", "J"),
            ("m", "M"),
            ("z", "Z"),
        ]

        self.assertEqual(len(response.entries), 4)

        for i, (expected_key, expected_value) in enumerate(expected):
            entry = response.entries[i]
            self.assertEqual(entry.key, expected_key)
            self.assertTrue(entry.HasField("value"))
            self.assertEqual(as_str(entry.value), expected_value)

    async def test_range_from_middle(self) -> None:
        """
        Test that we can fetch a range starting from the middle of the
        ordered_map.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = await self.create_and_populate_ordered_map(context)

        response = await ordered_map.Range(context, start_key="j", limit=2)

        expected = [
            ("j", "J"),
            ("m", "M"),
        ]

        self.assertEqual(len(response.entries), 2)

        for i, (expected_key, expected_value) in enumerate(expected):
            entry = response.entries[i]
            self.assertEqual(entry.key, expected_key)
            self.assertTrue(entry.HasField("value"))
            self.assertEqual(as_str(entry.value), expected_value)

    async def test_range_nonexistent_start_key(self) -> None:
        """
        Test that we can fetch a range after passing a start key that
        does not exist in the ordered_map.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = await self.create_and_populate_ordered_map(context)

        response = await ordered_map.Range(context, start_key="c", limit=3)

        expected = [
            ("j", "J"),
            ("m", "M"),
            ("z", "Z"),
        ]

        self.assertEqual(len(response.entries), 3)

        for i, (expected_key, expected_value) in enumerate(expected):
            entry = response.entries[i]
            self.assertEqual(entry.key, expected_key)
            self.assertTrue(entry.HasField("value"))
            self.assertEqual(as_str(entry.value), expected_value)

    async def test_range_exceeding_limit(self) -> None:
        """
        Test that we can successfully fetch a range with a limit that
        exceeds the number of elements in the ordered_map.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = await self.create_and_populate_ordered_map(context)

        response = await ordered_map.Range(context, start_key="a", limit=10)

        expected = [
            ("a", "A"),
            ("j", "J"),
            ("m", "M"),
            ("z", "Z"),
        ]

        self.assertEqual(len(response.entries), 4)

        for i, (expected_key, expected_value) in enumerate(expected):
            entry = response.entries[i]
            self.assertEqual(entry.key, expected_key)
            self.assertTrue(entry.HasField("value"))
            self.assertEqual(as_str(entry.value), expected_value)

    async def test_range_no_start_key(self) -> None:
        """
        Test that we can fetch a range without specifying a start key,
        which should return the first `limit` elements in the ordered_map
        starting from the smallest key.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = await self.create_and_populate_ordered_map(context)

        response = await ordered_map.Range(context, limit=4)

        expected = [
            ("a", "A"),
            ("j", "J"),
            ("m", "M"),
            ("z", "Z"),
        ]

        self.assertEqual(len(response.entries), 4)

        for i, (expected_key, expected_value) in enumerate(expected):
            entry = response.entries[i]
            self.assertEqual(entry.key, expected_key)
            self.assertTrue(entry.HasField("value"))
            self.assertEqual(as_str(entry.value), expected_value)

    async def test_range_limit_zero(self) -> None:
        """
        Test that a range request with limit set to zero raises
        an error.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = OrderedMap.ref("test-map")
        await ordered_map.Create(context, degree=4)

        await ordered_map.Insert(
            context,
            key="a",
            value=from_str("A"),
        )

        with self.assertRaises(OrderedMap.RangeAborted) as aborted:
            await ordered_map.Range(context, start_key="a", limit=0)
        self.assertEqual(type(aborted.exception.error), InvalidRangeError)
        self.assertIn(
            "Range requires a non-zero `limit` value.", str(aborted.exception)
        )

    async def test_reverse_range_basic(self) -> None:
        """
        Test a basic reverse range request succeeds.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = await self.create_and_populate_ordered_map(context)

        response = await ordered_map.ReverseRange(
            context, start_key="z", limit=4
        )

        expected = [
            ("z", "Z"),
            ("m", "M"),
            ("j", "J"),
            ("a", "A"),
        ]

        self.assertEqual(len(response.entries), 4)

        for i, (expected_key, expected_value) in enumerate(expected):
            entry = response.entries[i]
            self.assertEqual(entry.key, expected_key)
            self.assertTrue(entry.HasField("value"))
            self.assertEqual(as_str(entry.value), expected_value)

    async def test_reverse_range_from_middle(self) -> None:
        """
        Test that we can fetch a reverse range starting from the middle
        of the ordered_map.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = await self.create_and_populate_ordered_map(context)

        response = await ordered_map.ReverseRange(
            context, start_key="m", limit=2
        )

        expected = [
            ("m", "M"),
            ("j", "J"),
        ]

        self.assertEqual(len(response.entries), 2)

        for i, (expected_key, expected_value) in enumerate(expected):
            entry = response.entries[i]
            self.assertEqual(entry.key, expected_key)
            self.assertTrue(entry.HasField("value"))
            self.assertEqual(as_str(entry.value), expected_value)

    async def test_reverse_range_nonexistent_start_key(self) -> None:
        """
        Test that we can fetch a reverse range after passing a start key
        that does not exist in the ordered_map.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = await self.create_and_populate_ordered_map(context)

        response = await ordered_map.ReverseRange(
            context, start_key="q", limit=3
        )

        expected = [
            ("m", "M"),
            ("j", "J"),
            ("a", "A"),
        ]

        self.assertEqual(len(response.entries), 3)

        for i, (expected_key, expected_value) in enumerate(expected):
            entry = response.entries[i]
            self.assertEqual(entry.key, expected_key)
            self.assertTrue(entry.HasField("value"))
            self.assertEqual(as_str(entry.value), expected_value)

    async def test_reverse_range_exceeding_limit(self) -> None:
        """
        Test that we can successfully fetch a reverse range with a limit
        that exceeds the number of elements in the ordered_map.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = await self.create_and_populate_ordered_map(context)

        response = await ordered_map.ReverseRange(
            context, start_key="z", limit=10
        )

        expected = [
            ("z", "Z"),
            ("m", "M"),
            ("j", "J"),
            ("a", "A"),
        ]

        self.assertEqual(len(response.entries), 4)

        for i, (expected_key, expected_value) in enumerate(expected):
            entry = response.entries[i]
            self.assertEqual(entry.key, expected_key)
            self.assertTrue(entry.HasField("value"))
            self.assertEqual(as_str(entry.value), expected_value)

    async def test_reverse_range_no_start_key(self) -> None:
        """
        Test that we can fetch a reverse range without specifying a
        start key, which should return the first `limit` elements in the
        ordered_map starting from the largest key.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = await self.create_and_populate_ordered_map(context)

        response = await ordered_map.ReverseRange(context, limit=4)

        expected = [
            ("z", "Z"),
            ("m", "M"),
            ("j", "J"),
            ("a", "A"),
        ]

        self.assertEqual(len(response.entries), 4)

        for i, (expected_key, expected_value) in enumerate(expected):
            entry = response.entries[i]
            self.assertEqual(entry.key, expected_key)
            self.assertTrue(entry.HasField("value"))
            self.assertEqual(as_str(entry.value), expected_value)

    async def test_reverse_range_limit_zero(self) -> None:
        """
        Test that a reverse range request with limit set to zero raises
        an error.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = OrderedMap.ref("test-map")
        await ordered_map.Create(context, degree=4)

        await ordered_map.Insert(
            context,
            key="a",
            value=from_str("A"),
        )

        with self.assertRaises(OrderedMap.ReverseRangeAborted) as aborted:
            await ordered_map.ReverseRange(context, start_key="a", limit=0)
        self.assertEqual(type(aborted.exception.error), InvalidRangeError)
        self.assertIn(
            "Reverse range requires a non-zero `limit` value.",
            str(aborted.exception)
        )

    async def test_operations_on_all_types(self) -> None:
        """
        Test that we can perform operations (insert, search, range,
        reverse range) on an ordered_map with all types of keys (value,
        bytes, any).
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = OrderedMap.ref("test-map")
        await ordered_map.Create(context, degree=4)

        await ordered_map.Insert(
            context,
            key="value_key",
            value=from_str("Value"),
        )

        await ordered_map.Insert(
            context,
            key="bytes_key",
            bytes=b"Bytes Value",
        )

        any_value = Any()
        any_value.Pack(from_str("Any Value"))

        await ordered_map.Insert(
            context,
            key="any_key",
            any=any_value,
        )

        response = await ordered_map.Stringify(context)
        expected_b_tree = "Leaf: ['any_key', 'bytes_key', 'value_key']\n"
        self.assertEqual(response.value, expected_b_tree)

        # Search for all keys and ensure their types are retained.
        response = await ordered_map.Search(context, key="value_key")
        self.assertTrue(response.found)
        self.assertEqual(as_str(response.value), "Value")
        self.assertTrue(response.HasField("value"))

        response = await ordered_map.Search(context, key="bytes_key")
        self.assertTrue(response.found)
        self.assertEqual(response.bytes, b"Bytes Value")
        self.assertTrue(response.HasField("bytes"))

        response = await ordered_map.Search(context, key="any_key")
        self.assertTrue(response.found)
        self.assertTrue(response.HasField("any"))

        unpacked_any_value = Value()
        response.any.Unpack(unpacked_any_value)
        self.assertEqual(as_str(unpacked_any_value), "Any Value")

        # Get the range of all keys and ensure their types are retained.
        response = await ordered_map.Range(
            context, start_key="any_key", limit=3
        )
        self.assertEqual(len(response.entries), 3)
        expected = [
            ("any_key", "Any Value"),
            ("bytes_key", "Bytes Value"),
            ("value_key", "Value"),
        ]

        for i, (expected_key, expected_value) in enumerate(expected):
            entry = response.entries[i]
            self.assertEqual(entry.key, expected_key)
            if expected_key == "any_key":
                self.assertTrue(entry.HasField("any"))
                unpacked_any_value = Value()
                entry.any.Unpack(unpacked_any_value)
                self.assertEqual(
                    as_str(unpacked_any_value),
                    expected_value,
                )
            elif expected_key == "bytes_key":
                self.assertTrue(entry.HasField("bytes"))
                self.assertEqual(entry.bytes, expected_value.encode())
            else:
                self.assertTrue(entry.HasField("value"))
                self.assertEqual(as_str(entry.value), expected_value)\

        # Get the reverse range of all keys and ensure their types
        # are retained.
        response = await ordered_map.ReverseRange(
            context,
            start_key="value_key",
            limit=3,
        )
        self.assertEqual(len(response.entries), 3)
        expected = [
            ("value_key", "Value"),
            ("bytes_key", "Bytes Value"),
            ("any_key", "Any Value"),
        ]

        for i, (expected_key, expected_value) in enumerate(expected):
            entry = response.entries[i]
            self.assertEqual(entry.key, expected_key)
            if expected_key == "any_key":
                self.assertTrue(entry.HasField("any"))
                unpacked_any_value = Value()
                entry.any.Unpack(unpacked_any_value)
                self.assertEqual(
                    as_str(unpacked_any_value),
                    expected_value,
                )
            elif expected_key == "bytes_key":
                self.assertTrue(entry.HasField("bytes"))
                self.assertEqual(entry.bytes, expected_value.encode())
            else:
                self.assertTrue(entry.HasField("value"))
                self.assertEqual(as_str(entry.value), expected_value)

    async def test_two_creates(self) -> None:
        """
        Test what happens if you run two creates on the same ID
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = OrderedMap.ref("test-map")
        await ordered_map.Create(context, degree=4)

        with self.assertRaises(OrderedMap.CreateAborted) as aborted:
            await ordered_map.Create(context, degree=4)
            self.assertEqual(
                type(aborted.exception.error), StateAlreadyConstructed
            )

    async def test_implicit_construction_from_insert(self) -> None:
        """
        Test that if we do an insert, it will do an implicit construction
        of the OrderedMap with a default order value.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = OrderedMap.ref("implicit-test")
        await ordered_map.Insert(
            context,
            key="b",
            value=from_str("B"),
        )

    async def test_overriding_auth(self) -> None:
        """
        Override library authorization.
        """
        authorizer = OrderedMap.Authorizer(
            insert=allow(),
            search=deny(),
        )
        await self.rbt.up(
            Application(
                libraries=[ordered_map_library(authorizer)],
            ),
        )

        # Expect to be able to insert even with `app_internal=False`.
        context = self.rbt.create_external_context(
            name=f"test-{self.id()}-external",
            app_internal=False,
        )
        ordered_map = OrderedMap.ref(self.id())
        await ordered_map.insert(
            context,
            key="b",
            value=from_str("B"),
        )

        # Expect to not be able to get even with `app_internal=True`.
        context = self.rbt.create_external_context(
            name=f"test-{self.id()}-internal",
            app_internal=True,
        )
        ordered_map = OrderedMap.ref(self.id())
        with self.assertRaises(OrderedMap.SearchAborted) as aborted:
            await ordered_map.search(context, key="a")

        # TODO: we'd prefer for this to be an `Unauthenticated` error,
        #       but there are snags that prevent that; see discussion at
        #         https://github.com/reboot-dev/mono/pull/4601#issuecomment-2989091840
        self.assertEqual(type(aborted.exception.error), PermissionDenied)


if __name__ == '__main__':
    unittest.main()
