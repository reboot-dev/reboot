Feature: Accounts earn interest
  The bank credits interest to every account on a schedule of the
  account's own, without anyone asking for it.

  Background:
    Given the application is up
    And "anonymous" is an unauthenticated user

  Rule: Interest is credited each period
    An account credits itself one period's interest a period after it
    opens, and again each period after that.

    Scenario: A new account earns its first period's interest
      Given "anonymous" creates an `Account` via `open`
      And the resulting state id is saved as "account id"
      Then as "anonymous", `balance` on the `Account` for "<account id>" eventually has `amount=1.0` within 10 seconds
