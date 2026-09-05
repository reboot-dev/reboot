Feature: Transferring money between accounts
  A customer moves money from one of their accounts to another
  account of the bank in one step, which is how they pay someone
  without a withdrawal and a deposit that could come apart.

  Background:
    Given the application is up
    And the user is unauthenticated

  Rule: A transfer moves exactly the amount from one account to the other
    Neither account sees any other change, and the bank's view of
    every customer's balances agrees with each account's own.

    Scenario: A transfer between two customers' accounts
      Given a `Bank` for "test-bank" gets created via `create`
      When the `Bank` for "test-bank" gets a `sign_up` with `customer_id="test@reboot.dev"`
      And the `Customer` for "test@reboot.dev" gets an `open_account` with `initial_deposit=1000.0`
      And the resulting `account_id` is saved as `first_account_id`
      And the `Bank` for "test-bank" gets a `sign_up` with `customer_id="test2@reboot.dev"`
      And the `Customer` for "test2@reboot.dev" gets an `open_account` with `initial_deposit=0.0`
      And the resulting `account_id` is saved as `second_account_id`
      And the `Bank` for "test-bank" gets a `transfer` with `from_account_id=<first_account_id>` and `to_account_id=<second_account_id>` and `amount=250.0`
      Then `balance` on the `Account` for "<first_account_id>" has `amount=750.0`
      And `balance` on the `Account` for "<second_account_id>" has `amount=250.0`
      And `all_customer_ids` on the `Bank` for "test-bank" has `customer_ids` of length `2` and `customer_ids` containing `"test@reboot.dev"` and `customer_ids` containing `"test2@reboot.dev"`
      And `account_balances` on the `Bank` for "test-bank" has `balances` of length `2` and `balances[0].customer_id="test@reboot.dev"` and `balances[0].accounts` of length `1` and `balances[0].accounts[0].balance=750.0` and `balances[1].customer_id="test2@reboot.dev"` and `balances[1].accounts` of length `1` and `balances[1].accounts[0].balance=250.0`

  Rule: A transfer that would overdraw the source leaves both accounts unchanged
    A transfer is one transaction: when the withdrawal from the source
    account aborts, the deposit into the destination is rolled back
    too, so money is never created by a failed transfer.

    Scenario: A transfer for more than the source account holds
      Given a `Bank` for "test-bank" gets created via `create`
      When the `Bank` for "test-bank" gets a `sign_up` with `customer_id="payer@reboot.dev"`
      And the `Customer` for "payer@reboot.dev" gets an `open_account` with `initial_deposit=100.0`
      And the resulting `account_id` is saved as `payer_account_id`
      And the `Bank` for "test-bank" gets a `sign_up` with `customer_id="payee@reboot.dev"`
      And the `Customer` for "payee@reboot.dev" gets an `open_account` with `initial_deposit=0.0`
      And the resulting `account_id` is saved as `payee_account_id`
      And the `Bank` for "test-bank" attempts a `transfer` with `from_account_id=<payer_account_id>` and `to_account_id=<payee_account_id>` and `amount=250.0`
      Then the attempt aborts with `Unknown`
      And `balance` on the `Account` for "<payer_account_id>" has `amount=100.0`
      And `balance` on the `Account` for "<payee_account_id>" has `amount=0.0`
