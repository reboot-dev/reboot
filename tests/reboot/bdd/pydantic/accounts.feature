Feature: Accounts with a pydantic API

  Background:
    Given the application is up
    And "anonymous" is an unauthenticated user

  Scenario: Depositing adds to the balance
    Given "anonymous" creates an `Account` via `open` with `initial_balance=100`
    And the resulting state id is saved as "account_id"
    When "anonymous" does a `deposit` with `amount=50` on `Account` of "<account_id>"
    Then the result has `updated_balance=150`
    And as "anonymous", `balance` on the `Account` for "<account_id>" has `balance=150`

  Scenario: A factory can make the id up
    Given "anonymous" creates an `Account` via `open` with `initial_balance=5`
    And the resulting state id is saved as "account_id"
    When "anonymous" does a `deposit` with `amount=1` on `Account` of "<account_id>"
    Then as "anonymous", `balance` on the `Account` for "<account_id>" has `balance=6`

  Scenario: Withdrawing more than the balance is refused
    Given "anonymous" creates an `Account` via `open`
    And the resulting state id is saved as "account_id"
    And "anonymous" does a `deposit` with `amount=30` on `Account` of "<account_id>"
    When "anonymous" attempts a `withdraw` with `amount=50` on `Account` of "<account_id>"
    Then the attempt aborts with `OverdraftError` with `amount=20`
    And as "anonymous", `balance` on the `Account` for "<account_id>" has `balance=30`

  Scenario: Custom async steps can call through the world
    Given "anonymous" creates an `Account` via `open` with `initial_balance=10`
    And the resulting state id is saved as "account_id"
    When "anonymous" does 3 deposits of 7 on `Account` of "<account_id>"
    Then as "anonymous", `balance` on the `Account` for "<account_id>" has `balance=31`

  Scenario: Properties can be messages
    Given "anonymous" creates an `Account` via `open`
    And the resulting state id is saved as "frank_account_id"
    When "anonymous" does a `set_owner` with `owner={name: "Frank", tags: ["vip", "beta"]}` on `Account` of "<frank_account_id>"
    Then as "anonymous", `get_owner` on the `Account` for "<frank_account_id>" has `owner={name: "Frank", tags: ["vip", "beta"]}`
    When "anonymous" does a `set_owner` with `owner.name="Frankie"` and `owner.tags=["pro"]` on `Account` of "<frank_account_id>"
    Then as "anonymous", `get_owner` on the `Account` for "<frank_account_id>" has `owner={name: "Frankie", tags: ["pro"]}`
    And as "anonymous", `get_owner` on the `Account` for "<frank_account_id>" has `owner.tags[0]="pro"`
    And as "anonymous", `get_owner` on the `Account` for "<frank_account_id>" has `owner.name` containing `"rank"` and `owner.tags` of length `1`
    And as "anonymous", `get_owner` on the `Account` for "<frank_account_id>" has `owner.tags` containing `"pro"`
    When as "anonymous", `get_owner` on the `Account` for "<frank_account_id>" has `owner` saved as "owner"
    And "anonymous" creates an `Account` via `open`
    And the resulting state id is saved as "franklin_account_id"
    And "anonymous" does a `set_owner` with `owner=<owner>` on `Account` of "<franklin_account_id>"
    Then as "anonymous", `get_owner` on the `Account` for "<franklin_account_id>" has `owner={name: "Frankie", tags: ["pro"]}`

  Scenario: Properties reach through maps
    Given "anonymous" creates an `Account` via `open`
    And the resulting state id is saved as "account_id"
    When "anonymous" does a `put_owner` with `key="main"` and `owner={name: "Heidi", tags: ["a"]}` on `Account` of "<account_id>"
    Then as "anonymous", `get_owners` on the `Account` for "<account_id>" has `owners["main"].name="Heidi"`
    And as "anonymous", `get_owners` on the `Account` for "<account_id>" has `owners={main: {name: "Heidi", tags: ["a"]}}`
    And as "anonymous", `get_owners` on the `Account` for "<account_id>" has `owners` containing `"main"` and `owners` of length `1`

  Scenario: Steps call as the user they name
    Given "alice" is an authenticated user
    And "bob" is an authenticated user
    And "alice" creates an `Account` via `open`
    And the resulting state id is saved as "account_id"
    Then as "alice", `whoami` on the `Account` for "<account_id>" has `user_id="alice"`
    And as "bob", `whoami` on the `Account` for "<account_id>" has `user_id="bob"`

  Scenario: Effects land eventually
    Given "anonymous" creates an `Account` via `open`
    And the resulting state id is saved as "account_id"
    When "anonymous" does a `deposit_later` with `amount=75` on `Account` of "<account_id>"
    Then as "anonymous", `balance` on the `Account` for "<account_id>" eventually has `balance=75` within 30 seconds

  Scenario: Spawned tasks complete
    Given "anonymous" creates an `Account` via `open`
    And the resulting state id is saved as "account_id"
    When "anonymous" spawns a `deposit` with `amount=15` on `Account` of "<account_id>"
    And the resulting task id is saved as "first"
    Then "anonymous" awaits the `deposit` task "<first>" on `Account` within 30 seconds
    And the result has `updated_balance=15`
