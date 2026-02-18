import unittest

# Import used in Item documentation.
# isort: off
from reboot.protobuf import (
    as_bool,
    as_dict,
    as_int,
    as_list,
    as_str,
    from_bool,
    from_dict,
    from_int,
    from_list,
    from_str,
)
from reboot.protobuf import pack, unpack
# isort: on
from reboot.std.item.v1.item import Item
from tests.reboot.greeter_rbt import CreateRequest as SomeMessage


class TestCase(unittest.IsolatedAsyncioTestCase):

    async def test_item_with_value(self) -> None:
        """
        Test storing a value in an `Item`. `print`s are for documentation examples.
        """
        item = Item(value=from_bool(True))
        print(as_bool(item.value))

        item = Item(value=from_int(3))
        print(as_int(item.value))

        item = Item(value=from_str("apple"))
        print(as_str(item.value))

        item = Item(value=from_list(["a", "b", "c"]))
        print(as_list(item.value))

        item = Item(value=from_dict({"details": "details-go-here"}))
        print(as_dict(item.value))

        self.assertEquals(as_dict(item.value)["details"], "details-go-here")

    async def test_item_with_bytes(self) -> None:
        """
        Test storing bytes in an `Item`. `print`s are for documentation examples.
        """
        item = Item(bytes=b"some-bytes")
        print(item.bytes)

        self.assertEqual(b"some-bytes", item.bytes)

    async def test_item_with_any(self) -> None:
        """
        Test storing an `Any` in an `Item`. `print`s are for documentation examples.
        """
        contents = {
            "title": "king",
            "name": "nemo",
            "adjective": "fishy",
        }

        message = SomeMessage(**contents)

        item = Item(any=pack(message))

        unpacked_message = unpack(item.any, SomeMessage)

        self.assertEqual(unpacked_message.title, "king")


if __name__ == '__main__':
    unittest.main()
