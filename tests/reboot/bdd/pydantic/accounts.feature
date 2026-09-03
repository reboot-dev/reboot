Feature: Accounts with a pydantic API

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
    Then the attempt aborts with `OverdraftError` with `amount=20`
    And `balance` on the `Account` for "bob" has `balance=30`

  Scenario: Custom async steps can call through the world
    Given an `Account` for "carol" gets created via `open` with `initial_balance=10`
    When "carol" makes 3 deposits of 7
    Then `balance` on the `Account` for "carol" has `balance=31`

  Scenario: Properties can be messages
    Given an `Account` for "frank" gets created via `open`
    When the `Account` for "frank" gets a `set_owner` with `owner={name: "Frank", tags: ["vip", "beta"]}`
    Then `get_owner` on the `Account` for "frank" has `owner={name: "Frank", tags: ["vip", "beta"]}`
    When the `Account` for "frank" gets a `set_owner` with `owner.name="Frankie"` and `owner.tags=["pro"]`
    Then `get_owner` on the `Account` for "frank" has `owner={name: "Frankie", tags: ["pro"]}`
    And `get_owner` on the `Account` for "frank" has `owner.tags[0]="pro"`
    And `get_owner` on the `Account` for "frank" has `owner.name` containing "rank" and `owner.tags` of length 1
    And `get_owner` on the `Account` for "frank" has `owner.tags` containing "pro"
    When `get_owner` on the `Account` for "frank" has `owner` saved as `owner`
    And an `Account` for "franklin" gets created via `open`
    And the `Account` for "franklin" gets a `set_owner` with `owner=${owner}`
    Then `get_owner` on the `Account` for "franklin" has `owner={name: "Frankie", tags: ["pro"]}`

  Scenario: Properties reach through maps
    Given an `Account` for "heidi" gets created via `open`
    When the `Account` for "heidi" gets a `put_owner` with `key="main"` and `owner={name: "Heidi", tags: ["a"]}`
    Then `get_owners` on the `Account` for "heidi" has `owners["main"].name="Heidi"`
    And `get_owners` on the `Account` for "heidi" has `owners={main: {name: "Heidi", tags: ["a"]}}`
    And `get_owners` on the `Account` for "heidi" has `owners` containing "main" and `owners` of length 1

  Scenario: Steps call as who I am
    Given I am "alice"
    And an `Account` for "joint" gets created via `open`
    Then `whoami` on the `Account` for "joint" has `user_id="alice"`
    When I am "bob"
    Then `whoami` on the `Account` for "joint" has `user_id="bob"`

  Scenario: Effects land eventually
    Given an `Account` for "slow" gets created via `open`
    When the `Account` for "slow" gets a `deposit_later` with `amount=75`
    Then `balance` on the `Account` for "slow" eventually has `balance=75` within 30 seconds

  Scenario: Spawned tasks complete
    Given an `Account` for "spawned" gets created via `open`
    When the `Account` for "spawned" gets a `deposit` with `amount=15` spawned with its task id saved as `first`
    Then the `deposit` task with id "${first}" of the `Account` completes within 30 seconds
    And the result has `updated_balance=15`
