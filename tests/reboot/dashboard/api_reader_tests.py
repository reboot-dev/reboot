"""The dashboard describes an API file without the application.

This is what lets the dashboard show state types before anything has
been built: `rbt generate` has not run, no servicer exists, and there
is no process to ask. Only the file the developer wrote.
"""
import json
import os
import tempfile
import unittest
from pathlib import Path
from rbt.dashboard.v1.dashboard_pb2 import Method, StateType
from reboot.dashboard.api_reader import read_api_file

API_DIRECTORY = str(Path(__file__).parent / 'api')


def _state_types_by_name(state_types: list[StateType]) -> dict[str, StateType]:
    return {state_type.name: state_type for state_type in state_types}


def _schema_of_data_type(state_type: StateType, name: str) -> dict:
    """The JSON Schema of the data type called `name`."""
    for data_type in state_type.data_types:
        if data_type.name == name:
            return json.loads(data_type.schema)
    raise AssertionError(f"No data type '{name}' in {state_type.name}")


def _method_named(state_type: StateType, name: str) -> Method:
    for method in state_type.methods:
        if method.name == name:
            return method
    raise AssertionError(f"No method '{name}' in {state_type.name}")


class APIReaderTest(unittest.IsolatedAsyncioTestCase):

    async def test_describes_a_state_type_and_its_methods(self) -> None:
        state_types, error = await read_api_file(
            API_DIRECTORY, 'shop/v1/shop.py'
        )

        self.assertIsNone(error)

        shop = _state_types_by_name(state_types)['shop.v1.Shop']

        # The API directory as given, then the path inside it.
        self.assertEqual(
            shop.file,
            os.path.join(API_DIRECTORY, 'shop/v1/shop.py'),
        )

        self.assertEqual(
            shop.description,
            'A shop, and the stock it has to sell.',
        )

        # `properties` keeps the order the fields were declared in.
        self.assertEqual(
            list(json.loads(shop.state_schema)['properties']),
            ['name', 'open'],
        )

        # Methods keep the names their author gave them, and name what
        # they take and return in `data_types`.
        stock = _method_named(shop, 'stock')
        self.assertEqual(stock.kind, Method.Kind.TRANSACTION)
        self.assertEqual(stock.request, 'StockRequest')
        self.assertEqual(
            list(_schema_of_data_type(shop, 'StockRequest')['properties']),
            ['item', 'quantity', 'labels'],
        )

        self.assertEqual(stock.description, 'Add stock of an item.')
        self.assertFalse(stock.mcp)

        remaining = _method_named(shop, 'remaining')
        self.assertEqual(remaining.kind, Method.Kind.READER)
        self.assertEqual(remaining.response, 'StockResponse')
        self.assertTrue(remaining.mcp)
        self.assertEqual(
            remaining.description,
            'How much of an item is left.',
        )

        # An error is a data type like a request, so its fields can be
        # read.
        self.assertEqual(list(remaining.errors), ['OutOfStockError'])
        self.assertEqual(
            list(_schema_of_data_type(shop, 'OutOfStockError')['properties']),
            ['item'],
        )

        create = _method_named(shop, 'create')
        self.assertTrue(create.factory)
        self.assertFalse(create.HasField('request'))
        self.assertFalse(create.HasField('response'))

    async def test_a_nested_type_is_followed_rather_than_named(self) -> None:
        # `StockResponse.items` is a list of `Item`, whose `price` is an
        # `Optional[Price]`; `data_types` describes every one of them.
        state_types, error = await read_api_file(
            API_DIRECTORY, 'shop/v1/shop.py'
        )

        self.assertIsNone(error)
        shop = _state_types_by_name(state_types)['shop.v1.Shop']

        self.assertEqual(
            _schema_of_data_type(shop, 'StockResponse')['properties']['items'],
            {
                'items': {
                    '$ref': '#/$defs/Item'
                },
                'tag': 2,
                'title': 'Items',
                'type': 'array',
            },
        )

        # Pydantic writes `Optional[X]` as a union with null.
        self.assertEqual(
            _schema_of_data_type(shop, 'Item')['properties']['price']['anyOf'],
            [{
                '$ref': '#/$defs/Price'
            }, {
                'type': 'null'
            }],
        )

        self.assertEqual(
            list(_schema_of_data_type(shop, 'Price')['properties']),
            ['currency', 'cents'],
        )

        # A model's docstring is its schema's description.
        self.assertEqual(
            _schema_of_data_type(shop, 'Item')['description'],
            'One thing the shop sells.',
        )

    async def test_a_file_with_no_api_describes_nothing(self) -> None:
        state_types, error = await read_api_file(
            API_DIRECTORY, 'shop/v1/helper.py'
        )

        self.assertIsNone(error)
        self.assertEqual(state_types, [])

    async def test_a_file_that_does_not_parse_reports_why(self) -> None:
        # A half-written file is the normal case while someone is
        # typing; the message is what the developer needs.
        with tempfile.TemporaryDirectory() as directory:
            os.makedirs(os.path.join(directory, 'shop', 'v1'))
            Path(os.path.join(directory, 'shop', 'v1', 'shop.py')
                ).write_text('from reboot.api import API\napi = API(\n')

            state_types, error = await read_api_file(
                directory, 'shop/v1/shop.py'
            )

            self.assertEqual(state_types, [])
            assert error is not None
            self.assertIn('SyntaxError', error)

    async def test_reading_does_not_write_to_the_developer_s_tree(
        self
    ) -> None:
        before = sorted(os.listdir(os.path.join(API_DIRECTORY, 'shop', 'v1')))

        await read_api_file(API_DIRECTORY, 'shop/v1/shop.py')

        self.assertEqual(
            before,
            sorted(os.listdir(os.path.join(API_DIRECTORY, 'shop', 'v1'))),
        )


if __name__ == '__main__':
    unittest.main()
