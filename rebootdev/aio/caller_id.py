from dataclasses import dataclass
from rebootdev.aio.types import ApplicationId, SpaceId
from rebootdev.naming import ensure_valid_application_id, ensure_valid_space_id
from typing import Optional

SPACE_ID_KEY = "space_id"
APPLICATION_ID_KEY = "application_id"


@dataclass
class CallerID:
    """
    Identifies the calling application in a request.
    """

    application_id: ApplicationId
    space_id: Optional[SpaceId] = None

    def __str__(self) -> str:
        """
        The string representation of this CallerID.

        Caller ID strings have the form:
          "[space_id={space_id},]application_id={application_id}"

        This format allows for future expansion by adding more key/value
        pairs.
        """
        return (
            (
                f"{SPACE_ID_KEY}={self.space_id},"
                if self.space_id is not None else ""
            ) + f"{APPLICATION_ID_KEY}={self.application_id}"
        )

    @classmethod
    def parse(cls, caller_id: str) -> "CallerID":
        """Parse a caller ID string into a CallerID object."""
        caller_id_parts = caller_id.split(",")

        # Currently, application caller IDs are always of the form
        # `[space_id={space_id},]application_id={application_id}`, but
        # we politely ignore any unknown key/value pairs for forwards
        # compatibility with possible future expansion (e.g.
        # organization ID, cluster ID, library ID, ...?).
        values: dict[str, str] = {}
        for part in caller_id_parts:
            if part == "":
                continue
            key_value = part.split("=", 1)
            if len(key_value) != 2:
                raise ValueError(f"Invalid caller ID part: '{part}'")
            key, value = key_value
            values[key] = value

        space_id_str = values.get(SPACE_ID_KEY)
        application_id_str = values.get(APPLICATION_ID_KEY)
        if application_id_str is None:
            raise ValueError("Missing application ID in caller ID")

        return cls(
            space_id=ensure_valid_space_id(space_id_str)
            if space_id_str is not None else None,
            application_id=ensure_valid_application_id(application_id_str),
        )
