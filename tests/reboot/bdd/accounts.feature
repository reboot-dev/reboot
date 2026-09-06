Feature: Accounts

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

  Scenario: Custom async steps share the application
    Given "anonymous" creates an `Account` of "carol" via `open` with `initial_balance=10`
    When "anonymous" does 3 deposits of 7 on `Account` of "carol"
    Then as "anonymous", `balance` on the `Account` for "carol" has `balance=31`

  Scenario: Steps can save result properties
    Given "anonymous" creates an `Account` of "eve" via `open` with `initial_balance=9`
    And the resulting `account_id` is saved as `eve_account`
    When "anonymous" does a `deposit` on `Account` of "<eve_account>" with `amount=1`
    And the resulting `updated_balance` is saved as `balance`
    And "anonymous" does a `deposit` on `Account` of "<eve_account>" with `amount=<balance>`
    When as "anonymous", `balance` on the `Account` for "<eve_account>" has `balance` saved as `current`
    And "anonymous" does a `deposit` on `Account` of "<eve_account>" with `amount=<current>`
    Then as "anonymous", `balance` on the `Account` for "<eve_account>" has `balance=40`

  Scenario: Saving during setup
    Given "anonymous" creates an `Account` of "gus" via `open` with `initial_balance=7`
    And as "anonymous", `balance` on the `Account` for "gus" has `balance` saved as `initial` and `balance` saved as `twin`
    When "anonymous" does a `deposit` on `Account` of "gus" with `amount=<initial>`
    Then as "anonymous", `balance` on the `Account` for "gus" has `balance=14`

  Scenario: Properties can be messages
    Given "anonymous" creates an `Account` of "frank" via `open`
    When "anonymous" does a `set_owner` on `Account` of "frank" with `owner={name: "Frank", tags: ["vip", "beta"]}`
    Then as "anonymous", `get_owner` on the `Account` for "frank" has `owner={name: "Frank", tags: ["vip", "beta"]}`
    When "anonymous" does a `set_owner` on `Account` of "frank" with `owner.name="Frankie"` and `owner.tags=["pro"]`
    Then as "anonymous", `get_owner` on the `Account` for "frank" has `owner={name: "Frankie", tags: ["pro"]}`
    And as "anonymous", `get_owner` on the `Account` for "frank" has `owner.name="Frankie"`
    And as "anonymous", `get_owner` on the `Account` for "frank" has `owner.tags[0]="pro"`
    And as "anonymous", `get_owner` on the `Account` for "frank" has `owner.name` containing `"rank"` and `owner.tags` of length `1`
    And as "anonymous", `get_owner` on the `Account` for "frank" has `owner.tags` containing `"pro"`
    When as "anonymous", `get_owner` on the `Account` for "frank" has `owner.name` saved as `owner_name`
    And "anonymous" creates an `Account` of "<owner_name>" via `open` with `initial_balance=1`
    Then as "anonymous", `balance` on the `Account` for "Frankie" has `balance=1`
    When as "anonymous", `get_owner` on the `Account` for "frank" has `owner` saved as `owner`
    And "anonymous" creates an `Account` of "franklin" via `open`
    And "anonymous" does a `set_owner` on `Account` of "franklin" with `owner=<owner>`
    Then as "anonymous", `get_owner` on the `Account` for "franklin" has `owner={name: "Frankie", tags: ["pro"]}`

  Scenario: Readers can abort
    Then as "anonymous", `balance` on the `Account` for "ghost" aborts with `StateNotConstructed`

  Scenario: Properties reach through maps
    Given "anonymous" creates an `Account` of "heidi" via `open`
    When "anonymous" does a `put_owner` on `Account` of "heidi" with `key="main"` and `owner={name: "Heidi", tags: ["a"]}`
    Then as "anonymous", `get_owners` on the `Account` for "heidi" has `owners["main"].name="Heidi"`
    And as "anonymous", `get_owners` on the `Account` for "heidi" has `owners={main: {name: "Heidi", tags: ["a"]}}`
    And as "anonymous", `get_owners` on the `Account` for "heidi" has `owners` containing `"main"` and `owners` of length `1`

  Scenario: Steps can share one context
    Given as "anonymous", a shared context
    And "anonymous" creates an `Account` of "dave" via `open`
    When "anonymous" does a `deposit` on `Account` of "dave" with `amount=5`
    Then as "anonymous", `balance` on the `Account` for "dave" has `balance=5`

  Scenario: A shared context calls as one user
    Given "carol" is an authenticated user
    And as "carol", a shared context
    And "carol" creates an `Account` of "shared" via `open`
    Then as "carol", `whoami` on the `Account` for "shared" has `user_id="carol"`

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
    When "anonymous" spawns a `balance` on `Account` of "spawned" and saves its task id as `read`
    Then "anonymous" awaits the `balance` task "<read>" on `Account` within 30 seconds
    And the result has `balance=15`

  Scenario: Scheduled tasks are awaited by ID
    Given "anonymous" creates an `Account` of "later" via `open`
    When "anonymous" does a `deposit_later` on `Account` of "later" with `amount=20`
    And the resulting `task_id` is saved as `deposit_task_id`
    And "anonymous" awaits the `deposit` task "<deposit_task_id>" on `Account` within 30 seconds
    Then the result has `updated_balance=20`
