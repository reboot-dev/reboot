Feature: Accounts

  Background:
    Given the application is up
    And "anonymous" is an unauthenticated user

  Scenario: Depositing and withdrawing move the balance
    Given "anonymous" creates an `Account` via `open` with `customer_name="Alice"`
    And the resulting state id is saved as "account_id"
    Then as "anonymous", `balance` on the `Account` for "<account_id>" has `balance=0`
    When "anonymous" does a `deposit` on `Account` of "<account_id>" with `amount=100`
    Then as "anonymous", `balance` on the `Account` for "<account_id>" has `balance=100`
    When "anonymous" does a `withdraw` on `Account` of "<account_id>" with `amount=60`
    Then as "anonymous", `balance` on the `Account` for "<account_id>" has `balance=40`
    When "anonymous" attempts a `withdraw` on `Account` of "<account_id>" with `amount=65`
    Then the attempt aborts with `OverdraftError` with `amount=25`
    And as "anonymous", `balance` on the `Account` for "<account_id>" has `balance=40`

  Scenario: Opening sends a welcome email
    Given "anonymous" creates an `Account` via `open` with `customer_name="Bob"`
    And the resulting state id is saved as "account_id"
    And the resulting `welcome_email_task_id` is saved as "welcome_email_task_id"
    Then "anonymous" awaits the `welcome_email` task "<welcome_email_task_id>" on `Account` within 30 seconds
    And the welcome email was sent
