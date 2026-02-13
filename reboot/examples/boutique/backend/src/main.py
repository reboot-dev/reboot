import asyncio
import reboot.thirdparty.mailgun
from boutique.v1.demo_rbt import Checkout, ProductCatalog
from cart.servicer import CartServicer
from checkout.servicer import CheckoutServicer
from constants import CHECKOUT_ACTOR_ID, PRODUCT_CATALOG_ACTOR_ID
from currencyconverter.servicer import CurrencyConverterServicer
from productcatalog.servicer import ProductCatalogServicer
from reboot.aio.applications import Application
from shipping.servicer import ShippingServicer


async def initialize(context):
    await Checkout.create(context, CHECKOUT_ACTOR_ID)

    await ProductCatalog.load_products(context, PRODUCT_CATALOG_ACTOR_ID)


async def main():
    application = Application(
        servicers=[
            ProductCatalogServicer,
            CartServicer,
            CheckoutServicer,
            ShippingServicer,
        ] + reboot.thirdparty.mailgun.servicers(),
        legacy_grpc_servicers=[
            CurrencyConverterServicer,
        ],
        initialize=initialize,
    )

    await application.run()


if __name__ == '__main__':
    asyncio.run(main())
