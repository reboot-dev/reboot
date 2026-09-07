Feature: Food orders

  Background:
    Given the application is up
    And "alice" is an authenticated user

  Scenario: Starting an order pre-populates the menu with an empty cart
    When "alice" does a `start_order` on `User` of "alice"
    And the resulting `order_id` is saved as "order_id"
    Then as "alice", `get_menu` on the `FoodOrder` for "<order_id>" has `items` of length `10` and `items[0].name="Chicken Burrito"` and `items[0].category="Burritos"` and `items[0].price_cents=1115`
    And as "alice", `get_cart` on the `FoodOrder` for "<order_id>" has `entries=[]` and `total_cents=0`

  Scenario: Adding the same item twice increments its quantity
    Given "alice" does a `start_order` on `User` of "alice"
    And the resulting `order_id` is saved as "order_id"
    When "alice" does a `add_to_cart` on `FoodOrder` of "<order_id>" with `item_index=0` and `quantity=1`
    And "alice" does a `add_to_cart` on `FoodOrder` of "<order_id>" with `item_index=0` and `quantity=1`
    And "alice" does a `add_to_cart` on `FoodOrder` of "<order_id>" with `item_index=1` and `quantity=1`
    Then as "alice", `get_cart` on the `FoodOrder` for "<order_id>" has `entries` of length `2` and `entries[0].item_index=0` and `entries[0].quantity=2` and `entries[1].item_index=1` and `entries[1].quantity=1` and `total_cents=3470`
    When "alice" does a `remove_from_cart` on `FoodOrder` of "<order_id>" with `item_index=0`
    Then as "alice", `get_cart` on the `FoodOrder` for "<order_id>" has `entries` of length `1` and `entries[0].item_index=1` and `total_cents=1240`

  Scenario: A quantity of zero means one
    Given "alice" does a `start_order` on `User` of "alice"
    And the resulting `order_id` is saved as "order_id"
    When "alice" does a `add_to_cart` on `FoodOrder` of "<order_id>" with `item_index=0` and `quantity=0`
    Then as "alice", `get_cart` on the `FoodOrder` for "<order_id>" has `entries` of length `1` and `entries[0].quantity=1`

  Scenario: Out-of-range menu indexes are refused
    Given "alice" does a `start_order` on `User` of "alice"
    And the resulting `order_id` is saved as "order_id"
    When "alice" attempts a `add_to_cart` on `FoodOrder` of "<order_id>" with `item_index=10` and `quantity=1`
    Then the attempt aborts with `Unknown`
    When "alice" attempts a `add_to_cart` on `FoodOrder` of "<order_id>" with `item_index=-1` and `quantity=1`
    Then the attempt aborts with `Unknown`

  Scenario: Another user cannot touch the order
    Given "alice" does a `start_order` on `User` of "alice"
    And the resulting `order_id` is saved as "order_id"
    And "bob" is an authenticated user
    Then as "bob", `get_cart` on the `FoodOrder` for "<order_id>" aborts with `PermissionDenied`
    When "bob" attempts a `add_to_cart` on `FoodOrder` of "<order_id>" with `item_index=0` and `quantity=1`
    Then the attempt aborts with `PermissionDenied`
