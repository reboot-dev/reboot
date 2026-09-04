Feature: Food orders

  Background:
    Given the application is up
    And the authenticated user is "alice"

  Scenario: Starting an order pre-populates the menu with an empty cart
    When the `User` for "alice" gets a `start_order`
    And the resulting `order_id` is saved as `order_id`
    Then `get_menu` on the `FoodOrder` for "${order_id}" has `items` of length `10` and `items[0].name="Chicken Burrito"` and `items[0].category="Burritos"` and `items[0].price_cents=1115`
    And `get_cart` on the `FoodOrder` for "${order_id}" has `entries=[]` and `total_cents=0`

  Scenario: Adding the same item twice increments its quantity
    Given the `User` for "alice" gets a `start_order`
    And the resulting `order_id` is saved as `order_id`
    When the `FoodOrder` for "${order_id}" gets a `add_to_cart` with `item_index=0` and `quantity=1`
    And the `FoodOrder` for "${order_id}" gets a `add_to_cart` with `item_index=0` and `quantity=1`
    And the `FoodOrder` for "${order_id}" gets a `add_to_cart` with `item_index=1` and `quantity=1`
    Then `get_cart` on the `FoodOrder` for "${order_id}" has `entries` of length `2` and `entries[0].item_index=0` and `entries[0].quantity=2` and `entries[1].item_index=1` and `entries[1].quantity=1` and `total_cents=3470`
    When the `FoodOrder` for "${order_id}" gets a `remove_from_cart` with `item_index=0`
    Then `get_cart` on the `FoodOrder` for "${order_id}" has `entries` of length `1` and `entries[0].item_index=1` and `total_cents=1240`

  Scenario: A quantity of zero means one
    Given the `User` for "alice" gets a `start_order`
    And the resulting `order_id` is saved as `order_id`
    When the `FoodOrder` for "${order_id}" gets a `add_to_cart` with `item_index=0` and `quantity=0`
    Then `get_cart` on the `FoodOrder` for "${order_id}" has `entries` of length `1` and `entries[0].quantity=1`

  Scenario: Out-of-range menu indexes are refused
    Given the `User` for "alice" gets a `start_order`
    And the resulting `order_id` is saved as `order_id`
    When the `FoodOrder` for "${order_id}" attempts a `add_to_cart` with `item_index=10` and `quantity=1`
    Then the attempt aborts with `Unknown`
    When the `FoodOrder` for "${order_id}" attempts a `add_to_cart` with `item_index=-1` and `quantity=1`
    Then the attempt aborts with `Unknown`

  Scenario: Another user cannot touch the order
    Given the `User` for "alice" gets a `start_order`
    And the resulting `order_id` is saved as `order_id`
    When the authenticated user is "bob"
    Then `get_cart` on the `FoodOrder` for "${order_id}" aborts with `PermissionDenied`
    When the `FoodOrder` for "${order_id}" attempts a `add_to_cart` with `item_index=0` and `quantity=1`
    Then the attempt aborts with `PermissionDenied`
