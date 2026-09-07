Feature: Bank

  Background:
    Given the application is up
    And "anonymous" is an unauthenticated user

  Scenario: Signing up opens an account
    When "anonymous" does a `sign_up` on `Bank` of "my-bank" with `customer_name="Alice"`
    And the resulting `account_id` is saved as "alice_account_id"
    Then as "anonymous", `balance` on the `Account` for "<alice_account_id>" has `balance=0`

  Scenario: Transfers move money between accounts
    Given "anonymous" does a `sign_up` on `Bank` of "my-bank" with `customer_name="Alice"`
    And the resulting `account_id` is saved as "alice_account_id"
    And "anonymous" does a `sign_up` on `Bank` of "my-bank" with `customer_name="Bob"`
    And the resulting `account_id` is saved as "bob_account_id"
    When "anonymous" does a `deposit` on `Account` of "<alice_account_id>" with `amount=100`
    Then as "anonymous", `balance` on the `Account` for "<alice_account_id>" has `balance=100`
    When "anonymous" does a `transfer` on `Bank` of "my-bank" with `from_account_id=<alice_account_id>` and `to_account_id=<bob_account_id>` and `amount=40`
    Then as "anonymous", `balance` on the `Account` for "<alice_account_id>" has `balance=60`
    And as "anonymous", `balance` on the `Account` for "<bob_account_id>" has `balance=40`
    When "anonymous" attempts a `transfer` on `Bank` of "my-bank" with `from_account_id=<bob_account_id>` and `to_account_id=<alice_account_id>` and `amount=50`
    Then the attempt aborts with `OverdraftError` with `amount=10`
