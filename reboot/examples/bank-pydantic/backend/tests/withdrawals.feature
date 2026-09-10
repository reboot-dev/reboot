Feature: Customers can withdraw from an account
  A customer takes money out of an account, but never more than the
  account holds.

  Background:
    Given the application is up
    And "anonymous" is an unauthenticated user

  Scenario: Withdrawing part of the balance leaves the rest
    Given "anonymous" creates an `Account` via `open`
    And the resulting state id is saved as "account id"
    When "anonymous" does a `deposit` with `amount=100.0` on `Account` of "<account id>"
    And "anonymous" does a `withdraw` with `amount=40.0` on `Account` of "<account id>"
    Then as "anonymous", `balance` on the `Account` for "<account id>" has `amount=60.0`

  Rule: Overdrafts are refused
    An account never goes below zero: a withdrawal for more than the
    balance aborts, saying by how much it fell short.

    Scenario Outline: Withdrawing more than the balance aborts with the shortfall
      Given "anonymous" creates an `Account` via `open`
      And the resulting state id is saved as "account id"
      When "anonymous" does a `deposit` with `amount=<deposit>` on `Account` of "<account id>"
      And "anonymous" attempts a `withdraw` with `amount=<withdrawal>` on `Account` of "<account id>"
      Then the attempt aborts with `OverdraftError` with `amount=<shortfall>`

      Examples:
        | deposit | withdrawal | shortfall |
        | 0.0     | 50.50      | 50.50     |
        | 20.0    | 50.50      | 30.50     |
