import uuid
from boutique.v1 import demo_pb2
from boutique.v1.demo_rbt import Shipping
from datetime import timedelta
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WriterContext


class ShippingServicer(Shipping.Servicer):

    def authorizer(self):
        return allow()

    async def get_quote(
        self,
        context: WriterContext,
        request: demo_pb2.GetQuoteRequest,
    ) -> demo_pb2.GetQuoteResponse:
        quote = demo_pb2.ShippingQuote(
            id=str(uuid.uuid4()),
            cost=demo_pb2.Money(
                currency_code="USD",
                units=8,
                nanos=(99 * 10000000),
            ),
        )

        self.state.quotes.append(quote)

        await self.ref().schedule(
            when=timedelta(seconds=request.quote_expiration_seconds),
        ).expire_quote(
            context,
            quote=quote,
        )

        return demo_pb2.GetQuoteResponse(quote=quote)

    async def prepare_ship_order(
        self,
        context: WriterContext,
        request: demo_pb2.PrepareShipOrderRequest,
    ) -> demo_pb2.PrepareShipOrderResponse:
        # Remove the quote, unless it is missing implying it has been
        # expired, in which case we raise an error.
        valid_quote = False
        i = 0
        while i < len(self.state.quotes):
            if self.state.quotes[i].id == request.quote.id:
                valid_quote = True
                del self.state.quotes[i]
                break
            i += 1

        if not valid_quote:
            raise Shipping.PrepareShipOrderAborted(
                demo_pb2.ShippingQuoteInvalidOrExpired()
            )

        # Create a task to actually do the shipping since that is not
        # compensatable and if we are called from within a transaction
        # we only want to actually do the shipping if the transaction
        # commits (and thus our task gets dispatched).
        await self.ref().schedule().ship_order(context)

        return demo_pb2.PrepareShipOrderResponse(tracking_id=str(uuid.uuid4()))

    async def expire_quote(
        self,
        context: WriterContext,
        request: demo_pb2.ExpireQuoteRequest,
    ) -> demo_pb2.Empty:
        # Remove the quote.
        quotes = [
            quote for quote in self.state.quotes
            if quote.id != request.quote.id
        ]
        del self.state.quotes[:]
        self.state.quotes.extend(quotes)

        return demo_pb2.Empty()

    async def ship_order(
        self,
        context: ReaderContext,
        request: demo_pb2.ShipOrderRequest,
    ) -> demo_pb2.Empty:
        # This is where we'd actually do the shipping, retrying if we
        # get an error.
        return demo_pb2.Empty()
