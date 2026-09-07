Feature: Withdrawing from an account
  A customer takes money out of an account, but never more than the
  account holds.

  Background:
    Given the application is up
    And "anonymous" is an unauthenticated user

  Scenario: Withdrawing part of the balance leaves the rest
    Given "anonymous" creates an `Account` via `open`
    And the resulting state id is saved as "account_id"
    When "anonymous" does a `deposit` on `Account` of "<account_id>" with `amount=100.0`
    And "anonymous" does a `withdraw` on `Account` of "<account_id>" with `amount=40.0`
    Then as "anonymous", `balance` on the `Account` for "<account_id>" has `amount=60.0`

  Rule: Overdrafts are refused
    An account never goes below zero: a withdrawal for more than the
    balance aborts, saying by how much it fell short.

    Scenario Outline: Withdrawing more than the balance aborts with the shortfall
      Given "anonymous" creates an `Account` via `open`
      And the resulting state id is saved as "account_id"
      When "anonymous" does a `deposit` on `Account` of "<account_id>" with `amount=<deposit>`
      And "anonymous" attempts a `withdraw` on `Account` of "<account_id>" with `amount=<withdrawal>`
      Then the attempt aborts with `OverdraftError` with `amount=<shortfall>`

      Examples:
        | deposit | withdrawal | shortfall |
        | 0.0     | 50.50      | 50.50     |
        | 20.0    | 50.50      | 30.50     |
