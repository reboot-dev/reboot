Feature: Choosing the application

  Scenario: A scenario picks its application by name
    Given the "two accounts" application is up
    And the user is unauthenticated
    And a `tests.reboot.bdd.other.Account` for "vary" gets created via `open` with `initial_total=7`
    Then `total` on the `tests.reboot.bdd.other.Account` for "vary" has `total=7`

  Scenario: The unnamed application is the `application` fixture
    Given the application is up
    And the user is unauthenticated
    And an `Account` for "vary" gets created via `open` with `initial_balance=3`
    Then `balance` on the `Account` for "vary" has `balance=3`
