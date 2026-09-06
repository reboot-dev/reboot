Feature: Colliding state type names

  Background:
    Given the application is up
    And "anonymous" is an unauthenticated user

  Scenario: Full state type names disambiguate
    Given as "anonymous" a `tests.reboot.bdd.Account` for "alice" gets created via `open` with `initial_balance=1`
    And as "anonymous" a `tests.reboot.bdd.other.Account` for "alice" gets created via `open` with `initial_total=2`
    Then as "anonymous" `balance` on the `tests.reboot.bdd.Account` for "alice" has `balance=1`
    And as "anonymous" `total` on the `tests.reboot.bdd.other.Account` for "alice" has `total=2`
