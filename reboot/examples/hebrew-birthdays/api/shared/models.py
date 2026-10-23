from reboot.api import Field, Model
from typing import Optional


class HebrewDate(Model):
    year: int = Field(
        tag=1,
        default=0,
        description="The Hebrew year, counted from creation (e.g. 5785).",
    )
    month: int = Field(
        tag=2,
        default=0,
        description="The month's number, counting from Nisan as 1 "
        "through Adar as 12; Adar II is 13, and only a leap year has it, "
        "in which 12 is Adar I.",
    )
    day: int = Field(
        tag=3,
        default=0,
        description="The day of the month, from 1 to 30.",
    )
    month_name: str = Field(
        tag=4,
        default="",
        description="The month's English name, e.g. \"Cheshvan\"; "
        "\"Adar I\" and \"Adar II\" in a leap year, plain \"Adar\" "
        "otherwise.",
    )
    text: str = Field(
        tag=5,
        default="",
        description="The whole date in English, e.g. \"13 Adar 5750\".",
    )
    hebrew_text: str = Field(
        tag=6,
        default="",
        description="The whole date in Hebrew letters, e.g. "
        "\"י״ג אדר תש״נ\".",
    )


class Birthday(Model):
    hebrew_date: Optional[HebrewDate] = Field(
        tag=1,
        default=None,
        description="The Hebrew date the birthday falls on that year, "
        "which may differ from the date of birth when that year lacks "
        "it (Adar II, 30 Cheshvan, 30 Kislev, 30 Adar I).",
    )
    gregorian_date: str = Field(
        tag=2,
        default="",
        description="The Gregorian date of the birthday's daytime, as "
        "YYYY-MM-DD. The Hebrew day begins at sunset, so the birthday "
        "starts the evening before.",
    )
    age: int = Field(
        tag=3,
        default=0,
        description="How old the person turns on this birthday, in "
        "Hebrew years.",
    )
    days_until: int = Field(
        tag=4,
        default=0,
        description="Days from the `today` the request was made for "
        "until `gregorian_date`; 0 means the birthday is today.",
    )


class InvalidBirthdayError(Model):
    message: str = Field(
        tag=1,
        default="",
        description="Why the birthday or date could not be used, "
        "written to be shown to the person who entered it.",
    )


class PersonNotFoundError(Model):
    person_id: str = Field(
        tag=1,
        default="",
        description="The id that names no person on the caller's list.",
    )
