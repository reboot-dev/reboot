@wip
Feature: Users see whose Hebrew birthday comes next
  A Hebrew birthday moves around the Gregorian calendar from year to
  year, which is why it is so easy to miss. The user sees everyone
  they track ordered by whose Hebrew birthday comes next, with the
  Gregorian date it falls on and the age they turn.

  Background:
    Given the application is up
    And "alice" is an authenticated user

  Scenario: Everyone's next Hebrew birthday, soonest first
    Given "alice" does an `add_person` with `name="Grandma Rivka"` and `gregorian_birth_date="1950-03-10"` on `User` of "alice"
    And "alice" does an `add_person` with `name="Eli"` and `gregorian_birth_date="2016-11-30"` on `User` of "alice"
    And "alice" does an `add_person` with `name="Abba"` and `hebrew_birth_day=30` and `hebrew_birth_month="Cheshvan"` and `hebrew_birth_year=5720` on `User` of "alice"
    Then as "alice", `upcoming_birthdays` with `today="2026-10-23"` on the `User` for "alice" has `birthdays` of length `3` and `birthdays[0].name="Eli"` and `birthdays[0].next_birthday.gregorian_date="2026-11-09"` and `birthdays[0].next_birthday.age=10` and `birthdays[0].next_birthday.days_until=17` and `birthdays[1].name="Abba"` and `birthdays[1].next_birthday.gregorian_date="2026-11-10"` and `birthdays[2].name="Grandma Rivka"` and `birthdays[2].next_birthday.gregorian_date="2027-03-30"`

  Scenario: Only the birthdays of the coming month
    Given "alice" does an `add_person` with `name="Grandma Rivka"` and `gregorian_birth_date="1950-03-10"` on `User` of "alice"
    And "alice" does an `add_person` with `name="Eli"` and `gregorian_birth_date="2016-11-30"` on `User` of "alice"
    Then as "alice", `upcoming_birthdays` with `today="2026-10-23"` and `within_days=30` on the `User` for "alice" has `birthdays` of length `1` and `birthdays[0].name="Eli"`

  Scenario: A birthday that is today
    Given "alice" does an `add_person` with `name="Eli"` and `gregorian_birth_date="2016-11-30"` on `User` of "alice"
    Then as "alice", `upcoming_birthdays` with `today="2026-11-09"` on the `User` for "alice" has `birthdays[0].next_birthday.days_until=0` and `birthdays[0].next_birthday.age=10`

  Scenario: The next few years of one person's Hebrew birthday
    Given "alice" does an `add_person` with `name="Eli"` and `gregorian_birth_date="2016-11-30"` on `User` of "alice"
    And the resulting `person_id` is saved as <eli id>
    Then as "alice", `get` with `today="2026-10-23"` and `years=3` on the `Person` for <eli id> has `upcoming` of length `3` and `upcoming[0].gregorian_date="2026-11-09"` and `upcoming[1].gregorian_date="2027-11-29"` and `upcoming[2].gregorian_date="2028-11-18"` and `upcoming[2].age=12`

  Rule: A birthday on a date the year lacks moves to the customary one
    The Hebrew year has 12 or 13 months, and Cheshvan and Kislev have
    29 or 30 days, so some dates of birth are missing from some years.
    The birthday then follows the common custom: Adar becomes Adar II
    in a leap year, and Adar I or II becomes Adar in a common one; 30
    Adar I becomes 1 Nisan, 30 Cheshvan 1 Kislev, and 30 Kislev 1
    Tevet, in a year that lacks them.

    Scenario: Born in Adar of a common year, celebrating in a leap year
      Given "alice" does an `add_person` with `name="Grandma Rivka"` and `gregorian_birth_date="1950-03-10"` on `User` of "alice"
      And the resulting `person_id` is saved as <rivka id>
      Then as "alice", `get` with `today="2026-10-23"` and `years=2` on the `Person` for <rivka id> has `upcoming[0].hebrew_date.text="21 Adar II 5787"` and `upcoming[0].age=77` and `upcoming[1].hebrew_date.text="21 Adar 5788"`

    Scenario: Born on 30 Cheshvan, in a year whose Cheshvan has 29 days
      Given "alice" does an `add_person` with `name="Abba"` and `hebrew_birth_day=30` and `hebrew_birth_month="Cheshvan"` and `hebrew_birth_year=5720` on `User` of "alice"
      And the resulting `person_id` is saved as <abba id>
      Then as "alice", `get` with `today="2026-10-23"` and `years=3` on the `Person` for <abba id> has `upcoming[1].hebrew_date.text="30 Cheshvan 5788"` and `upcoming[2].hebrew_date.text="1 Kislev 5789"` and `upcoming[2].gregorian_date="2028-11-19"`

    Scenario: Born on 30 Adar I, in a year with only one Adar
      Given "alice" does an `add_person` with `name="Tamar"` and `hebrew_birth_day=30` and `hebrew_birth_month="Adar I"` and `hebrew_birth_year=5784` on `User` of "alice"
      And the resulting `person_id` is saved as <tamar id>
      Then as "alice", `get` with `today="2024-06-01"` and `years=1` on the `Person` for <tamar id> has `upcoming[0].hebrew_date.text="1 Nisan 5785"` and `upcoming[0].gregorian_date="2025-03-30"` and `upcoming[0].age=1`

  Rule: A user sees and changes only the people on their own list
    Each user's list is theirs alone, whichever app they use, so a
    person someone else tracks can be neither read nor removed.

    Scenario: Two users' lists
      Given "bob" is an authenticated user
      And "alice" does an `add_person` with `name="Grandma Rivka"` and `gregorian_birth_date="1950-03-10"` on `User` of "alice"
      And the resulting `person_id` is saved as <rivka id>
      Then as "bob", `upcoming_birthdays` on the `User` for "bob" has `birthdays=[]`
      And as "bob", `get` on the `Person` for <rivka id> aborts with `PermissionDenied`
      When "bob" attempts a `remove_person` with `person_id=<rivka id>` on `User` of "bob"
      Then the attempt aborts with `PersonNotFoundError`
      And as "alice", `upcoming_birthdays` on the `User` for "alice" has `birthdays` of length `1`
