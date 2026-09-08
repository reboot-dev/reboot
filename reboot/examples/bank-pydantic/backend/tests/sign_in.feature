@wip
Feature: Users can sign in
  A user who signs in is a customer of the bank from then on, under
  their user id, and sees only what is theirs.

  Background:
    Given the application is up
    And "anonymous" is an unauthenticated user

  Scenario: Signing in makes the user a customer of the bank
    Given "alice" is an authenticated user
    Then as "alice", `balances` on the `User` for "alice" has `balances=[]`
    And as "anonymous", `all_customer_ids` on the `Bank` for "reboot-bank" has `customer_ids` containing `"alice"`

  Rule: The customer the bank knows is the one who signed in

    Scenario: Signing in and out with the Development picker
      Given "ben" is an unauthenticated user
      When "ben" opens the web app
      And "ben" clicks the "Sign in" button in the web app
      And "ben" clicks the "Ben" link in the web app
      Then "ben" is signed in to the web app with their user id saved as "ben user id"
      When "ben" fills "Initial Deposit ($)" in the web app with `500`
      And "ben" clicks the "Open Account" button in the web app
      Then "ben" eventually sees "$500" in the "Your Accounts" table in the web app within 10 seconds
      And as "ben", `balances` on the `User` for "<ben user id>" eventually has `balances` of length `1` and `balances[0].balance=500.0` within 10 seconds
      When "ben" clicks the "Sign out" button in the web app
      Then "ben" is signed out of the web app
      And "ben" sees the "Sign in" button in the web app is enabled
      And as "ben", `balances` on the `User` for "<ben user id>" aborts with `Unauthenticated`

  Rule: A customer sees only their own accounts
    An account is its owner's alone: the app shows a customer the
    accounts the bank holds for them and never another customer's,
    whoever else is signed in at the time.

    Scenario: Two customers in the app at once
      Given "alice" is an authenticated user
      And "carol" is an authenticated user
      And "alice" does an `open_account` on `User` of "alice" with `initial_deposit=100.0`
      And the resulting `account_id` is saved as "alice account id"
      And "carol" does an `open_account` on `User` of "carol" with `initial_deposit=200.0`
      And the resulting `account_id` is saved as "carol account id"
      When "alice" opens the web app
      And "carol" opens the web app
      Then "alice" sees "<alice account id>" in the "Your Accounts" table in the web app
      And "alice" does not see "<carol account id>" in the web app
      And "carol" sees "<carol account id>" in the "Your Accounts" table in the web app
      And "carol" does not see "<alice account id>" in the web app
