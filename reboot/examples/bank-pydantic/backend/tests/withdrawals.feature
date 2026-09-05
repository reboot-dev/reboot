Feature: Withdrawing from an account
  A customer takes money out of an account, but never more than the
  account holds.

  Background:
    Given the application is up
    And the user is unauthenticated

  Scenario: Withdrawing part of the balance leaves the rest
    Given an `Account` for "part-account" gets created via `open`
    When the `Account` for "part-account" gets a `deposit` with `amount=100.0`
    And the `Account` for "part-account" gets a `withdraw` with `amount=40.0`
    Then `balance` on the `Account` for "part-account" has `amount=60.0`

  Rule: Overdrafts are refused
    An account never goes below zero: a withdrawal for more than the
    balance aborts, saying by how much it fell short.

    Scenario Outline: Withdrawing more than the balance aborts with the shortfall
      Given an `Account` for "<account>" gets created via `open`
      When the `Account` for "<account>" gets a `deposit` with `amount=<deposit>`
      And the `Account` for "<account>" attempts a `withdraw` with `amount=<withdrawal>`
      Then the attempt aborts with `OverdraftError` with `amount=<shortfall>`

      Examples:
        | account        | deposit | withdrawal | shortfall |
        | empty-account  | 0.0     | 50.50      | 50.50     |
        | funded-account | 20.0    | 50.50      | 30.50     |
