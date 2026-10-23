import asyncio
import hebrew_calendar
from birth_dates import hebrew_date, parse_today, resolve_birth
from birthdays.v1.person_rbt import Person
from birthdays.v1.user import UpcomingBirthday
from birthdays.v1.user_rbt import User
from hebrew_calendar import InvalidDate
from rbt.std.collections.ordered_map.v1.ordered_map_rbt import OrderedMap
from reboot.aio.contexts import ReaderContext, TransactionContext
from shared.models import InvalidBirthdayError, PersonNotFoundError
from uuid import uuid4

# How many people to read from the index per page.
PAGE_SIZE = 128


class UserServicer(User.Servicer):
    # No explicit authorizer: `User` is auto-constructed per user id,
    # so the framework only lets the user whose id this state has call
    # it, which is exactly the check we want.

    async def create(
        self,
        context: TransactionContext,
    ) -> None:
        """Called when the user first signs in: give them an empty
        list of people, constructed now so that reading it before the
        first person is added finds it empty rather than missing."""
        self.state.people_index_id = str(uuid4())
        await OrderedMap.ref(self.state.people_index_id).create(context)

    async def add_person(
        self,
        context: TransactionContext,
        request: User.AddPersonRequest,
    ) -> User.AddPersonResponse:
        name = request.name.strip()
        try:
            if name == "":
                raise InvalidDate("give the person a name")
            birth = resolve_birth(
                gregorian_birth_date=request.gregorian_birth_date,
                born_after_sunset=request.born_after_sunset,
                hebrew_birth_day=request.hebrew_birth_day,
                hebrew_birth_month=request.hebrew_birth_month,
                hebrew_birth_year=request.hebrew_birth_year,
            )
        except InvalidDate as error:
            raise User.AddPersonAborted(
                InvalidBirthdayError(message=str(error))
            )

        person, _ = await Person.create(
            context,
            owner_user_id=context.state_id,
            name=name,
            notes=request.notes.strip(),
            gregorian_birth_date=birth.gregorian,
            born_after_sunset=birth.after_sunset,
            hebrew_birth_year=birth.hebrew.year,
            hebrew_birth_month=birth.hebrew.month,
            hebrew_birth_day=birth.hebrew.day,
        )

        # Keyed by the person's id, so removing them needs nothing else.
        await OrderedMap.ref(self.state.people_index_id).insert(
            context,
            key=person.state_id,
            bytes=person.state_id.encode(),
        )

        return User.AddPersonResponse(
            person_id=person.state_id,
            hebrew_birth_date=hebrew_date(birth.hebrew),
        )

    async def _person_ids(self, context: ReaderContext) -> list[str]:
        people_index = OrderedMap.ref(self.state.people_index_id)
        person_ids: list[str] = []
        start_key: str | None = None
        while True:
            if start_key is None:
                page = await people_index.range(context, limit=PAGE_SIZE)
            else:
                page = await people_index.range(
                    context,
                    start_key=start_key,
                    limit=PAGE_SIZE,
                )
            person_ids.extend(entry.bytes.decode() for entry in page.entries)
            if len(page.entries) < PAGE_SIZE:
                return person_ids
            # `start_key` is inclusive, so start just after the last key.
            start_key = page.entries[-1].key + "\0"

    async def upcoming_birthdays(
        self,
        context: ReaderContext,
        request: User.UpcomingBirthdaysRequest,
    ) -> User.UpcomingBirthdaysResponse:
        try:
            today = parse_today(request.today)
        except InvalidDate as error:
            raise User.UpcomingBirthdaysAborted(
                InvalidBirthdayError(message=str(error))
            )

        async def upcoming(person_id: str) -> UpcomingBirthday:
            details = await Person.ref(person_id).get(
                context,
                today=today.isoformat(),
                years=1,
            )
            return UpcomingBirthday(
                person_id=person_id,
                name=details.name,
                notes=details.notes,
                gregorian_birth_date=details.gregorian_birth_date,
                hebrew_birth_date=details.hebrew_birth_date,
                next_birthday=(
                    details.upcoming[0] if details.upcoming else None
                ),
            )

        birthdays = await asyncio.gather(
            *[
                upcoming(person_id)
                for person_id in await self._person_ids(context)
            ]
        )

        def days_until(birthday: UpcomingBirthday) -> int:
            assert birthday.next_birthday is not None
            return birthday.next_birthday.days_until

        listed = [
            birthday for birthday in birthdays
            if birthday.next_birthday is not None and (
                request.within_days <= 0 or
                days_until(birthday) <= request.within_days
            )
        ]
        listed.sort(key=lambda birthday: (days_until(birthday), birthday.name))
        return User.UpcomingBirthdaysResponse(birthdays=listed)

    async def remove_person(
        self,
        context: TransactionContext,
        request: User.RemovePersonRequest,
    ) -> None:
        people_index = OrderedMap.ref(self.state.people_index_id)
        # Only a person on this user's own list may be removed, and
        # being on the list is what makes them this user's.
        found = await people_index.search(context, key=request.person_id)
        if not found.found:
            raise User.RemovePersonAborted(
                PersonNotFoundError(person_id=request.person_id)
            )
        await people_index.remove(context, key=request.person_id)
        await Person.ref(request.person_id).erase(context)

    async def convert_date(
        self,
        context: ReaderContext,
        request: User.ConvertDateRequest,
    ) -> User.ConvertDateResponse:
        try:
            moment = parse_today(request.gregorian_date)
            hebrew = hebrew_calendar.from_gregorian(
                moment,
                request.after_sunset,
            )
        except InvalidDate as error:
            raise User.ConvertDateAborted(
                InvalidBirthdayError(message=str(error))
            )
        return User.ConvertDateResponse(hebrew_date=hebrew_date(hebrew))

