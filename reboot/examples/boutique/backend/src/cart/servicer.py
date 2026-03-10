import time
from boutique.v1 import demo_pb2
from boutique.v1.demo_rbt import Cart
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WriterContext


class CartServicer(Cart.Servicer):

    def authorizer(self):
        return allow()

    async def add_item(
        self,
        context: WriterContext,
        request: demo_pb2.AddItemRequest,
    ) -> demo_pb2.Empty:

        now = int(time.time())

        # If the item was already in the cart, increase the count instead of
        # adding it again.
        previous_item = next(
            (
                item for item in self.state.items
                if item.product_id == request.item.product_id
            ),
            None,
        )
        if previous_item is not None:
            previous_item.quantity += request.item.quantity
            previous_item.added_at = now
        else:
            request.item.added_at = now
            self.state.items.append(request.item)

        return demo_pb2.Empty()

    async def get_items(
        self,
        context: ReaderContext,
        request: demo_pb2.GetItemsRequest,
    ) -> demo_pb2.GetItemsResponse:
        return demo_pb2.GetItemsResponse(items=self.state.items)

    async def empty_cart(
        self,
        context: WriterContext,
        request: demo_pb2.EmptyCartRequest,
    ) -> demo_pb2.Empty:
        del self.state.items[:]
        return demo_pb2.Empty()
