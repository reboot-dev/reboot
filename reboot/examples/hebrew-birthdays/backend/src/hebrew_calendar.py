"""Hebrew calendar arithmetic for birthdays.

Pure functions over `pyluach`, with no Reboot in them, so the servicers
stay about state and these rules stay easy to read on their own.

Months are numbered the way `pyluach` numbers them: Nisan is 1 and
Adar is 12, with Adar II as 13 in a leap year (when 12 is Adar I).
"""

from dataclasses import dataclass
from datetime import date
from pyluach import dates, hebrewcal

NISAN = 1
CHESHVAN = 8
KISLEV = 9
TEVET = 10
ADAR = 12  # Adar I in a leap year.
ADAR_II = 13

_MONTH_NAMES = [
    "Nisan",
    "Iyar",
    "Sivan",
    "Tammuz",
    "Av",
    "Elul",
    "Tishrei",
    "Cheshvan",
    "Kislev",
    "Tevet",
    "Shevat",
    "Adar",
]

# Every spelling we accept for a month, lower-cased, mapped to its
# number. Adar I and Adar II also go by Adar Aleph and Adar Bet.
_MONTH_SPELLINGS: dict[str, int] = {
    "nisan": NISAN,
    "nissan": NISAN,
    "iyar": 2,
    "iyyar": 2,
    "sivan": 3,
    "tammuz": 4,
    "tamuz": 4,
    "av": 5,
    "menachem av": 5,
    "elul": 6,
    "tishrei": 7,
    "tishri": 7,
    "cheshvan": CHESHVAN,
    "heshvan": CHESHVAN,
    "marcheshvan": CHESHVAN,
    "mar cheshvan": CHESHVAN,
    "kislev": KISLEV,
    "tevet": TEVET,
    "teves": TEVET,
    "shevat": 11,
    "shvat": 11,
    "sh'vat": 11,
    "adar": ADAR,
    "adar i": ADAR,
    "adar 1": ADAR,
    "adar aleph": ADAR,
    "adar alef": ADAR,
    "adar ii": ADAR_II,
    "adar 2": ADAR_II,
    "adar bet": ADAR_II,
    "adar beth": ADAR_II,
    "adar sheni": ADAR_II,
}


class InvalidDate(ValueError):
    """A date that does not exist, or that we could not read."""


@dataclass(frozen=True)
class HebrewDay:
    year: int
    month: int
    day: int


def is_leap(year: int) -> bool:
    return hebrewcal.Year(year).leap


def days_in_month(year: int, month: int) -> int:
    return len(hebrewcal.Month(year, month))


def month_name(year: int, month: int) -> str:
    """The English name of `month` in `year`, telling Adar I from
    Adar II only in a leap year, where both exist."""
    if month == ADAR and is_leap(year):
        return "Adar I"
    if month == ADAR_II:
        return "Adar II"
    return _MONTH_NAMES[month - 1]


def english_text(hebrew: HebrewDay) -> str:
    """For example "13 Adar 5750"."""
    return f"{hebrew.day} {month_name(hebrew.year, hebrew.month)} {hebrew.year}"


def hebrew_text(hebrew: HebrewDay) -> str:
    """The date in Hebrew letters, for example "י״ג אדר תש״נ"."""
    return dates.HebrewDate(
        hebrew.year,
        hebrew.month,
        hebrew.day,
    ).hebrew_date_string()


def parse_gregorian(text: str) -> date:
    try:
        return date.fromisoformat(text.strip())
    except ValueError:
        raise InvalidDate(
            f"'{text}' is not a date in the form YYYY-MM-DD"
        ) from None


def from_gregorian(born: date, after_sunset: bool) -> HebrewDay:
    """The Hebrew date of a birth on the Gregorian date `born`.

    A Hebrew day begins at sunset, so a birth after sunset falls on
    the Hebrew date of the following Gregorian day."""
    if born.year < 1:
        raise InvalidDate("the year must be 1 or later")
    hebrew = dates.GregorianDate.from_pydate(born).to_heb()
    if after_sunset:
        hebrew = hebrew + 1
    return HebrewDay(hebrew.year, hebrew.month, hebrew.day)


def from_parts(day: int, month: str, year: int) -> HebrewDay:
    """A Hebrew date given as its day, the name of its month and its
    year, checked to exist: Adar II only in a leap year, the 30th only
    of a month that has one that year."""
    number = _MONTH_SPELLINGS.get(" ".join(month.lower().split()))
    if number is None:
        raise InvalidDate(
            f"'{month}' is not a Hebrew month; use one of "
            f"{', '.join(_MONTH_NAMES)}, Adar I or Adar II"
        )
    if year < 1:
        raise InvalidDate("the Hebrew year must be 1 or later")
    if number == ADAR_II and not is_leap(year):
        raise InvalidDate(
            f"{year} is not a leap year, so it has no Adar II"
        )
    if not 1 <= day <= days_in_month(year, number):
        raise InvalidDate(
            f"{month_name(year, number)} {year} has no day {day}"
        )
    return HebrewDay(year, number, day)


def to_gregorian(hebrew: HebrewDay) -> date:
    return dates.HebrewDate(
        hebrew.year,
        hebrew.month,
        hebrew.day,
    ).to_greg().to_pydate()


def birthday_in_year(birth: HebrewDay, year: int) -> HebrewDay:
    """The date in Hebrew `year` on which the birthday of someone born
    on `birth` falls, following the common custom (the one Hebcal
    uses) for the dates a year may not have:

    - Born in Adar of a common year: Adar II in a leap year.
    - Born in Adar I or Adar II of a leap year: Adar in a common year.
    - Born on 30 Adar I: 1 Nisan in a common year, whose Adar has 29
      days.
    - Born on 30 Cheshvan or 30 Kislev: 1 Kislev or 1 Tevet in a year
      whose Cheshvan or Kislev has only 29 days.
    """
    month, day = birth.month, birth.day
    if month == ADAR_II and not is_leap(year):
        month = ADAR
    elif month == ADAR and not is_leap(birth.year) and is_leap(year):
        month = ADAR_II
    elif (
        month == ADAR and day == 30 and is_leap(birth.year) and
        not is_leap(year)
    ):
        month, day = NISAN, 1
    elif month == CHESHVAN and day == 30 and days_in_month(
        year,
        CHESHVAN,
    ) == 29:
        month, day = KISLEV, 1
    elif month == KISLEV and day == 30 and days_in_month(
        year,
        KISLEV,
    ) == 29:
        month, day = TEVET, 1
    return HebrewDay(year, month, day)


@dataclass(frozen=True)
class Occurrence:
    hebrew: HebrewDay
    gregorian: date
    age: int


def occurrences(birth: HebrewDay, today: date, count: int) -> list[Occurrence]:
    """The next `count` Hebrew birthdays of someone born on `birth`,
    counting a birthday that falls `today` as the first."""
    year = from_gregorian(today, after_sunset=False).year
    result: list[Occurrence] = []
    while len(result) < count:
        hebrew = birthday_in_year(birth, year)
        gregorian = to_gregorian(hebrew)
        # A birthday this Hebrew year that is already past, or a year
        # before the person was born, is not upcoming.
        if gregorian >= today and year >= birth.year:
            result.append(Occurrence(hebrew, gregorian, year - birth.year))
        year += 1
    return result
