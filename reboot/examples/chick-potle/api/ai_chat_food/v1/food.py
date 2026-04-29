from reboot.api import (
    API,
    UI,
    Field,
    Methods,
    Model,
    Reader,
    Tool,
    Transaction,
    Type,
    Writer,
)

# -- Helper models. --


class MenuItem(Model):
    """A food item on the menu."""
    name: str = Field(tag=1)
    description: str = Field(tag=2)
    price_cents: int = Field(tag=3)
    category: str = Field(tag=4)
    emoji: str = Field(tag=5)


class CartEntry(Model):
    """An item in the cart."""
    item_index: int = Field(tag=1)
    quantity: int = Field(tag=2)


# -- User models. --


class StartOrderResponse(Model):
    order_id: str = Field(tag=1)


class UserState(Model):
    pass


# -- FoodOrder models. --


class FoodOrderState(Model):
    menu: list[MenuItem] = Field(tag=1, default_factory=list)
    cart: list[CartEntry] = Field(tag=2, default_factory=list)


class MenuResponse(Model):
    items: list[MenuItem] = Field(tag=1)


class CartResponse(Model):
    entries: list[CartEntry] = Field(tag=1)
    total_cents: int = Field(tag=2)


class AddToCartRequest(Model):
    """Add a menu item to the cart by index."""
    item_index: int = Field(tag=1)
    quantity: int = Field(tag=2)


class RemoveFromCartRequest(Model):
    """Remove an item from the cart by menu index."""
    item_index: int = Field(tag=1)


class CreateOrderRequest(Model):
    """Initial menu items."""
    menu: list[MenuItem] = Field(tag=1, default_factory=list)


api = API(
    User=Type(
        state=UserState,
        methods=Methods(
            start_order=Transaction(
                request=None,
                response=StartOrderResponse,
                description="Start a new food order with a "
                "pre-populated menu of items. Returns the "
                "order ID. Then show the menu UI.",
                mcp=Tool(),
            ),
        ),
    ),
    FoodOrder=Type(
        state=FoodOrderState,
        methods=Methods(
            show_menu=UI(
                request=None,
                path="web/ui/menu",
                title="Food Menu",
                description="Browse the food menu and add "
                "items to the cart.",
            ),
            show_cart=UI(
                request=None,
                path="web/ui/cart",
                title="Your Cart",
                description="View the cart with item details "
                "and total price.",
            ),
            create=Writer(
                request=CreateOrderRequest,
                response=None,
                factory=True,
                mcp=None,
            ),
            get_menu=Reader(
                request=None,
                response=MenuResponse,
                description="Get the food menu.",
                mcp=Tool(),
            ),
            get_cart=Reader(
                request=None,
                response=CartResponse,
                description="Get the current cart contents "
                "and total price.",
                mcp=Tool(),
            ),
            add_to_cart=Writer(
                request=AddToCartRequest,
                response=None,
                description="Add a menu item to the cart by "
                "its index (0-based). Specify quantity.",
                mcp=Tool(),
            ),
            remove_from_cart=Writer(
                request=RemoveFromCartRequest,
                response=None,
                description="Remove an item from the cart "
                "by its menu index.",
                mcp=Tool(),
            ),
        ),
    ),
)
