from reboot.api import (
    API,
    UI,
    Field,
    Methods,
    Model,
    Reader,
    Tool,
    Type,
    Writer,
)
from shared.models import Birthday, HebrewDate, InvalidBirthdayError
from typing import Optional


class PersonState(Model):
    owner_user_id: str = Field(
        tag=1,
        default="",
        description="The id of the user whose list this person is on, "
        "the only user who may read or change them.",
    )
    name: str = Field(
        tag=2,
        default="",
        description="What the user calls this person, e.g. \"Grandma "
        "Rivka\".",
    )
    gregorian_birth_date: str = Field(
        tag=3,
        default="",
        description="The Gregorian date of birth as YYYY-MM-DD, or "
        "empty when the user gave only the Hebrew date.",
    )
    born_after_sunset: bool = Field(
        tag=4,
        default=False,
        description="Whether the birth was after sunset on "
        "`gregorian_birth_date`, which puts it on the next Hebrew day.",
    )
    hebrew_birth_year: int = Field(
        tag=5,
        default=0,
        description="The Hebrew year of birth.",
    )
    hebrew_birth_month: int = Field(
        tag=6,
        default=0,
        description="The Hebrew month of birth, Nisan as 1 through "
        "Adar (Adar I in a leap year) as 12 and Adar II as 13.",
    )
    hebrew_birth_day: int = Field(
        tag=7,
        default=0,
        description="The day of the Hebrew month of birth, 1 to 30.",
    )
    notes: str = Field(
        tag=8,
        default="",
        description="Anything else the user wants to remember, e.g. "
        "\"likes chocolate babka\".",
    )


class CreateRequest(Model):
    owner_user_id: str = Field(
        tag=1,
        default="",
        description="The user whose list the person is added to.",
    )
    name: str = Field(tag=2, default="", description="The person's name.")
    gregorian_birth_date: str = Field(
        tag=3,
        default="",
        description="The Gregorian date of birth, YYYY-MM-DD, or empty.",
    )
    born_after_sunset: bool = Field(
        tag=4,
        default=False,
        description="Whether the birth was after sunset.",
    )
    hebrew_birth_year: int = Field(
        tag=5,
        default=0,
        description="The Hebrew year of birth, already resolved.",
    )
    hebrew_birth_month: int = Field(
        tag=6,
        default=0,
        description="The Hebrew month of birth, already resolved.",
    )
    hebrew_birth_day: int = Field(
        tag=7,
        default=0,
        description="The Hebrew day of birth, already resolved.",
    )
    notes: str = Field(tag=8, default="", description="Free-form notes.")


class GetRequest(Model):
    today: str = Field(
        tag=1,
        default="",
        description="The date to count upcoming birthdays from, as "
        "YYYY-MM-DD, normally the user's local date; empty means today "
        "in UTC.",
    )
    years: int = Field(
        tag=2,
        default=0,
        description="How many upcoming birthdays to list, one per "
        "year; 0 means 5.",
    )


class PersonDetails(Model):
    person_id: str = Field(
        tag=1,
        default="",
        description="The person's id, for the other person tools.",
    )
    name: str = Field(tag=2, default="", description="The person's name.")
    notes: str = Field(tag=3, default="", description="Free-form notes.")
    gregorian_birth_date: str = Field(
        tag=4,
        default="",
        description="The Gregorian date of birth, YYYY-MM-DD, or empty "
        "when only the Hebrew date is known.",
    )
    born_after_sunset: bool = Field(
        tag=5,
        default=False,
        description="Whether the birth was after sunset on the "
        "Gregorian date of birth.",
    )
    hebrew_birth_date: Optional[HebrewDate] = Field(
        tag=6,
        default=None,
        description="The Hebrew date of birth.",
    )
    upcoming: list[Birthday] = Field(
        tag=7,
        default_factory=list,
        description="The person's next Hebrew birthdays, soonest first, "
        "with the Gregorian date each falls on.",
    )


class UpdateRequest(Model):
    name: str = Field(
        tag=1,
        default="",
        description="A new name, or empty to keep the current one.",
    )
    notes: str = Field(
        tag=2,
        default="",
        description="New notes, replacing the old ones; empty keeps "
        "the current notes.",
    )


class SetBirthDateRequest(Model):
    gregorian_birth_date: str = Field(
        tag=1,
        default="",
        description="The Gregorian date of birth as YYYY-MM-DD. Give "
        "either this or all three Hebrew fields.",
    )
    born_after_sunset: bool = Field(
        tag=2,
        default=False,
        description="Whether the birth was after sunset on "
        "`gregorian_birth_date`; ignored for a Hebrew date.",
    )
    hebrew_birth_day: int = Field(
        tag=3,
        default=0,
        description="The day of the Hebrew month of birth, 1 to 30.",
    )
    hebrew_birth_month: str = Field(
        tag=4,
        default="",
        description="The Hebrew month of birth by name: Nisan, Iyar, "
        "Sivan, Tammuz, Av, Elul, Tishrei, Cheshvan, Kislev, Tevet, "
        "Shevat, Adar, Adar I or Adar II.",
    )
    hebrew_birth_year: int = Field(
        tag=5,
        default=0,
        description="The Hebrew year of birth, e.g. 5750.",
    )


PersonMethods = Methods(
    create=Writer(
        request=CreateRequest,
        response=None,
        factory=True,
        description="Bring the person into existence on a user's list, "
        "with their date of birth already checked and resolved to a "
        "Hebrew date by the caller.",
        mcp=None,
    ),
    get=Reader(
        request=GetRequest,
        response=PersonDetails,
        errors=[InvalidBirthdayError],
        description="Get a person's details, their Hebrew date of birth, "
        "and the Gregorian dates of their next Hebrew birthdays. Get "
        "the `person_id` from `user_upcoming_birthdays`.",
        mcp=Tool(),
    ),
    update=Writer(
        request=UpdateRequest,
        response=None,
        description="Rename a person or replace their notes. Get the "
        "`person_id` from `user_upcoming_birthdays`.",
        mcp=Tool(),
    ),
    set_birth_date=Writer(
        request=SetBirthDateRequest,
        response=None,
        errors=[InvalidBirthdayError],
        description="Correct a person's date of birth, given either as "
        "a Gregorian date (with whether it was after sunset) or as a "
        "Hebrew day, month and year. Get the `person_id` from "
        "`user_upcoming_birthdays`.",
        mcp=Tool(),
    ),
    erase=Writer(
        request=None,
        response=None,
        description="Forget everything about the person, once their "
        "owner has taken them off their list.",
        mcp=None,
    ),
    show=UI(
        request=None,
        path="person",
        title="Hebrew Birthday",
        description="Show a card with one person's Hebrew date of "
        "birth and the Gregorian dates of their next Hebrew birthdays. "
        "Get the `person_id` from `user_upcoming_birthdays`.",
    ),
)

api = API(
    Person=Type(
        state=PersonState,
        methods=PersonMethods,
        description="One person whose Hebrew birthday a user tracks, "
        "and the consistency boundary for changes to their record. Its "
        "id is made up when the user adds them.",
    ),
)
