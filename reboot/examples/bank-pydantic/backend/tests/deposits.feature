Feature: Depositing into an account
  A customer puts money into an account and sees it in the balance.

  Background:
    Given the application is up
    And "anonymous" is an unauthenticated user

  Scenario: A deposit into a new account
    Given "anonymous" creates an `Account` via `open`
    And the resulting state id is saved as `account_id`
    When "anonymous" does a `deposit` on `Account` of "<account_id>" with `amount=10.0`
    Then as "anonymous", `balance` on the `Account` for "<account_id>" has `amount=10.0`
