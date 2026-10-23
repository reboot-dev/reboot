import hebrew_calendar
import rbt.v1alpha1.errors_pb2 as errors
from birth_dates import (
    birthday,
    hebrew_date,
    parse_today,
    resolve_birth,
)
from birthdays.v1.person import PersonState
from birthdays.v1.person_rbt import Person
from hebrew_calendar import HebrewDay, InvalidDate
from reboot.aio.auth.authorizers import (
    Authorizer,
    allow_if,
    is_app_internal,
)
from reboot.aio.contexts import ReaderContext, WriterContext
from shared.models import InvalidBirthdayError
from typing import Any

# How many upcoming birthdays `get` lists when the caller doesn't say.
DEFAULT_YEARS = 5


def is_owner(
    *,
    context: ReaderContext,
    state: PersonState | None = None,
    **kwargs: Any,
) -> Authorizer.Decision:
    if context.auth is None or context.auth.user_id is None:
        return errors.Unauthenticated()
    if state is not None and state.owner_user_id == context.auth.user_id:
        return errors.Ok()
    return errors.PermissionDenied()


class PersonServicer(Person.Servicer):

    def authorizer(self):
        # A person is only ever seen or changed by the user whose list
        # they are on, or created and erased by that user's `User`.
        return allow_if(any=[is_app_internal, is_owner])

    async def create(
        self,
        context: WriterContext,
        request: Person.CreateRequest,
    ) -> None:
        self.state.owner_user_id = request.owner_user_id
        self.state.name = request.name
        self.state.notes = request.notes
        self.state.gregorian_birth_date = request.gregorian_birth_date
        self.state.born_after_sunset = request.born_after_sunset
        self.state.hebrew_birth_year = request.hebrew_birth_year
        self.state.hebrew_birth_month = request.hebrew_birth_month
        self.state.hebrew_birth_day = request.hebrew_birth_day

    async def get(
        self,
        context: ReaderContext,
        request: Person.GetRequest,
    ) -> Person.GetResponse:
        try:
            today = parse_today(request.today)
        except InvalidDate as error:
            raise Person.GetAborted(
                InvalidBirthdayError(message=str(error))
            )

        details = Person.GetResponse(
            person_id=context.state_id,
            name=self.state.name,
            notes=self.state.notes,
            gregorian_birth_date=self.state.gregorian_birth_date,
            born_after_sunset=self.state.born_after_sunset,
        )
        # An erased person has no date of birth left to show.
        if self.state.hebrew_birth_year == 0:
            return details

        birth = HebrewDay(
            self.state.hebrew_birth_year,
            self.state.hebrew_birth_month,
            self.state.hebrew_birth_day,
        )
        details.hebrew_birth_date = hebrew_date(birth)
        details.upcoming = [
            birthday(occurrence, today)
            for occurrence in hebrew_calendar.occurrences(
                birth,
                today,
                request.years if request.years > 0 else DEFAULT_YEARS,
            )
        ]
        return details

    async def update(
        self,
        context: WriterContext,
        request: Person.UpdateRequest,
    ) -> None:
        if request.name.strip() != "":
            self.state.name = request.name.strip()
        if request.notes.strip() != "":
            self.state.notes = request.notes.strip()

    async def set_birth_date(
        self,
        context: WriterContext,
        request: Person.SetBirthDateRequest,
    ) -> None:
        try:
            birth = resolve_birth(
                gregorian_birth_date=request.gregorian_birth_date,
                born_after_sunset=request.born_after_sunset,
                hebrew_birth_day=request.hebrew_birth_day,
                hebrew_birth_month=request.hebrew_birth_month,
                hebrew_birth_year=request.hebrew_birth_year,
            )
        except InvalidDate as error:
            raise Person.SetBirthDateAborted(
                InvalidBirthdayError(message=str(error))
            )
        self.state.gregorian_birth_date = birth.gregorian
        self.state.born_after_sunset = birth.after_sunset
        self.state.hebrew_birth_year = birth.hebrew.year
        self.state.hebrew_birth_month = birth.hebrew.month
        self.state.hebrew_birth_day = birth.hebrew.day

    async def erase(
        self,
        context: WriterContext,
    ) -> None:
        # Keep the owner, so the owner alone can still see that
        # there is nothing left.
        self.state.name = ""
        self.state.notes = ""
        self.state.gregorian_birth_date = ""
        self.state.born_after_sunset = False
        self.state.hebrew_birth_year = 0
        self.state.hebrew_birth_month = 0
        self.state.hebrew_birth_day = 0
