"""The dashboard describes an API file without the application.

This is what lets the dashboard show state types before anything has
been built: `rbt generate` has not run, no servicer exists, and there
is no process to ask. Only the file the developer wrote.
"""
import os
import tempfile
import unittest
from pathlib import Path
from reboot.dashboard.api_reader import read

API_DIRECTORY = str(Path(__file__).parent / 'api')


def _by_name(state_types: list[dict]) -> dict[str, dict]:
    return {state_type['name']: state_type for state_type in state_types}


def _defs(state_type: dict, name: str) -> dict:
    return state_type['$defs'][name]


def _method(state_type: dict, name: str) -> dict:
    for method in state_type['methods']:
        if method['name'] == name:
            return method
    raise AssertionError(f"No method '{name}' in {state_type['name']}")


class APIReaderTest(unittest.IsolatedAsyncioTestCase):

    async def test_describes_a_state_type_and_its_methods(self) -> None:
        state_types, error = await read(API_DIRECTORY, 'shop/v1/shop.py')

        self.assertIsNone(error)

        shop = _by_name(state_types)['shop.v1.Shop']

        # The file the developer wrote, spelled from where the
        # dashboard was started: the API directory as given, then the
        # path inside it.
        self.assertEqual(
            shop['file'],
            os.path.join(API_DIRECTORY, 'shop/v1/shop.py'),
        )

        self.assertEqual(
            shop['description'],
            'A shop, and the stock it has to sell.',
        )

        # The state is a `$ref` into this state type's own `$defs`.
        self.assertEqual(shop['state'], {'$ref': '#/$defs/ShopState'})
        self.assertEqual(
            list(_defs(shop, 'ShopState')['properties']),
            ['name', 'open'],
        )

        # The methods come from the file, with the names and kinds
        # their author wrote.
        stock = _method(shop, 'stock')
        self.assertEqual(stock['kind'], 'transaction')
        self.assertEqual(stock['request'], {'$ref': '#/$defs/StockRequest'})
        self.assertEqual(
            list(_defs(shop, 'StockRequest')['properties']),
            ['item', 'quantity'],
        )

        # `stock` has a `description` and is not an MCP tool: prose
        # reaches the page whether or not its author also exposed the
        # method to MCP.
        self.assertEqual(stock['description'], 'Add stock of an item.')
        self.assertFalse(stock['mcp'])

        remaining = _method(shop, 'remaining')
        self.assertEqual(remaining['kind'], 'reader')
        self.assertEqual(
            remaining['response'],
            {'$ref': '#/$defs/StockResponse'},
        )
        self.assertTrue(remaining['mcp'])
        self.assertEqual(
            remaining['description'],
            'How much of an item is left.',
        )

        # An error is a `$ref` like anything else, so what it holds
        # can be read rather than only its name.
        self.assertEqual(
            remaining['errors'],
            [{
                '$ref': '#/$defs/OutOfStockError'
            }],
        )
        self.assertEqual(
            list(_defs(shop, 'OutOfStockError')['properties']),
            ['item'],
        )

        # A factory constructs the state, and takes and returns
        # nothing.
        create = _method(shop, 'create')
        self.assertTrue(create['factory'])
        self.assertNotIn('request', create)
        self.assertNotIn('response', create)

    async def test_a_nested_type_is_followed_rather_than_named(self) -> None:
        # The whole point: a type that holds another type is not a
        # dead end. `StockResponse.items` is a list of `Item`, whose
        # `price` is an `Optional[Price]`, and every one of those is
        # in `$defs` to be read.
        state_types, error = await read(API_DIRECTORY, 'shop/v1/shop.py')

        self.assertIsNone(error)
        shop = _by_name(state_types)['shop.v1.Shop']

        self.assertEqual(
            _defs(shop, 'StockResponse')['properties']['items'],
            {
                'items': {
                    '$ref': '#/$defs/Item'
                },
                'tag': 2,
                'title': 'Items',
                'type': 'array',
            },
        )

        # `Optional[X]` is spelled as a union with null.
        self.assertEqual(
            _defs(shop, 'Item')['properties']['price']['anyOf'],
            [{
                '$ref': '#/$defs/Price'
            }, {
                'type': 'null'
            }],
        )

        self.assertEqual(
            list(_defs(shop, 'Price')['properties']),
            ['currency', 'cents'],
        )

        # A model's docstring describes it, so prose the author
        # already wrote reaches the page.
        self.assertEqual(
            _defs(shop, 'Item')['description'],
            'One thing the shop sells.',
        )

    async def test_a_file_with_no_api_describes_nothing(self) -> None:
        # A directory holds shared code as well as APIs, and reading a
        # module that declares no `api` is not an error.
        state_types, error = await read(API_DIRECTORY, 'shop/v1/helper.py')

        self.assertIsNone(error)
        self.assertEqual(state_types, [])

    async def test_a_file_that_does_not_parse_reports_why(self) -> None:
        # Half-written files are the normal case while someone is
        # typing. The reader has to survive them and say what is
        # wrong, because that message is what the developer needs.
        with tempfile.TemporaryDirectory() as directory:
            os.makedirs(os.path.join(directory, 'shop', 'v1'))
            Path(os.path.join(directory, 'shop', 'v1', 'shop.py')
                ).write_text('from reboot.api import API\napi = API(\n')

            state_types, error = await read(directory, 'shop/v1/shop.py')

            self.assertEqual(state_types, [])
            assert error is not None
            self.assertIn('SyntaxError', error)

    async def test_reading_does_not_write_to_the_developer_s_tree(
        self
    ) -> None:
        # Reading walks the API object in memory and leaves the
        # developer's tree exactly as it was.
        before = sorted(os.listdir(os.path.join(API_DIRECTORY, 'shop', 'v1')))

        await read(API_DIRECTORY, 'shop/v1/shop.py')

        self.assertEqual(
            before,
            sorted(os.listdir(os.path.join(API_DIRECTORY, 'shop', 'v1'))),
        )


if __name__ == '__main__':
    unittest.main()
