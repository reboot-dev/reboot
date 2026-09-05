Feature: Opening an account from the web app
  A signed-in customer opens an account in the browser and sees it
  listed with its initial deposit, and the bank agrees.

  Background:
    Given the application is up
    And the authenticated user is "alice"

  Rule: An opened account appears in the customer's account list with its initial deposit

    Scenario: Opening a first account
      When the user opens the app
      Then the page shows "Signed in as alice"
      When the user fills "Initial Deposit ($)" with `1000`
      And the user clicks the "Open Account" button
      Then the "Your Accounts" table eventually shows "$1000" within 10 seconds
      When the text of the "account-id" element is saved as `account_id`
      Then `balance` on the `Account` for "<account_id>" has `amount=1000.0`
      And `balances` on the `User` for "alice" has `balances` of length `1` and `balances[0].balance=1000.0`

  Rule: A transfer made in the browser moves the money at the bank

    Scenario: Transferring between two of the customer's accounts
      Given the `User` for "alice" gets an `open_account` with `initial_deposit=1000.0`
      And the resulting `account_id` is saved as `first_account_id`
      And the `User` for "alice" gets an `open_account` with `initial_deposit=0.0`
      And the resulting `account_id` is saved as `second_account_id`
      When the user opens the app
      And the user selects "<first_account_id>" in "From Account"
      And the user selects "<second_account_id>" in "To Account"
      And the user fills "Amount ($)" with `250`
      And the user clicks the "Transfer Funds" button
      Then the page eventually shows "$750" within 10 seconds
      And `balance` on the `Account` for "<first_account_id>" has `amount=750.0`
      And `balance` on the `Account` for "<second_account_id>" has `amount=250.0`
