from __future__ import annotations

from datetime import datetime, timezone, tzinfo
from google.protobuf import timestamp_pb2
from typing import Optional
from tzlocal import get_localzone


class DateTimeWithTimeZone(datetime):
    """
    Using a datetime object without timezone information can be dangerous
    because it can accidentally be interpreted in a different timezone as
    it travels through the code path in a distributed setting, causing bugs.

    The purpose of this class is to internally convert any datetime objects
    passed in by users to our DateTimeWithTimeZone object. This is useful
    because we can ensure that our internal functions pass around our
    DateTimeWithTimeZone object that is guaranteed to have timezone information
    instead of passing around a datetime object that may or may not have timezone
    information.

    Using this class will also make it easier to onboard others
    onto the codebase if they have not been told about the naive datetime penguin.
    """

    @classmethod
    def from_datetime(cls, user_time: datetime) -> DateTimeWithTimeZone:
        """
        This function ensures that the user's datetime has timezone information
        before constructing and returning a new DateTimeWithTimeZone object.
        """
        tzinfo = user_time.tzinfo or get_localzone()
        user_time = user_time.replace(tzinfo=tzinfo)

        return cls.__new__(
            cls,
            user_time.year,
            user_time.month,
            user_time.day,
            user_time.hour,
            user_time.minute,
            user_time.second,
            user_time.microsecond,
            tzinfo=tzinfo,
            fold=user_time.fold,
        )

    @classmethod
    def from_protobuf_timestamp(
        cls,
        proto_timestamp: timestamp_pb2.Timestamp,
    ) -> DateTimeWithTimeZone:
        """
        By default, proto's `ToDatetime()` will return a `datetime` object without timezone information; this is incorrect!
        The proto `Timestamp` is explicitly specified as being in UTC, but a Python `datetime` without timezone is
        seen as being in local time! We must explicitly attach the timezone information.
        """
        proto_datetime = proto_timestamp.ToDatetime().replace(
            tzinfo=timezone.utc
        )
        return cls.from_datetime(proto_datetime)

    @classmethod
    def now(cls, tz: Optional[tzinfo] = None) -> DateTimeWithTimeZone:
        """
        Plain `datetime.now()` calls will return `datetime` objects without timezone information. In Python, such a
        "naive" `datetime` normally represents local time, but can lead to confusion in distributed settings when
        the `datetime` could also reasonably be interpreted as representing UTC. To disambiguate, Reboot always
        sets the timezone in all `datetime` objects.
        """
        return cls.from_datetime(datetime.now(tz=tz))

    @classmethod
    def fromisoformat(cls, date_string: str) -> DateTimeWithTimeZone:
        """
        Parses an ISO 8601 date string and returns a DateTimeWithTimeZone object.
        If the string does not contain timezone info, it will be assumed to be in local time.
        """
        user_time = datetime.fromisoformat(date_string)
        return cls.from_datetime(user_time)
