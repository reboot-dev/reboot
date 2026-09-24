"""The dashboard describes an API file without the application.

This is what lets the dashboard show state types before anything has
been built: `rbt generate` has not run, no servicer exists, and there
is no process to ask. Only the file the developer wrote.
"""
import os
import tempfile
import unittest
from google.protobuf.type_pb2 import Field
from pathlib import Path
from rbt.v1alpha1.api.api_pb2 import API, Method, StateType
from rbt.v1alpha1.api.schema_pb2 import (
    ANY,
    STRING,
    Array,
    Constraints,
    Enum,
    Map,
    OneOf,
    Optional,
    Origin,
    Reference,
    Schema,
    Type,
)
from reboot.api_digest import api_digest
from reboot.dashboard.backend.api_reader import read_api_file
from reboot.dashboard.backend.code_watcher import _try_extract_api_digest

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
        assert api is not None

        # The file relative to the API directory, and the package and
        # module the generated code spells the file as.
        self.assertEqual(api.filename, 'shop/v1/shop.py')
        self.assertEqual(api.package, 'shop.v1')
        self.assertEqual(api.pydantic.module, 'shop.v1.shop')

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


class ProtoAPIReaderTest(unittest.IsolatedAsyncioTestCase):
    """A `.proto` is described with the same grammar a Pydantic file
    is, plus the forms only a `.proto` declares."""

    async def test_describes_a_state_type_and_its_methods(self) -> None:
        api, error = await read_api_file(API_DIRECTORY, 'shop/v1/depot.proto')

        self.assertIsNone(error)
        assert api is not None
        assert api is not None

        # The package is the one the file declares; a message is
        # referred to by its full proto name.
        self.assertEqual(api.filename, 'shop/v1/depot.proto')
        self.assertEqual(api.package, 'shop.v1')
        # A `.proto` is no module; what it is, is a `proto`.
        self.assertEqual(api.WhichOneof('source'), 'proto')

        [depot] = api.state_types
        self.assertEqual(depot.name, 'Depot')
        self.assertEqual(depot.reference, Reference(name='shop.v1.Depot'))
        self.assertEqual(depot.description, "One building's worth of parts.")

        stock, audit = depot.methods

        self.assertEqual(stock.name, 'Stock')
        self.assertEqual(stock.WhichOneof('kind'), 'transaction')
        self.assertEqual(stock.transaction.WhichOneof('mode'), 'exclusive')
        self.assertTrue(stock.factory)
        self.assertEqual(stock.request, Reference(name='shop.v1.StockRequest'))
        self.assertEqual(
            list(stock.errors), [Reference(name='shop.v1.DepotFullError')]
        )
        # With no description among its options, the comment above a
        # method is what describes it.
        self.assertEqual(stock.description, 'Puts parts on the shelves.')

        # `google.protobuf.Empty` is nothing taken and nothing
        # returned.
        self.assertEqual(audit.WhichOneof('kind'), 'reader')
        self.assertFalse(audit.HasField('request'))
        self.assertFalse(audit.HasField('response'))
        self.assertEqual(audit.description, 'Counts what is on the shelves.')
        self.assertEqual(audit.mcp.tool.title, 'Audit a depot')

        # In the order the file declares them, nested ones after the
        # message nesting them. `Part`, which the state's first
        # property names, is `parts.proto`'s to describe.
        self.assertEqual(
            [reference.name for reference in api.data_types],
            [
                'shop.v1.Depot.Courier',
                'shop.v1.StockRequest',
                'shop.v1.StockResponse',
                'shop.v1.DepotFullError',
            ],
        )

    async def test_describes_the_forms_only_a_proto_declares(self) -> None:
        api, error = await read_api_file(API_DIRECTORY, 'shop/v1/depot.proto')

        self.assertIsNone(error)
        assert api is not None
        assert api is not None

        depot = api.schemas['shop.v1.Depot']
        shelves, manager, floor_plan, notes, truck, courier = (
            depot.properties
        )

        # A type is what a value of it is in JSON, with what it was
        # declared as beneath it, the way a field's descriptor says
        # it. A map's keys are strings in JSON, whatever the file
        # says they are.
        self.assertEqual(
            shelves.type,
            Type(
                map=Map(
                    value=Type(reference=Reference(name='shop.v1.Part')),
                    key=Type(
                        scalar=STRING,
                        origin=Origin(
                            proto=Origin.Proto(kind=Field.TYPE_UINT32)
                        ),
                    ),
                )
            ),
        )
        self.assertEqual(
            shelves.description, 'The parts on each shelf, by shelf number.'
        )
        self.assertEqual(
            manager.type,
            Type(
                optional=Optional(
                    inner=Type(
                        scalar=STRING,
                        origin=Origin(
                            proto=Origin.Proto(kind=Field.TYPE_STRING)
                        ),
                    )
                )
            ),
        )
        # Bytes are shipped as a string, of base64.
        self.assertEqual(
            floor_plan.type,
            Type(
                scalar=STRING,
                origin=Origin(proto=Origin.Proto(kind=Field.TYPE_BYTES)),
            ),
        )
        # A `google.protobuf.Value` is any JSON value at all, rather
        # than the message it is declared as, which is not filed.
        self.assertEqual(
            notes.type,
            Type(
                scalar=ANY,
                origin=Origin(
                    proto=Origin.Proto(
                        kind=Field.TYPE_MESSAGE,
                        type_name='google.protobuf.Value',
                    )
                ),
            ),
        )
        self.assertNotIn('google.protobuf.Value', api.schemas)

        # The members of a `oneof` are properties like any other,
        # which is what they are in JSON, where nothing is named
        # after the `oneof`; the schema says which exclude each other.
        self.assertEqual(truck.tag, 5)
        self.assertEqual(truck.description, "The truck's plate.")
        self.assertEqual(
            courier.type,
            Type(reference=Reference(name='shop.v1.Depot.Courier')),
        )
        self.assertEqual(
            list(depot.one_ofs),
            [
                OneOf(
                    name='delivery',
                    tags=[5, 6],
                    description='How the depot last received parts.',
                )
            ],
        )
        # An `optional` field is recorded as the only member of a
        # `oneof` of its own, which is not one the developer wrote.
        self.assertNotIn(2, depot.one_ofs[0].tags)

        # A nested message is named within its package.
        courier = api.schemas['shop.v1.Depot.Courier']
        self.assertEqual(courier.name, 'Depot.Courier')
        self.assertEqual(courier.package, 'shop.v1')

        # What another file declares is that file's to describe: a
        # `Reference` here, its schema and enum there.
        self.assertNotIn('shop.v1.Part', api.schemas)
        self.assertEqual(list(api.enums), [])

        parts, error = await read_api_file(
            API_DIRECTORY, 'shop/v1/parts.proto'
        )
        self.assertIsNone(error)
        assert parts is not None and parts.api is not None
        _, size = parts.api.schemas['shop.v1.Part'].properties
        self.assertEqual(
            size.type, Type(enum=Reference(name='shop.v1.Part.Size'))
        )
        self.assertEqual(list(parts.api.enums), ['shop.v1.Part.Size'])
        declared = parts.api.enums['shop.v1.Part.Size']
        self.assertEqual(declared.name, 'Part.Size')
        self.assertEqual(declared.package, 'shop.v1')
        self.assertEqual(declared.description, 'How big the part is.')
        self.assertEqual(
            list(declared.values),
            [
                Enum.Value(name='SIZE_UNSPECIFIED', number=0),
                Enum.Value(
                    name='SMALL', number=1, description='Fits in a hand.'
                ),
                Enum.Value(name='LARGE', number=2, deprecated=True),
            ],
        )

    async def test_a_file_with_no_state_describes_its_models(self) -> None:
        """A `.proto` of shared messages declares no state type, and
        declares its messages and enums all the same: the developer
        wrote each, and `rbt generate` writes a module for the file."""
        api, error = await read_api_file(API_DIRECTORY, 'shop/v1/parts.proto')

        self.assertIsNone(error)
        assert api is not None
        self.assertEqual(list(api.state_types), [])
        self.assertEqual(
            [reference.name for reference in api.data_types],
            ['shop.v1.Part'],
        )
        self.assertEqual(list(api.enums), ['shop.v1.Part.Size'])

    async def test_the_digest_is_of_what_is_described(self) -> None:
        """The digest generated code records is of the `API` the file
        is read into, the way a pydantic file's is: whatever the
        dashboard describes differently digests differently, a
        comment included, since a comment is what a declaration
        means. What the `API` does not describe, the digest does not
        notice."""
        with tempfile.TemporaryDirectory() as directory:
            for name in ('depot.proto', 'parts.proto'):
                path = Path(directory) / 'shop' / 'v1' / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(
                    (Path(API_DIRECTORY) / 'shop' / 'v1' / name).read_text()
                )

            depot = Path(directory) / 'shop' / 'v1' / 'depot.proto'

            async def read_after(old: str, new: str):
                assert old in depot.read_text()
                depot.write_text(depot.read_text().replace(old, new))
                api, error = await read_api_file(
                    directory, 'shop/v1/depot.proto'
                )
                self.assertIsNone(error)
                assert api is not None
                return api

            before = await read_after('', '')

            commented = await read_after(
                '// Puts parts on the shelves.',
                '// Puts parts on the shelves, in order.',
            )
            self.assertNotEqual(
                api_digest(before.api), api_digest(commented.api)
            )

            # A `uint32` is a number in JSON and a `uint64` a string.
            widened = await read_after(
                'uint32 capacity = 1;', 'uint64 capacity = 1;'
            )
            self.assertNotEqual(
                api_digest(commented.api), api_digest(widened.api)
            )

            # Described the same, so digested the same: the grammar
            # says nothing of the tags a message reserves.
            reserved = await read_after(
                'uint64 capacity = 1;', 'uint64 capacity = 1;\n  reserved 9;'
            )
            self.assertEqual(widened.api, reserved.api)

    async def test_the_digest_is_the_one_the_generator_records(self) -> None:
        """What says whether generated code came from a `.proto` as
        it is: the generator's actual output for `echo.proto`, checked
        in as a golden and rewritten by `make goldens`, records the
        digest reading the same file finds."""
        tests = Path(__file__).parent.parent
        # From the directory `echo.proto` was generated from, so that
        # the file is named the way the generator was given it.
        api, error = await read_api_file(
            str(tests.parent.parent), 'tests/reboot/echo.proto'
        )

        self.assertIsNone(error)
        assert api is not None

        self.assertEqual(
            api_digest(api),
            await _try_extract_api_digest(tests / 'echo_rbt.golden.py'),
        )

    async def test_a_file_protoc_refuses_reports_why(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'shop' / 'v1' / 'depot.proto'
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('syntax = "proto3";\n\nmessage Depot {\n')

            api, error = await read_api_file(directory, 'shop/v1/depot.proto')

            self.assertIsNone(api)
            assert error is not None
            self.assertIn('shop/v1/depot.proto', error)


if __name__ == '__main__':
    unittest.main()
