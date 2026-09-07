Feature: Opening an account from the web app
  A signed-in customer opens an account in the browser and sees it
  listed with its initial deposit, and the bank agrees.

  Background:
    Given the application is up
    And "alice" is an authenticated user

  Scenario: Opening a first account
    When "alice" opens the web app
    Then "alice" sees "Signed in as alice" in the web app
    When "alice" fills "Initial Deposit ($)" in the web app with `1000`
    And "alice" clicks the "Open Account" button in the web app
    Then "alice" eventually sees "$1000" in the "Your Accounts" table in the web app within 10 seconds
    When "alice" saves the text of the "account-id" element in the web app as `account_id`
    Then as "alice", `balance` on the `Account` for "<account_id>" has `amount=1000.0`
    And as "alice", `balances` on the `User` for "alice" has `balances` of length `1` and `balances[0].balance=1000.0`

  Scenario: Transferring between two of the customer's accounts
    Given "alice" does an `open_account` on `User` of "alice" with `initial_deposit=1000.0`
    And the resulting `account_id` is saved as `first_account_id`
    And "alice" does an `open_account` on `User` of "alice" with `initial_deposit=0.0`
    And the resulting `account_id` is saved as `second_account_id`
    When "alice" opens the web app
    And "alice" selects "<first_account_id>" in "From Account" in the web app
    And "alice" selects "<second_account_id>" in "To Account" in the web app
    And "alice" fills "Amount ($)" in the web app with `250`
    And "alice" clicks the "Transfer Funds" button in the web app
    Then "alice" eventually sees "$750" in the web app within 10 seconds
    And as "alice", `balance` on the `Account` for "<first_account_id>" has `amount=750.0`
    And as "alice", `balance` on the `Account` for "<second_account_id>" has `amount=250.0`

  Scenario: Signing in and out with the Development picker
    Given "ben" is an unauthenticated user
    When "ben" opens the web app
    And "ben" clicks the "Sign in" button in the web app
    And "ben" clicks the "Ben" link in the web app
    Then "ben" is signed in to the web app with their user id saved as `ben_user_id`
    When "ben" fills "Initial Deposit ($)" in the web app with `500`
    And "ben" clicks the "Open Account" button in the web app
    Then "ben" eventually sees "$500" in the "Your Accounts" table in the web app within 10 seconds
    And as "ben", `balances` on the `User` for "<ben_user_id>" eventually has `balances` of length `1` and `balances[0].balance=500.0` within 10 seconds
    When "ben" clicks the "Sign out" button in the web app
    Then "ben" is signed out of the web app
    And "ben" sees the "Sign in" button in the web app is enabled
    And as "ben", `balances` on the `User` for "<ben_user_id>" aborts with `Unauthenticated`

  Rule: A customer sees only their own accounts
    An account is its owner's alone: the app shows a customer the
    accounts the bank holds for them and never another customer's,
    whoever else is signed in at the time.

    Scenario: Two customers in the app at once
      Given "carol" is an authenticated user
      And "alice" does an `open_account` on `User` of "alice" with `initial_deposit=100.0`
      And the resulting `account_id` is saved as `alice_account_id`
      And "carol" does an `open_account` on `User` of "carol" with `initial_deposit=200.0`
      And the resulting `account_id` is saved as `carol_account_id`
      When "alice" opens the web app
      And "carol" opens the web app
      Then "alice" sees "<alice_account_id>" in the "Your Accounts" table in the web app
      And "alice" does not see "<carol_account_id>" in the web app
      And "carol" sees "<carol_account_id>" in the "Your Accounts" table in the web app
      And "carol" does not see "<alice_account_id>" in the web app
