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
    Then the attempt aborts with `OverdraftError` where `amount=20`
    And `balance` on the `Account` for "bob" has `balance=30`

  Scenario: Custom async steps can call through the world
    Given an `Account` for "carol" gets created via `open` with `initial_balance=10`
    When "carol" makes 3 deposits of 7
    Then `balance` on the `Account` for "carol" has `balance=31`
