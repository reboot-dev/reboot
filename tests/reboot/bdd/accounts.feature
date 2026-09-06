Feature: Accounts

  Background:
    Given the application is up
    And "anonymous" is an unauthenticated user

  Scenario: Depositing adds to the balance
    Given as "anonymous" an `Account` for "alice" gets created via `open` with `initial_balance=100`
    When as "anonymous" the `Account` for "alice" gets a `deposit` with `amount=50`
    Then the result has `updated_balance=150`
    And as "anonymous" `balance` on the `Account` for "alice" has `balance=150`

  Scenario: Withdrawing more than the balance is refused
    Given as "anonymous" an `Account` for "bob" gets created via `open`
    And as "anonymous" the `Account` for "bob" gets a `deposit` with `amount=30`
    When as "anonymous" the `Account` for "bob" attempts a `withdraw` with `amount=50`
    Then the attempt aborts with `OverdraftError` with `amount=20`
    And as "anonymous" `balance` on the `Account` for "bob" has `balance=30`

  Scenario: Custom async steps share the application
    Given as "anonymous" an `Account` for "carol" gets created via `open` with `initial_balance=10`
    When as "anonymous" the `Account` for "carol" gets 3 deposits of 7
    Then as "anonymous" `balance` on the `Account` for "carol" has `balance=31`

  Scenario: Steps can save result properties
    Given as "anonymous" an `Account` for "eve" gets created via `open` with `initial_balance=9`
    And the resulting `account_id` is saved as `eve_account`
    When as "anonymous" the `Account` for "<eve_account>" gets a `deposit` with `amount=1`
    And the resulting `updated_balance` is saved as `balance`
    And as "anonymous" the `Account` for "<eve_account>" gets a `deposit` with `amount=<balance>`
    When as "anonymous" `balance` on the `Account` for "<eve_account>" has `balance` saved as `current`
    And as "anonymous" the `Account` for "<eve_account>" gets a `deposit` with `amount=<current>`
    Then as "anonymous" `balance` on the `Account` for "<eve_account>" has `balance=40`

  Scenario: Saving during setup
    Given as "anonymous" an `Account` for "gus" gets created via `open` with `initial_balance=7`
    And as "anonymous" `balance` on the `Account` for "gus" has `balance` saved as `initial` and `balance` saved as `twin`
    When as "anonymous" the `Account` for "gus" gets a `deposit` with `amount=<initial>`
    Then as "anonymous" `balance` on the `Account` for "gus" has `balance=14`

  Scenario: Properties can be messages
    Given as "anonymous" an `Account` for "frank" gets created via `open`
    When as "anonymous" the `Account` for "frank" gets a `set_owner` with `owner={name: "Frank", tags: ["vip", "beta"]}`
    Then as "anonymous" `get_owner` on the `Account` for "frank" has `owner={name: "Frank", tags: ["vip", "beta"]}`
    When as "anonymous" the `Account` for "frank" gets a `set_owner` with `owner.name="Frankie"` and `owner.tags=["pro"]`
    Then as "anonymous" `get_owner` on the `Account` for "frank" has `owner={name: "Frankie", tags: ["pro"]}`
    And as "anonymous" `get_owner` on the `Account` for "frank" has `owner.name="Frankie"`
    And as "anonymous" `get_owner` on the `Account` for "frank" has `owner.tags[0]="pro"`
    And as "anonymous" `get_owner` on the `Account` for "frank" has `owner.name` containing `"rank"` and `owner.tags` of length `1`
    And as "anonymous" `get_owner` on the `Account` for "frank" has `owner.tags` containing `"pro"`
    When as "anonymous" `get_owner` on the `Account` for "frank" has `owner.name` saved as `owner_name`
    And as "anonymous" an `Account` for "<owner_name>" gets created via `open` with `initial_balance=1`
    Then as "anonymous" `balance` on the `Account` for "Frankie" has `balance=1`
    When as "anonymous" `get_owner` on the `Account` for "frank" has `owner` saved as `owner`
    And as "anonymous" an `Account` for "franklin" gets created via `open`
    And as "anonymous" the `Account` for "franklin" gets a `set_owner` with `owner=<owner>`
    Then as "anonymous" `get_owner` on the `Account` for "franklin" has `owner={name: "Frankie", tags: ["pro"]}`

  Scenario: Readers can abort
    Then as "anonymous" `balance` on the `Account` for "ghost" aborts with `StateNotConstructed`

  Scenario: Properties reach through maps
    Given as "anonymous" an `Account` for "heidi" gets created via `open`
    When as "anonymous" the `Account` for "heidi" gets a `put_owner` with `key="main"` and `owner={name: "Heidi", tags: ["a"]}`
    Then as "anonymous" `get_owners` on the `Account` for "heidi" has `owners["main"].name="Heidi"`
    And as "anonymous" `get_owners` on the `Account` for "heidi" has `owners={main: {name: "Heidi", tags: ["a"]}}`
    And as "anonymous" `get_owners` on the `Account` for "heidi" has `owners` containing `"main"` and `owners` of length `1`

  Scenario: Steps can share one context
    Given as "anonymous" a shared context
    And as "anonymous" an `Account` for "dave" gets created via `open`
    When as "anonymous" the `Account` for "dave" gets a `deposit` with `amount=5`
    Then as "anonymous" `balance` on the `Account` for "dave" has `balance=5`

  Scenario: A shared context calls as one user
    Given "carol" is an authenticated user
    And as "carol" a shared context
    And as "carol" an `Account` for "shared" gets created via `open`
    Then as "carol" `whoami` on the `Account` for "shared" has `user_id="carol"`

  Scenario: Steps call as the user they name
    Given "alice" is an authenticated user
    And "bob" is an authenticated user
    And as "alice" an `Account` for "joint" gets created via `open`
    Then as "alice" `whoami` on the `Account` for "joint" has `user_id="alice"`
    And as "bob" `whoami` on the `Account` for "joint" has `user_id="bob"`

  Scenario: Effects land eventually
    Given as "anonymous" an `Account` for "slow" gets created via `open`
    When as "anonymous" the `Account` for "slow" gets a `deposit_later` with `amount=75`
    Then as "anonymous" `balance` on the `Account` for "slow" eventually has `balance=75` within 30 seconds

  Scenario: Spawned tasks complete
    Given as "anonymous" an `Account` for "spawned" gets created via `open`
    When as "anonymous" the `Account` for "spawned" gets a `deposit` with `amount=15` spawned with its task id saved as `first`
    Then as "anonymous" the `deposit` task with id "<first>" of the `Account` completes within 30 seconds
    And the result has `updated_balance=15`
    When as "anonymous" the `Account` for "spawned" gets a `balance` spawned with its task id saved as `read`
    Then as "anonymous" the `balance` task with id "<read>" of the `Account` completes within 30 seconds
    And the result has `balance=15`

  Scenario: Scheduled tasks are awaited by ID
    Given as "anonymous" an `Account` for "later" gets created via `open`
    When as "anonymous" the `Account` for "later" gets a `deposit_later` with `amount=20`
    And the resulting `task_id` is saved as `deposit_task_id`
    And as "anonymous" the `deposit` task with id "<deposit_task_id>" of the `Account` completes within 30 seconds
    Then the result has `updated_balance=20`
