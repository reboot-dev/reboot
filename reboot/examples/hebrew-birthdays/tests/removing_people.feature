@wip
Feature: Users can stop tracking someone
  A user takes a person off their list, and the app forgets what it
  knew about them.

  Background:
    Given the application is up
    And "alice" is an authenticated user

  Scenario: Removing someone from the list
    Given "alice" does an `add_person` with `name="Grandma Rivka"` and `gregorian_birth_date="1950-03-10"` on `User` of "alice"
    And the resulting `person_id` is saved as <rivka id>
    And "alice" does an `add_person` with `name="Eli"` and `gregorian_birth_date="2016-11-30"` on `User` of "alice"
    When "alice" does a `remove_person` with `person_id=<rivka id>` on `User` of "alice"
    Then as "alice", `upcoming_birthdays` on the `User` for "alice" has `birthdays` of length `1` and `birthdays[0].name="Eli"`
    And as "alice", `get` on the `Person` for <rivka id> has `name=""` and `gregorian_birth_date=""` and `upcoming=[]`

  Scenario: Removing someone who is not on the list
    When "alice" attempts a `remove_person` with `person_id="nobody"` on `User` of "alice"
    Then the attempt aborts with `PersonNotFoundError` with `person_id="nobody"`
