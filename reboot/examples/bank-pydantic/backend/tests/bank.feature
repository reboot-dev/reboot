Feature: Bank

  Background:
    Given the application is up
    And the user is unauthenticated

  Scenario: Transfers move money between accounts
    Given a `Bank` for "test-bank" gets created via `create`
    When the `Bank` for "test-bank" gets a `sign_up` with `customer_id="test@reboot.dev"`
    And the `Customer` for "test@reboot.dev" gets a `open_account` with `initial_deposit=1000.0`
    And the resulting `account_id` is saved as `first_account_id`
    And the `Bank` for "test-bank" gets a `sign_up` with `customer_id="test2@reboot.dev"`
    And the `Customer` for "test2@reboot.dev" gets a `open_account` with `initial_deposit=0.0`
    And the resulting `account_id` is saved as `second_account_id`
    And the `Bank` for "test-bank" gets a `transfer` with `from_account_id=${first_account_id}` and `to_account_id=${second_account_id}` and `amount=250.0`
    Then `balance` on the `Account` for "${first_account_id}" has `amount=750.0`
    And `balance` on the `Account` for "${second_account_id}" has `amount=250.0`
    And `all_customer_ids` on the `Bank` for "test-bank" has `customer_ids` of length `2` and `customer_ids` containing `"test@reboot.dev"` and `customer_ids` containing `"test2@reboot.dev"`
    And `account_balances` on the `Bank` for "test-bank" has `balances` of length `2` and `balances[0].customer_id="test@reboot.dev"` and `balances[0].accounts` of length `1` and `balances[0].accounts[0].balance=750.0` and `balances[1].customer_id="test2@reboot.dev"` and `balances[1].accounts` of length `1` and `balances[1].accounts[0].balance=250.0`

  Scenario: Overdrafts are refused
    Given an `Account` for "overdraft-account" gets created via `open`
    When the `Account` for "overdraft-account" attempts a `withdraw` with `amount=50.50`
    Then the attempt aborts with `OverdraftError` with `amount=50.50`

  Scenario: Spawned deposits and reads complete
    Given an `Account` for "spawning-account" gets created via `open`
    When the `Account` for "spawning-account" gets a `deposit` with `amount=10.0` spawned with its task id saved as `deposit_task_id`
    Then the `deposit` task with id "${deposit_task_id}" of the `Account` completes within 30 seconds
    When the `Account` for "spawning-account" gets a `balance` spawned with its task id saved as `balance_task_id`
    Then the `balance` task with id "${balance_task_id}" of the `Account` completes within 30 seconds
    And the result has `amount=10.0`
