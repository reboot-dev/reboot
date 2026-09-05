"""`api_of` reads an API file into the grammar `rbt generate` prints
from and the dashboard describes; `generate_from_api` prints the
proto from it."""
import asyncio
import importlib
import os
import sys
import unittest
from pathlib import Path
from rbt.v1alpha1.api.api_pb2 import API
from reboot.pydantic_api import api_of
from reboot.pydantic_schema_to_proto import generate_from_api

API_DIRECTORY = str(Path(__file__).parent / 'api')


def _read(filename: str) -> API:
    os.chdir(API_DIRECTORY)
    sys.path.insert(0, API_DIRECTORY)
    module = importlib.import_module(
        filename.rsplit('.py', 1)[0].replace(os.sep, '.')
    )
    return api_of(module.api, filename=filename)


class _Written:
    """What `generate_from_api` wrote, as one string."""

    def __init__(self) -> None:
        self.parts: list[str] = []

    async def write(self, part: str) -> None:
        self.parts.append(part)

    def __str__(self) -> str:
        return ''.join(self.parts)


def _proto_of(filename: str) -> str:
    written = _Written()
    asyncio.run(generate_from_api(written, _read(filename)))
    return str(written)


class PydanticApiTest(unittest.TestCase):

    def test_reads_an_error_another_file_defines(self) -> None:
        declared = _read('shop/v1/warehouse.py')

        [warehouse] = declared.state_types
        _, pick = warehouse.methods
        self.assertEqual(
            [error.name for error in pick.errors],
            ['shop.v1.shop.OutOfStockError'],
        )

    def test_prints_each_error_inside_its_methods_message(self) -> None:
        """An error is a message nested in the declaring method's own,
        so one defined in another file is copied, not imported."""
        proto = _proto_of('shop/v1/warehouse.py')

        self.assertNotIn('import "shop/v1/', proto)
        self.assertIn(
            'message WarehousePickErrors {\n'
            'message OutOfStockError {\n'
            '  optional string item = 1 [(rbt.v1alpha1.field).required = true];\n'
            '}\n'
            '\n'
            '  oneof type {\n'
            '  OutOfStockError out_of_stock_error = 1 '
            ' [ (rbt.v1alpha1.field).pydantic_type = '
            '"shop.v1.shop.OutOfStockError"];\n'
            '  }\n'
            '}\n',
            proto,
        )
        self.assertEqual(proto.count('message OutOfStockError {'), 1)

    def test_reads_what_the_file_declares(self) -> None:
        declared = _read('shop/v1/shop.py')

        self.assertEqual(declared.filename, 'shop/v1/shop.py')
        self.assertEqual(declared.package, 'shop.v1')
        self.assertEqual(declared.module, 'shop.v1.shop')

        [shop] = declared.state_types
        self.assertEqual(shop.name, 'Shop')
        self.assertEqual(shop.reference.name, 'shop.v1.shop.ShopState')
        self.assertEqual(
            shop.description, 'A shop, and the stock it has to sell.'
        )
        self.assertFalse(shop.auto_construct)
        self.assertEqual(list(shop.uis), [])

        create, stock, remaining = shop.methods
        self.assertEqual(
            (create.name, create.WhichOneof('kind'), create.factory),
            ('create', 'transaction', True),
        )
        self.assertFalse(create.HasField('request'))
        self.assertFalse(create.HasField('response'))
        self.assertFalse(create.HasField('mcp'))

        self.assertEqual(stock.request.name, 'shop.v1.shop.StockRequest')
        self.assertEqual(stock.description, 'Add stock of an item.')

        self.assertEqual(remaining.WhichOneof('kind'), 'reader')
        self.assertEqual(remaining.response.name, 'shop.v1.shop.StockResponse')
        self.assertEqual(
            [error.name for error in remaining.errors],
            ['shop.v1.shop.OutOfStockError'],
        )
        self.assertEqual(remaining.mcp.WhichOneof('primitive'), 'tool')
        self.assertFalse(remaining.mcp.tool.HasField('name'))

        # Every model but the state model is a data type, and every
        # model has a schema.
        self.assertEqual(
            [data_type.name for data_type in declared.data_types],
            [
                'shop.v1.shop.StockRequest',
                'shop.v1.shop.StockResponse',
                'shop.v1.shop.Item',
                'shop.v1.shop.Price',
                'shop.v1.shop.OutOfStockError',
            ],
        )
        self.assertEqual(
            sorted(declared.schemas),
            sorted(
                ['shop.v1.shop.ShopState'] +
                [data_type.name for data_type in declared.data_types]
            ),
        )


if __name__ == '__main__':
    unittest.main()
