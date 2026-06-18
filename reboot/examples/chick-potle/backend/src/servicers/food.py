from ai_chat_food.v1.food import CartEntry, MenuItem
from ai_chat_food.v1.food_rbt import FoodOrder, User
from rbt.v1alpha1.errors_pb2 import Ok, PermissionDenied, Unauthenticated
from reboot.aio.auth.authorizers import allow_if, is_app_internal
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WriterContext,
)
from typing import Optional

MENU_ITEMS = [
    MenuItem(
        name="Chicken Burrito",
        description="Flour tortilla, cilantro-lime rice, black beans, "
        "chicken, fresh tomato salsa, sour cream, cheese",
        price_cents=1115,
        category="Burritos",
        emoji="🌯",
    ),
    MenuItem(
        name="Steak Burrito",
        description="Flour tortilla, cilantro-lime rice, pinto beans, "
        "steak, roasted chili-corn salsa, guacamole",
        price_cents=1240,
        category="Burritos",
        emoji="🌯",
    ),
    MenuItem(
        name="Chicken Bowl",
        description="Cilantro-lime rice, black beans, chicken, fajita "
        "veggies, fresh tomato salsa, cheese, lettuce",
        price_cents=1115,
        category="Bowls",
        emoji="🥘",
    ),
    MenuItem(
        name="Barbacoa Bowl",
        description="Cilantro-lime rice, pinto beans, barbacoa, sour cream, "
        "cheese, roasted chili-corn salsa",
        price_cents=1240,
        category="Bowls",
        emoji="🥘",
    ),
    MenuItem(
        name="Chicken Tacos",
        description="Three crispy corn tortillas, chicken, fresh tomato "
        "salsa, cheese, lettuce",
        price_cents=1115,
        category="Tacos",
        emoji="🌮",
    ),
    MenuItem(
        name="Carnitas Tacos",
        description="Three soft flour tortillas, carnitas, tomatillo-green "
        "chili salsa, sour cream, cheese",
        price_cents=1115,
        category="Tacos",
        emoji="🌮",
    ),
    MenuItem(
        name="Chips & Guacamole",
        description="Fresh tortilla chips with hand-mashed avocado, lime, "
        "cilantro, jalapeno",
        price_cents=595,
        category="Sides",
        emoji="🥑",
    ),
    MenuItem(
        name="Chips & Queso Blanco",
        description="Fresh tortilla chips with creamy white queso dip",
        price_cents=545,
        category="Sides",
        emoji="🧀",
    ),
    MenuItem(
        name="Mexican Coca-Cola",
        description="Classic Coca-Cola made with real cane sugar in a "
        "glass bottle",
        price_cents=350,
        category="Drinks",
        emoji="🥤",
    ),
    MenuItem(
        name="Lemonade",
        description="Tractor Organic fresh-squeezed lemonade",
        price_cents=325,
        category="Drinks",
        emoji="🍋",
    ),
]


def _caller_is_order_user(
    *,
    context: ReaderContext,
    state: Optional[FoodOrder.State],
    **kwargs,
):
    """Allow when the caller's `user_id` matches `state.user_id`."""
    if context.auth is None or context.auth.user_id is None:
        return Unauthenticated()
    if state is not None and context.auth.user_id == state.user_id:
        return Ok()
    return PermissionDenied()


class UserServicer(User.Servicer):

    async def start_order(
        self,
        context: TransactionContext,
    ) -> User.StartOrderResponse:
        # A `User` state is keyed by the user's ID, and its default
        # authorizer only admits that user (or app-internal callers), so
        # `context.state_id` is the ordering user's ID — even for
        # app-internal calls, which carry no `context.auth`.
        order, _ = await FoodOrder.create(
            context,
            menu=MENU_ITEMS,
            user_id=context.state_id,
        )
        return User.StartOrderResponse(
            order_id=order.state_id,
        )


class FoodOrderServicer(FoodOrder.Servicer):

    def authorizer(self):
        return FoodOrder.Authorizer(
            # Orders are only created from within the application, via
            # `User.start_order`.
            create=allow_if(all=[is_app_internal]),
            get_menu=allow_if(any=[_caller_is_order_user, is_app_internal]),
            get_cart=allow_if(any=[_caller_is_order_user, is_app_internal]),
            add_to_cart=allow_if(any=[_caller_is_order_user, is_app_internal]),
            remove_from_cart=allow_if(
                any=[_caller_is_order_user, is_app_internal]
            ),
        )

    async def create(
        self,
        context: WriterContext,
        request: FoodOrder.CreateRequest,
    ) -> None:
        self.state.menu = list(request.menu)
        self.state.cart = []
        self.state.user_id = request.user_id

    async def get_menu(
        self,
        context: ReaderContext,
    ) -> FoodOrder.GetMenuResponse:
        return FoodOrder.GetMenuResponse(items=self.state.menu)

    async def get_cart(
        self,
        context: ReaderContext,
    ) -> FoodOrder.GetCartResponse:
        total = 0
        for entry in self.state.cart:
            if 0 <= entry.item_index < len(self.state.menu):
                total += (
                    self.state.menu[entry.item_index].price_cents *
                    entry.quantity
                )
        return FoodOrder.GetCartResponse(
            entries=self.state.cart,
            total_cents=total,
        )

    async def add_to_cart(
        self,
        context: WriterContext,
        request: FoodOrder.AddToCartRequest,
    ) -> None:
        if request.item_index < 0 or request.item_index >= len(
            self.state.menu
        ):
            raise ValueError("Invalid item index.")
        quantity = request.quantity if request.quantity > 0 else 1
        for entry in self.state.cart:
            if entry.item_index == request.item_index:
                entry.quantity += quantity
                return
        self.state.cart.append(
            CartEntry(item_index=request.item_index, quantity=quantity)
        )

    async def remove_from_cart(
        self,
        context: WriterContext,
        request: FoodOrder.RemoveFromCartRequest,
    ) -> None:
        self.state.cart = [
            e for e in self.state.cart if e.item_index != request.item_index
        ]
