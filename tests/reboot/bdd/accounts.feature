Feature: Accounts

  Background:
    Given the application is up

  Scenario: Depositing adds to the balance
    Given an `Account` for "alice" gets created via `open` with `initial_balance=100`
    When the `Account` for "alice" gets a `deposit` with `amount=50`
    Then the result has `updated_balance=150`
    And `balance` on the `Account` for "alice" has `balance=150`

  Scenario: Withdrawing more than the balance is refused
    Given an `Account` for "bob" gets created via `open`
    And the `Account` for "bob" gets a `deposit` with `amount=30`
    When the `Account` for "bob" attempts a `withdraw` with `amount=50`
    Then the attempt aborts with `OverdraftError` where `amount=20`
    And `balance` on the `Account` for "bob" has `balance=30`

  Scenario: Custom async steps share the application
    Given an `Account` for "carol" gets created via `open` with `initial_balance=10`
    When "carol" makes 3 deposits of 7
    Then `balance` on the `Account` for "carol" has `balance=31`

  Scenario: Steps can save result properties
    Given an `Account` for "eve" gets created via `open` with `initial_balance=9`
    And the resulting `account_id` is saved as "$eve_account"
    When the `Account` for "$eve_account" gets a `deposit` with `amount=1`
    And the resulting `updated_balance` is saved as "$balance"
    And the `Account` for "$eve_account" gets a `deposit` with `amount=$balance`
    When `balance` on the `Account` for "$eve_account" has `balance` saved as "$current"
    And the `Account` for "$eve_account" gets a `deposit` with `amount=$current`
    Then `balance` on the `Account` for "$eve_account" has `balance=40`

  Scenario: Saving during setup
    Given an `Account` for "gus" gets created via `open` with `initial_balance=7`
    And `balance` on the `Account` for "gus" has `balance` saved as "$initial" and `balance` saved as "$twin"
    When the `Account` for "gus" gets a `deposit` with `amount=$initial`
    Then `balance` on the `Account` for "gus" has `balance=14`

  Scenario: Properties can be messages
    Given an `Account` for "frank" gets created via `open`
    When the `Account` for "frank" gets a `set_owner` with `owner={name: "Frank", tags: ["vip", "beta"]}`
    Then `get_owner` on the `Account` for "frank" has `owner={name: "Frank", tags: ["vip", "beta"]}`
    When the `Account` for "frank" gets a `set_owner` with `owner.name="Frankie"` and `owner.tags=["pro"]`
    Then `get_owner` on the `Account` for "frank" has `owner={name: "Frankie", tags: ["pro"]}`
    And `get_owner` on the `Account` for "frank" has `owner.name="Frankie"`
    And `get_owner` on the `Account` for "frank" has `owner.tags[0]="pro"`
    When `get_owner` on the `Account` for "frank" has `owner.name` saved as "$owner_name"
    And an `Account` for "$owner_name" gets created via `open` with `initial_balance=1`
    Then `balance` on the `Account` for "Frankie" has `balance=1`
    When `get_owner` on the `Account` for "frank" has `owner` saved as "$owner"
    And an `Account` for "franklin" gets created via `open`
    And the `Account` for "franklin" gets a `set_owner` with `owner=$owner`
    Then `get_owner` on the `Account` for "franklin" has `owner={name: "Frankie", tags: ["pro"]}`

  Scenario: Readers can abort
    Then `balance` on the `Account` for "ghost" aborts with `StateNotConstructed`

  Scenario: Properties reach through maps
    Given an `Account` for "heidi" gets created via `open`
    When the `Account` for "heidi" gets a `put_owner` with `key="main"` and `owner={name: "Heidi", tags: ["a"]}`
    Then `get_owners` on the `Account` for "heidi" has `owners["main"].name="Heidi"`
    And `get_owners` on the `Account` for "heidi" has `owners={main: {name: "Heidi", tags: ["a"]}}`

  Scenario: Steps can share one context
    Given a shared context
    And an `Account` for "dave" gets created via `open`
    When the `Account` for "dave" gets a `deposit` with `amount=5`
    Then `balance` on the `Account` for "dave" has `balance=5`
