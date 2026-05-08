import unittest
from google.protobuf.any_pb2 import Any
from google.protobuf.struct_pb2 import Value
from rbt.std.item.v1.item_pb2 import Item
from rbt.v1alpha1.errors_pb2 import (
    InvalidArgument,
    PermissionDenied,
    StateAlreadyConstructed,
)
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
            maintain_size=True,
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
        await ordered_map.Create(context, degree=4, maintain_size=True)

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
        await ordered_map.Create(context, degree=4, maintain_size=True)

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
        await ordered_map.Create(context, degree=4, maintain_size=True)

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
        await ordered_map.Create(context, degree=4, maintain_size=True)

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
        await ordered_map.Create(context, degree=4, maintain_size=True)

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
        await ordered_map.Create(context, degree=4, maintain_size=True)

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

    async def test_two_creates_same_options(self) -> None:
        """
        Test that calling `Create` twice with the same options is
        idempotent — it succeeds without error.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = OrderedMap.ref("test-map")
        await ordered_map.Create(context, degree=4, maintain_size=True)
        await ordered_map.Create(context, degree=4, maintain_size=True)

    async def test_two_creates_different_degree(self) -> None:
        """
        Test that calling `Create` with a different degree
        raises `StateAlreadyConstructed`.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = OrderedMap.ref("test-map-diff-degree")
        await ordered_map.Create(context, degree=4, maintain_size=True)

        with self.assertRaises(OrderedMap.CreateAborted) as aborted:
            await ordered_map.Create(context, degree=8, maintain_size=True)

        self.assertEqual(
            type(aborted.exception.error),
            StateAlreadyConstructed,
        )

    async def test_two_creates_different_maintain_size(self) -> None:
        """
        Test that calling `Create` with a different
        `maintain_size` raises `StateAlreadyConstructed`.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = OrderedMap.ref("test-map-diff-maintain")
        await ordered_map.Create(context, degree=4, maintain_size=True)

        with self.assertRaises(OrderedMap.CreateAborted) as aborted:
            await ordered_map.Create(context, degree=4, maintain_size=False)

        self.assertEqual(
            type(aborted.exception.error),
            StateAlreadyConstructed,
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

    async def test_implicit_construction_from_remove(self) -> None:
        """
        Test that removing from a not-yet-created
        OrderedMap implicitly constructs it (as a no-op)
        rather than failing.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = OrderedMap.ref("implicit-remove-test")

        # Remove on a map that doesn't exist yet should succeed as a
        # no-op.
        await ordered_map.Remove(context, key="nonexistent")

        # The map should now be implicitly constructed and usable.
        response = await ordered_map.Search(context, key="a")
        self.assertFalse(response.found)

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

    async def test_bulk_insert_basic(self) -> None:
        """
        Test that a small bulk insert populates the map and
        entries are searchable.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = OrderedMap.ref("test-bulk")
        await ordered_map.Create(context, degree=4, maintain_size=True)

        entries = {
            "b": Item(value=from_str("B")),
            "a": Item(value=from_str("A")),
            "c": Item(value=from_str("C")),
        }
        await ordered_map.Insert(context, entries=entries)

        response = await ordered_map.Stringify(context)
        self.assertEqual(response.value, "Leaf: ['a', 'b', 'c']\n")

        for key, value in [("a", "A"), ("b", "B"), ("c", "C")]:
            response = await ordered_map.Search(
                context,
                key=key,
            )
            self.assertTrue(response.found)
            self.assertEqual(as_str(response.value), value)

        # Verify size is correct.
        response = await ordered_map.Range(context, limit=10)
        self.assertEqual(response.total_size, 3)

    async def test_bulk_insert_causes_splits(self) -> None:
        """
        Test that a bulk insert with enough entries triggers
        leaf and inner node splits.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = OrderedMap.ref("test-bulk-split")
        await ordered_map.Create(context, degree=4, maintain_size=True)

        # Insert enough entries to trigger splits with
        # degree=4 (split at 4 keys, mid=2).
        entries = {}
        for ch in "abcdefgh":
            entries[ch] = Item(value=from_str(ch.upper()))

        await ordered_map.Insert(context, entries=entries)

        # Verify all keys are searchable.
        for ch in "abcdefgh":
            response = await ordered_map.Search(
                context,
                key=ch,
            )
            self.assertTrue(response.found)
            self.assertEqual(as_str(response.value), ch.upper())

        # Verify size.
        response = await ordered_map.Range(context, limit=100)
        self.assertEqual(response.total_size, 8)
        self.assertEqual(len(response.entries), 8)

    async def test_bulk_insert_with_existing_data(self) -> None:
        """
        Test bulk insert merges with pre-existing entries.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = OrderedMap.ref("test-bulk-merge")
        await ordered_map.Create(context, degree=4, maintain_size=True)

        # Insert some initial entries.
        await ordered_map.Insert(
            context,
            key="b",
            value=from_str("B"),
        )
        await ordered_map.Insert(
            context,
            key="d",
            value=from_str("D"),
        )

        # Bulk insert more entries that interleave.
        entries = {
            "a": Item(value=from_str("A")),
            "c": Item(value=from_str("C")),
            "e": Item(value=from_str("E")),
        }
        await ordered_map.Insert(context, entries=entries)

        # Verify all 5 keys exist.
        for ch in "abcde":
            response = await ordered_map.Search(
                context,
                key=ch,
            )
            self.assertTrue(response.found)
            self.assertEqual(
                as_str(response.value),
                ch.upper(),
            )

        response = await ordered_map.Range(
            context,
            limit=100,
        )
        self.assertEqual(response.total_size, 5)

    async def test_bulk_insert_duplicates_update(self) -> None:
        """
        Test that bulk-inserting existing keys updates their
        values without incrementing size.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = OrderedMap.ref("test-bulk-dup")
        await ordered_map.Create(context, degree=4, maintain_size=True)

        # Insert initial entries.
        await ordered_map.Insert(
            context,
            key="a",
            value=from_str("A"),
        )
        await ordered_map.Insert(
            context,
            key="b",
            value=from_str("B"),
        )

        # Bulk insert: update 'a', add 'c'.
        entries = {
            "a": Item(value=from_str("A2")),
            "c": Item(value=from_str("C")),
        }
        await ordered_map.Insert(context, entries=entries)

        # 'a' should be updated.
        response = await ordered_map.Search(
            context,
            key="a",
        )
        self.assertTrue(response.found)
        self.assertEqual(as_str(response.value), "A2")

        # 'b' should be unchanged.
        response = await ordered_map.Search(
            context,
            key="b",
        )
        self.assertTrue(response.found)
        self.assertEqual(as_str(response.value), "B")

        # Size should be 3 (a, b, c), not 4.
        response = await ordered_map.Range(
            context,
            limit=100,
        )
        self.assertEqual(response.total_size, 3)

    async def test_bulk_insert_validates_fields(self) -> None:
        """
        Test that entries + single-key fields raises
        InvalidArgument.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = OrderedMap.ref("test-bulk-validate")
        await ordered_map.Create(context, degree=4, maintain_size=True)

        entries = {
            "a": Item(value=from_str("A")),
        }

        with self.assertRaises(OrderedMap.InsertAborted) as aborted:
            await ordered_map.Insert(
                context,
                key="conflict",
                value=from_str("X"),
                entries=entries,
            )
        self.assertEqual(
            type(aborted.exception.error),
            InvalidArgument,
        )

    async def test_bulk_insert_implicit_construction(self) -> None:
        """
        Test that bulk insert works on an uncreated
        OrderedMap via implicit construction.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = OrderedMap.ref("test-bulk-implicit")

        entries = {
            "x": Item(value=from_str("X")),
            "y": Item(value=from_str("Y")),
        }
        await ordered_map.Insert(context, entries=entries)

        response = await ordered_map.Search(
            context,
            key="x",
        )
        self.assertTrue(response.found)
        self.assertEqual(as_str(response.value), "X")

        response = await ordered_map.Search(
            context,
            key="y",
        )
        self.assertTrue(response.found)
        self.assertEqual(as_str(response.value), "Y")

    async def test_bulk_insert_all_types(self) -> None:
        """
        Test bulk insert with value, bytes, and any Item
        types.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = OrderedMap.ref("test-bulk-types")
        await ordered_map.Create(context, degree=4, maintain_size=True)

        any_value = Any()
        any_value.Pack(from_str("Any Value"))

        entries = {
            "val_key": Item(value=from_str("Value")),
            "bytes_key": Item(bytes=b"Bytes Value"),
            "any_key": Item(any=any_value),
        }
        await ordered_map.Insert(context, entries=entries)

        response = await ordered_map.Search(
            context,
            key="val_key",
        )
        self.assertTrue(response.found)
        self.assertTrue(response.HasField("value"))
        self.assertEqual(as_str(response.value), "Value")

        response = await ordered_map.Search(
            context,
            key="bytes_key",
        )
        self.assertTrue(response.found)
        self.assertTrue(response.HasField("bytes"))
        self.assertEqual(response.bytes, b"Bytes Value")

        response = await ordered_map.Search(
            context,
            key="any_key",
        )
        self.assertTrue(response.found)
        self.assertTrue(response.HasField("any"))
        unpacked = Value()
        response.any.Unpack(unpacked)
        self.assertEqual(as_str(unpacked), "Any Value")

    async def test_bulk_insert_large_batch(self) -> None:
        """
        Test bulk insert with hundreds of entries using a
        realistic degree to verify multi-level splits
        without creating pathologically many nodes.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = OrderedMap.ref("test-bulk-large")
        # Use degree=16 so 200 entries creates ~25 leaves
        # and a few inner-node levels, rather than ~150
        # nodes at degree=4.
        await ordered_map.Create(context, degree=16, maintain_size=True)

        count = 200
        entries = {}
        for i in range(count):
            key = f"key-{i:04d}"
            entries[key] = Item(
                value=from_str(f"value-{i:04d}"),
            )
        await ordered_map.Insert(context, entries=entries)

        # Verify size.
        response = await ordered_map.Range(context, limit=1)
        self.assertEqual(response.total_size, count)

        # Spot-check some keys across the tree.
        for i in [0, 50, 99, 150, 199]:
            key = f"key-{i:04d}"
            response = await ordered_map.Search(
                context,
                key=key,
            )
            self.assertTrue(
                response.found,
                f"Key {key} not found",
            )
            self.assertEqual(
                as_str(response.value),
                f"value-{i:04d}",
            )

        # Verify range ordering.
        response = await ordered_map.Range(
            context,
            limit=count,
        )
        self.assertEqual(len(response.entries), count)
        keys = [e.key for e in response.entries]
        self.assertEqual(keys, sorted(keys))

    async def test_bulk_remove_basic(self) -> None:
        """
        Test that a small bulk remove deletes the expected
        keys and leaves the rest intact.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = OrderedMap.ref("test-bulk-remove")
        await ordered_map.Create(context, degree=4, maintain_size=True)

        entries = {
            "a": Item(value=from_str("A")),
            "b": Item(value=from_str("B")),
            "c": Item(value=from_str("C")),
            "d": Item(value=from_str("D")),
        }
        await ordered_map.Insert(context, entries=entries)

        # Bulk remove two keys.
        await ordered_map.Remove(context, keys=["a", "c"])

        # Verify removed keys are gone.
        for key in ["a", "c"]:
            response = await ordered_map.Search(
                context,
                key=key,
            )
            self.assertFalse(response.found)

        # Verify remaining keys are intact.
        for key, value in [("b", "B"), ("d", "D")]:
            response = await ordered_map.Search(
                context,
                key=key,
            )
            self.assertTrue(response.found)
            self.assertEqual(
                as_str(response.value),
                value,
            )

        # Verify size is correct.
        response = await ordered_map.Range(context, limit=10)
        self.assertEqual(response.total_size, 2)

    async def test_bulk_remove_with_splits(self) -> None:
        """
        Test bulk remove on a tree with multiple levels
        (inner nodes) to exercise the concurrent inner-node
        dispatch path.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = OrderedMap.ref("test-bulk-remove-split")
        await ordered_map.Create(context, degree=4, maintain_size=True)

        # Insert enough to create inner nodes.
        entries = {}
        for ch in "abcdefghijklmnop":
            entries[ch] = Item(
                value=from_str(ch.upper()),
            )
        await ordered_map.Insert(context, entries=entries)

        # Remove keys spread across different children.
        await ordered_map.Remove(
            context,
            keys=["a", "d", "h", "m", "p"],
        )

        # Verify removed keys are gone.
        for key in ["a", "d", "h", "m", "p"]:
            response = await ordered_map.Search(
                context,
                key=key,
            )
            self.assertFalse(
                response.found,
                f"Key {key} should have been removed",
            )

        # Verify remaining keys are still present.
        remaining = set("abcdefghijklmnop") - {
            "a",
            "d",
            "h",
            "m",
            "p",
        }
        for key in remaining:
            response = await ordered_map.Search(
                context,
                key=key,
            )
            self.assertTrue(
                response.found,
                f"Key {key} should still exist",
            )

        # Verify size.
        response = await ordered_map.Range(context, limit=100)
        self.assertEqual(response.total_size, 11)

    async def test_bulk_remove_nonexistent_keys(self) -> None:
        """
        Test that bulk-removing keys that don't exist is a
        no-op and does not affect size.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = OrderedMap.ref("test-bulk-remove-noop")
        await ordered_map.Create(context, degree=4, maintain_size=True)

        entries = {
            "a": Item(value=from_str("A")),
            "b": Item(value=from_str("B")),
        }
        await ordered_map.Insert(context, entries=entries)

        # Remove keys that don't exist.
        await ordered_map.Remove(
            context,
            keys=["x", "y", "z"],
        )

        # Size should be unchanged.
        response = await ordered_map.Range(
            context,
            limit=10,
        )
        self.assertEqual(response.total_size, 2)

        # Original keys still present.
        for key in ["a", "b"]:
            response = await ordered_map.Search(
                context,
                key=key,
            )
            self.assertTrue(response.found)

    async def test_bulk_remove_mix_existing_and_nonexistent(self) -> None:
        """
        Test bulk remove with a mix of existing and
        nonexistent keys only removes the existing ones.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = OrderedMap.ref("test-bulk-remove-mix")
        await ordered_map.Create(context, degree=4, maintain_size=True)

        entries = {
            "a": Item(value=from_str("A")),
            "b": Item(value=from_str("B")),
            "c": Item(value=from_str("C")),
        }
        await ordered_map.Insert(context, entries=entries)

        # Remove a mix: "a" exists, "x" doesn't, "c" exists.
        await ordered_map.Remove(
            context,
            keys=["a", "x", "c"],
        )

        # "a" and "c" gone, "b" remains.
        self.assertFalse((await ordered_map.Search(context, key="a")).found)
        self.assertTrue((await ordered_map.Search(context, key="b")).found)
        self.assertFalse((await ordered_map.Search(context, key="c")).found)

        # Size should be 1.
        response = await ordered_map.Range(
            context,
            limit=10,
        )
        self.assertEqual(response.total_size, 1)

    async def test_bulk_remove_validates_fields(self) -> None:
        """
        Test that passing both `keys` and `key` raises
        `InvalidArgument`.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = OrderedMap.ref(
            "test-bulk-remove-validate",
        )
        await ordered_map.Create(context, degree=4, maintain_size=True)

        with self.assertRaises(
            OrderedMap.RemoveAborted,
        ) as aborted:
            await ordered_map.Remove(
                context,
                key="a",
                keys=["b", "c"],
            )
        self.assertEqual(
            type(aborted.exception.error),
            InvalidArgument,
        )

    async def test_bulk_remove_large_batch(self) -> None:
        """
        Test bulk remove with a large number of entries to
        exercise multi-level tree traversal.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = OrderedMap.ref(
            "test-bulk-remove-large",
        )
        await ordered_map.Create(context, degree=16, maintain_size=True)

        count = 200
        entries = {}
        for i in range(count):
            key = f"key-{i:04d}"
            entries[key] = Item(
                value=from_str(f"value-{i:04d}"),
            )
        await ordered_map.Insert(context, entries=entries)

        # Remove every other key.
        keys_to_remove = [f"key-{i:04d}" for i in range(0, count, 2)]
        await ordered_map.Remove(
            context,
            keys=keys_to_remove,
        )

        # Verify size.
        response = await ordered_map.Range(context, limit=1)
        self.assertEqual(response.total_size, count // 2)

        # Verify removed keys are gone.
        for i in range(0, count, 2):
            key = f"key-{i:04d}"
            response = await ordered_map.Search(
                context,
                key=key,
            )
            self.assertFalse(
                response.found,
                f"Key {key} should have been removed",
            )

        # Verify remaining keys are present.
        for i in range(1, count, 2):
            key = f"key-{i:04d}"
            response = await ordered_map.Search(
                context,
                key=key,
            )
            self.assertTrue(
                response.found,
                f"Key {key} should still exist",
            )

    async def test_maintain_size_false(self) -> None:
        """
        With `maintain_size=False`, inserts and removes don't update
        `state.size`, and `Range` leaves the `optional total_size`
        field unset rather than reporting a stale or zero count.
        """
        await self.rbt.up(Application(
            libraries=[ordered_map_library()],
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ordered_map = OrderedMap.ref("test-maintain-size-false")
        await ordered_map.Create(context, degree=4, maintain_size=False)

        # Insert a handful of entries.
        entries = {
            f"key-{i:02d}": Item(value=from_str(f"value-{i:02d}"))
            for i in range(5)
        }
        await ordered_map.Insert(context, entries=entries)

        # `total_size` should be left unset even though we just
        # inserted 5 entries.
        response = await ordered_map.Range(context, limit=1)
        self.assertFalse(response.HasField("total_size"))

        # Same expectation after a remove.
        await ordered_map.Remove(
            context,
            keys=["key-00", "key-01"],
        )
        response = await ordered_map.Range(context, limit=1)
        self.assertFalse(response.HasField("total_size"))


if __name__ == '__main__':
    unittest.main()
