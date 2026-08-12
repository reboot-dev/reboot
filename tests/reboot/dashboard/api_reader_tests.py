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

        self.assertEqual(
            [field['name'] for field in shop['fields']],
            ['name', 'open'],
        )

        # The methods come from the file, with the names and kinds
        # their author wrote.
        stock = _method(shop, 'stock')
        self.assertEqual(stock['kind'], 'transaction')
        self.assertEqual(
            [argument['name'] for argument in stock['arguments']],
            ['item', 'quantity'],
        )

        # `stock` has a `description` and is not an MCP tool: prose
        # reaches the page whether or not its author also exposed the
        # method to MCP.
        self.assertEqual(stock['description'], 'Add stock of an item.')
        self.assertNotIn('mcp', stock)

        remaining = _method(shop, 'remaining')
        self.assertEqual(remaining['kind'], 'reader')
        self.assertEqual(
            remaining['returns'],
            [{
                'name': 'remaining',
                'type': 'int',
            }],
        )
        self.assertTrue(remaining['mcp'])

        # The errors a method declares, by the names of the declared
        # models.
        self.assertEqual(remaining['errors'], ['OutOfStockError'])
        self.assertEqual(
            remaining['description'],
            'How much of an item is left.',
        )

        # A factory constructs the state, and returns nothing.
        create = _method(shop, 'create')
        self.assertTrue(create['factory'])
        self.assertNotIn('returns', create)

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
