from reboot.api import (
    API,
    UI,
    Field,
    Methods,
    Model,
    Reader,
    Shared,
    Tool,
    Transaction,
    Type,
)
from shared.models import (
    Birthday,
    HebrewDate,
    InvalidBirthdayError,
    PersonNotFoundError,
)
from typing import Optional


class UserState(Model):
    people_index_id: str = Field(
        tag=1,
        default="",
        description="The id of the `OrderedMap` that lists the people "
        "whose birthdays this user tracks, keyed by person id, so the "
        "list can grow as long as a family does.",
    )


class AddPersonRequest(Model):
    name: str = Field(
        tag=1,
        default="",
        description="What the user calls the person, e.g. \"Grandma "
        "Rivka\"; required.",
    )
    gregorian_birth_date: str = Field(
        tag=2,
        default="",
        description="The Gregorian date of birth as YYYY-MM-DD. Give "
        "either this or all three Hebrew fields.",
    )
    born_after_sunset: bool = Field(
        tag=3,
        default=False,
        description="Whether the birth was after sunset on "
        "`gregorian_birth_date`, which makes the Hebrew date of birth "
        "the next day's. Ask if unsure; most people don't know, and "
        "false is the usual answer.",
    )
    hebrew_birth_day: int = Field(
        tag=4,
        default=0,
        description="The day of the Hebrew month of birth, 1 to 30, "
        "when the user knows the Hebrew date instead.",
    )
    hebrew_birth_month: str = Field(
        tag=5,
        default="",
        description="The Hebrew month of birth by name: Nisan, Iyar, "
        "Sivan, Tammuz, Av, Elul, Tishrei, Cheshvan, Kislev, Tevet, "
        "Shevat, Adar, Adar I or Adar II.",
    )
    hebrew_birth_year: int = Field(
        tag=6,
        default=0,
        description="The Hebrew year of birth, e.g. 5750.",
    )
    notes: str = Field(
        tag=7,
        default="",
        description="Anything else worth remembering about the person.",
    )


class AddPersonResponse(Model):
    person_id: str = Field(
        tag=1,
        default="",
        description="The new person's id; pass it to the person tools, "
        "but there is no need to show it to the user.",
    )
    hebrew_birth_date: Optional[HebrewDate] = Field(
        tag=2,
        default=None,
        description="The Hebrew date of birth the app worked out.",
    )


class UpcomingBirthdaysRequest(Model):
    today: str = Field(
        tag=1,
        default="",
        description="The date to count from, as YYYY-MM-DD, normally "
        "the user's local date; empty means today in UTC.",
    )
    within_days: int = Field(
        tag=2,
        default=0,
        description="Only list birthdays at most this many days away; "
        "0 lists everyone's next birthday.",
    )


class UpcomingBirthday(Model):
    person_id: str = Field(
        tag=1,
        default="",
        description="The person's id, for the person tools.",
    )
    name: str = Field(tag=2, default="", description="The person's name.")
    notes: str = Field(tag=3, default="", description="Free-form notes.")
    gregorian_birth_date: str = Field(
        tag=4,
        default="",
        description="The Gregorian date of birth, YYYY-MM-DD, or empty "
        "when only the Hebrew date is known.",
    )
    hebrew_birth_date: Optional[HebrewDate] = Field(
        tag=5,
        default=None,
        description="The Hebrew date of birth.",
    )
    next_birthday: Optional[Birthday] = Field(
        tag=6,
        default=None,
        description="The person's next Hebrew birthday.",
    )


class UpcomingBirthdaysResponse(Model):
    birthdays: list[UpcomingBirthday] = Field(
        tag=1,
        default_factory=list,
        description="One entry per person on the list, soonest "
        "birthday first.",
    )


class RemovePersonRequest(Model):
    person_id: str = Field(
        tag=1,
        default="",
        description="The id of the person to take off the list.",
    )


class ConvertDateRequest(Model):
    gregorian_date: str = Field(
        tag=1,
        default="",
        description="A Gregorian date as YYYY-MM-DD; empty means today "
        "in UTC.",
    )
    after_sunset: bool = Field(
        tag=2,
        default=False,
        description="Whether the moment in question is after sunset, "
        "when the Hebrew date has already moved on to the next day.",
    )


class ConvertDateResponse(Model):
    hebrew_date: Optional[HebrewDate] = Field(
        tag=1,
        default=None,
        description="The Hebrew date at that moment.",
    )


# A `Type` named `User` is auto-constructed per authenticated user:
# every signed-in caller gets their own `User` state, the front door
# through which they add, find, and remove the people they track.
api = API(
    User=Type(
        state=UserState,
        methods=Methods(
            add_person=Transaction(
                # Writes the index and the new person, never the
                # user's own state.
                mode=Shared(),
                request=AddPersonRequest,
                response=AddPersonResponse,
                errors=[InvalidBirthdayError],
                description="Add someone whose Hebrew birthday the user "
                "wants to track. Give their Gregorian date of birth "
                "(and whether they were born after sunset), or, if the "
                "user knows it instead, their Hebrew day, month and "
                "year of birth. Returns the Hebrew date of birth.",
                mcp=Tool(),
            ),
            upcoming_birthdays=Reader(
                request=UpcomingBirthdaysRequest,
                response=UpcomingBirthdaysResponse,
                errors=[InvalidBirthdayError],
                description="List the people the user tracks with "
                "their Hebrew dates of birth and the Gregorian date of "
                "each one's next Hebrew birthday, soonest first. Also "
                "the way to find a person's `person_id` by name.",
                mcp=Tool(),
            ),
            remove_person=Transaction(
                mode=Shared(),
                request=RemovePersonRequest,
                response=None,
                errors=[PersonNotFoundError],
                description="Take a person off the user's list and "
                "forget them. Get the `person_id` from "
                "`user_upcoming_birthdays`.",
                mcp=Tool(),
            ),
            convert_date=Reader(
                request=ConvertDateRequest,
                response=ConvertDateResponse,
                errors=[InvalidBirthdayError],
                description="Convert a Gregorian date to the Hebrew "
                "calendar, without saving anything.",
                mcp=Tool(),
            ),
            show_birthdays=UI(
                request=None,
                path="birthdays",
                title="Hebrew Birthdays",
                description="Show a live list of everyone the user "
                "tracks, ordered by whose Hebrew birthday comes next, "
                "with a form to add someone.",
            ),
        ),
    ),
)
