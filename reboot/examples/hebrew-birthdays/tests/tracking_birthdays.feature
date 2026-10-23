@wip
Feature: Users can track the Hebrew birthdays of the people they care about
  A user adds someone with the date they were born, on the Gregorian
  calendar or on the Hebrew one when that is what the family
  remembers, and the app works out and keeps their Hebrew date of
  birth. The same list is there in the web app, the mobile app, and
  from an AI chat, since all three sign in as the same user.

  Background:
    Given the application is up
    And "alice" is an authenticated user

  Scenario: Adding someone by their Gregorian date of birth
    When "alice" does an `add_person` with `name="Grandma Rivka"` and `gregorian_birth_date="1950-03-10"` and `notes="Likes babka"` on `User` of "alice"
    And the resulting `person_id` is saved as <rivka id>
    Then the result has `hebrew_birth_date.text="21 Adar 5710"` and `hebrew_birth_date.hebrew_text="כ״א אדר תש״י"`
    And as "alice", `get` with `today="2026-10-23"` on the `Person` for <rivka id> has `name="Grandma Rivka"` and `notes="Likes babka"` and `gregorian_birth_date="1950-03-10"` and `hebrew_birth_date.month_name="Adar"`

  Scenario: Adding someone by their Hebrew date of birth
    When "alice" does an `add_person` with `name="Abba"` and `hebrew_birth_day=30` and `hebrew_birth_month="Cheshvan"` and `hebrew_birth_year=5720` on `User` of "alice"
    And the resulting `person_id` is saved as <abba id>
    Then the result has `hebrew_birth_date.text="30 Cheshvan 5720"`
    And as "alice", `get` with `today="2026-10-23"` on the `Person` for <abba id> has `gregorian_birth_date=""` and `hebrew_birth_date.day=30`

  Scenario: Correcting someone's date of birth
    Given "alice" does an `add_person` with `name="Eli"` and `gregorian_birth_date="2016-11-29"` on `User` of "alice"
    And the resulting `person_id` is saved as <eli id>
    When "alice" does a `set_birth_date` with `gregorian_birth_date="2016-11-30"` on `Person` of <eli id>
    And "alice" does an `update` with `notes="Loves trains"` on `Person` of <eli id>
    Then as "alice", `get` with `today="2026-10-23"` on the `Person` for <eli id> has `name="Eli"` and `notes="Loves trains"` and `hebrew_birth_date.text="29 Cheshvan 5777"`

  Scenario: Finding out today's Hebrew date
    Then as "alice", `convert_date` with `gregorian_date="2026-10-23"` on the `User` for "alice" has `hebrew_date.text="12 Cheshvan 5787"`
    And as "alice", `convert_date` with `gregorian_date="2026-10-23"` and `after_sunset=true` on the `User` for "alice" has `hebrew_date.text="13 Cheshvan 5787"`

  Scenario: Adding someone in the web app
    When "alice" opens the web app in light mode
    And "alice" fills "Name" in the web app with `"Grandma Rivka"`
    And "alice" fills "Gregorian date of birth" in the web app with `"1950-03-10"`
    And "alice" clicks the "Add person" button in the web app
    Then "alice" eventually sees "21 Adar 5710" in the "Upcoming birthdays" table in the web app within 10 seconds
    And as "alice", `upcoming_birthdays` on the `User` for "alice" has `birthdays` of length `1` and `birthdays[0].name="Grandma Rivka"`

  Rule: A birth after sunset falls on the next Hebrew day
    The Hebrew day begins at sunset, so a baby born on the evening of
    a Gregorian date was born on the Hebrew date of the day after it.

    Scenario: Two babies born on one Gregorian date, before and after sunset
      When "alice" does an `add_person` with `name="Eli"` and `gregorian_birth_date="2016-11-30"` on `User` of "alice"
      Then the result has `hebrew_birth_date.text="29 Cheshvan 5777"`
      When "alice" does an `add_person` with `name="Noa"` and `gregorian_birth_date="2016-11-30"` and `born_after_sunset=true` on `User` of "alice"
      Then the result has `hebrew_birth_date.text="1 Kislev 5777"`

  Rule: Only a date that exists can be a date of birth
    A date the calendar does not have is refused with a reason the
    user can act on, and nobody is added.

    Scenario: A Hebrew month the year does not have
      When "alice" attempts an `add_person` with `name="Shira"` and `hebrew_birth_day=1` and `hebrew_birth_month="Adar II"` and `hebrew_birth_year=5785` on `User` of "alice"
      Then the attempt aborts with `InvalidBirthdayError` with `message="5785 is not a leap year, so it has no Adar II"`
      And as "alice", `upcoming_birthdays` on the `User` for "alice" has `birthdays=[]`

    Scenario: A Gregorian date that does not exist
      When "alice" attempts an `add_person` with `name="Shira"` and `gregorian_birth_date="1990-02-30"` on `User` of "alice"
      Then the attempt aborts with `InvalidBirthdayError` with `message="'1990-02-30' is not a date in the form YYYY-MM-DD"`
      And as "alice", `upcoming_birthdays` on the `User` for "alice" has `birthdays=[]`
