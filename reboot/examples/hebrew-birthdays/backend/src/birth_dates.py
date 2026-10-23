"""The bridge between what a caller types and `hebrew_calendar`: reading
a date of birth given either way, and turning the calendar's results
into the API's models. Shared by both servicers, which say a bad date
with their own `<Method>Aborted`."""

import hebrew_calendar
from dataclasses import dataclass
from datetime import date, datetime, timezone
from hebrew_calendar import HebrewDay, InvalidDate, Occurrence
from shared.models import Birthday, HebrewDate


@dataclass(frozen=True)
class Birth:
    hebrew: HebrewDay
    # Empty when only the Hebrew date was given.
    gregorian: str
    after_sunset: bool


def resolve_birth(
    *,
    gregorian_birth_date: str,
    born_after_sunset: bool,
    hebrew_birth_day: int,
    hebrew_birth_month: str,
    hebrew_birth_year: int,
) -> Birth:
    """The date of birth a caller gave, either as a Gregorian date or
    as a Hebrew day, month and year, but not both."""
    gives_gregorian = gregorian_birth_date.strip() != ""
    gives_hebrew = (
        hebrew_birth_day != 0 or hebrew_birth_month.strip() != "" or
        hebrew_birth_year != 0
    )
    if gives_gregorian and gives_hebrew:
        raise InvalidDate(
            "give the date of birth either as a Gregorian date or as a "
            "Hebrew date, not both"
        )
    if gives_gregorian:
        born = hebrew_calendar.parse_gregorian(gregorian_birth_date)
        return Birth(
            hebrew=hebrew_calendar.from_gregorian(born, born_after_sunset),
            gregorian=born.isoformat(),
            after_sunset=born_after_sunset,
        )
    if (
        hebrew_birth_day == 0 or hebrew_birth_month.strip() == "" or
        hebrew_birth_year == 0
    ):
        raise InvalidDate(
            "give a Gregorian date of birth, or the Hebrew day, month "
            "and year of birth"
        )
    return Birth(
        hebrew=hebrew_calendar.from_parts(
            hebrew_birth_day,
            hebrew_birth_month,
            hebrew_birth_year,
        ),
        gregorian="",
        after_sunset=False,
    )


def parse_today(text: str) -> date:
    """The date a request counts from: the caller's, or today in UTC
    when they gave none."""
    if text.strip() == "":
        return datetime.now(timezone.utc).date()
    return hebrew_calendar.parse_gregorian(text)


def hebrew_date(hebrew: HebrewDay) -> HebrewDate:
    return HebrewDate(
        year=hebrew.year,
        month=hebrew.month,
        day=hebrew.day,
        month_name=hebrew_calendar.month_name(hebrew.year, hebrew.month),
        text=hebrew_calendar.english_text(hebrew),
        hebrew_text=hebrew_calendar.hebrew_text(hebrew),
    )


def birthday(occurrence: Occurrence, today: date) -> Birthday:
    return Birthday(
        hebrew_date=hebrew_date(occurrence.hebrew),
        gregorian_date=occurrence.gregorian.isoformat(),
        age=occurrence.age,
        days_until=(occurrence.gregorian - today).days,
    )
