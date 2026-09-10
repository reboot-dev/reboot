Feature: The bank can see every customer's balances
  The bank lists its customers and the balance of each of their
  accounts, as one view over all of them.

  Background:
    Given the application is up
    And "anonymous" is an unauthenticated user
    And "anonymous" creates a `Bank` via `create`
    And the resulting state id is saved as "bank id"

  Rule: The bank's view of an account agrees with the account itself

    Scenario: Two customers with an account each
      Given "anonymous" does a `sign_up` with `customer_id="ann@example.com"` on `Bank` of "<bank id>"
      And "anonymous" does a `sign_up` with `customer_id="bob@example.com"` on `Bank` of "<bank id>"
      And "anonymous" does an `open_account` with `initial_deposit=100.0` on `Customer` of "ann@example.com"
      And the resulting `account_id` is saved as "ann account id"
      And "anonymous" does an `open_account` with `initial_deposit=50.0` on `Customer` of "bob@example.com"
      And the resulting `account_id` is saved as "bob account id"
      Then as "anonymous", `all_customer_ids` on the `Bank` for "<bank id>" has `customer_ids=["ann@example.com", "bob@example.com"]`
      And as "anonymous", `account_balances` on the `Bank` for "<bank id>" has `balances` of length `2` and `balances[0].customer_id="ann@example.com"` and `balances[0].accounts` of length `1` and `balances[0].accounts[0].account_id=<ann account id>` and `balances[0].accounts[0].balance=100.0` and `balances[1].customer_id="bob@example.com"` and `balances[1].accounts[0].balance=50.0`
      And as "anonymous", `balance` on the `Account` for "<ann account id>" has `amount=100.0`
      And as "anonymous", `balance` on the `Account` for "<bob account id>" has `amount=50.0`
