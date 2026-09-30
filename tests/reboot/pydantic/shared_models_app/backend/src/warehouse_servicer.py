from catalog.items import Item
from common.errors import NotFoundError
from common.money import Money
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WriterContext,
)
from store.v1.store import Receipt
from store.v1.store_rbt import Store
from warehouse.v1.warehouse import RestockRequest
from warehouse.v1.warehouse_rbt import Warehouse


class WarehouseServicer(Warehouse.Servicer):

    def authorizer(self):
        return allow()

    async def create(
        self,
        context: WriterContext,
    ) -> None:
        self.state.inventory = {}
        self.state.receipts = []

    async def receive(
        self,
        context: WriterContext,
        request: Item,
    ) -> None:
        self.state.inventory[request.name] = request

    async def record(
        self,
        context: WriterContext,
        request: Receipt,
    ) -> None:
        self.state.receipts.append(request)

    async def restock(
        self,
        context: TransactionContext,
        request: RestockRequest,
    ) -> None:
        item = self.state.inventory.pop(request.name, None)
        if item is None:
            raise Warehouse.RestockAborted(NotFoundError(name=request.name))
        await Store.ref(request.store_id).stock(
            context,
            name=item.name,
            price=item.price,
        )

    async def value(
        self,
        context: ReaderContext,
    ) -> Money:
        return Money(
            cents=sum(
                item.price.amount.cents
                for item in self.state.inventory.values()
            ),
            currency='USD',
        )
