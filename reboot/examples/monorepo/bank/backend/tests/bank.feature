Feature: Bank

  Background:
    Given the application is up
    And the user is unauthenticated

  Scenario: Signing up opens an account
    When the `Bank` for "my-bank" gets a `sign_up` with `customer_name="Alice"`
    And the resulting `account_id` is saved as `alice_account_id`
    Then `balance` on the `Account` for "${alice_account_id}" has `balance=0`

  Scenario: Transfers move money between accounts
    Given the `Bank` for "my-bank" gets a `sign_up` with `customer_name="Alice"`
    And the resulting `account_id` is saved as `alice_account_id`
    And the `Bank` for "my-bank" gets a `sign_up` with `customer_name="Bob"`
    And the resulting `account_id` is saved as `bob_account_id`
    When the `Account` for "${alice_account_id}" gets a `deposit` with `amount=100`
    Then `balance` on the `Account` for "${alice_account_id}" has `balance=100`
    When the `Bank` for "my-bank" gets a `transfer` with `from_account_id=${alice_account_id}` and `to_account_id=${bob_account_id}` and `amount=40`
    Then `balance` on the `Account` for "${alice_account_id}" has `balance=60`
    And `balance` on the `Account` for "${bob_account_id}" has `balance=40`
    When the `Bank` for "my-bank" attempts a `transfer` with `from_account_id=${bob_account_id}` and `to_account_id=${alice_account_id}` and `amount=50`
    Then the attempt aborts with `OverdraftError` with `amount=10`
