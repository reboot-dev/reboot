import os
import rbt.v1alpha1.errors_pb2
import secrets
import uuid7
from constants import COUPON_BOOK_ID
from datetime import datetime, timezone
from printful import create_order, fetch_products
from reboot.aio.auth.authorizers import allow_if, is_app_internal
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WorkflowContext,
    WriterContext,
)
from reboot.aio.workflows import at_least_once
from reboot_swag_store.v1.store import (
    CartEmpty,
    CartItem,
    InvalidCoupon,
    OrderItem,
)
from reboot_swag_store.v1.store_rbt import Cart, CouponBook, Order, User

# Environment variable that gates `CouponBook.generate_codes`.
# Locally read from `.env` (see `.env.example`).
STORE_ADMIN_KEY_ENV = "STORE_ADMIN_KEY"


async def _caller_is_authenticated(*, context, **kwargs):
    """Allow when the caller has any non-empty OAuth user-id.
    Anonymous guest sessions still satisfy this (the framework
    issues them a stable user-id); only fully unauthenticated
    callers fail."""
    if context.auth is None or not context.auth.user_id:
        return rbt.v1alpha1.errors_pb2.Unauthenticated()
    return rbt.v1alpha1.errors_pb2.Ok()


async def _caller_is_owner(*, context, state, **kwargs):
    """Allow when the caller's OAuth user-id matches the
    `owner_id` recorded on this state. State that hasn't been
    constructed yet (state is None) falls through to deny."""
    if context.auth is None or not context.auth.user_id:
        return rbt.v1alpha1.errors_pb2.Unauthenticated()
    if state is not None and context.auth.user_id == state.owner_id:
        return rbt.v1alpha1.errors_pb2.Ok()
    return rbt.v1alpha1.errors_pb2.PermissionDenied()


class UserServicer(User.Servicer):
    # No explicit authorizer: `User` is auto-constructed
    # `PER_USER_ID`, so the framework only routes calls whose
    # caller user-id matches the state-id, which is exactly
    # the security check we want here.

    async def list_products(
        self,
        context: ReaderContext,
    ) -> User.ListProductsResponse:
        """Return the full Printful catalog (cached). Filtering
        happens on the client: the model calls this tool, picks
        product IDs that match the user's intent, then passes
        them to `browse_store` which renders the subset."""
        products = await fetch_products()
        return User.ListProductsResponse(
            products=products,
        )

    async def create_cart(
        self,
        context: TransactionContext,
    ) -> User.CreateCartResponse:
        """Create a new shopping cart owned by the calling
        user. The user-id comes from the auth context (the
        framework already enforced caller==state-id to reach
        this method), and is recorded on the cart so only
        this session can mutate it."""
        owner_id = context.auth.user_id if context.auth else ""
        cart, _ = await Cart.create(context, owner_id=owner_id)
        return User.CreateCartResponse(
            cart_id=cart.state_id,
        )


async def _is_admin(*, context, state, request, **kwargs):
    """Allow only requests bearing a valid admin key, read
    from the `STORE_ADMIN_KEY` env var."""
    expected = os.environ.get(STORE_ADMIN_KEY_ENV)
    token = context.caller_bearer_token
    if not expected or token != expected:
        return rbt.v1alpha1.errors_pb2.PermissionDenied()
    return rbt.v1alpha1.errors_pb2.Ok()


class CouponBookServicer(CouponBook.Servicer):

    def authorizer(self):
        return CouponBook.Authorizer(
            # `create` runs once from `initialize`, and
            # `redeem_code` is only ever called from
            # `Cart.checkout` — both app-internal.
            # `validate_code` is different: the cart UI calls
            # it directly from the browser to give the buyer
            # instant green/red feedback before they hit
            # checkout, so it has to allow any authenticated
            # session.
            create=allow_if(any=[is_app_internal]),
            generate_codes=allow_if(all=[_is_admin]),
            validate_code=allow_if(any=[_caller_is_authenticated]),
            redeem_code=allow_if(any=[is_app_internal]),
        )

    async def create(self, context: WriterContext) -> None:
        """Generate initial batch of codes on creation."""
        self.state.codes = self._make_codes(20)

    async def generate_codes(
        self,
        context: WriterContext,
    ) -> CouponBook.GenerateCodesResponse:
        """Generate 20 six-digit coupon codes."""
        new_codes = self._make_codes(20)
        self.state.codes.extend(new_codes)
        return CouponBook.GenerateCodesResponse(
            codes=new_codes,
        )

    @staticmethod
    def _make_codes(count: int) -> list[str]:
        return [
            "".join(str(secrets.randbelow(10))
                    for _ in range(6))
            for _ in range(count)
        ]

    async def validate_code(
        self,
        context: ReaderContext,
        request: CouponBook.ValidateCodeRequest,
    ) -> CouponBook.ValidateCodeResponse:
        """Check if a code exists in the pool."""
        code = request.coupon_code.strip()
        return CouponBook.ValidateCodeResponse(
            valid=(code in self.state.codes),
        )

    async def redeem_code(
        self,
        context: WriterContext,
        request: CouponBook.RedeemCodeRequest,
    ) -> CouponBook.RedeemCodeResponse:
        """Redeem a code, removing it from the pool."""
        code = request.code.strip()
        if code in self.state.codes:
            self.state.codes.remove(code)
            return CouponBook.RedeemCodeResponse(
                success=True,
            )
        return CouponBook.RedeemCodeResponse(
            success=False,
        )


class CartServicer(Cart.Servicer):

    def authorizer(self):
        # `create` has no state yet, so we fall back to "any
        # authenticated session" — the cart records its owner
        # and every method afterwards locks to that owner. UI
        # methods (e.g. `show_cart`) aren't listed: the
        # framework authorizes them based on the underlying
        # state, not via this map.
        return Cart.Authorizer(
            create=allow_if(any=[_caller_is_authenticated]),
            add_item=allow_if(any=[_caller_is_owner]),
            remove_item=allow_if(any=[_caller_is_owner]),
            get_cart=allow_if(any=[_caller_is_owner]),
            checkout=allow_if(any=[_caller_is_owner]),
        )

    async def create(
        self,
        context: WriterContext,
        request: Cart.CreateRequest,
    ) -> None:
        self.state.owner_id = request.owner_id

    async def add_item(
        self,
        context: WriterContext,
        request: Cart.AddItemRequest,
    ) -> None:
        """Add a product to the cart."""
        # Check if same product+variant already in cart.
        for item in self.state.items:
            if (
                item.product_id == request.product_id and
                item.variant_id == request.variant_id
            ):
                item.quantity += max(request.quantity, 1)
                return

        self.state.items.append(
            CartItem(
                product_id=request.product_id,
                name=request.name,
                price_cents=request.price_cents,
                quantity=max(request.quantity, 1),
                image_url=request.image_url,
                variant_id=request.variant_id,
                size=request.size,
            )
        )

    async def remove_item(
        self,
        context: WriterContext,
        request: Cart.RemoveItemRequest,
    ) -> None:
        """Remove a product from the cart."""
        self.state.items = [
            item for item in self.state.items
            if item.product_id != request.product_id
        ]

    async def get_cart(
        self,
        context: ReaderContext,
    ) -> Cart.GetCartResponse:
        return Cart.GetCartResponse(
            items=self.state.items,
        )

    async def checkout(
        self,
        context: TransactionContext,
        request: Cart.CheckoutRequest,
    ) -> Cart.CheckoutResponse:
        """Process checkout: redeem coupon, create
        order, schedule fulfillment, empty cart."""
        if not self.state.items:
            raise Cart.CheckoutAborted(CartEmpty())

        # Redeem the coupon code via CouponBook.
        code = request.coupon_code.strip()
        book = CouponBook.ref(COUPON_BOOK_ID)
        result = await book.redeem_code(
            context,
            CouponBook.RedeemCodeRequest(code=code),
        )
        if not result.success:
            raise Cart.CheckoutAborted(InvalidCoupon(coupon_code=code))

        subtotal_cents = sum(
            item.price_cents * item.quantity for item in self.state.items
        )
        # Coupon makes the order free.
        total_cents = 0

        order_id = str(uuid7.create())

        order_items = [
            OrderItem(
                product_id=item.product_id,
                name=item.name,
                price_cents=item.price_cents,
                quantity=item.quantity,
                size=item.size,
            ) for item in self.state.items
        ]

        variant_ids = [item.variant_id for item in self.state.items]
        quantities = [item.quantity for item in self.state.items]

        order, _ = await Order.create(
            context,
            order_id,
            Order.CreateRequest(
                order_id=order_id,
                items=order_items,
                subtotal_cents=subtotal_cents,
                shipping_cents=0,
                total_cents=total_cents,
                shipping_name=(request.shipping_address.name),
                created_at=datetime.now(timezone.utc).isoformat(),
                # Carry the cart's owner forward so the order
                # is visible only to the buyer.
                owner_id=self.state.owner_id,
            ),
        )

        # Schedule fulfillment workflow (Printful order).
        await order.schedule().fulfill(
            context,
            shipping_address=request.shipping_address,
            variant_ids=variant_ids,
            quantities=quantities,
        )

        # Empty the cart.
        self.state.items = []

        return Cart.CheckoutResponse(order_id=order_id)


class OrderServicer(Order.Servicer):

    def authorizer(self):
        return Order.Authorizer(
            # Orders are only created by `Cart.checkout`
            # (app-internal). `fulfill` is the workflow the
            # checkout schedules; it also runs internally.
            # `show_confirmation` is a UI method, authorized
            # by the framework via the underlying state.
            create=allow_if(any=[is_app_internal]),
            fulfill=allow_if(any=[is_app_internal]),
            get_details=allow_if(any=[_caller_is_owner]),
        )

    @classmethod
    async def fulfill(
        cls,
        context: WorkflowContext,
        request: Order.FulfillRequest,
    ) -> None:
        """Fulfill the order via Printful."""
        items = [
            {
                "variant_id": variant_id,
                "quantity": quantity,
            } for variant_id, quantity in zip(
                request.variant_ids,
                request.quantities,
            )
        ]

        order_id = context.state_id

        async def _place_order():
            await create_order(
                items,
                request.shipping_address,
                external_id=order_id,
            )

        await at_least_once(
            order_id,
            context,
            _place_order,
        )

    async def create(
        self,
        context: WriterContext,
        request: Order.CreateRequest,
    ) -> None:
        """Store order details in state."""
        self.state.order_id = request.order_id
        self.state.items = list(request.items)
        self.state.subtotal_cents = (request.subtotal_cents)
        self.state.shipping_cents = (request.shipping_cents)
        self.state.total_cents = request.total_cents
        self.state.shipping_name = request.shipping_name
        self.state.created_at = request.created_at
        self.state.owner_id = request.owner_id

    async def get_details(
        self,
        context: ReaderContext,
    ) -> Order.GetDetailsResponse:
        return Order.GetDetailsResponse(
            order_id=self.state.order_id,
            items=self.state.items,
            subtotal_cents=self.state.subtotal_cents,
            shipping_cents=self.state.shipping_cents,
            total_cents=self.state.total_cents,
            shipping_name=self.state.shipping_name,
            created_at=self.state.created_at,
        )
