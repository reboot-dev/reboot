"""Integration tests for the reboot-swag-store servicers.

These spin up an in-process Reboot, set the admin-key env var to
a known test value so the admin authorizer accepts our test
bearer token, and swap the `OrderServicer.fulfill` workflow for
a no-op so tests don't hit the Printful API.
"""

import os
import unittest
from constants import COUPON_BOOK_ID
from reboot.aio.aborted import Aborted
from reboot.aio.applications import Application
from reboot.aio.auth.oauth_providers import Anonymous
from reboot.aio.contexts import WorkflowContext
from reboot.aio.tests import OAuthProviderForTest, Reboot
from reboot_swag_store.v1.store import (
    CartEmpty,
    InvalidCoupon,
    Product,
    ShippingAddress,
)
from reboot_swag_store.v1.store_rbt import Cart, CouponBook, Order, User
from servicers.store import (
    STORE_ADMIN_KEY_ENV,
    CartServicer,
    CouponBookServicer,
    OrderServicer,
    UserServicer,
)
from unittest.mock import AsyncMock, patch

ADMIN_KEY = "test-admin-key"
SHIPPING = ShippingAddress(
    name="Jane Doe",
    email="jane@example.com",
    address1="123 Main St",
    address2="",
    city="Seattle",
    state_code="WA",
    zip_code="98101",
    country_code="US",
)

HOODIE = dict(
    product_id="hoodie-1",
    variant_id="hoodie-1-l",
    name="Reboot Hoodie",
    price_cents=4000,
    image_url="",
    size="L",
)


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


class TestStoreServicers(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        # Provide the admin key the authorizer reads via the
        # environment. The Printful API is never called in
        # tests because `NoFulfillOrderServicer` short-circuits
        # the only code path that would need a token.
        self._prev_admin_key = os.environ.get(STORE_ADMIN_KEY_ENV)
        os.environ[STORE_ADMIN_KEY_ENV] = ADMIN_KEY
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(
            Application(
                servicers=[
                    UserServicer,
                    CartServicer,
                    CouponBookServicer,
                    NoFulfillOrderServicer,
                ],
                initialize=_initialize,
                oauth=OAuthProviderForTest(Anonymous()),
            )
        )
        # Authenticated context for a "guest" user. With
        # `useOAuth: true` enabled in `mcp_servers.json`, every
        # session — including anonymous ones — gets a stable
        # OAuth user-id, which our authorizers rely on. Tests
        # bypass the MCP session hook that auto-constructs
        # the matching `User` state, so we trigger it here.
        self.user_id = "test-user"
        self.context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            bearer_token=self.rbt.make_valid_oauth_access_token(
                user_id=self.user_id,
            ),
        )
        await UserServicer._auto_construct(
            self.context,
            state_id=self.user_id,
        )

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()
        if self._prev_admin_key is None:
            os.environ.pop(STORE_ADMIN_KEY_ENV, None)
        else:
            os.environ[STORE_ADMIN_KEY_ENV] = self._prev_admin_key

    async def _admin_context(self):
        return self.rbt.create_external_context(
            name=f"admin-{self.id()}",
            bearer_token=ADMIN_KEY,
        )

    async def _mint_coupon(self) -> str:
        """Generate a fresh coupon code with the admin bearer
        token and return one of the new codes."""
        admin_ctx = await self._admin_context()
        response = await CouponBook.ref(COUPON_BOOK_ID
                                       ).generate_codes(admin_ctx)
        self.assertTrue(response.codes)
        return response.codes[0]

    # ----- User.list_products -----------------------------------

    async def test_list_products_returns_full_catalog(self) -> None:
        """The backend never filters: filtering moved to the
        client model, which calls `list_products` to read the
        catalog, picks the IDs that match the user's intent,
        then opens `browse_store` with those IDs. This locks
        that contract — `list_products` returns whatever
        `fetch_products` produced, in order, with no server-
        side filtering."""
        catalog = [
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
        with patch(
            "servicers.store.fetch_products",
            new=AsyncMock(return_value=catalog),
        ):
            response = await User.ref(self.user_id).list_products(self.context)
        self.assertEqual(
            [product.id for product in response.products],
            ["hat-1", "hoodie-1", "tee-1"],
        )

    # ----- Authorization ----------------------------------------

    async def test_different_user_cannot_touch_cart(self) -> None:
        """A second guest session — with a valid OAuth token
        but a different `user_id` — must not be able to read
        someone else's cart. All `Cart` methods share the
        `_caller_is_owner` rule, so checking one read is
        enough to prove the authorizer wires through; we
        don't probe the writers from the wrong user because
        Reboot's effect-validation can't safely retry a
        non-idempotent mutation that aborted."""
        cart, _ = await Cart.create(
            self.context,
            owner_id=self.user_id,
        )
        await cart.add_item(self.context, quantity=1, **HOODIE)

        # A second authenticated guest session. A fresh
        # `Cart.ref` is required because each weak reference
        # binds to a single context.
        other_context = self.rbt.create_external_context(
            name=f"other-{self.id()}",
            bearer_token=self.rbt.make_valid_oauth_access_token(
                user_id="other-user",
            ),
        )
        other_cart = Cart.ref(cart.state_id)

        with self.assertRaises(Aborted):
            await other_cart.get_cart(other_context)

        # The original owner still has access.
        response = await cart.get_cart(self.context)
        self.assertEqual(len(response.items), 1)

    # ----- Cart.add_item / get_cart / remove_item ---------------

    async def test_add_item_and_get_cart(self) -> None:
        cart, _ = await Cart.create(self.context, owner_id=self.user_id)
        await cart.add_item(self.context, quantity=2, **HOODIE)
        response = await cart.get_cart(self.context)
        self.assertEqual(len(response.items), 1)
        item = response.items[0]
        self.assertEqual(item.product_id, "hoodie-1")
        self.assertEqual(item.name, "Reboot Hoodie")
        self.assertEqual(item.size, "L")
        self.assertEqual(item.quantity, 2)

    async def test_add_same_variant_increments_quantity(
        self,
    ) -> None:
        cart, _ = await Cart.create(self.context, owner_id=self.user_id)
        await cart.add_item(self.context, quantity=2, **HOODIE)
        await cart.add_item(self.context, quantity=1, **HOODIE)
        response = await cart.get_cart(self.context)
        self.assertEqual(len(response.items), 1)
        self.assertEqual(response.items[0].quantity, 3)

    async def test_add_different_variant_adds_a_line(
        self,
    ) -> None:
        cart, _ = await Cart.create(self.context, owner_id=self.user_id)
        small = {**HOODIE, "variant_id": "hoodie-1-s", "size": "S"}
        await cart.add_item(self.context, quantity=1, **HOODIE)
        await cart.add_item(self.context, quantity=1, **small)
        response = await cart.get_cart(self.context)
        self.assertEqual(len(response.items), 2)
        sizes = sorted(item.size for item in response.items)
        self.assertEqual(sizes, ["L", "S"])

    async def test_remove_item(self) -> None:
        cart, _ = await Cart.create(self.context, owner_id=self.user_id)
        await cart.add_item(self.context, quantity=1, **HOODIE)
        await cart.remove_item(self.context, product_id="hoodie-1")
        response = await cart.get_cart(self.context)
        self.assertEqual(response.items, [])

    # ----- Cart.checkout ----------------------------------------

    async def test_checkout_on_empty_cart_raises_cart_empty(
        self,
    ) -> None:
        cart, _ = await Cart.create(self.context, owner_id=self.user_id)
        with self.assertRaises(Cart.CheckoutAborted) as cm:
            await cart.checkout(
                self.context,
                shipping_address=SHIPPING,
                coupon_code="000000",
            )
        self.assertIsInstance(cm.exception.error, CartEmpty)

    async def test_checkout_with_invalid_coupon_raises(
        self,
    ) -> None:
        cart, _ = await Cart.create(self.context, owner_id=self.user_id)
        await cart.add_item(self.context, quantity=1, **HOODIE)
        with self.assertRaises(Cart.CheckoutAborted) as cm:
            await cart.checkout(
                self.context,
                shipping_address=SHIPPING,
                coupon_code="definitely-not-a-real-code",
            )
        self.assertIsInstance(cm.exception.error, InvalidCoupon)
        # The cart is still intact after a failed checkout.
        response = await cart.get_cart(self.context)
        self.assertEqual(len(response.items), 1)

    async def test_checkout_happy_path(self) -> None:
        cart, _ = await Cart.create(self.context, owner_id=self.user_id)
        await cart.add_item(self.context, quantity=2, **HOODIE)

        code = await self._mint_coupon()
        result = await cart.checkout(
            self.context,
            shipping_address=SHIPPING,
            coupon_code=code,
        )
        self.assertTrue(result.order_id)

        # Cart emptied.
        response = await cart.get_cart(self.context)
        self.assertEqual(response.items, [])

        # Order created with the expected line item.
        order = Order.ref(result.order_id)
        details = await order.get_details(self.context)
        self.assertEqual(details.order_id, result.order_id)
        self.assertEqual(len(details.items), 1)
        self.assertEqual(details.items[0].product_id, "hoodie-1")
        self.assertEqual(details.items[0].quantity, 2)
        self.assertEqual(details.subtotal_cents, 8000)
        # The coupon makes the order free.
        self.assertEqual(details.total_cents, 0)

    async def test_checkout_redeems_coupon_so_reuse_fails(
        self,
    ) -> None:
        code = await self._mint_coupon()

        cart, _ = await Cart.create(self.context, owner_id=self.user_id)
        await cart.add_item(self.context, quantity=1, **HOODIE)
        await cart.checkout(
            self.context,
            shipping_address=SHIPPING,
            coupon_code=code,
        )

        # Same code a second time should no longer be valid.
        cart2, _ = await Cart.create(self.context, owner_id=self.user_id)
        await cart2.add_item(self.context, quantity=1, **HOODIE)
        with self.assertRaises(Cart.CheckoutAborted) as cm:
            await cart2.checkout(
                self.context,
                shipping_address=SHIPPING,
                coupon_code=code,
            )
        self.assertIsInstance(cm.exception.error, InvalidCoupon)

    # ----- CouponBook admin gating ------------------------------

    async def test_generate_codes_requires_admin_bearer(
        self,
    ) -> None:
        book = CouponBook.ref(COUPON_BOOK_ID)
        # Anonymous caller: no bearer token.
        with self.assertRaises(Aborted):
            await book.generate_codes(self.context)

    async def test_generate_codes_with_admin_bearer_succeeds(
        self,
    ) -> None:
        admin_ctx = await self._admin_context()
        response = await CouponBook.ref(COUPON_BOOK_ID
                                       ).generate_codes(admin_ctx)
        self.assertEqual(len(response.codes), 20)
        # Fresh codes are all six digits.
        for code in response.codes:
            self.assertEqual(len(code), 6)
            self.assertTrue(code.isdigit())


if __name__ == "__main__":
    unittest.main()
