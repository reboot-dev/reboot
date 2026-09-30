from catalog.items import Item
from catalog.payments import CashPayment
from common.errors import InsufficientFundsError, NotFoundError
from common.money import Money
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WriterContext
from store.v1.store import FindRequest, PurchaseRequest, Receipt
from store.v1.store_rbt import Store


class StoreServicer(Store.Servicer):

    def authorizer(self):
        return allow()

    async def create(
        self,
        context: WriterContext,
    ) -> None:
        self.state.revenue = Money(cents=0, currency='USD')
        self.state.items = {}

    async def stock(
        self,
        context: WriterContext,
        request: Item,
    ) -> None:
        self.state.items[request.name] = request
        self.state.featured = request

    async def revenue(
        self,
        context: ReaderContext,
    ) -> Money:
        return self.state.revenue

    async def find(
        self,
        context: ReaderContext,
        request: FindRequest,
    ) -> Item:
        item = self.state.items.get(request.name)
        if item is None:
            raise Store.FindAborted(NotFoundError(name=request.name))
        return item

    async def purchase(
        self,
        context: WriterContext,
        request: PurchaseRequest,
    ) -> Receipt:
        item = self.state.items.get(request.name)
        if item is None:
            raise Store.PurchaseAborted(NotFoundError(name=request.name))

        due = item.price.amount.cents - sum(
            discount.cents for discount in item.price.discounts
        )
        if item.price.tax is not None:
            due += item.price.tax.cents

        change = None
        if isinstance(request.payment, CashPayment):
            tendered = request.payment.tendered.cents
            if tendered < due:
                raise Store.PurchaseAborted(
                    InsufficientFundsError(
                        shortfall=Money(
                            cents=due - tendered,
                            currency='USD',
                        ),
                    )
                )
            change = Money(cents=tendered - due, currency='USD')

        self.state.last_payment = request.payment
        self.state.revenue = Money(
            cents=self.state.revenue.cents + due,
            currency='USD',
        )
        return Receipt(
            item=item,
            paid=Money(cents=due, currency='USD'),
            change=change,
        )
