import os
import uuid
from boutique.v1 import demo_pb2, demo_pb2_grpc
from boutique.v1.demo_rbt import Cart, Checkout, ProductCatalog, Shipping
from constants import PRODUCT_CATALOG_ACTOR_ID, SHIPPING_ACTOR_ID
from jinja2 import Environment, FileSystemLoader, select_autoescape
from logger import logger
from rbt.thirdparty.mailgun.v1.mailgun_rbt import Message
from reboot.aio.auth.authorizers import allow
from reboot.aio.call import Options
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WriterContext,
)
from reboot.aio.secrets import SecretNotFoundException, Secrets
from reboot.thirdparty.mailgun import MAILGUN_API_KEY_SECRET_NAME
from typing import Optional


class CheckoutServicer(Checkout.Servicer):

    def __init__(self):
        self._secrets = Secrets()

    def authorizer(self):
        return allow()

    async def create(
        self,
        context: WriterContext,
        request: demo_pb2.Empty,
    ) -> demo_pb2.Empty:
        return demo_pb2.Empty()

    async def place_order(
        self,
        context: TransactionContext,
        request: demo_pb2.PlaceOrderRequest,
    ) -> demo_pb2.PlaceOrderResponse:
        # Get user cart.
        cart = Cart.ref(request.user_id)

        get_items_response = await cart.get_items(context)

        # For each item in the cart, verify that it is a real product, get its
        # price, and convert the price to user currency.
        product_catalog = ProductCatalog.ref(PRODUCT_CATALOG_ACTOR_ID)

        # Convert to user currency.
        order_items: list[demo_pb2.OrderItem] = []
        async with context.legacy_grpc_channel() as channel:
            stub = demo_pb2_grpc.CurrencyConverterStub(channel)
            convert_response = await stub.Convert(
                demo_pb2.CurrencyConversionRequest(
                    products=[
                        (
                            await product_catalog.get_product(
                                context,
                                id=item.product_id,
                            )
                        ) for item in get_items_response.items
                    ],
                    to_code=request.user_currency,
                )
            )

            for item, product in zip(
                get_items_response.items, convert_response.products
            ):
                order_items.append(
                    demo_pb2.OrderItem(
                        item=item,
                        cost=product.price,
                    )
                )

        # TODO: Total up the price for the user.
        # TODO: Charge the user's credit card.

        # Prepare the shipping.
        shipping = Shipping.ref(SHIPPING_ACTOR_ID)
        await shipping.prepare_ship_order(
            context,
            quote=request.quote,
        )

        # Empty the user's cart.
        await cart.empty_cart(context)

        # Send a confirmation email to the user.
        order_id = str(uuid.uuid4())
        order_result = demo_pb2.OrderResult(
            order_id=order_id,
            shipping_cost=request.quote.cost,
            shipping_address=request.address,
            items=order_items,
        )

        self.state.orders.append(order_result)

        # Use a template in the 'templates' folder.
        env = Environment(
            loader=FileSystemLoader(
                os.path.join(os.path.dirname(__file__), 'templates')
            ),
            autoescape=select_autoescape(['html', 'xml']),
        )
        template = env.get_template('thanks_for_listening_to_demo.html')

        confirmation = template.render(order=order_result)

        if mailgun_api_key := await self._mailgun_api_key():
            await Message.send(
                context,
                Options(bearer_token=mailgun_api_key),
                recipient=request.email,
                sender='Reboot Team <team@reboot.dev>',
                domain='reboot.dev',
                subject='Thanks from the team at reboot.dev!',
                html=confirmation,
            )
        logger.info(f"Order placed for '{request.email}'")

        return demo_pb2.PlaceOrderResponse(order=order_result)

    async def orders(
        self,
        context: ReaderContext,
        request: demo_pb2.OrdersRequest,
    ) -> demo_pb2.OrdersResponse:
        return demo_pb2.OrdersResponse(orders=reversed(self.state.orders))

    async def _mailgun_api_key(self) -> Optional[str]:
        try:
            secret_bytes = await self._secrets.get(MAILGUN_API_KEY_SECRET_NAME)
            return secret_bytes.decode()
        except SecretNotFoundException:
            logger.warning(
                "The Mailgun API key secret is not set: please see the README to "
                "enable sending email."
            )
            return None
