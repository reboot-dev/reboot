Feature: Accounts with a pydantic API

  Background:
    Given the application is up
    And "anonymous" is an unauthenticated user

  Scenario: Depositing adds to the balance
    Given "anonymous" creates an `Account` of "alice" via `open` with `initial_balance=100`
    When "anonymous" does a `deposit` on `Account` of "alice" with `amount=50`
    Then the result has `updated_balance=150`
    And as "anonymous", `balance` on the `Account` for "alice" has `balance=150`

  Scenario: Withdrawing more than the balance is refused
    Given "anonymous" creates an `Account` of "bob" via `open`
    And "anonymous" does a `deposit` on `Account` of "bob" with `amount=30`
    When "anonymous" attempts a `withdraw` on `Account` of "bob" with `amount=50`
    Then the attempt aborts with `OverdraftError` with `amount=20`
    And as "anonymous", `balance` on the `Account` for "bob" has `balance=30`

  Scenario: Custom async steps can call through the world
    Given "anonymous" creates an `Account` of "carol" via `open` with `initial_balance=10`
    When "anonymous" does 3 deposits of 7 on `Account` of "carol"
    Then as "anonymous", `balance` on the `Account` for "carol" has `balance=31`

  Scenario: Properties can be messages
    Given "anonymous" creates an `Account` of "frank" via `open`
    When "anonymous" does a `set_owner` on `Account` of "frank" with `owner={name: "Frank", tags: ["vip", "beta"]}`
    Then as "anonymous", `get_owner` on the `Account` for "frank" has `owner={name: "Frank", tags: ["vip", "beta"]}`
    When "anonymous" does a `set_owner` on `Account` of "frank" with `owner.name="Frankie"` and `owner.tags=["pro"]`
    Then as "anonymous", `get_owner` on the `Account` for "frank" has `owner={name: "Frankie", tags: ["pro"]}`
    And as "anonymous", `get_owner` on the `Account` for "frank" has `owner.tags[0]="pro"`
    And as "anonymous", `get_owner` on the `Account` for "frank" has `owner.name` containing `"rank"` and `owner.tags` of length `1`
    And as "anonymous", `get_owner` on the `Account` for "frank" has `owner.tags` containing `"pro"`
    When as "anonymous", `get_owner` on the `Account` for "frank" has `owner` saved as `owner`
    And "anonymous" creates an `Account` of "franklin" via `open`
    And "anonymous" does a `set_owner` on `Account` of "franklin" with `owner=<owner>`
    Then as "anonymous", `get_owner` on the `Account` for "franklin" has `owner={name: "Frankie", tags: ["pro"]}`

  Scenario: Properties reach through maps
    Given "anonymous" creates an `Account` of "heidi" via `open`
    When "anonymous" does a `put_owner` on `Account` of "heidi" with `key="main"` and `owner={name: "Heidi", tags: ["a"]}`
    Then as "anonymous", `get_owners` on the `Account` for "heidi" has `owners["main"].name="Heidi"`
    And as "anonymous", `get_owners` on the `Account` for "heidi" has `owners={main: {name: "Heidi", tags: ["a"]}}`
    And as "anonymous", `get_owners` on the `Account` for "heidi" has `owners` containing `"main"` and `owners` of length `1`

  Scenario: Steps call as the user they name
    Given "alice" is an authenticated user
    And "bob" is an authenticated user
    And "alice" creates an `Account` of "joint" via `open`
    Then as "alice", `whoami` on the `Account` for "joint" has `user_id="alice"`
    And as "bob", `whoami` on the `Account` for "joint" has `user_id="bob"`

  Scenario: Effects land eventually
    Given "anonymous" creates an `Account` of "slow" via `open`
    When "anonymous" does a `deposit_later` on `Account` of "slow" with `amount=75`
    Then as "anonymous", `balance` on the `Account` for "slow" eventually has `balance=75` within 30 seconds

  Scenario: Spawned tasks complete
    Given "anonymous" creates an `Account` of "spawned" via `open`
    When "anonymous" spawns a `deposit` on `Account` of "spawned" with `amount=15` and saves its task id as `first`
    Then "anonymous" awaits the `deposit` task "<first>" on `Account` within 30 seconds
    And the result has `updated_balance=15`
