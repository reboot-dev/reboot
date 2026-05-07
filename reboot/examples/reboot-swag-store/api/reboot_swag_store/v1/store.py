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
    Workflow,
    Writer,
)

# -- Shared models. --


class Variant(Model):
    """A size/color variant of a product."""
    id: str = Field(tag=1)
    size: str = Field(tag=2)
    color: str = Field(tag=3)
    price_cents: int = Field(tag=4)
    image_url: str = Field(tag=5, default="")


class Product(Model):
    """A product available in the store."""
    id: str = Field(tag=1)
    name: str = Field(tag=2)
    description: str = Field(tag=3)
    price_cents: int = Field(tag=4)
    # Tag 5 was previously `category`; left vacant to avoid
    # rebinding the wire tag if removed-and-re-added.
    image_url: str = Field(tag=6, default="")
    variants: list[Variant] = Field(tag=7, default_factory=list)


class CartItem(Model):
    """An item in a shopping cart."""
    product_id: str = Field(tag=1)
    name: str = Field(tag=2)
    price_cents: int = Field(tag=3)
    quantity: int = Field(tag=4)
    image_url: str = Field(tag=5, default="")
    variant_id: str = Field(tag=6, default="")
    size: str = Field(tag=7, default="")


class OrderItem(Model):
    """An item in a completed order."""
    product_id: str = Field(tag=1)
    name: str = Field(tag=2)
    price_cents: int = Field(tag=3)
    quantity: int = Field(tag=4)
    size: str = Field(tag=5, default="")


class ShippingAddress(Model):
    """Shipping address for order fulfillment."""
    name: str = Field(tag=1)
    address1: str = Field(tag=2)
    city: str = Field(tag=3)
    state_code: str = Field(tag=4)
    zip_code: str = Field(tag=5)
    country_code: str = Field(tag=6)
    address2: str = Field(tag=7)
    email: str = Field(tag=8)


# -- User models. --


class UserState(Model):
    pass


class CreateCartResponse(Model):
    cart_id: str = Field(tag=1)


class ListProductsResponse(Model):
    products: list[Product] = Field(tag=1, default_factory=list)


class BrowseStoreRequest(Model):
    """Subset of products to render in the storefront UI.
    The model picks `product_ids` after reading the catalog
    from `list_products`. Empty list shows every product."""
    product_ids: list[str] = Field(tag=1, default_factory=list)


# -- Cart models. --


class CartState(Model):
    items: list[CartItem] = Field(tag=1, default_factory=list)
    # OAuth user-id of the session that created the cart;
    # only that caller can read or mutate it.
    owner_id: str = Field(tag=2, default="")


class CartCreateRequest(Model):
    owner_id: str = Field(tag=1)


class AddItemRequest(Model):
    product_id: str = Field(tag=1)
    quantity: int = Field(tag=2)
    variant_id: str = Field(tag=3)
    name: str = Field(tag=4)
    price_cents: int = Field(tag=5)
    image_url: str = Field(tag=6)
    size: str = Field(tag=7)


class RemoveItemRequest(Model):
    product_id: str = Field(tag=1)


class GetItemsResponse(Model):
    items: list[CartItem] = Field(tag=1, default_factory=list)


class ValidateCouponRequest(Model):
    coupon_code: str = Field(tag=1)


class ValidateCouponResponse(Model):
    valid: bool = Field(tag=1)


class CheckoutRequest(Model):
    shipping_address: ShippingAddress = Field(tag=1)
    coupon_code: str = Field(tag=2)


class CheckoutResponse(Model):
    order_id: str = Field(tag=1)


class CartEmpty(Model):
    """Checkout was attempted on an empty cart."""


class InvalidCoupon(Model):
    """Checkout was attempted with a coupon code that is
    unknown or has already been redeemed."""
    coupon_code: str = Field(tag=1)


# -- CouponBook models. --


class CouponBookState(Model):
    codes: list[str] = Field(tag=1, default_factory=list)


class GenerateCodesResponse(Model):
    codes: list[str] = Field(tag=1, default_factory=list)


class RedeemCodeRequest(Model):
    code: str = Field(tag=1)


class RedeemCodeResponse(Model):
    success: bool = Field(tag=1)


# -- Order models. --


class OrderState(Model):
    order_id: str = Field(tag=1, default="")
    items: list[OrderItem] = Field(tag=2, default_factory=list)
    subtotal_cents: int = Field(tag=3, default=0)
    shipping_cents: int = Field(tag=4, default=0)
    total_cents: int = Field(tag=5, default=0)
    shipping_name: str = Field(tag=6, default="")
    created_at: str = Field(tag=7, default="")
    # OAuth user-id of the session that placed the order;
    # only that caller can read it back via `get_details` or
    # `show_confirmation`.
    owner_id: str = Field(tag=8, default="")


class CreateOrderRequest(Model):
    order_id: str = Field(tag=1)
    items: list[OrderItem] = Field(tag=2, default_factory=list)
    subtotal_cents: int = Field(tag=3)
    shipping_cents: int = Field(tag=4)
    total_cents: int = Field(tag=5)
    shipping_name: str = Field(tag=6)
    created_at: str = Field(tag=7)
    owner_id: str = Field(tag=8)


class FulfillRequest(Model):
    shipping_address: ShippingAddress = Field(tag=1)
    variant_ids: list[str] = Field(tag=2, default_factory=list)
    quantities: list[int] = Field(tag=3, default_factory=list)


class GetDetailsResponse(Model):
    order_id: str = Field(tag=1)
    items: list[OrderItem] = Field(tag=2, default_factory=list)
    subtotal_cents: int = Field(tag=3)
    shipping_cents: int = Field(tag=4)
    total_cents: int = Field(tag=5)
    shipping_name: str = Field(tag=6)
    created_at: str = Field(tag=7)


api = API(
    User=Type(
        state=UserState,
        methods=Methods(
            browse_store=UI(
                request=BrowseStoreRequest,
                path="web/ui/store",
                title="Reboot Store",
                description="Open a visual storefront for "
                "the Reboot swag store. To honor a user "
                "filter (e.g. 'show me hats'), first call "
                "`list_products` to read the catalog, pick "
                "the IDs whose name or description matches "
                "the user's intent, then call this with "
                "those IDs in `product_ids`. Pass an empty "
                "list to show every product.",
                mcp=Tool(),
            ),
            list_products=Reader(
                request=None,
                response=ListProductsResponse,
                description="Return the full product "
                "catalog. Call this before `browse_store` "
                "whenever the user wants to see, filter, "
                "or shop for specific items, so you can "
                "pick the IDs of products that match the "
                "user's request and pass them to "
                "`browse_store`.",
                mcp=Tool(),
            ),
            create_cart=Transaction(
                request=None,
                response=CreateCartResponse,
                description="Create a new shopping cart. "
                "Returns the cart ID. Call this before "
                "adding items.",
                mcp=Tool(),
            ),
        ),
    ),
    Cart=Type(
        state=CartState,
        methods=Methods(
            create=Writer(
                request=CartCreateRequest,
                response=None,
                factory=True,
                mcp=None,
            ),
            add_item=Writer(
                request=AddItemRequest,
                response=None,
                description="Add a product to the cart. "
                "Requires product_id, variant_id, name, "
                "price_cents, image_url, and size. "
                "Increments quantity if the same "
                "product+variant is already in the cart.",
                mcp=Tool(),
            ),
            remove_item=Writer(
                request=RemoveItemRequest,
                response=None,
                description="Remove a product from the "
                "cart by product ID.",
                mcp=Tool(),
            ),
            get_cart=Reader(
                request=None,
                response=GetItemsResponse,
                description="Get all items currently in "
                "the cart.",
                mcp=Tool(),
            ),
            show_cart=UI(
                request=None,
                path="web/ui/cart",
                title="Shopping Cart",
                description="View the shopping cart with "
                "items, totals, and checkout form.",
                mcp=Tool(),
            ),
            checkout=Transaction(
                request=CheckoutRequest,
                response=CheckoutResponse,
                errors=[CartEmpty, InvalidCoupon],
                description="Check out the cart. Provide "
                "a shipping address and a valid coupon "
                "code. Creates an order and empties the "
                "cart. Returns the order ID.",
                mcp=Tool(),
            ),
        ),
    ),
    CouponBook=Type(
        state=CouponBookState,
        methods=Methods(
            create=Writer(
                request=None,
                response=None,
                factory=True,
                mcp=None,
            ),
            generate_codes=Writer(
                request=None,
                response=GenerateCodesResponse,
                description="Generate 20 single-use "
                "coupon codes. Admin only.",
                mcp=None,
            ),
            validate_code=Reader(
                request=ValidateCouponRequest,
                response=ValidateCouponResponse,
                description="Check whether a coupon "
                "code is valid (exists and unused).",
                mcp=None,
            ),
            redeem_code=Writer(
                request=RedeemCodeRequest,
                response=RedeemCodeResponse,
                description="Redeem a coupon code, "
                "removing it from the available pool.",
                mcp=None,
            ),
        ),
    ),
    Order=Type(
        state=OrderState,
        methods=Methods(
            create=Writer(
                request=CreateOrderRequest,
                response=None,
                factory=True,
                mcp=None,
            ),
            fulfill=Workflow(
                request=FulfillRequest,
                response=None,
                description="Fulfill the order via "
                "Printful. Called automatically after "
                "checkout.",
                mcp=None,
            ),
            show_confirmation=UI(
                request=None,
                path="web/ui/confirmation",
                title="Order Confirmation",
                description="View the order confirmation "
                "with details and receipt.",
                mcp=Tool(),
            ),
            get_details=Reader(
                request=None,
                response=GetDetailsResponse,
                description="Get the details of a "
                "completed order.",
                mcp=Tool(),
            ),
        ),
    ),
)
