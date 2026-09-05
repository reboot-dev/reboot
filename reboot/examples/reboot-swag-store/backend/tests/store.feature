Feature: Swag store

  Background:
    Given the application is up
    And the authenticated user is "test-user"

  Scenario: The catalog lists unfiltered, in order
    Then `list_products` on the `User` for "test-user" has `products` of length `3` and `products[0].id="hat-1"` and `products[1].id="hoodie-1"` and `products[2].id="tee-1"`

  Scenario: Another user cannot read the cart
    Given a `Cart` for "cart-1" gets created via `create` with `owner_id="test-user"`
    And the `Cart` for "cart-1" gets a `add_item` with `quantity=1` and `product_id="hoodie-1"` and `variant_id="hoodie-1-l"` and `name="Reboot Hoodie"` and `price_cents=4000` and `image_url=""` and `size="L"`
    When the authenticated user is "other-user"
    Then `get_cart` on the `Cart` for "cart-1" aborts with `PermissionDenied`
    When the authenticated user is "test-user"
    Then `get_cart` on the `Cart` for "cart-1" has `items` of length `1`

  Scenario: Added items appear in the cart
    Given a `Cart` for "cart-1" gets created via `create` with `owner_id="test-user"`
    When the `Cart` for "cart-1" gets a `add_item` with `quantity=2` and `product_id="hoodie-1"` and `variant_id="hoodie-1-l"` and `name="Reboot Hoodie"` and `price_cents=4000` and `image_url=""` and `size="L"`
    Then `get_cart` on the `Cart` for "cart-1" has `items` of length `1` and `items[0].product_id="hoodie-1"` and `items[0].name="Reboot Hoodie"` and `items[0].size="L"` and `items[0].quantity=2`

  Scenario: Adding the same variant increments its quantity
    Given a `Cart` for "cart-1" gets created via `create` with `owner_id="test-user"`
    When the `Cart` for "cart-1" gets a `add_item` with `quantity=2` and `product_id="hoodie-1"` and `variant_id="hoodie-1-l"` and `name="Reboot Hoodie"` and `price_cents=4000` and `image_url=""` and `size="L"`
    And the `Cart` for "cart-1" gets a `add_item` with `quantity=1` and `product_id="hoodie-1"` and `variant_id="hoodie-1-l"` and `name="Reboot Hoodie"` and `price_cents=4000` and `image_url=""` and `size="L"`
    Then `get_cart` on the `Cart` for "cart-1" has `items` of length `1` and `items[0].quantity=3`

  Scenario: Adding a different variant adds a line
    Given a `Cart` for "cart-1" gets created via `create` with `owner_id="test-user"`
    When the `Cart` for "cart-1" gets a `add_item` with `quantity=1` and `product_id="hoodie-1"` and `variant_id="hoodie-1-l"` and `name="Reboot Hoodie"` and `price_cents=4000` and `image_url=""` and `size="L"`
    And the `Cart` for "cart-1" gets a `add_item` with `quantity=1` and `product_id="hoodie-1"` and `variant_id="hoodie-1-s"` and `name="Reboot Hoodie"` and `price_cents=4000` and `image_url=""` and `size="S"`
    Then `get_cart` on the `Cart` for "cart-1" has `items` of length `2` and `items[0].size="L"` and `items[1].size="S"`

  Scenario: Removed items leave the cart
    Given a `Cart` for "cart-1" gets created via `create` with `owner_id="test-user"`
    When the `Cart` for "cart-1" gets a `add_item` with `quantity=1` and `product_id="hoodie-1"` and `variant_id="hoodie-1-l"` and `name="Reboot Hoodie"` and `price_cents=4000` and `image_url=""` and `size="L"`
    And the `Cart` for "cart-1" gets a `remove_item` with `product_id="hoodie-1"`
    Then `get_cart` on the `Cart` for "cart-1" has `items=[]`

  Scenario: Checking out an empty cart is refused
    Given a `Cart` for "cart-1" gets created via `create` with `owner_id="test-user"`
    When the `Cart` for "cart-1" attempts a `checkout` with `coupon_code="000000"` and `shipping_address={name: "Jane Doe", email: "jane@example.com", address1: "123 Main St", address2: "", city: "Seattle", state_code: "WA", zip_code: "98101", country_code: "US"}`
    Then the attempt aborts with `CartEmpty`

  Scenario: An invalid coupon refuses checkout and keeps the cart
    Given a `Cart` for "cart-1" gets created via `create` with `owner_id="test-user"`
    And the `Cart` for "cart-1" gets a `add_item` with `quantity=1` and `product_id="hoodie-1"` and `variant_id="hoodie-1-l"` and `name="Reboot Hoodie"` and `price_cents=4000` and `image_url=""` and `size="L"`
    When the `Cart` for "cart-1" attempts a `checkout` with `coupon_code="definitely-not-a-real-code"` and `shipping_address={name: "Jane Doe", email: "jane@example.com", address1: "123 Main St", address2: "", city: "Seattle", state_code: "WA", zip_code: "98101", country_code: "US"}`
    Then the attempt aborts with `InvalidCoupon`
    And `get_cart` on the `Cart` for "cart-1" has `items` of length `1`

  Scenario: Checkout empties the cart and creates the order
    Given the bearer token is "test-admin-key"
    And the `CouponBook` for "coupon-book" gets a `generate_codes`
    And the resulting `codes[0]` is saved as `coupon_code`
    And the authenticated user is "test-user"
    And a `Cart` for "cart-1" gets created via `create` with `owner_id="test-user"`
    And the `Cart` for "cart-1" gets a `add_item` with `quantity=2` and `product_id="hoodie-1"` and `variant_id="hoodie-1-l"` and `name="Reboot Hoodie"` and `price_cents=4000` and `image_url=""` and `size="L"`
    When the `Cart` for "cart-1" gets a `checkout` with `coupon_code=<coupon_code>` and `shipping_address={name: "Jane Doe", email: "jane@example.com", address1: "123 Main St", address2: "", city: "Seattle", state_code: "WA", zip_code: "98101", country_code: "US"}`
    And the resulting `order_id` is saved as `order_id`
    Then `get_cart` on the `Cart` for "cart-1" has `items=[]`
    And `get_details` on the `Order` for "<order_id>" has `order_id=<order_id>` and `items` of length `1` and `items[0].product_id="hoodie-1"` and `items[0].quantity=2` and `subtotal_cents=8000` and `total_cents=0`

  Scenario: A redeemed coupon cannot be reused
    Given the bearer token is "test-admin-key"
    And the `CouponBook` for "coupon-book" gets a `generate_codes`
    And the resulting `codes[0]` is saved as `coupon_code`
    And the authenticated user is "test-user"
    And a `Cart` for "cart-1" gets created via `create` with `owner_id="test-user"`
    And the `Cart` for "cart-1" gets a `add_item` with `quantity=1` and `product_id="hoodie-1"` and `variant_id="hoodie-1-l"` and `name="Reboot Hoodie"` and `price_cents=4000` and `image_url=""` and `size="L"`
    And the `Cart` for "cart-1" gets a `checkout` with `coupon_code=<coupon_code>` and `shipping_address={name: "Jane Doe", email: "jane@example.com", address1: "123 Main St", address2: "", city: "Seattle", state_code: "WA", zip_code: "98101", country_code: "US"}`
    And a `Cart` for "cart-2" gets created via `create` with `owner_id="test-user"`
    And the `Cart` for "cart-2" gets a `add_item` with `quantity=1` and `product_id="hoodie-1"` and `variant_id="hoodie-1-l"` and `name="Reboot Hoodie"` and `price_cents=4000` and `image_url=""` and `size="L"`
    When the `Cart` for "cart-2" attempts a `checkout` with `coupon_code=<coupon_code>` and `shipping_address={name: "Jane Doe", email: "jane@example.com", address1: "123 Main St", address2: "", city: "Seattle", state_code: "WA", zip_code: "98101", country_code: "US"}`
    Then the attempt aborts with `InvalidCoupon`

  Scenario: Generating coupon codes requires the admin bearer token
    When the `CouponBook` for "coupon-book" attempts a `generate_codes`
    Then the attempt aborts with `PermissionDenied`

  Scenario: The admin bearer token generates fresh six-digit codes
    Given the bearer token is "test-admin-key"
    When the `CouponBook` for "coupon-book" gets a `generate_codes`
    Then the result has `codes` of length `20`
    And every generated code is six digits
