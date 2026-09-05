Feature: Depositing into an account
  A customer puts money into an account and sees it in the balance.

  Background:
    Given the application is up
    And the user is unauthenticated

  Rule: A deposit raises the balance by the amount

    Scenario: A deposit into a new account
      Given an `Account` for "new-account" gets created via `open`
      When the `Account` for "new-account" gets a `deposit` with `amount=10.0`
      Then `balance` on the `Account` for "new-account" has `amount=10.0`
