import unittest
from catalog.items import Item, Price
from catalog.payments import CardPayment, CashPayment
from common.errors import InsufficientFundsError, NotFoundError
from common.money import Money
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot
from store.v1.store_rbt import Store
from store_servicer import StoreServicer
from warehouse.v1.warehouse_rbt import Warehouse
from warehouse_servicer import WarehouseServicer


def usd(cents: int) -> Money:
    return Money(cents=cents, currency='USD')


WIDGET = Item(
    name='widget',
    price=Price(amount=usd(1000), discounts=[usd(100)], tax=usd(50)),
)


class SharedModelsTest(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(
            Application(servicers=[StoreServicer, WarehouseServicer]),
        )
        self.context = self.rbt.create_external_context(
            name=f"test-{self.id()}"
        )

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_shared_models_as_requests_responses_and_state(self):
        store, _ = await Store.create(self.context)
        warehouse, _ = await Warehouse.create(self.context)

        # A shared model as the request itself, stored in a state's
        # map of shared models.
        await warehouse.receive(
            self.context,
            name=WIDGET.name,
            price=WIDGET.price,
        )
        # A shared model as the response itself.
        self.assertEqual(await warehouse.value(self.context), usd(1000))

        # A transaction that passes a shared model from one state to
        # another.
        await warehouse.restock(
            self.context,
            store_id=store.state_id,
            name='widget',
        )
        self.assertEqual(await warehouse.value(self.context), usd(0))
        self.assertEqual(
            await store.find(self.context, name='widget'),
            WIDGET,
        )

        # A request holding a union of shared models, and a response
        # that nests shared models.
        receipt = await store.purchase(
            self.context,
            name='widget',
            payment=CashPayment(kind='cash', tendered=usd(1000)),
        )
        self.assertEqual(receipt.item, WIDGET)
        self.assertEqual(receipt.paid, usd(950))
        self.assertEqual(receipt.change, usd(50))

        receipt = await store.purchase(
            self.context,
            name='widget',
            payment=CardPayment(kind='card', last_four='4242'),
        )
        self.assertIsNone(receipt.change)
        self.assertEqual(await store.revenue(self.context), usd(1900))

        # A model of one API file as the request of another's method.
        await warehouse.record(
            self.context,
            item=receipt.item,
            paid=receipt.paid,
        )

    async def test_shared_errors(self):
        store, _ = await Store.create(self.context)
        warehouse, _ = await Warehouse.create(self.context)

        # The same shared error raised by methods of both APIs.
        with self.assertRaises(Store.FindAborted) as find_aborted:
            await store.find(self.context, name='gadget')
        self.assertEqual(
            find_aborted.exception.error,
            NotFoundError(name='gadget'),
        )

        with self.assertRaises(Warehouse.RestockAborted) as restock_aborted:
            await warehouse.restock(
                self.context,
                store_id=store.state_id,
                name='gadget',
            )
        self.assertEqual(
            restock_aborted.exception.error,
            NotFoundError(name='gadget'),
        )

        # A shared error that itself holds a shared model.
        await store.stock(
            self.context,
            name=WIDGET.name,
            price=WIDGET.price,
        )
        with self.assertRaises(Store.PurchaseAborted) as purchase_aborted:
            await store.purchase(
                self.context,
                name='widget',
                payment=CashPayment(kind='cash', tendered=usd(900)),
            )
        self.assertEqual(
            purchase_aborted.exception.error,
            InsufficientFundsError(shortfall=usd(50)),
        )


if __name__ == '__main__':
    unittest.main(verbosity=2)
