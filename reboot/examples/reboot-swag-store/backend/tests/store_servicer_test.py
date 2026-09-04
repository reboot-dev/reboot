"""The swag store's tests: the Gherkin scenarios in
`store.feature`.

The scenarios run with the admin key in the environment, the
Printful fulfillment workflow stubbed to a no-op, and the product
catalog mocked, so nothing reaches external services.
"""

import os
import pytest
from constants import COUPON_BOOK_ID
from reboot.aio.applications import Application
from reboot.aio.contexts import WorkflowContext
from reboot.bdd import scenarios, then
from reboot.bdd.fixtures import World
from reboot_swag_store.v1.store import Product
from reboot_swag_store.v1.store_rbt import CouponBook, Order
from servicers.store import (
    STORE_ADMIN_KEY_ENV,
    CartServicer,
    CouponBookServicer,
    OrderServicer,
    UserServicer,
)
from typing import Iterator
from unittest.mock import AsyncMock, patch

ADMIN_KEY = "test-admin-key"

CATALOG = [
    Product(
        id="hat-1",
        name="Bucket Hat",
        description="Embroidered bucket hat.",
        price_cents=2500,
    ),
    Product(
        id="hoodie-1",
        name="Reboot Hoodie",
        description="Heavy-blend hoodie.",
        price_cents=4000,
    ),
    Product(
        id="tee-1",
        name="Reboot Tee",
        description="Classic merch tee.",
        price_cents=2000,
    ),
]


class NoFulfillOrderServicer(OrderServicer):
    """Override the `fulfill` workflow to skip the Printful
    call during tests."""

    @classmethod
    async def fulfill(
        cls,
        context: WorkflowContext,
        request: Order.FulfillRequest,
    ) -> None:
        return None


async def _initialize(context) -> None:
    await CouponBook.create(context, COUPON_BOOK_ID)


# The admin authorizer reads its key from the environment; give it
# a known one for the scenario's duration.
@pytest.fixture(autouse=True)
def admin_key() -> Iterator[None]:
    previous = os.environ.get(STORE_ADMIN_KEY_ENV)
    os.environ[STORE_ADMIN_KEY_ENV] = ADMIN_KEY
    yield
    if previous is None:
        os.environ.pop(STORE_ADMIN_KEY_ENV, None)
    else:
        os.environ[STORE_ADMIN_KEY_ENV] = previous


# The catalog comes from Printful in production; mock the fetch
# with a fixed one.
@pytest.fixture(autouse=True)
def catalog() -> Iterator[None]:
    with patch(
        'servicers.store.fetch_products',
        new=AsyncMock(return_value=CATALOG),
    ):
        yield


@pytest.fixture
def application() -> Application:
    return Application(
        servicers=[
            UserServicer,
            CartServicer,
            CouponBookServicer,
            NoFulfillOrderServicer,
        ],
        initialize=_initialize,
    )


@then('every generated code is six digits')
def _every_generated_code_is_six_digits(world: World) -> None:
    for code in world.response.codes:
        assert len(code) == 6 and code.isdigit()


scenarios('store.feature')
