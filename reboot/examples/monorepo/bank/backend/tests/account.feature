Feature: Accounts

  Background:
    Given the application is up
    And "anonymous" is an unauthenticated user

  Scenario: Depositing and withdrawing move the balance
    Given "anonymous" creates an `Account` of "alice" via `open` with `customer_name="Alice"`
    Then as "anonymous", `balance` on the `Account` for "alice" has `balance=0`
    When "anonymous" does a `deposit` on `Account` of "alice" with `amount=100`
    Then as "anonymous", `balance` on the `Account` for "alice" has `balance=100`
    When "anonymous" does a `withdraw` on `Account` of "alice" with `amount=60`
    Then as "anonymous", `balance` on the `Account` for "alice" has `balance=40`
    When "anonymous" attempts a `withdraw` on `Account` of "alice" with `amount=65`
    Then the attempt aborts with `OverdraftError` with `amount=25`
    And as "anonymous", `balance` on the `Account` for "alice" has `balance=40`

  Scenario: Opening sends a welcome email
    Given "anonymous" creates an `Account` of "bob" via `open` with `customer_name="Bob"`
    And the resulting `welcome_email_task_id` is saved as `welcome_email_task_id`
    Then "anonymous" awaits the `welcome_email` task "<welcome_email_task_id>" on `Account` within 30 seconds
    And the welcome email was sent
