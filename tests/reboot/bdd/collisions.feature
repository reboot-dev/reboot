Feature: Colliding state type names

  Background:
    Given the application is up
    And "anonymous" is an unauthenticated user

  Scenario: Full state type names disambiguate
    Given "anonymous" creates a `tests.reboot.bdd.Account` via `open` with `initial_balance=1`
    And the resulting state id is saved as "account_id"
    And "anonymous" creates a `tests.reboot.bdd.other.Account` via `open` with `initial_total=2`
    And the resulting state id is saved as "other_account_id"
    Then as "anonymous", `balance` on the `tests.reboot.bdd.Account` for "<account_id>" has `balance=1`
    And as "anonymous", `total` on the `tests.reboot.bdd.other.Account` for "<other_account_id>" has `total=2`
