Feature: Customers can open an account
  A customer opens accounts with the bank, each with an initial
  deposit, at the counter or in the web app.

  Background:
    Given the application is up

  Scenario: The bank opens an account for a customer
    Given "anonymous" is an unauthenticated user
    And "anonymous" creates a `Bank` via `create`
    And the resulting state id is saved as "bank id"
    And "anonymous" does a `sign_up` on `Bank` of "<bank id>" with `customer_id="ann@example.com"`
    When "anonymous" does an `open_customer_account` on `Bank` of "<bank id>" with `customer_id="ann@example.com"` and `initial_deposit=25.0`
    Then as "anonymous", `balances` on the `Customer` for "ann@example.com" has `balances` of length `1` and `balances[0].balance=25.0`

  Rule: A new account holds exactly its initial deposit

    Scenario: Opening an account with a deposit
      Given "anonymous" is an unauthenticated user
      And "anonymous" creates a `Bank` via `create`
      And the resulting state id is saved as "bank id"
      And "anonymous" does a `sign_up` on `Bank` of "<bank id>" with `customer_id="ann@example.com"`
      When "anonymous" does an `open_account` on `Customer` of "ann@example.com" with `initial_deposit=100.0`
      And the resulting `account_id` is saved as "account id"
      Then as "anonymous", `balance` on the `Account` for "<account id>" has `amount=100.0`

    Scenario: Opening a first account in the web app
      Given "alice" is an authenticated user
      When "alice" opens the web app
      Then "alice" sees "Signed in as alice" in the web app
      When "alice" fills "Initial Deposit ($)" in the web app with `1000`
      And "alice" clicks the "Open Account" button in the web app
      Then "alice" eventually sees "$1000" in the "Your Accounts" table in the web app within 10 seconds
      When "alice" saves the text of the "account-id" element in the web app as "account id"
      Then as "alice", `balance` on the `Account` for "<account id>" has `amount=1000.0`
      And as "alice", `balances` on the `User` for "alice" has `balances` of length `1` and `balances[0].balance=1000.0`

  Rule: An account belongs to the customer who opened it

    Scenario: Two customers open an account each
      Given "anonymous" is an unauthenticated user
      And "anonymous" creates a `Bank` via `create`
      And the resulting state id is saved as "bank id"
      And "anonymous" does a `sign_up` on `Bank` of "<bank id>" with `customer_id="ann@example.com"`
      And "anonymous" does a `sign_up` on `Bank` of "<bank id>" with `customer_id="bob@example.com"`
      When "anonymous" does an `open_account` on `Customer` of "ann@example.com" with `initial_deposit=10.0`
      And the resulting `account_id` is saved as "ann account id"
      And "anonymous" does an `open_account` on `Customer` of "bob@example.com" with `initial_deposit=20.0`
      And the resulting `account_id` is saved as "bob account id"
      Then as "anonymous", `balances` on the `Customer` for "ann@example.com" has `balances` of length `1` and `balances[0].account_id=<ann account id>`
      And as "anonymous", `balances` on the `Customer` for "bob@example.com" has `balances` of length `1` and `balances[0].account_id=<bob account id>`
