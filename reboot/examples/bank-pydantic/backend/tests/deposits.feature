Feature: Depositing into an account
  A customer puts money into an account and sees it in the balance.

  Background:
    Given the application is up
    And "anonymous" is an unauthenticated user

  Rule: A deposit raises the balance by the amount

    Scenario: A deposit into a new account
      Given "anonymous" creates an `Account` of "new-account" via `open`
      When "anonymous" does a `deposit` on `Account` of "new-account" with `amount=10.0`
      Then as "anonymous", `balance` on the `Account` for "new-account" has `amount=10.0`
