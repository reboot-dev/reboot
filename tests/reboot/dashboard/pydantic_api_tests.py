"""`api_of` reads an API file into the grammar `rbt generate` prints
from and the dashboard describes."""
import importlib
import os
import sys
import unittest
from pathlib import Path
from rbt.v1alpha1.api.api_pb2 import API
from reboot.pydantic_api import api_of

API_DIRECTORY = str(Path(__file__).parent / 'api')


def _read(filename: str) -> API:
    os.chdir(API_DIRECTORY)
    sys.path.insert(0, API_DIRECTORY)
    module = importlib.import_module(
        filename.rsplit('.py', 1)[0].replace(os.sep, '.')
    )
    return api_of(module.api, filename=filename)


class PydanticApiTest(unittest.TestCase):

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
