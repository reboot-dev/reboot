Feature: Swag store

  Background:
    Given the application is up
    And "test-user" is an authenticated user

  Scenario: The catalog lists unfiltered, in order
    Then as "test-user", `list_products` on the `User` for "test-user" has `products` of length `3` and `products[0].id="hat-1"` and `products[1].id="hoodie-1"` and `products[2].id="tee-1"`

  Scenario: Another user cannot read the cart
    Given "test-user" creates a `Cart` via `create` with `owner_id="test-user"`
    And the resulting state id is saved as `cart_id`
    And "test-user" does a `add_item` on `Cart` of "<cart_id>" with `quantity=1` and `product_id="hoodie-1"` and `variant_id="hoodie-1-l"` and `name="Reboot Hoodie"` and `price_cents=4000` and `image_url=""` and `size="L"`
    And "other-user" is an authenticated user
    Then as "other-user", `get_cart` on the `Cart` for "<cart_id>" aborts with `PermissionDenied`
    And as "test-user", `get_cart` on the `Cart` for "<cart_id>" has `items` of length `1`

  Scenario: Added items appear in the cart
    Given "test-user" creates a `Cart` via `create` with `owner_id="test-user"`
    And the resulting state id is saved as `cart_id`
    When "test-user" does a `add_item` on `Cart` of "<cart_id>" with `quantity=2` and `product_id="hoodie-1"` and `variant_id="hoodie-1-l"` and `name="Reboot Hoodie"` and `price_cents=4000` and `image_url=""` and `size="L"`
    Then as "test-user", `get_cart` on the `Cart` for "<cart_id>" has `items` of length `1` and `items[0].product_id="hoodie-1"` and `items[0].name="Reboot Hoodie"` and `items[0].size="L"` and `items[0].quantity=2`

  Scenario: Adding the same variant increments its quantity
    Given "test-user" creates a `Cart` via `create` with `owner_id="test-user"`
    And the resulting state id is saved as `cart_id`
    When "test-user" does a `add_item` on `Cart` of "<cart_id>" with `quantity=2` and `product_id="hoodie-1"` and `variant_id="hoodie-1-l"` and `name="Reboot Hoodie"` and `price_cents=4000` and `image_url=""` and `size="L"`
    And "test-user" does a `add_item` on `Cart` of "<cart_id>" with `quantity=1` and `product_id="hoodie-1"` and `variant_id="hoodie-1-l"` and `name="Reboot Hoodie"` and `price_cents=4000` and `image_url=""` and `size="L"`
    Then as "test-user", `get_cart` on the `Cart` for "<cart_id>" has `items` of length `1` and `items[0].quantity=3`

  Scenario: Adding a different variant adds a line
    Given "test-user" creates a `Cart` via `create` with `owner_id="test-user"`
    And the resulting state id is saved as `cart_id`
    When "test-user" does a `add_item` on `Cart` of "<cart_id>" with `quantity=1` and `product_id="hoodie-1"` and `variant_id="hoodie-1-l"` and `name="Reboot Hoodie"` and `price_cents=4000` and `image_url=""` and `size="L"`
    And "test-user" does a `add_item` on `Cart` of "<cart_id>" with `quantity=1` and `product_id="hoodie-1"` and `variant_id="hoodie-1-s"` and `name="Reboot Hoodie"` and `price_cents=4000` and `image_url=""` and `size="S"`
    Then as "test-user", `get_cart` on the `Cart` for "<cart_id>" has `items` of length `2` and `items[0].size="L"` and `items[1].size="S"`

  Scenario: Removed items leave the cart
    Given "test-user" creates a `Cart` via `create` with `owner_id="test-user"`
    And the resulting state id is saved as `cart_id`
    When "test-user" does a `add_item` on `Cart` of "<cart_id>" with `quantity=1` and `product_id="hoodie-1"` and `variant_id="hoodie-1-l"` and `name="Reboot Hoodie"` and `price_cents=4000` and `image_url=""` and `size="L"`
    And "test-user" does a `remove_item` on `Cart` of "<cart_id>" with `product_id="hoodie-1"`
    Then as "test-user", `get_cart` on the `Cart` for "<cart_id>" has `items=[]`

  Scenario: Checking out an empty cart is refused
    Given "test-user" creates a `Cart` via `create` with `owner_id="test-user"`
    And the resulting state id is saved as `cart_id`
    When "test-user" attempts a `checkout` on `Cart` of "<cart_id>" with `coupon_code="000000"` and `shipping_address={name: "Jane Doe", email: "jane@example.com", address1: "123 Main St", address2: "", city: "Seattle", state_code: "WA", zip_code: "98101", country_code: "US"}`
    Then the attempt aborts with `CartEmpty`

  Scenario: An invalid coupon refuses checkout and keeps the cart
    Given "test-user" creates a `Cart` via `create` with `owner_id="test-user"`
    And the resulting state id is saved as `cart_id`
    And "test-user" does a `add_item` on `Cart` of "<cart_id>" with `quantity=1` and `product_id="hoodie-1"` and `variant_id="hoodie-1-l"` and `name="Reboot Hoodie"` and `price_cents=4000` and `image_url=""` and `size="L"`
    When "test-user" attempts a `checkout` on `Cart` of "<cart_id>" with `coupon_code="definitely-not-a-real-code"` and `shipping_address={name: "Jane Doe", email: "jane@example.com", address1: "123 Main St", address2: "", city: "Seattle", state_code: "WA", zip_code: "98101", country_code: "US"}`
    Then the attempt aborts with `InvalidCoupon`
    And as "test-user", `get_cart` on the `Cart` for "<cart_id>" has `items` of length `1`

  Scenario: Checkout empties the cart and creates the order
    Given "admin" has the bearer token "test-admin-key"
    And "admin" does a `generate_codes` on `CouponBook` of "coupon-book"
    And the resulting `codes[0]` is saved as `coupon_code`
    And "test-user" creates a `Cart` via `create` with `owner_id="test-user"`
    And the resulting state id is saved as `cart_id`
    And "test-user" does a `add_item` on `Cart` of "<cart_id>" with `quantity=2` and `product_id="hoodie-1"` and `variant_id="hoodie-1-l"` and `name="Reboot Hoodie"` and `price_cents=4000` and `image_url=""` and `size="L"`
    When "test-user" does a `checkout` on `Cart` of "<cart_id>" with `coupon_code=<coupon_code>` and `shipping_address={name: "Jane Doe", email: "jane@example.com", address1: "123 Main St", address2: "", city: "Seattle", state_code: "WA", zip_code: "98101", country_code: "US"}`
    And the resulting `order_id` is saved as `order_id`
    Then as "test-user", `get_cart` on the `Cart` for "<cart_id>" has `items=[]`
    And as "test-user", `get_details` on the `Order` for "<order_id>" has `order_id=<order_id>` and `items` of length `1` and `items[0].product_id="hoodie-1"` and `items[0].quantity=2` and `subtotal_cents=8000` and `total_cents=0`

  Scenario: A redeemed coupon cannot be reused
    Given "admin" has the bearer token "test-admin-key"
    And "admin" does a `generate_codes` on `CouponBook` of "coupon-book"
    And the resulting `codes[0]` is saved as `coupon_code`
    And "test-user" creates a `Cart` via `create` with `owner_id="test-user"`
    And the resulting state id is saved as `cart_id`
    And "test-user" does a `add_item` on `Cart` of "<cart_id>" with `quantity=1` and `product_id="hoodie-1"` and `variant_id="hoodie-1-l"` and `name="Reboot Hoodie"` and `price_cents=4000` and `image_url=""` and `size="L"`
    And "test-user" does a `checkout` on `Cart` of "<cart_id>" with `coupon_code=<coupon_code>` and `shipping_address={name: "Jane Doe", email: "jane@example.com", address1: "123 Main St", address2: "", city: "Seattle", state_code: "WA", zip_code: "98101", country_code: "US"}`
    And "test-user" creates a `Cart` via `create` with `owner_id="test-user"`
    And the resulting state id is saved as `second_cart_id`
    And "test-user" does a `add_item` on `Cart` of "<second_cart_id>" with `quantity=1` and `product_id="hoodie-1"` and `variant_id="hoodie-1-l"` and `name="Reboot Hoodie"` and `price_cents=4000` and `image_url=""` and `size="L"`
    When "test-user" attempts a `checkout` on `Cart` of "<second_cart_id>" with `coupon_code=<coupon_code>` and `shipping_address={name: "Jane Doe", email: "jane@example.com", address1: "123 Main St", address2: "", city: "Seattle", state_code: "WA", zip_code: "98101", country_code: "US"}`
    Then the attempt aborts with `InvalidCoupon`

  Scenario: Generating coupon codes requires the admin bearer token
    When "test-user" attempts a `generate_codes` on `CouponBook` of "coupon-book"
    Then the attempt aborts with `PermissionDenied`

  Scenario: The admin bearer token generates fresh six-digit codes
    Given "admin" has the bearer token "test-admin-key"
    When "admin" does a `generate_codes` on `CouponBook` of "coupon-book"
    Then the result has `codes` of length `20`
    And every generated code is six digits
