Feature: Withdrawing from an account
  A customer takes money out of an account, but never more than the
  account holds.

  Background:
    Given the application is up
    And "anonymous" is an unauthenticated user

  Scenario: Withdrawing part of the balance leaves the rest
    Given as "anonymous" an `Account` for "part-account" gets created via `open`
    When as "anonymous" the `Account` for "part-account" gets a `deposit` with `amount=100.0`
    And as "anonymous" the `Account` for "part-account" gets a `withdraw` with `amount=40.0`
    Then as "anonymous" `balance` on the `Account` for "part-account" has `amount=60.0`

  Rule: Overdrafts are refused
    An account never goes below zero: a withdrawal for more than the
    balance aborts, saying by how much it fell short.

    Scenario Outline: Withdrawing more than the balance aborts with the shortfall
      Given as "anonymous" an `Account` for "<account>" gets created via `open`
      When as "anonymous" the `Account` for "<account>" gets a `deposit` with `amount=<deposit>`
      And as "anonymous" the `Account` for "<account>" attempts a `withdraw` with `amount=<withdrawal>`
      Then the attempt aborts with `OverdraftError` with `amount=<shortfall>`

      Examples:
        | account        | deposit | withdrawal | shortfall |
        | empty-account  | 0.0     | 50.50      | 50.50     |
        | funded-account | 20.0    | 50.50      | 30.50     |
