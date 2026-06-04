import asyncio
import logging
from constants import COUPON_BOOK_ID
from dotenv import load_dotenv
from reboot.aio.applications import Application
from reboot.aio.auth.oauth_providers import (
    Development,
    OAuthProviderByEnvironment,
)
from reboot_swag_store.v1.store_rbt import CouponBook
from servicers.store import (
    CartServicer,
    CouponBookServicer,
    OrderServicer,
    UserServicer,
)

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format=("%(asctime)s - %(name)s - %(levelname)s"
            " - %(message)s"),
)


async def initialize(context) -> None:
    """Ensure the coupon book exists (creates initial
    codes on first run)."""
    await CouponBook.create(context, COUPON_BOOK_ID)


async def main() -> None:
    application = Application(
        servicers=[
            UserServicer,
            CouponBookServicer,
            CartServicer,
            OrderServicer,
        ],
        oauth=OAuthProviderByEnvironment(
            dev=Development(),
            # TODO: set a real provider (e.g. `Google(...)`) before
            # production; `prod=None` makes a production deployment fail
            # to start until one is chosen.
            prod=None,
        ),
        initialize=initialize,
    )
    await application.run()


if __name__ == "__main__":
    asyncio.run(main())
