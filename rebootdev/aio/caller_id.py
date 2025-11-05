from rebootdev.aio.types import ApplicationId, SpaceId
from rebootdev.naming import ensure_valid_application_id, ensure_valid_space_id
from typing import Optional

SPACE_ID_KEY = "space_id"
APPLICATION_ID_KEY = "application_id"


def make_caller_id(
    space_id: Optional[SpaceId],
    application_id: ApplicationId,
) -> str:
    # Caller IDs have the form:
    #   [space_id={space_id},]application_id={application_id}
    #
    # This format allows for future expansion by adding more key/value
    # pairs.
    return (
        (f"{SPACE_ID_KEY}={space_id}," if space_id is not None else "") +
        f"{APPLICATION_ID_KEY}={application_id}"
    )


def parse_caller_id(
    caller_id: str,
) -> tuple[Optional[SpaceId], ApplicationId]:
    caller_id_parts = caller_id.split(",")

    # Currently, application caller IDs are always of the form
    # `[space_id={space_id},]application_id={application_id}`, but we
    # politely ignore any unknown key/value pairs for forwards
    # compatibility with possible future expansion (e.g. organization
    # ID, cluster ID, library ID, ...?).
    values: dict[str, str] = {}
    for part in caller_id_parts:
        if part == "":
            continue
        key_value = part.split("=", 1)
        if len(key_value) != 2:
            raise ValueError(f"Invalid caller ID part: '{part}'")
        key, value = key_value
        values[key] = value

    space_id = values.get(SPACE_ID_KEY)
    application_id = values.get(APPLICATION_ID_KEY)
    if application_id is None:
        raise ValueError("Missing application ID in caller ID")

    return (
        ensure_valid_space_id(space_id) if space_id is not None else None,
        ensure_valid_application_id(application_id),
    )
