Feature: Users can sign up with the bank
  A person becomes a customer of the bank by signing up with it, and
  the bank keeps the list of its customers.

  Background:
    Given the application is up
    And "anonymous" is an unauthenticated user
    And "anonymous" creates a `Bank` via `create`
    And the resulting state id is saved as "bank id"

  Scenario: Signing up makes a new customer with no accounts
    When "anonymous" does a `sign_up` with `customer_id="ann@example.com"` on `Bank` of "<bank id>"
    Then as "anonymous", `all_customer_ids` on the `Bank` for "<bank id>" has `customer_ids=["ann@example.com"]`
    And as "anonymous", `balances` on the `Customer` for "ann@example.com" has `balances=[]`

  Rule: A user signs up once
    Signing up under a customer id the bank already knows is refused,
    so no customer is ever counted twice.

    @blocked
    Scenario: Signing up twice under the same id
      The bank does not refuse a second sign-up yet: the customer's
      factory aborts with `StateAlreadyConstructed`, which the bank
      lets surface as `Unknown`. This waits for a declared error.

      Given "anonymous" does a `sign_up` with `customer_id="ann@example.com"` on `Bank` of "<bank id>"
      When "anonymous" attempts a `sign_up` with `customer_id="ann@example.com"` on `Bank` of "<bank id>"
      Then the attempt aborts with `AlreadySignedUp`
      And as "anonymous", `all_customer_ids` on the `Bank` for "<bank id>" has `customer_ids` of length `1`
