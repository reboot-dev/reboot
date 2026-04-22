"""Tests for the chick-potle backend.

Covers `User.start_order` and `FoodOrder` CRUD via direct
Reboot calls."""
import unittest
from ai_chat_food.v1.food_rbt import FoodOrder, User
from reboot.aio.applications import Application
from reboot.aio.auth.authorizers import allow
from reboot.aio.tests import Reboot
from servicers.food import FoodOrderServicer, UserServicer

# Production servicers intentionally don't define an
# `authorizer()`: in development Reboot defaults to allow-all,
# but in production an absent authorizer denies by default,
# which we rely on so that no permissive code accidentally
# ships. The tests run against the production-mode harness, so
# we extend each servicer here and grant `allow()` for the
# duration of the suite.


class PermissiveUserServicer(UserServicer):

    def authorizer(self):
        return allow()


class PermissiveFoodOrderServicer(FoodOrderServicer):

    def authorizer(self):
        return allow()


APPLICATION_SERVICERS = [
    PermissiveUserServicer,
    PermissiveFoodOrderServicer,
]


class ServicerTest(unittest.IsolatedAsyncioTestCase):
    """Unit tests for `User` and `FoodOrder` servicers."""

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(
            Application(servicers=APPLICATION_SERVICERS),
        )
        self.user_id = "alice"
        self.context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            bearer_token=self.rbt.make_valid_oauth_access_token(
                user_id=self.user_id,
            ),
        )
        # `User` is an auto-constructed state type: in
        # production the MCP session's "new session" hook
        # calls `_auto_construct` for the authenticated user.
        # Tests don't go through that hook, so we do it here.
        await PermissiveUserServicer._auto_construct(
            self.context,
            state_id=self.user_id,
        )

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_start_order_returns_food_order_id(self) -> None:
        """`User.start_order` creates a `FoodOrder` whose
        menu is pre-populated and whose cart is empty."""
        user = User.ref(self.user_id)
        response = await user.start_order(self.context)
        self.assertTrue(response.order_id)

        order = FoodOrder.ref(response.order_id)
        menu_response = await order.get_menu(self.context)
        # The menu is constant, populated by the servicer; we
        # just check that it isn't empty and that the items
        # have the fields the UI expects.
        self.assertGreater(len(menu_response.items), 0)
        first = menu_response.items[0]
        self.assertTrue(first.name)
        self.assertTrue(first.category)
        self.assertGreater(first.price_cents, 0)

        cart_response = await order.get_cart(self.context)
        self.assertEqual(cart_response.entries, [])
        self.assertEqual(cart_response.total_cents, 0)

    async def test_add_and_remove_from_cart(self) -> None:
        """Adding the same item twice increments its
        quantity instead of creating a duplicate row, and
        the cart total reflects menu prices."""
        user = User.ref(self.user_id)
        start_response = await user.start_order(self.context)
        order = FoodOrder.ref(start_response.order_id)

        menu_response = await order.get_menu(self.context)
        first_price = menu_response.items[0].price_cents
        second_price = menu_response.items[1].price_cents

        # Add two of item 0 and one of item 1; the second
        # add for item 0 should bump quantity, not append.
        await order.add_to_cart(self.context, item_index=0, quantity=1)
        await order.add_to_cart(self.context, item_index=0, quantity=1)
        await order.add_to_cart(self.context, item_index=1, quantity=1)

        cart_response = await order.get_cart(self.context)
        self.assertEqual(len(cart_response.entries), 2)
        by_index = {
            entry.item_index: entry.quantity for entry in cart_response.entries
        }
        self.assertEqual(by_index[0], 2)
        self.assertEqual(by_index[1], 1)
        self.assertEqual(
            cart_response.total_cents,
            2 * first_price + second_price,
        )

        # Remove item 0 entirely; item 1 should remain.
        await order.remove_from_cart(self.context, item_index=0)
        cart_response = await order.get_cart(self.context)
        self.assertEqual(len(cart_response.entries), 1)
        self.assertEqual(cart_response.entries[0].item_index, 1)
        self.assertEqual(cart_response.total_cents, second_price)

    async def test_add_to_cart_default_quantity(self) -> None:
        """A `quantity` of 0 (the protobuf default) is
        treated as 1, matching the AI-friendly contract in
        `food.py`."""
        user = User.ref(self.user_id)
        start_response = await user.start_order(self.context)
        order = FoodOrder.ref(start_response.order_id)

        await order.add_to_cart(self.context, item_index=0, quantity=0)
        cart_response = await order.get_cart(self.context)
        self.assertEqual(len(cart_response.entries), 1)
        self.assertEqual(cart_response.entries[0].quantity, 1)

    async def test_add_to_cart_invalid_index_raises(self) -> None:
        """Out-of-range indexes raise `ValueError` rather
        than silently corrupting the cart."""
        user = User.ref(self.user_id)
        start_response = await user.start_order(self.context)
        order = FoodOrder.ref(start_response.order_id)

        menu_response = await order.get_menu(self.context)
        too_large = len(menu_response.items)

        with self.assertRaises(Exception):
            await order.add_to_cart(
                self.context, item_index=too_large, quantity=1
            )
        with self.assertRaises(Exception):
            await order.add_to_cart(self.context, item_index=-1, quantity=1)
