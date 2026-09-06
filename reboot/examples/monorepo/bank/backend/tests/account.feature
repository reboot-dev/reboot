Feature: Accounts

  Background:
    Given the application is up
    And "anonymous" is an unauthenticated user

  Scenario: Depositing and withdrawing move the balance
    Given as "anonymous" an `Account` for "alice" gets created via `open` with `customer_name="Alice"`
    Then as "anonymous" `balance` on the `Account` for "alice" has `balance=0`
    When as "anonymous" the `Account` for "alice" gets a `deposit` with `amount=100`
    Then as "anonymous" `balance` on the `Account` for "alice" has `balance=100`
    When as "anonymous" the `Account` for "alice" gets a `withdraw` with `amount=60`
    Then as "anonymous" `balance` on the `Account` for "alice" has `balance=40`
    When as "anonymous" the `Account` for "alice" attempts a `withdraw` with `amount=65`
    Then the attempt aborts with `OverdraftError` with `amount=25`
    And as "anonymous" `balance` on the `Account` for "alice" has `balance=40`

  Scenario: Opening sends a welcome email
    Given as "anonymous" an `Account` for "bob" gets created via `open` with `customer_name="Bob"`
    And the resulting `welcome_email_task_id` is saved as `welcome_email_task_id`
    Then as "anonymous" the `welcome_email` task with id "<welcome_email_task_id>" of the `Account` completes within 30 seconds
    And the welcome email was sent
