Feature: Colliding state type names

  Background:
    Given the application is up

  Scenario: Full state type names disambiguate
    Given a `tests.reboot.bdd.Account` for "alice" gets created via `open` with `initial_balance=1`
    And a `tests.reboot.bdd.other.Account` for "alice" gets created via `open` with `initial_total=2`
    Then `balance` on the `tests.reboot.bdd.Account` for "alice" has `balance=1`
    And `total` on the `tests.reboot.bdd.other.Account` for "alice" has `total=2`
