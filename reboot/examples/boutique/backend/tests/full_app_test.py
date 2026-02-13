import asyncio
import unittest
from boutique.v1 import demo_pb2, demo_pb2_grpc
from boutique.v1.demo_rbt import Cart, Checkout, Shipping
from cart.servicer import CartServicer
from checkout.servicer import CheckoutServicer
from constants import CHECKOUT_ACTOR_ID, SHIPPING_ACTOR_ID
from currencyconverter.servicer import CurrencyConverterServicer
from main import initialize
from productcatalog.servicer import ProductCatalogServicer
from reboot.aio.applications import Application
from reboot.aio.secrets import MockSecretSource, Secrets
from reboot.aio.tests import Reboot
from reboot.aio.types import ServiceName
from reboot.thirdparty.mailgun import MAILGUN_API_KEY_SECRET_NAME
from reboot.thirdparty.mailgun.servicers import MockMessageServicer
from shipping.servicer import ShippingServicer

# Any arbitrary mailgun API key works for the `MockMessageServicer`.
MAILGUN_API_KEY = 'S3CR3T!'


class TestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        Secrets.set_secret_source(
            MockSecretSource(
                {
                    MAILGUN_API_KEY_SECRET_NAME: MAILGUN_API_KEY.encode(),
                }
            )
        )

        self.rbt = Reboot()
        servicers: list[type] = [
            ProductCatalogServicer,
            CartServicer,
            CheckoutServicer,
            ShippingServicer,
            MockMessageServicer,
        ]

        legacy_grpc_servicers: list[type] = [CurrencyConverterServicer]

        await self.rbt.start()
        revision = await self.rbt.up(
            Application(
                servicers=servicers,
                legacy_grpc_servicers=legacy_grpc_servicers,
            ),
        )

        del revision
        self.context = self.rbt.create_external_context(
            name=f"test-{self.id()}"
        )

        await initialize(self.context)

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_checkout(self) -> None:
        """Check out a single item successfully."""
        # Add an item to a cart.
        cart = Cart.ref('jonathan')
        await cart.add_item(
            self.context,
            item=demo_pb2.CartItem(
                product_id='OLJCESPC7Z',
                quantity=42,
            ),
        )

        # Get a shipping quote for that card in preparation for checkout.
        shipping = Shipping.ref(SHIPPING_ACTOR_ID)
        get_quote_response = await shipping.get_quote(
            self.context,
            quote_expiration_seconds=30,
        )

        # Check out the order.
        checkout = Checkout.ref(CHECKOUT_ACTOR_ID)

        place_order_response = await checkout.place_order(
            self.context,
            user_id='jonathan',
            user_currency='USD',
            email='hi@reboot.dev',
            quote=get_quote_response.quote,
        )

        # The user should receive an email after placing the order.
        await MockMessageServicer.emails_sent_sema.acquire()
        self.assertEqual(1, len(MockMessageServicer.emails_sent))

        self.assertTrue(place_order_response.HasField('order'))

        # Check a couple of order result fields for correctly filled values.
        self.assertEqual(len(place_order_response.order.items), 1)
        order_item = place_order_response.order.items[0]
        expected_item_cost = demo_pb2.Money(
            currency_code='USD', units=19, nanos=(99 * 10000000)
        )
        self.assertEqual(order_item.cost, expected_item_cost)
        self.assertEqual(order_item.item.quantity, 42)
        expected_shipping_cost = demo_pb2.Money(
            currency_code='USD', units=8, nanos=(99 * 10000000)
        )
        self.assertEqual(
            place_order_response.order.shipping_cost, expected_shipping_cost
        )

        # The cart must have been emptied.
        get_items_response = await cart.get_items(self.context)
        self.assertEqual(len(get_items_response.items), 0)

        # The order must have been registered.
        orders_response = await checkout.orders(self.context)
        self.assertEqual(len(orders_response.orders), 1)
        self.assertEqual(
            orders_response.orders[0].order_id,
            place_order_response.order.order_id
        )

    async def test_checkout_quote_expired(self) -> None:
        """Check out a single item with an expired shipping quote, and see the
        checkout fail to complete."""
        # Add an item to a cart.
        cart = Cart.ref('jonathan')
        await cart.add_item(
            self.context,
            item=demo_pb2.CartItem(
                product_id='OLJCESPC7Z',
                quantity=42,
            ),
        )

        # Get a shipping quote for that card in preparation for checkout.
        # Use an expiration time of 0 so that the quote will expire immediately.
        shipping = Shipping.ref(SHIPPING_ACTOR_ID)
        get_quote_response = await shipping.get_quote(
            self.context,
            quote_expiration_seconds=0,
        )

        await asyncio.sleep(1)

        # The quote should have expired and the order should not have
        # gone through.
        checkout = Checkout.ref(CHECKOUT_ACTOR_ID)

        with self.assertRaises(Checkout.PlaceOrderAborted) as aborted:
            await checkout.place_order(
                self.context,
                user_id='jonathan',
                user_currency='USD',
                email='hi@reboot.dev',
                quote=get_quote_response.quote,
            )

        self.assertEqual(
            type(aborted.exception.error),
            demo_pb2.ShippingQuoteInvalidOrExpired
        )

    async def test_currency_conversion(self) -> None:
        """Test a couple of currency conversions to make sure the Money format
        is handled correctly."""
        test_cases = [
            (
                demo_pb2.CurrencyConversionRequest(
                    products=[
                        demo_pb2.Product(
                            price=demo_pb2.Money(
                                currency_code='USD',
                                units=8,
                                nanos=(99 * 10000000),
                            ),
                        )
                    ],
                    to_code='USD',
                ),
                demo_pb2.Money(
                    currency_code='USD', units=8, nanos=(99 * 10000000)
                )
            ),
            (
                demo_pb2.CurrencyConversionRequest(
                    products=[
                        demo_pb2.Product(
                            price=demo_pb2.Money(
                                currency_code='EUR', units=1, nanos=0
                            ),
                        )
                    ],
                    to_code='USD',
                ),
                demo_pb2.Money(
                    currency_code='USD',
                    units=1,
                    nanos=int(0.1305 * 1000000000),
                )
            )
        ]

        async with self.context.channel_manager.get_channel_to_legacy_grpc_service(
            ServiceName('boutique.v1.CurrencyConverter'),
        ) as channel:
            stub = demo_pb2_grpc.CurrencyConverterStub(channel)
            for conversion_request, expected_conversion in test_cases:
                self.assertEqual(len(conversion_request.products), 1)

                conversion = await stub.Convert(conversion_request)

                self.assertEqual(len(conversion.products), 1)
                self.assertEqual(
                    conversion.products[0].price,
                    expected_conversion,
                )


if __name__ == '__main__':
    unittest.main()
