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

  Scenario: Readers can abort
    Then `balance` on the `Account` for "ghost" aborts with `StateNotConstructed`

  Scenario: Steps can share one context
    Given a shared context
    And an `Account` for "dave" gets created via `open`
    When the `Account` for "dave" gets a `deposit` with `amount=5`
    Then `balance` on the `Account` for "dave" has `balance=5`
