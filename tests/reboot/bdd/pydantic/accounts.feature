Feature: Accounts with a pydantic API

  Background:
    Given the application is up
    And "anonymous" is an unauthenticated user

  Scenario: Depositing adds to the balance
    Given as "anonymous", an `Account` for "alice" gets created via `open` with `initial_balance=100`
    When as "anonymous", the `Account` for "alice" gets a `deposit` with `amount=50`
    Then the result has `updated_balance=150`
    And as "anonymous", `balance` on the `Account` for "alice" has `balance=150`

  Scenario: Withdrawing more than the balance is refused
    Given as "anonymous", an `Account` for "bob" gets created via `open`
    And as "anonymous", the `Account` for "bob" gets a `deposit` with `amount=30`
    When as "anonymous", the `Account` for "bob" attempts a `withdraw` with `amount=50`
    Then the attempt aborts with `OverdraftError` with `amount=20`
    And as "anonymous", `balance` on the `Account` for "bob" has `balance=30`

  Scenario: Custom async steps can call through the world
    Given as "anonymous", an `Account` for "carol" gets created via `open` with `initial_balance=10`
    When as "anonymous", the `Account` for "carol" gets 3 deposits of 7
    Then as "anonymous", `balance` on the `Account` for "carol" has `balance=31`

  Scenario: Properties can be messages
    Given as "anonymous", an `Account` for "frank" gets created via `open`
    When as "anonymous", the `Account` for "frank" gets a `set_owner` with `owner={name: "Frank", tags: ["vip", "beta"]}`
    Then as "anonymous", `get_owner` on the `Account` for "frank" has `owner={name: "Frank", tags: ["vip", "beta"]}`
    When as "anonymous", the `Account` for "frank" gets a `set_owner` with `owner.name="Frankie"` and `owner.tags=["pro"]`
    Then as "anonymous", `get_owner` on the `Account` for "frank" has `owner={name: "Frankie", tags: ["pro"]}`
    And as "anonymous", `get_owner` on the `Account` for "frank" has `owner.tags[0]="pro"`
    And as "anonymous", `get_owner` on the `Account` for "frank" has `owner.name` containing `"rank"` and `owner.tags` of length `1`
    And as "anonymous", `get_owner` on the `Account` for "frank" has `owner.tags` containing `"pro"`
    When as "anonymous", `get_owner` on the `Account` for "frank" has `owner` saved as `owner`
    And as "anonymous", an `Account` for "franklin" gets created via `open`
    And as "anonymous", the `Account` for "franklin" gets a `set_owner` with `owner=<owner>`
    Then as "anonymous", `get_owner` on the `Account` for "franklin" has `owner={name: "Frankie", tags: ["pro"]}`

  Scenario: Properties reach through maps
    Given as "anonymous", an `Account` for "heidi" gets created via `open`
    When as "anonymous", the `Account` for "heidi" gets a `put_owner` with `key="main"` and `owner={name: "Heidi", tags: ["a"]}`
    Then as "anonymous", `get_owners` on the `Account` for "heidi" has `owners["main"].name="Heidi"`
    And as "anonymous", `get_owners` on the `Account` for "heidi" has `owners={main: {name: "Heidi", tags: ["a"]}}`
    And as "anonymous", `get_owners` on the `Account` for "heidi" has `owners` containing `"main"` and `owners` of length `1`

  Scenario: Steps call as the user they name
    Given "alice" is an authenticated user
    And "bob" is an authenticated user
    And as "alice", an `Account` for "joint" gets created via `open`
    Then as "alice", `whoami` on the `Account` for "joint" has `user_id="alice"`
    And as "bob", `whoami` on the `Account` for "joint" has `user_id="bob"`

  Scenario: Effects land eventually
    Given as "anonymous", an `Account` for "slow" gets created via `open`
    When as "anonymous", the `Account` for "slow" gets a `deposit_later` with `amount=75`
    Then as "anonymous", `balance` on the `Account` for "slow" eventually has `balance=75` within 30 seconds

  Scenario: Spawned tasks complete
    Given as "anonymous", an `Account` for "spawned" gets created via `open`
    When as "anonymous", the `Account` for "spawned" gets a `deposit` with `amount=15` spawned with its task id saved as `first`
    Then as "anonymous", the `deposit` task with id "<first>" of the `Account` completes within 30 seconds
    And the result has `updated_balance=15`
