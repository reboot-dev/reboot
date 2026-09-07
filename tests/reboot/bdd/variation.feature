Feature: Choosing the application

  Scenario: A scenario picks its application by name
    Given the "two accounts" application is up
    And "anonymous" is an unauthenticated user
    And "anonymous" creates a `tests.reboot.bdd.other.Account` via `open` with `initial_total=7`
    And the resulting state id is saved as `account_id`
    Then as "anonymous", `total` on the `tests.reboot.bdd.other.Account` for "<account_id>" has `total=7`

  Scenario: The unnamed application is the `application` fixture
    Given the application is up
    And "anonymous" is an unauthenticated user
    And "anonymous" creates an `Account` via `open` with `initial_balance=3`
    And the resulting state id is saved as `account_id`
    Then as "anonymous", `balance` on the `Account` for "<account_id>" has `balance=3`
