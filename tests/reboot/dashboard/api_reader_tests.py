"""The dashboard describes an API file without the application.

This is what lets the dashboard show state types before anything has
been built: `rbt generate` has not run, no servicer exists, and there
is no process to ask. Only the file the developer wrote.
"""
import os
import tempfile
import unittest
from pathlib import Path
from rbt.v1alpha1.api.api_pb2 import API, Method, StateType
from rbt.v1alpha1.api.schema_pb2 import (
    Array,
    Constraints,
    Optional,
    Reference,
    Schema,
    Type,
)
from reboot.dashboard.backend.api_reader import read_api_file

API_DIRECTORY = str(Path(__file__).parent / 'api')


def _state_types_by_name(state_types: list[StateType]) -> dict[str, StateType]:
    return {state_type.name: state_type for state_type in state_types}


def _schema_of_model(api: API, name: str) -> Schema:
    """The schema of the model called `name`."""
    if name not in api.schemas:
        raise AssertionError(f"No model '{name}' in {list(api.schemas)}")
    return api.schemas[name]


def _property_names(schema: Schema) -> list[str]:
    return [property.name for property in schema.properties]


def _property(schema: Schema, name: str):
    for property in schema.properties:
        if property.name == name:
            return property
    raise AssertionError(f"No property '{name}' in {schema.name}")


def _method_named(state_type: StateType, name: str) -> Method:
    for method in state_type.methods:
        if method.name == name:
            return method
    raise AssertionError(f"No method '{name}' in {state_type.name}")


class APIReaderTest(unittest.IsolatedAsyncioTestCase):

    async def test_describes_a_state_type_and_its_methods(self) -> None:
        api, error = await read_api_file(API_DIRECTORY, 'shop/v1/shop.py')

        self.assertIsNone(error)
        assert api is not None

        # The file relative to the API directory, and the package and
        # module the generated code spells the file as.
        self.assertEqual(api.filename, 'shop/v1/shop.py')
        self.assertEqual(api.package, 'shop.v1')
        self.assertEqual(api.module, 'shop.v1.shop')

        shop = _state_types_by_name(list(api.state_types))['Shop']

        self.assertEqual(
            shop.description,
            'A shop, and the stock it has to sell.',
        )

        # The state model's schema is among the schemas, and
        # `properties` keeps the order the fields were declared in.
        self.assertEqual(shop.reference.name, 'shop.v1.shop.ShopState')
        state = _schema_of_model(api, shop.reference.name)
        self.assertEqual(state.name, 'ShopState')
        self.assertEqual(_property_names(state), ['name', 'open'])

        # Every other model is a data type.
        self.assertEqual(
            sorted(reference.name for reference in api.data_types),
            sorted(set(api.schemas) - {'shop.v1.shop.ShopState'}),
        )

        # Methods keep the names their author gave them, and name what
        # they take and return in `schemas`, the way a `Reference`
        # names a model: by its module and class.
        stock = _method_named(shop, 'stock')
        self.assertEqual(stock.WhichOneof('kind'), 'transaction')
        self.assertEqual(stock.request.name, 'shop.v1.shop.StockRequest')
        self.assertEqual(
            _property_names(
                _schema_of_model(api, 'shop.v1.shop.StockRequest')
            ),
            ['item', 'quantity', 'labels'],
        )

        # What a value must satisfy beyond its type.
        quantity = _property(
            _schema_of_model(api, 'shop.v1.shop.StockRequest'),
            'quantity',
        )
        self.assertEqual(
            quantity.constraints, Constraints(greater_than_or_equal=0)
        )
        self.assertFalse(quantity.deprecated)

        self.assertEqual(stock.description, 'Add stock of an item.')
        self.assertFalse(stock.HasField('mcp'))

        remaining = _method_named(shop, 'remaining')
        self.assertEqual(remaining.WhichOneof('kind'), 'reader')
        self.assertEqual(remaining.response.name, 'shop.v1.shop.StockResponse')
        self.assertEqual(remaining.mcp.WhichOneof('primitive'), 'tool')
        self.assertEqual(
            remaining.description,
            'How much of an item is left.',
        )

        # An error is a data type like a request, so its fields can be
        # read.
        self.assertEqual(
            [error.name for error in remaining.errors],
            ['shop.v1.shop.OutOfStockError'],
        )
        self.assertEqual(
            _property_names(
                _schema_of_model(api, 'shop.v1.shop.OutOfStockError')
            ),
            ['item'],
        )

        create = _method_named(shop, 'create')
        self.assertTrue(create.factory)
        self.assertFalse(create.HasField('request'))
        self.assertFalse(create.HasField('response'))

    async def test_a_nested_type_is_followed_rather_than_named(self) -> None:
        # `StockResponse.items` is a list of `Item`, whose `price` is an
        # `Optional[Price]`; `schemas` describes every one of them.
        api, error = await read_api_file(API_DIRECTORY, 'shop/v1/shop.py')

        self.assertIsNone(error)
        assert api is not None

        items = _property(
            _schema_of_model(api, 'shop.v1.shop.StockResponse'), 'items'
        )
        self.assertEqual(items.tag, 2)
        self.assertEqual(
            items.type,
            Type(
                array=Array(
                    item=Type(reference=Reference(name='shop.v1.shop.Item'))
                )
            ),
        )

        # `Optional[X]` is an optional of a reference.
        price = _property(_schema_of_model(api, 'shop.v1.shop.Item'), 'price')
        self.assertEqual(
            price.type,
            Type(
                optional=Optional(
                    inner=Type(reference=Reference(name='shop.v1.shop.Price'))
                )
            ),
        )
        self.assertEqual(price.default, 'null')

        self.assertEqual(
            _property_names(_schema_of_model(api, 'shop.v1.shop.Price')),
            ['currency', 'cents'],
        )

        # A model's docstring is its schema's description.
        self.assertEqual(
            _schema_of_model(api, 'shop.v1.shop.Item').description,
            'One thing the shop sells.',
        )

    async def test_a_file_with_no_api_describes_nothing(self) -> None:
        api, error = await read_api_file(API_DIRECTORY, 'shop/v1/helper.py')

        self.assertIsNone(error)
        self.assertIsNone(api)

    async def test_a_file_that_does_not_parse_reports_why(self) -> None:
        # A half-written file is the normal case while someone is
        # typing; the message is what the developer needs.
        with tempfile.TemporaryDirectory() as directory:
            os.makedirs(os.path.join(directory, 'shop', 'v1'))
            Path(os.path.join(directory, 'shop', 'v1', 'shop.py')
                ).write_text('from reboot.api import API\napi = API(\n')

            api, error = await read_api_file(directory, 'shop/v1/shop.py')

            self.assertIsNone(api)
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
