Feature: Customers can transfer money between accounts
  A customer moves money from one of their accounts to another
  account of the bank in one step, which is how they pay someone
  without a withdrawal and a deposit that could come apart.

  Background:
    Given the application is up

  Rule: A transfer moves exactly the amount from one account to the other
    Neither account sees any other change.

    Scenario: A transfer between two customers' accounts
      Given "anonymous" is an unauthenticated user
      And "anonymous" creates a `Bank` via `create`
      And the resulting state id is saved as "bank id"
      When "anonymous" does a `sign_up` with `customer_id="test@reboot.dev"` on `Bank` of "<bank id>"
      And "anonymous" does an `open_account` with `initial_deposit=1000.0` on `Customer` of "test@reboot.dev"
      And the resulting `account_id` is saved as "first account id"
      And "anonymous" does a `sign_up` with `customer_id="test2@reboot.dev"` on `Bank` of "<bank id>"
      And "anonymous" does an `open_account` with `initial_deposit=0.0` on `Customer` of "test2@reboot.dev"
      And the resulting `account_id` is saved as "second account id"
      And "anonymous" does a `transfer` with `from_account_id=<first account id>` and `to_account_id=<second account id>` and `amount=250.0` on `Bank` of "<bank id>"
      Then as "anonymous", `balance` on the `Account` for "<first account id>" has `amount=750.0`
      And as "anonymous", `balance` on the `Account` for "<second account id>" has `amount=250.0`

    Scenario: Transferring between two of the customer's accounts in the web app
      Given "alice" is an authenticated user
      And "alice" does an `open_account` with `initial_deposit=1000.0` on `User` of "alice"
      And the resulting `account_id` is saved as "first account id"
      And "alice" does an `open_account` with `initial_deposit=0.0` on `User` of "alice"
      And the resulting `account_id` is saved as "second account id"
      When "alice" opens the web app
      And "alice" selects "<first account id>" in "From Account" in the web app
      And "alice" selects "<second account id>" in "To Account" in the web app
      And "alice" fills "Amount ($)" in the web app with `250`
      And "alice" clicks the "Transfer Funds" button in the web app
      Then "alice" eventually sees "$750" in the web app within 10 seconds
      And as "alice", `balance` on the `Account` for "<first account id>" has `amount=750.0`
      And as "alice", `balance` on the `Account` for "<second account id>" has `amount=250.0`

  Rule: A transfer that would overdraw the source leaves both accounts unchanged
    A transfer is one transaction: when the withdrawal from the source
    account aborts, the deposit into the destination is rolled back
    too, so money is never created by a failed transfer.

    Scenario: A transfer for more than the source account holds
      Given "anonymous" is an unauthenticated user
      And "anonymous" creates a `Bank` via `create`
      And the resulting state id is saved as "bank id"
      When "anonymous" does a `sign_up` with `customer_id="payer@reboot.dev"` on `Bank` of "<bank id>"
      And "anonymous" does an `open_account` with `initial_deposit=100.0` on `Customer` of "payer@reboot.dev"
      And the resulting `account_id` is saved as "payer account id"
      And "anonymous" does a `sign_up` with `customer_id="payee@reboot.dev"` on `Bank` of "<bank id>"
      And "anonymous" does an `open_account` with `initial_deposit=0.0` on `Customer` of "payee@reboot.dev"
      And the resulting `account_id` is saved as "payee account id"
      And "anonymous" attempts a `transfer` with `from_account_id=<payer account id>` and `to_account_id=<payee account id>` and `amount=250.0` on `Bank` of "<bank id>"
      Then the attempt aborts with `OverdraftError` with `amount=150.0`
      And as "anonymous", `balance` on the `Account` for "<payer account id>" has `amount=100.0`
      And as "anonymous", `balance` on the `Account` for "<payee account id>" has `amount=0.0`
